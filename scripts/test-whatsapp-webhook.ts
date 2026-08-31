/**
 * WhatsApp webhook regression suite — status callbacks + inbound idempotency.
 *
 *   npx tsx scripts/test-whatsapp-webhook.ts [baseUrl]
 *
 * Runs against a locally running dev server by default. Everything happens
 * inside a disposable scratch org that is created at the start and deleted at
 * the end; no other tenant's rows are read or written, and the suite fails if
 * the surrounding data changes.
 *
 * Requires migration 038. The suite detects whether it has been applied and
 * reports the schema-dependent cases as BLOCKED rather than failing them, so a
 * missing migration can never be mistaken for a code defect.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_APP_SECRET.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, randomBytes } from "crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const URL_WA = `${BASE}/api/webhooks/whatsapp`;
const URL_IG = `${BASE}/api/webhooks/meta/instagram`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_SECRET = process.env.META_APP_SECRET!;
if (!SUPABASE_URL || !SERVICE_KEY || !APP_SECRET) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / META_APP_SECRET");
  process.exit(2);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TAG = randomBytes(4).toString("hex");
const ORG = randomUUID();
const PHONE_ID = `PN_TEST_${TAG}`;          // matched by the webhook's org routing
const SENDER = `9199${TAG.replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`;

let pass = 0, fail = 0, blocked = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? "  — " + d : ""}`); };
const skip = (n: string, why: string) => { blocked++; console.log(`  ⏸  ${n}  — BLOCKED: ${why}`); };

const sign = (body: string) => "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
async function post(url: string, body: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
    body,
  });
  return { status: r.status, text: (await r.text()).slice(0, 80) };
}

const inboundBody = (wamid: string, text = "hello") => JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "E1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "1555", phone_number_id: PHONE_ID },
    contacts: [{ profile: { name: "Scratch Sender" }, wa_id: SENDER }],
    messages: [{ id: wamid, from: SENDER, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  } }] }],
});

const statusBody = (wamid: string, status: string, errors?: unknown[]) => JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "E1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "1555", phone_number_id: PHONE_ID },
    statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: SENDER, ...(errors ? { errors } : {}) }],
  } }] }],
});

const countMessages = async () =>
  (await db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", ORG)).count as number;
const getByWamid = async (wamid: string) =>
  (await db.from("messages").select("id,status,failure_reason,status_updated_at,direction").eq("org_id", ORG).eq("provider_message_id", wamid).maybeSingle()).data;

async function outsideFingerprint() {
  const [m, c] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true }).neq("org_id", ORG),
    db.from("conversations").select("id", { count: "exact", head: true }).neq("org_id", ORG),
  ]);
  return `${m.count}/${c.count}`;
}

(async () => {
  console.log("═".repeat(70));
  console.log("WHATSAPP WEBHOOK SUITE — status callbacks + inbound idempotency");
  console.log(`  target: ${BASE}\n  scratch org: ${ORG}`);
  console.log("═".repeat(70));

  const before = await outsideFingerprint();

  // Is migration 038 applied?
  const probe = await db.from("messages").select("status,status_updated_at,failure_reason").limit(1);
  const hasSchema = !probe.error;
  console.log(`\n  migration 038 applied: ${hasSchema ? "YES ✅" : "NO ❌ (" + String(probe.error?.message).slice(0, 60) + ")"}\n`);

  await db.from("orgs").insert({ id: ORG, slug: `zz-wa-${TAG}`, name: `ZZ WA SUITE ${TAG} — DELETE ME`, channel_config: {} });
  await db.from("integrations").insert({
    org_id: ORG, provider: "whatsapp_cloud", active: true,
    config: { phone_number_id: PHONE_ID, waba_id: `WABA_${TAG}`, display_phone_number: "1555", access_token_enc: "x:y:z" },
  });

  try {
    // Inbound writes go through an upsert whose ON CONFLICT target is the unique
    // index added by 038. Without the migration the insert cannot succeed at all,
    // so these are blocked rather than failed.
    if (!hasSchema) {
      ["1. inbound creates exactly one message", "2. same wamid twice → still one message", "3. 5 concurrent duplicates → exactly one message"]
        .forEach((n) => skip(n, "needs the unique index from 038 (upsert ON CONFLICT target)"));
    } else {
      // ── 1 ── inbound creates exactly one message
      const w1 = `wamid.TEST_${TAG}_1`;
      const r1 = await post(URL_WA, inboundBody(w1));
      ok("1. inbound creates exactly one message", r1.status === 200 && (await countMessages()) === 1, `HTTP ${r1.status}, count=${await countMessages()}`);

      // ── 2 ── same wamid twice
      const r2 = await post(URL_WA, inboundBody(w1));
      ok("2. same wamid twice → still one message", r2.status === 200 && (await countMessages()) === 1, `HTTP ${r2.status} (200 required so Meta stops retrying), count=${await countMessages()}`);

      // ── 3 ── concurrent duplicates
      const w3 = `wamid.TEST_${TAG}_3`;
      const conc = await Promise.all([1, 2, 3, 4, 5].map(() => post(URL_WA, inboundBody(w3))));
      const n3 = (await db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", ORG).eq("provider_message_id", w3)).count;
      ok("3. 5 concurrent duplicates → exactly one message", n3 === 1 && conc.every((r) => r.status === 200), `rows=${n3}, all HTTP 200=${conc.every((r) => r.status === 200)}`);
    }

    // ── status fixtures ────────────────────────────────────────────────────
    // Built independently of the inbound cases above so the status tests still
    // run when the inbound path is blocked on the migration.
    const wOut = `wamid.TEST_${TAG}_OUT`;
    // Distinct external_id: the inbound cases above may already have created a
    // lead for SENDER, and leads are unique per (org, channel, external_id).
    const { data: fxLead, error: fxLeadErr } = await db.from("leads").insert({
      org_id: ORG, channel: "whatsapp_cloud", external_id: `wa_fixture_${TAG}`,
      name: "Status Fixture", stage: "cold", metadata: {},
    }).select("id").single();
    if (fxLeadErr || !fxLead) throw new Error("status fixture lead insert failed: " + fxLeadErr?.message);
    const { data: conv, error: convErr } = await db.from("conversations").insert({
      org_id: ORG, lead_id: fxLead.id, channel_provider: "whatsapp_cloud",
    }).select("id").single();
    if (convErr || !conv) throw new Error("status fixture conversation insert failed: " + convErr?.message);
    await db.from("messages").insert({
      conversation_id: conv.id, org_id: ORG, direction: "outbound", content: "outbound fixture",
      sent_at: new Date().toISOString(), provider_message_id: wOut, metadata: { source: "test" },
    });

    if (!hasSchema) {
      ["4. sent status", "5. delivered status", "6. read status", "7. failed stores failure state", "9. duplicate status is harmless"].forEach((n) => skip(n, "needs status columns from 038"));
    } else {
      // ── 4 ── sent
      await post(URL_WA, statusBody(wOut, "sent"));
      ok("4. sent status updates the outbound message", (await getByWamid(wOut))?.status === "sent", `status=${(await getByWamid(wOut))?.status}`);

      // ── 5 ── delivered
      await post(URL_WA, statusBody(wOut, "delivered"));
      ok("5. delivered status updates correctly", (await getByWamid(wOut))?.status === "delivered", `status=${(await getByWamid(wOut))?.status}`);

      // ── 6 ── read
      await post(URL_WA, statusBody(wOut, "read"));
      ok("6. read status updates correctly", (await getByWamid(wOut))?.status === "read", `status=${(await getByWamid(wOut))?.status}`);

      // ── 6b ── monotonic: a late `sent` must not regress `read`
      await post(URL_WA, statusBody(wOut, "sent"));
      ok("6b. out-of-order status cannot regress state", (await getByWamid(wOut))?.status === "read", `still ${(await getByWamid(wOut))?.status}`);

      // ── 9 ── duplicate status is harmless
      const beforeDup = await getByWamid(wOut);
      await post(URL_WA, statusBody(wOut, "read"));
      const afterDup = await getByWamid(wOut);
      ok("9. duplicate status webhook is harmless", afterDup?.status === "read" && afterDup?.status_updated_at === beforeDup?.status_updated_at && (await countMessages()) === 3,
        `status unchanged, timestamp unchanged, no new rows`);

      // ── 7 ── failed
      const wFail = `wamid.TEST_${TAG}_FAIL`;
      await db.from("messages").insert({
        conversation_id: conv.id, org_id: ORG, direction: "outbound", content: "fail fixture",
        sent_at: new Date().toISOString(), provider_message_id: wFail, metadata: { source: "test" },
      });
      await post(URL_WA, statusBody(wFail, "failed", [{ code: 131047, title: "Re-engagement message" }]));
      const f = await getByWamid(wFail);
      ok("7. failed status stores failure state", f?.status === "failed" && !!f?.failure_reason, `status=${f?.status} reason="${f?.failure_reason}"`);
    }

    // ── 8 ── unknown wamid must not create or corrupt anything
    const cBefore = await countMessages();
    const r8 = await post(URL_WA, statusBody(`wamid.TEST_${TAG}_UNKNOWN`, "delivered"));
    ok("8. unknown wamid status does not corrupt data", r8.status === 200 && (await countMessages()) === cBefore, `HTTP ${r8.status}, count ${cBefore} → ${await countMessages()}`);

    // ── 10 ── other channels unchanged
    const igUnsigned = await fetch(URL_IG, { method: "POST", headers: { "content-type": "application/json" }, body: '{"object":"instagram","entry":[]}' });
    const igBadToken = await fetch(`${URL_IG}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
    const waBadToken = await fetch(`${URL_WA}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
    const waUnsigned = await fetch(URL_WA, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    // Instagram rejects with 401 where INSTAGRAM_APP_SECRET is configured, and
    // 500 "Server misconfigured" where it is not (a local .env.local typically
    // has no Instagram secret). Both are fail-closed; neither processes the body.
    const igSecretConfigured = igUnsigned.status === 401;
    ok("10. Instagram + WhatsApp auth behaviour unchanged",
      (igUnsigned.status === 401 || igUnsigned.status === 500) && igBadToken.status === 403
      && waBadToken.status === 403 && waUnsigned.status === 401,
      `IG unsigned=${igUnsigned.status}${igSecretConfigured ? "" : " (500 = no INSTAGRAM_APP_SECRET locally; production returns 401)"} `
      + `IG token=${igBadToken.status} WA token=${waBadToken.status} WA unsigned=${waUnsigned.status}`);
  } finally {
    for (const t of ["messages", "conversations", "leads", "integrations"]) await db.from(t).delete().eq("org_id", ORG);
    await db.from("orgs").delete().eq("id", ORG);
    const left = (await db.from("orgs").select("id", { count: "exact", head: true }).eq("id", ORG)).count;
    console.log(`\n  cleanup: scratch rows left=${left} ${left === 0 ? "✅" : "❌"}`);
  }

  const after = await outsideFingerprint();
  console.log(`  data outside the scratch org: ${before} → ${after} ${before === after ? "✅ unchanged" : "❌ CHANGED"}`);
  console.log("\n" + "═".repeat(70));
  console.log(`RESULT: ${pass} passed, ${fail} failed, ${blocked} blocked`);
  console.log("═".repeat(70));
  process.exit(fail === 0 && before === after ? 0 : 1);
})().catch((e) => { console.error("FATAL: " + (e as Error).message); process.exit(2); });
