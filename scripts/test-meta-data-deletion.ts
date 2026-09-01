/**
 * Meta data-deletion + deauthorize regression suite.
 *
 *   npx tsx scripts/test-meta-data-deletion.ts [baseUrl]
 *
 * Covers Meta's User Data Deletion Callback, the Deauthorize Callback, the
 * status page, and the deletion cascade itself.
 *
 * EVERYTHING runs inside disposable scratch orgs created at the start and
 * deleted at the end. The cascade is exercised against scratch leads only —
 * never a production lead, conversation, booking or message — and the suite
 * fails if any surrounding data changes.
 *
 * Three tenants are needed to prove multi-tenant scoping:
 *   ORG_A  the org whose lead is being deleted
 *   ORG_B  a second org holding an UNRELATED Instagram lead + WhatsApp lead
 *   ORG_C  the same Meta user as a lead in a different org (cross-org fan-out)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_APP_SECRET.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, randomBytes } from "crypto";
import { cascadeDeleteLead, findLeadsForMetaUser } from "@/lib/inngest/functions/on-meta-data-deletion";

const BASE = process.argv[2] ?? "http://localhost:3000";
const URL_DEL    = `${BASE}/api/meta/data-deletion`;
const URL_DEAUTH = `${BASE}/api/meta/deauthorize`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_SECRET   = process.env.META_APP_SECRET!;
if (!SUPABASE_URL || !SERVICE_KEY || !APP_SECRET) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / META_APP_SECRET");
  process.exit(2);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TAG = randomBytes(4).toString("hex");
const ORG_A = randomUUID(), ORG_B = randomUUID(), ORG_C = randomUUID();
const META_USER = `9${TAG.replace(/\D/g, "").padEnd(10, "7").slice(0, 10)}`;   // scratch IGSID
const OTHER_META_USER = `8${TAG.replace(/\D/g, "").padEnd(10, "3").slice(0, 10)}`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) pass++; else fail++;
  console.log(`  ${c ? "✅" : "❌"} ${n}${d ? "  — " + d : ""}`);
};

// ── signed_request helpers ───────────────────────────────────────────────────
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function signedRequest(payload: Record<string, unknown>, secret = APP_SECRET): string {
  const encoded = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(encoded).digest();
  return `${b64url(sig)}.${encoded}`;
}
async function postSigned(url: string, sr: string | null, asJson = true) {
  const init: RequestInit = asJson
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sr === null ? {} : { signed_request: sr }) }
    : { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: sr === null ? "" : `signed_request=${encodeURIComponent(sr)}` };
  const r = await fetch(url, init);
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, text: text.slice(0, 200), json };
}

const countMessages = async (convId: string) =>
  (await db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId)).count as number;
const lead = async (id: string) =>
  (await db.from("leads").select("id,name,external_id,phone,instagram_handle,deleted_at,org_id").eq("id", id).maybeSingle()).data;

async function outsideFingerprint() {
  const scratch = `(${[ORG_A, ORG_B, ORG_C].join(",")})`;
  const [l, m, c, b] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).not("org_id", "in", scratch),
    db.from("messages").select("id", { count: "exact", head: true }).not("org_id", "in", scratch),
    db.from("conversations").select("id", { count: "exact", head: true }).not("org_id", "in", scratch),
    db.from("bookings").select("id", { count: "exact", head: true }).not("org_id", "in", scratch),
  ]);
  return `${l.count}/${m.count}/${c.count}/${b.count}`;
}

(async () => {
  console.log("═".repeat(74));
  console.log("META DATA DELETION + DEAUTHORIZE SUITE");
  console.log(`  target: ${BASE}`);
  console.log(`  scratch orgs: A=${ORG_A} B=${ORG_B} C=${ORG_C}`);
  console.log("═".repeat(74));

  const before = await outsideFingerprint();
  const ids: Record<string, string> = {};

  try {
    // ── fixtures ────────────────────────────────────────────────────────────
    for (const [id, s] of [[ORG_A, "a"], [ORG_B, "b"], [ORG_C, "c"]] as const) {
      await db.from("orgs").insert({ id, slug: `zz-mdd-${s}-${TAG}`, name: `ZZ META DELETION ${s} ${TAG} — DELETE ME`, channel_config: {} });
    }

    const mkLead = async (org: string, external: string, channel: string, name: string) =>
      (await db.from("leads").insert({
        org_id: org, channel, external_id: external, name,
        stage: "cold", metadata: {}, instagram_handle: channel === "instagram" ? `@${name}` : null,
      }).select("id").single()).data.id;
    const mkConv = async (org: string, leadId: string, provider: string) =>
      (await db.from("conversations").insert({ org_id: org, lead_id: leadId, channel_provider: provider }).select("id").single()).data.id;
    const mkMsg = async (org: string, convId: string, n: number) => {
      for (let i = 0; i < n; i++) {
        await db.from("messages").insert({
          conversation_id: convId, org_id: org, direction: i % 2 ? "outbound" : "inbound",
          content: `scratch dm ${i}`, sent_at: new Date(Date.now() - i * 1000).toISOString(), metadata: { source: "instagram" },
        });
      }
    };

    // ORG_A: the target — IG lead for META_USER, with conversation + messages + booking + active sequence
    ids.leadA = await mkLead(ORG_A, `ig_${META_USER}`, "instagram", "Target Lead");
    ids.convA = await mkConv(ORG_A, ids.leadA, "meta_instagram");
    await mkMsg(ORG_A, ids.convA, 4);
    ids.bookA = (await db.from("bookings").insert({ org_id: ORG_A, lead_id: ids.leadA, status: "confirmed" }).select("id").single()).data.id;
    await db.from("sequence_runs").insert({ org_id: ORG_A, lead_id: ids.leadA, conversation_id: ids.convA, type: "dunning", status: "active", step_current: 1 });

    // ORG_A also holds an UNRELATED IG lead that must survive untouched
    ids.leadAOther = await mkLead(ORG_A, `ig_${OTHER_META_USER}`, "instagram", "Bystander Lead");
    ids.convAOther = await mkConv(ORG_A, ids.leadAOther, "meta_instagram");
    await mkMsg(ORG_A, ids.convAOther, 3);

    // ORG_B: a different tenant, unrelated IG lead + a WhatsApp lead
    ids.leadB = await mkLead(ORG_B, `ig_${OTHER_META_USER}`, "instagram", "Other Org IG");
    ids.convB = await mkConv(ORG_B, ids.leadB, "meta_instagram");
    await mkMsg(ORG_B, ids.convB, 2);
    ids.leadBwa = await mkLead(ORG_B, `wa_${META_USER}`, "whatsapp_cloud", "Other Org WA");
    ids.convBwa = await mkConv(ORG_B, ids.leadBwa, "whatsapp_cloud");
    await mkMsg(ORG_B, ids.convBwa, 3);
    ids.bookB = (await db.from("bookings").insert({ org_id: ORG_B, lead_id: ids.leadB, status: "confirmed" }).select("id").single()).data.id;

    // ORG_C: the SAME Meta user as a lead in a second tenant (cross-org fan-out)
    ids.leadC = await mkLead(ORG_C, `ig_${META_USER}`, "instagram", "Same Person Elsewhere");
    ids.convC = await mkConv(ORG_C, ids.leadC, "meta_instagram");
    await mkMsg(ORG_C, ids.convC, 2);

    console.log("\n  fixture: 3 scratch orgs, 5 leads, 5 conversations, 14 messages, 2 bookings, 1 active sequence\n");

    // ══ CALLBACK — signature handling ══════════════════════════════════════
    console.log("── data-deletion callback ──");

    const good = signedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER });
    const r1 = await postSigned(URL_DEL, good);
    ok("1. valid signed deletion request → 200 with confirmation_code + url",
      r1.status === 200 && typeof r1.json.confirmation_code === "string" && typeof r1.json.url === "string"
      && String(r1.json.url).includes("/data-deletion-status?id="),
      `status=${r1.status}`);
    const code1 = String(r1.json.confirmation_code ?? "");

    const badSig = signedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER }, "wrong-secret-" + TAG);
    const r2 = await postSigned(URL_DEL, badSig);
    ok("2. invalid signature → 403", r2.status === 403, `status=${r2.status} ${r2.text}`);

    const r3a = await postSigned(URL_DEL, null);
    const r3b = await postSigned(URL_DEL, "no-dot-here");
    const r3c = await postSigned(URL_DEL, `${b64url(Buffer.from("x"))}.${b64url(Buffer.from("{not json"))}`);
    const r3d = await postSigned(URL_DEL, signedRequest({ algorithm: "PLAINTEXT", user_id: META_USER }));
    const r3e = await postSigned(URL_DEL, signedRequest({ algorithm: "HMAC-SHA256" }));
    ok("3. malformed requests → 400",
      [r3a, r3b, r3c, r3d, r3e].every((r) => r.status === 400),
      `missing=${r3a.status} no-dot=${r3b.status} bad-json=${r3c.status} bad-algo=${r3d.status} no-user=${r3e.status}`);

    ok("3b. form-encoded body is accepted too (Meta's default)",
      (await postSigned(URL_DEL, signedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER }), false)).status === 200,
      "application/x-www-form-urlencoded");

    // The running dev server has META_APP_SECRET set and cannot be restarted
    // without disturbing it, so the fail-closed branch is exercised by calling
    // the real route handler in-process with the variable removed. There is no
    // platform_settings row to fall back to, so this reaches the 500 branch —
    // and it must NOT silently accept the request.
    {
      const { NextRequest } = await import("next/server");
      const { POST: deletionPOST } = await import("@/app/api/meta/data-deletion/route");
      const saved = process.env.META_APP_SECRET;
      delete process.env.META_APP_SECRET;
      let res: Response;
      try {
        res = await deletionPOST(new NextRequest("http://localhost/api/meta/data-deletion", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ signed_request: good }),
        }));
      } finally {
        process.env.META_APP_SECRET = saved;
      }
      const body = await res.text();
      ok("4. missing app secret → 500, request rejected rather than trusted",
        res.status === 500 && !body.includes("confirmation_code"),
        `status=${res.status} — fails closed, issues no confirmation code`);
    }

    const r5 = await postSigned(URL_DEL, good);
    ok("5. repeated callback → safe, new code, no error",
      r5.status === 200 && r5.json.confirmation_code !== code1,
      "each request gets its own confirmation code, as Meta expects");

    const recorded = (await db.from("meta_data_deletion_requests").select("id", { count: "exact", head: true }).eq("meta_user_id", META_USER)).count;
    ok("5b. requests are recorded for the status endpoint", recorded >= 2, `${recorded} rows recorded`);

    // ══ WORKER — the cascade ═══════════════════════════════════════════════
    console.log("\n── deletion cascade (scratch data only) ──");

    const matched = await findLeadsForMetaUser(db, META_USER);
    ok("6a. matcher finds the lead in BOTH orgs holding this Meta user",
      matched.length === 2 && matched.some((l) => l.org_id === ORG_A) && matched.some((l) => l.org_id === ORG_C),
      `${matched.length} leads: ORG_A + ORG_C`);
    ok("6b. matcher does NOT match the WhatsApp lead with the same digits",
      !matched.some((l) => l.id === ids.leadBwa),
      "wa_<id> never collides with ig_<id>");

    const msgsBefore = await countMessages(ids.convA);
    const counts = await cascadeDeleteLead(db, matched.find((l) => l.org_id === ORG_A)!);
    ok("6. worker HARD DELETES the affected messages",
      (await countMessages(ids.convA)) === 0 && counts.messages === msgsBefore,
      `${msgsBefore} → 0 (deleted ${counts.messages})`);

    const la = await lead(ids.leadA);
    ok("7. worker anonymises the correct lead",
      la?.name === "Deleted lead" && la?.phone === null && la?.instagram_handle === null
      && String(la?.external_id).startsWith("deleted_") && !!la?.deleted_at,
      "name/phone/handle cleared, external_id rewritten, deleted_at set");

    const cvA = (await db.from("conversations").select("deleted_at").eq("id", ids.convA).maybeSingle()).data;
    const bkA = (await db.from("bookings").select("deleted_at").eq("id", ids.bookA).maybeSingle()).data;
    const seq = (await db.from("sequence_runs").select("status").eq("org_id", ORG_A).eq("lead_id", ids.leadA).maybeSingle()).data;
    ok("8. worker soft-deletes the affected conversation + booking, stops the sequence",
      !!cvA?.deleted_at && !!bkA?.deleted_at && seq?.status === "stopped",
      `conv deleted_at set, booking deleted_at set, sequence=${seq?.status}`);

    // ── isolation ──────────────────────────────────────────────────────────
    ok("9. does NOT touch the OTHER org's data",
      (await countMessages(ids.convB)) === 2
      && (await lead(ids.leadB))?.name === "Other Org IG"
      && !(await db.from("bookings").select("deleted_at").eq("id", ids.bookB).maybeSingle()).data?.deleted_at,
      "ORG_B messages, lead and booking all intact");

    ok("10. does NOT touch WhatsApp data",
      (await countMessages(ids.convBwa)) === 3 && (await lead(ids.leadBwa))?.name === "Other Org WA",
      "wa_ lead and its 3 messages intact");

    ok("11. does NOT touch the unrelated Instagram conversation in the SAME org",
      (await countMessages(ids.convAOther)) === 3
      && (await lead(ids.leadAOther))?.name === "Bystander Lead"
      && !(await db.from("conversations").select("deleted_at").eq("id", ids.convAOther).maybeSingle()).data?.deleted_at,
      "same-org bystander lead untouched — scoping is per conversation, not per org");

    // ── idempotency ────────────────────────────────────────────────────────
    const again = await cascadeDeleteLead(db, { id: ids.leadA, org_id: ORG_A });
    ok("11b. re-running the cascade on the same lead is a harmless no-op",
      again.messages === 0 && again.conversations === 0 && again.bookings === 0 && again.sequences === 0,
      "all guards hold on the second pass");
    ok("11c. a second deletion request for the same Meta user matches only the untouched org",
      (await findLeadsForMetaUser(db, META_USER)).every((l) => l.org_id === ORG_C),
      "ORG_A's lead no longer matches — external_id was rewritten");

    // ══ DEAUTHORIZE ════════════════════════════════════════════════════════
    console.log("\n── deauthorize callback ──");
    const IG_ID = `1784${TAG.replace(/\D/g, "").padEnd(8, "5").slice(0, 8)}`;
    await db.from("integrations").insert({
      org_id: ORG_A, provider: "meta_instagram", active: true,
      config: { page_id: `p_${TAG}`, instagram_business_account_id: IG_ID, ig_username: "zz_scratch",
                access_token_enc: "zz:scratch:token", user_access_token_enc: "zz:scratch:usertoken" },
    });

    const d1 = await postSigned(URL_DEAUTH, signedRequest({ algorithm: "HMAC-SHA256", user_id: IG_ID }));
    const intAfter = (await db.from("integrations").select("active,config").eq("org_id", ORG_A).eq("provider", "meta_instagram").maybeSingle()).data;
    ok("12. deauthorize → 200, integration disconnected and tokens stripped",
      d1.status === 200 && intAfter?.active === false
      && intAfter?.config?.access_token_enc === undefined && intAfter?.config?.user_access_token_enc === undefined
      && !!intAfter?.config?.deauthorized_at,
      `disconnected=${d1.json.disconnected}, tokens removed, identifiers kept`);

    const d2 = await postSigned(URL_DEAUTH, signedRequest({ algorithm: "HMAC-SHA256", user_id: IG_ID }));
    ok("13. repeated deauthorize → still 200, disconnects nothing further",
      d2.status === 200 && d2.json.disconnected === 0, `disconnected=${d2.json.disconnected}`);
    ok("13b. deauthorize rejects a bad signature",
      (await postSigned(URL_DEAUTH, signedRequest({ algorithm: "HMAC-SHA256", user_id: IG_ID }, "nope"))).status === 403,
      "403");
    ok("13c. deauthorize does NOT delete business data",
      (await countMessages(ids.convAOther)) === 3 && !!(await lead(ids.leadAOther)),
      "bystander lead and messages still present after deauthorize");

    // ══ STATUS PAGE ════════════════════════════════════════════════════════
    console.log("\n── status page ──");
    const sres = await fetch(`${BASE}/data-deletion-status?id=${code1}`);
    const shtml = await sres.text();
    ok("14. status URL resolves → 200 and reports the request",
      sres.status === 200 && shtml.includes(code1),
      `HTTP ${sres.status}, ${shtml.length} bytes, code echoed`);
    const sres2 = await fetch(`${BASE}/data-deletion-status?id=definitely-not-a-code-${TAG}`);
    ok("14b. unknown code → 200 'not found', no information disclosed",
      sres2.status === 200 && (await sres2.text()).includes("No request found"),
      "does not confirm or deny anything else");

    // ══ LOG HYGIENE ════════════════════════════════════════════════════════
    console.log("\n── logging hygiene ──");
    ok("15. no secret or message content in the callback responses",
      !r1.text.includes(APP_SECRET) && !d1.text.includes(APP_SECRET)
      && !shtml.includes(APP_SECRET) && !shtml.includes("scratch dm"),
      "app secret and DM bodies absent from every response body");
  } finally {
    for (const org of [ORG_A, ORG_B, ORG_C]) {
      for (const t of ["messages", "sequence_runs", "lead_events", "bookings", "conversations", "leads", "integrations"]) {
        await db.from(t).delete().eq("org_id", org);
      }
      await db.from("orgs").delete().eq("id", org);
    }
    await db.from("meta_data_deletion_requests").delete().eq("meta_user_id", META_USER);
    const left = (await db.from("orgs").select("id", { count: "exact", head: true }).in("id", [ORG_A, ORG_B, ORG_C])).count;
    const reqLeft = (await db.from("meta_data_deletion_requests").select("id", { count: "exact", head: true }).eq("meta_user_id", META_USER)).count;
    console.log(`\n  cleanup: scratch orgs left=${left} ${left === 0 ? "✅" : "❌"}, deletion requests left=${reqLeft} ${reqLeft === 0 ? "✅" : "❌"}`);
  }

  const after = await outsideFingerprint();
  console.log(`  data outside the scratch orgs (leads/messages/convs/bookings): ${before} → ${after} ${before === after ? "✅ unchanged" : "❌ CHANGED"}`);
  console.log("\n" + "═".repeat(74));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log("═".repeat(74));
  process.exit(fail === 0 && before === after ? 0 : 1);
})().catch((e) => { console.error("FATAL: " + (e as Error).message); process.exit(2); });
