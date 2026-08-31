/**
 * WhatsApp transport suite — timeout, bounded retry, and configuration validation.
 *
 *   npx tsx scripts/test-whatsapp-transport.ts
 *
 * The Graph API is mocked at globalThis.fetch, so nothing leaves the machine and
 * no WhatsApp message is ever sent. A disposable scratch org supplies the
 * integration row that the send path loads its config from.
 */
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes, randomUUID } from "crypto";
import { sendWhatsAppMessage, validateWhatsAppToken, invalidateWhatsAppConfigCache } from "@/lib/integrations/whatsapp-cloud";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENC_KEY = process.env.ENCRYPTION_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY || !ENC_KEY) { console.error("missing env"); process.exit(2); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "hex"), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

const TAG = randomBytes(4).toString("hex");
const ORG = randomUUID();
const realFetch = globalThis.fetch;
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? "  — " + d : ""}`); };

type Step = { status?: number; body?: string; throwName?: string; hangUntilAbort?: boolean; headers?: Record<string, string> };

/**
 * Replace fetch with a scripted sequence for Graph calls only; everything else
 * (Supabase, which also uses fetch) passes through untouched. Returns a counter
 * of Graph calls, which is what the attempt assertions are about.
 */
function mockGraph(steps: Step[]) {
  let i = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes("graph.facebook.com")) return realFetch(url, init);
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    if (step.hangUntilAbort) {
      // Never resolves on its own — only the AbortController can end it, which
      // is what proves the timeout is actually wired to the request.
      return await new Promise((_res, rej) => {
        init?.signal?.addEventListener?.("abort", () => {
          const e = new Error("The operation was aborted"); e.name = "AbortError"; rej(e);
        });
      });
    }
    if (step.throwName) { const e = new Error("network down"); e.name = step.throwName; throw e; }
    return new Response(step.body ?? JSON.stringify({ messages: [{ id: "wamid.MOCK" }] }), {
      status: step.status ?? 200,
      headers: step.headers,
    });
  }) as typeof fetch;
  return () => i;
}
const restore = () => { globalThis.fetch = realFetch; };

async function attempts(steps: Step[]): Promise<{ calls: number; threw: boolean; ms: number }> {
  invalidateWhatsAppConfigCache(ORG);
  const count = mockGraph(steps);
  const t0 = Date.now();
  let threw = false;
  try { await sendWhatsAppMessage(ORG, "919999999999", "test"); } catch { threw = true; }
  const ms = Date.now() - t0;
  restore();
  return { calls: count(), threw, ms };
}

(async () => {
  console.log("═".repeat(72));
  console.log("WHATSAPP TRANSPORT SUITE — timeout, bounded retry, config validation");
  console.log(`  scratch org: ${ORG}`);
  console.log("═".repeat(72) + "\n");

  // Sweep residue from any earlier run that was killed before its finally block
  // ran. Scoped to this suite's own slug prefix so it can never touch real data.
  const { data: stale } = await db.from("orgs").select("id,slug").like("slug", "zz-tr-%");
  for (const o of (stale ?? []) as Array<{ id: string; slug: string }>) {
    for (const t of ["messages", "conversations", "leads", "integrations"]) await db.from(t).delete().eq("org_id", o.id);
    await db.from("orgs").delete().eq("id", o.id);
    console.log(`  swept stale scratch org ${o.slug}`);
  }

  await db.from("orgs").insert({ id: ORG, slug: `zz-tr-${TAG}`, name: `ZZ TRANSPORT ${TAG} — DELETE ME`, channel_config: {} });
  await db.from("integrations").insert({
    org_id: ORG, provider: "whatsapp_cloud", active: true,
    config: { phone_number_id: `PN_${TAG}`, waba_id: `WABA_${TAG}`, display_phone_number: "1555", access_token_enc: encrypt("scratch-token") },
  });

  try {
    console.log("── TASK 1: retry matrix ──");
    let r = await attempts([{ status: 200 }]);
    ok("T1. success → exactly 1 attempt, no retry", r.calls === 1 && !r.threw, `calls=${r.calls}`);

    r = await attempts([{ status: 429, headers: { "retry-after": "1" } }, { status: 200 }]);
    ok("T2. 429 → retried, then succeeds", r.calls === 2 && !r.threw, `calls=${r.calls}`);

    for (const s of [500, 502, 503, 504]) {
      r = await attempts([{ status: s }, { status: 200 }]);
      ok(`T3.${s} → retried`, r.calls === 2 && !r.threw, `calls=${r.calls}`);
    }

    for (const s of [400, 401, 403, 404]) {
      r = await attempts([{ status: s, body: JSON.stringify({ error: { code: 190, message: "permanent" } }) }]);
      ok(`T4.${s} → NOT retried`, r.calls === 1 && r.threw, `calls=${r.calls}, threw=${r.threw}`);
    }

    r = await attempts([{ throwName: "TypeError" }, { status: 200 }]);
    ok("T5. network error → retried", r.calls === 2 && !r.threw, `calls=${r.calls}`);

    r = await attempts([{ status: 503 }]);
    ok("T6. retries are bounded at 3 attempts", r.calls === 3 && r.threw, `calls=${r.calls}`);

    r = await attempts([{ status: 500 }, { status: 500 }, { status: 200 }]);
    ok("T7. succeeds on the final permitted attempt", r.calls === 3 && !r.threw, `calls=${r.calls}`);

    console.log("\n── TASK 1: timeout ──");
    r = await attempts([{ hangUntilAbort: true }, { status: 200 }]);
    ok("T8. a hanging request is aborted and retried", r.calls === 2 && !r.threw && r.ms >= 8_000 && r.ms < 20_000,
      `calls=${r.calls}, elapsed=${r.ms}ms (8s timeout fired)`);

    console.log("\n── TASK 2: validateWhatsAppToken ──");
    const PHONE = "1157897524079611", WABA = "1731582281187448";

    mockGraph([{ body: JSON.stringify({ id: PHONE, display_phone_number: "+1 555 0100", verified_name: "Acme" }) },
               { body: JSON.stringify({ data: [{ id: PHONE }] }) }]);
    let v = await validateWhatsAppToken(PHONE, "tok", WABA);
    restore();
    ok("V1. valid token + valid phone id → accepted", v.valid && v.display_phone_number === "+1 555 0100", `display=${v.display_phone_number}`);

    // A WABA node answers 200 but has no display_phone_number — the old defect.
    mockGraph([{ body: JSON.stringify({ id: WABA, name: "My WABA" }) }]);
    v = await validateWhatsAppToken(WABA, "tok");
    restore();
    ok("V2. WABA id supplied as phone id → rejected", !v.valid && /WhatsApp Business Account/i.test(v.error ?? ""), `"${(v.error ?? "").slice(0, 60)}…"`);

    mockGraph([{ body: JSON.stringify({ id: PHONE, verified_name: "Acme" }) }]);
    v = await validateWhatsAppToken(PHONE, "tok");
    restore();
    ok("V3. missing display_phone_number → rejected", !v.valid);

    mockGraph([{ status: 401, body: JSON.stringify({ error: { message: "Session has expired" } }) }]);
    v = await validateWhatsAppToken(PHONE, "tok");
    restore();
    ok("V4. invalid/expired token → rejected", !v.valid && /expired/i.test(v.error ?? ""), `"${v.error}"`);

    mockGraph([{ body: JSON.stringify({ id: PHONE, display_phone_number: "+1 555 0100" }) },
               { body: JSON.stringify({ data: [{ id: "999999" }] }) }]);
    v = await validateWhatsAppToken(PHONE, "tok", WABA);
    restore();
    ok("V5. phone not owned by the given WABA → rejected", !v.valid && /does not belong/i.test(v.error ?? ""), `"${(v.error ?? "").slice(0, 60)}…"`);

    mockGraph([{ body: "not json" }]);
    v = await validateWhatsAppToken(PHONE, "tok");
    restore();
    ok("V6. unreadable Meta response → fails closed", !v.valid);

    mockGraph([{ body: JSON.stringify({ id: "SOMETHING_ELSE", display_phone_number: "+1 555 0100" }) }]);
    v = await validateWhatsAppToken(PHONE, "tok");
    restore();
    ok("V7. Meta echoes a different object → rejected", !v.valid && /different object/i.test(v.error ?? ""));

    const SECRET = "super-secret-token-value";
    mockGraph([{ status: 401, body: JSON.stringify({ error: { message: "Invalid OAuth access token" } }) }]);
    v = await validateWhatsAppToken(PHONE, SECRET);
    restore();
    ok("V8. no token leakage in the returned error", !String(v.error ?? "").includes(SECRET), "error text carries no token");
  } finally {
    restore();
    for (const t of ["messages", "conversations", "leads", "integrations"]) await db.from(t).delete().eq("org_id", ORG);
    await db.from("orgs").delete().eq("id", ORG);
    const left = (await db.from("orgs").select("id", { count: "exact", head: true }).eq("id", ORG)).count;
    console.log(`\n  cleanup: scratch rows left=${left} ${left === 0 ? "✅" : "❌"}`);
  }

  console.log("\n" + "═".repeat(72));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log("═".repeat(72));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { restore(); console.error("FATAL: " + (e as Error).message); process.exit(2); });
