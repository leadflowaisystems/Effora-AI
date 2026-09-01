/**
 * Webhook authentication regression suite — Phase A1 P0 fixes.
 *
 *   npx tsx scripts/test-webhook-security.ts [baseUrl]
 *
 * Covers the two fail-open authentication defects found in the production audit:
 *
 *   P0-1  app/api/webhooks/calcom/[orgId]  — verification was skipped entirely
 *         when an org had no webhook secret, payload-supplied lead/conversation
 *         ids were trusted without an ownership check, and the lead update was
 *         not org-scoped.
 *   P0-2  lib/platform-billing.ts          — verifyPlatformWebhookSignature()
 *         returned true when PLATFORM_RAZORPAY_WEBHOOK_SECRET was absent.
 *
 * Everything runs inside three disposable scratch orgs created at the start and
 * deleted at the end. The cross-org cases need two tenants: ORG_A owns the
 * webhook URL, ORG_B plays the victim whose rows must stay untouched.
 *
 * No real message can be sent: the scratch leads deliberately have NO
 * conversation, and both booking Inngest functions return `skipped` on a
 * booking whose conversation_id is null — checked before anything else they do.
 * The scratch orgs also have no WhatsApp or Instagram integration.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, randomBytes } from "crypto";
import { verifyPlatformWebhookSignature } from "@/lib/platform-billing";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const calcomUrl = (orgId: string) => `${BASE}/api/webhooks/calcom/${orgId}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TAG = randomBytes(4).toString("hex");
const ORG_A  = randomUUID();   // owns the webhook URL, has a secret
const ORG_B  = randomUUID();   // the other tenant — its rows must never change
const ORG_NS = randomUUID();   // calcom integration with NO webhook secret
const SECRET_A = `zz_calcom_secret_${TAG}`;
const SECRET_B = `zz_calcom_secret_b_${TAG}`;
let LEAD_A = "", LEAD_B = "", CONV_B = "";
let USER_A = "", USER_B = "";

let pass = 0, fail = 0, blocked = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? "  — " + d : ""}`); };
const skip = (n: string, why: string) => { blocked++; console.log(`  ⏸  ${n}  — BLOCKED: ${why}`); };

/**
 * The Cal.com route ends BOOKING_CREATED with an unguarded `await
 * inngest.send(...)`. With no usable INNGEST_EVENT_KEY that call throws and the
 * route answers 500 — after the booking row and the lead update have already
 * been committed. That is a pre-existing robustness gap (audit P1-1), not part
 * of this security change, so the HTTP status of the two happy-path cases is
 * reported as BLOCKED rather than failed when no key is configured. The
 * database assertions still run and are hard failures.
 */
const INNGEST_KEY = (process.env.INNGEST_EVENT_KEY ?? "").trim();

const signCal = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("hex");

async function postCal(orgId: string, body: string, sig?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig !== undefined) headers["x-cal-signature-256"] = sig;
  const r = await fetch(calcomUrl(orgId), { method: "POST", headers, body });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: r.status, text: text.slice(0, 160), json };
}

// ── Authenticated browser-equivalent requests ──────────────────────────────
// @supabase/ssr 0.4 stores the session in `sb-<ref>-auth-token` as
// "base64-" + base64url(JSON.stringify(session)), split across .0/.1 chunks
// past ~3180 chars. Building it here lets the suite exercise the real
// authorization path of the settings API rather than approximating it.
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const CHUNK = 3180;

function sessionCookie(session: unknown): string {
  const encoded = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const name = `sb-${PROJECT_REF}-auth-token`;
  if (encoded.length <= CHUNK) return `${name}=${encoded}`;
  const parts: string[] = [];
  for (let i = 0, n = 0; i < encoded.length; i += CHUNK, n++) {
    parts.push(`${name}.${n}=${encoded.slice(i, i + CHUNK)}`);
  }
  return parts.join("; ");
}

/** Sign in as a real Supabase user and return a browser-equivalent Cookie header. */
async function signIn(email: string, password: string): Promise<string | null> {
  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return sessionCookie(data.session);
}

async function putIntegration(orgId: string, cookie: string | null, config: Record<string, string>) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  const r = await fetch(`${BASE}/api/orgs/${orgId}/integrations`, {
    method: "PUT", headers,
    body: JSON.stringify({ provider: "calcom", config, active: true }),
  });
  return { status: r.status, text: await r.text() };
}

async function getIntegrations(orgId: string, cookie: string | null) {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  const r = await fetch(`${BASE}/api/orgs/${orgId}/integrations`, { headers });
  return { status: r.status, text: await r.text() };
}

/** The stored calcom config row, straight from the database. */
async function calcomConfig(orgId: string): Promise<Record<string, string>> {
  const { data } = await db.from("integrations").select("config")
    .eq("org_id", orgId).eq("provider", "calcom").maybeSingle();
  return ((data as { config?: Record<string, string> } | null)?.config ?? {}) as Record<string, string>;
}

/** BOOKING_CREATED payload. `lId`/`cId` go in metadata exactly as Cal.com relays them. */
const bookingBody = (opts: { uid: string; email?: string; lId?: string; cId?: string }) =>
  JSON.stringify({
    triggerEvent: "BOOKING_CREATED",
    payload: {
      uid:       opts.uid,
      startTime: new Date(Date.now() + 86_400_000).toISOString(),
      endTime:   new Date(Date.now() + 88_200_000).toISOString(),
      attendees: [{ name: "Scratch Attendee", email: opts.email ?? `zz-attendee-${TAG}@example.test` }],
      metadata:  { ...(opts.lId ? { lId: opts.lId } : {}), ...(opts.cId ? { cId: opts.cId } : {}) },
    },
  });

const leadSnapshot = async (id: string) =>
  (await db.from("leads").select("id,stage,metadata,updated_at").eq("id", id).maybeSingle()).data;
const countBookings = async (orgId: string) =>
  (await db.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId)).count as number;
const countLeads = async (orgId: string) =>
  (await db.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId)).count as number;

async function outsideFingerprint() {
  const scratch = [ORG_A, ORG_B, ORG_NS];
  const [l, b, o] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).not("org_id", "in", `(${scratch.join(",")})`),
    db.from("bookings").select("id", { count: "exact", head: true }).not("org_id", "in", `(${scratch.join(",")})`),
    db.from("orgs").select("id", { count: "exact", head: true }),
  ]);
  return `${l.count}/${b.count}/${o.count}`;
}

/**
 * Run fn with console.{log,warn,error} captured.
 * Returns [fn's value, everything written] — the value is returned rather than
 * assigned into an outer variable so TypeScript can still narrow it.
 */
async function captureConsole<T>(fn: () => T | Promise<T>): Promise<[T, string]> {
  const lines: string[] = [];
  const cap = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  const [l, w, e] = [console.log, console.warn, console.error];
  console.log = cap; console.warn = cap; console.error = cap;
  let value: T;
  try { value = await fn(); } finally { console.log = l; console.warn = w; console.error = e; }
  return [value!, lines.join("\n")];
}

(async () => {
  console.log("═".repeat(72));
  console.log("WEBHOOK AUTHENTICATION SUITE — Cal.com + platform billing (P0-1, P0-2)");
  console.log(`  target: ${BASE}`);
  console.log(`  scratch orgs: A=${ORG_A}  B=${ORG_B}  no-secret=${ORG_NS}`);
  console.log("═".repeat(72));

  const before = await outsideFingerprint();

  try {
    // ── fixtures ────────────────────────────────────────────────────────────
    for (const [id, slug] of [[ORG_A, "a"], [ORG_B, "b"], [ORG_NS, "ns"]] as const) {
      await db.from("orgs").insert({
        id, slug: `zz-whs-${slug}-${TAG}`, name: `ZZ WEBHOOK SEC ${slug} ${TAG} — DELETE ME`,
        channel_config: {},
        // Set so the org layout renders the settings page instead of bouncing
        // to the onboarding wizard when the S5 case fetches it.
        onboarding_completed_at: new Date().toISOString(),
      });
    }
    // ORG_A and ORG_B each have their own Cal.com webhook secret; ORG_B's
    // exists so the "same uid in another org" case has a signable endpoint.
    //
    // Seeded in the ENCRYPTED form, exactly as the integrations route writes it,
    // so the suite exercises getWebhookSecret's decrypt path rather than its
    // legacy plaintext fallback.
    await db.from("integrations").insert({
      org_id: ORG_A, provider: "calcom", active: true,
      config: { cal_link: "https://cal.com/zz-scratch", webhook_secret_enc: encryptSecret(SECRET_A) },
    });
    await db.from("integrations").insert({
      org_id: ORG_B, provider: "calcom", active: true,
      config: { cal_link: "https://cal.com/zz-scratch-b", webhook_secret_enc: encryptSecret(SECRET_B) },
    });
    // ORG_NS: Cal.com configured but NO webhook secret — the fail-open case.
    await db.from("integrations").insert({
      org_id: ORG_NS, provider: "calcom", active: true,
      config: { cal_link: "https://cal.com/zz-scratch-ns" },
    });

    const { data: la } = await db.from("leads").insert({
      org_id: ORG_A, channel: "manual", external_id: `zz-a-${TAG}@example.test`,
      name: "Scratch A", stage: "hot", metadata: {},
    }).select("id").single();
    LEAD_A = la.id;

    const { data: lb } = await db.from("leads").insert({
      org_id: ORG_B, channel: "manual", external_id: `zz-b-${TAG}@example.test`,
      name: "Scratch B (victim)", stage: "cold", metadata: {},
    }).select("id").single();
    LEAD_B = lb.id;

    // ORG_B also gets a conversation, so the cross-org cId case has a real
    // foreign target to aim at. ORG_A's lead deliberately has none.
    const { data: cb } = await db.from("conversations").insert({
      org_id: ORG_B, lead_id: LEAD_B, channel_provider: "manual",
    }).select("id").single();
    CONV_B = cb.id;

    const convA = (await db.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", ORG_A)).count;
    console.log(`\n  fixture: ORG_A has ${convA} conversations → booking Inngest functions skip, no message can be sent`);
    console.log(`  fixture: ORG_A has no WhatsApp/Instagram integration either\n`);

    // ══ CAL.COM ════════════════════════════════════════════════════════════
    console.log("── P0-1  Cal.com webhook authentication ──");

    // 1. missing secret → 503
    const r1 = await postCal(ORG_NS, bookingBody({ uid: `zz-uid-1-${TAG}` }), signCal("x", "anything"));
    ok("1. no webhook secret configured → 503, nothing processed",
      r1.status === 503 && (await countBookings(ORG_NS)) === 0,
      `status=${r1.status}, bookings in that org=${await countBookings(ORG_NS)}`);

    // 2. missing signature → 401
    const body2 = bookingBody({ uid: `zz-uid-2-${TAG}` });
    const r2 = await postCal(ORG_A, body2);           // header omitted entirely
    ok("2. secret configured but signature header absent → 401",
      r2.status === 401, `status=${r2.status} ${r2.text}`);

    // 3. invalid signature → 401
    const body3 = bookingBody({ uid: `zz-uid-3-${TAG}` });
    const r3 = await postCal(ORG_A, body3, signCal(body3, "the-wrong-secret"));
    ok("3. signature computed with the wrong secret → 401",
      r3.status === 401, `status=${r3.status} ${r3.text}`);

    // 8. no DB side effect before verification (checked against 2 + 3 above)
    ok("8. no database side effect before verification succeeds",
      (await countBookings(ORG_A)) === 0 && (await countLeads(ORG_A)) === 1,
      `bookings=${await countBookings(ORG_A)} (expected 0), leads=${await countLeads(ORG_A)} (expected 1 — no stub lead created)`);

    // 4. valid signature → existing behaviour preserved
    const body4 = bookingBody({ uid: `zz-uid-4-${TAG}`, email: `zz-a-${TAG}@example.test` });
    const r4 = await postCal(ORG_A, body4, signCal(body4, SECRET_A));
    const bk4 = (await db.from("bookings").select("id,lead_id,status,cal_booking_uid").eq("org_id", ORG_A).eq("cal_booking_uid", `zz-uid-4-${TAG}`).maybeSingle()).data;
    ok("4. valid signature → accepted and processed, existing behaviour preserved",
      !!bk4 && bk4.status === "confirmed" && bk4.lead_id === LEAD_A,
      `booking=${bk4 ? "created, lead matched by attendee email" : "MISSING"}`);
    const leadA4 = await leadSnapshot(LEAD_A);
    ok("4b. lead advanced to booked via the org-scoped update",
      leadA4?.stage === "booked", `stage=${leadA4?.stage}`);
    if (INNGEST_KEY) {
      ok("4c. valid signature → HTTP 200", r4.status === 200, `status=${r4.status}`);
    } else {
      skip("4c. valid signature → HTTP 200",
        `INNGEST_EVENT_KEY is empty, so the route's unguarded inngest.send throws and returns ${r4.status} ` +
        `AFTER the booking and lead update commit — pre-existing (audit P1-1), unrelated to this fix`);
    }

    // 5. attacker-supplied lId belonging to ORG_B → rejected
    const bBefore = await leadSnapshot(LEAD_B);
    const body5 = bookingBody({ uid: `zz-uid-5-${TAG}`, lId: LEAD_B });
    const r5 = await postCal(ORG_A, body5, signCal(body5, SECRET_A));   // correctly signed for ORG_A
    const bAfter5 = await leadSnapshot(LEAD_B);
    ok("5. signed request naming ANOTHER org's lead → 404, rejected",
      r5.status === 404, `status=${r5.status} ${r5.text}`);
    ok("5b. the other org's lead is completely unchanged",
      bAfter5?.stage === bBefore?.stage && bAfter5?.updated_at === bBefore?.updated_at
      && JSON.stringify(bAfter5?.metadata) === JSON.stringify(bBefore?.metadata),
      `stage still "${bAfter5?.stage}", updated_at and metadata identical`);
    ok("5c. no booking was created for the rejected request",
      !(await db.from("bookings").select("id").eq("cal_booking_uid", `zz-uid-5-${TAG}`).maybeSingle()).data,
      "no bookings row carries that uid in any org");

    // 5d. same check for the conversation id
    const body5d = bookingBody({ uid: `zz-uid-5d-${TAG}`, cId: CONV_B });
    const r5d = await postCal(ORG_A, body5d, signCal(body5d, SECRET_A));
    ok("5d. signed request naming ANOTHER org's conversation → 404",
      r5d.status === 404, `status=${r5d.status} — blocks messaging into a foreign thread`);

    // 6. valid lId belonging to ORG_A → existing behaviour
    const body6 = bookingBody({ uid: `zz-uid-6-${TAG}`, lId: LEAD_A });
    const r6 = await postCal(ORG_A, body6, signCal(body6, SECRET_A));
    const bk6 = (await db.from("bookings").select("id,lead_id").eq("org_id", ORG_A).eq("cal_booking_uid", `zz-uid-6-${TAG}`).maybeSingle()).data;
    ok("6. lId owned by the requesting org → accepted, booking attached to it",
      bk6?.lead_id === LEAD_A, `booking created and attached to the org's own lead`);
    if (INNGEST_KEY) {
      ok("6b. owned lId → HTTP 200", r6.status === 200, `status=${r6.status}`);
    } else {
      skip("6b. owned lId → HTTP 200", `same unguarded inngest.send as 4c (status=${r6.status})`);
    }

    // 7. forged (unsigned) request naming another org's lead
    const bBefore7 = await leadSnapshot(LEAD_B);
    const body7 = bookingBody({ uid: `zz-uid-7-${TAG}`, lId: LEAD_B });
    const r7 = await postCal(ORG_A, body7);                      // no signature at all
    const bAfter7 = await leadSnapshot(LEAD_B);
    ok("7. forged unsigned request cannot mutate a cross-org lead",
      r7.status === 401
      && bAfter7?.stage === bBefore7?.stage
      && bAfter7?.updated_at === bBefore7?.updated_at
      && !(await db.from("bookings").select("id").eq("cal_booking_uid", `zz-uid-7-${TAG}`).maybeSingle()).data,
      `401 at the door; victim lead unchanged; no booking created`);

    // Unsigned request against the no-secret org, the original attack shape.
    const body7b = bookingBody({ uid: `zz-uid-7b-${TAG}`, lId: LEAD_B });
    const r7b = await postCal(ORG_NS, body7b);
    ok("7b. the original attack (no secret + no signature) is refused",
      r7b.status === 503 && (await leadSnapshot(LEAD_B))?.stage === bBefore7?.stage,
      `status=${r7b.status}, victim lead untouched`);

    // ══ PLATFORM BILLING ═══════════════════════════════════════════════════
    console.log("\n── P0-2  platform billing signature verification ──");

    const BODY = JSON.stringify({ event: "subscription.activated", payload: {} });
    const SENTINEL = `zz_platform_secret_sentinel_${TAG}`;
    const original = process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;

    try {
      // 9. missing secret → false (was: true). The call is wrapped so the
      // module's own warning does not interleave with the result line; the
      // assertion itself is made outside the capture so it stays visible.
      delete process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;
      const [missingResult] = await captureConsole(() => verifyPlatformWebhookSignature(BODY, "anything"));
      ok("9. PLATFORM_RAZORPAY_WEBHOOK_SECRET absent → verification FAILS",
        missingResult === false,
        "fail-closed; an unsigned billing event can no longer activate a plan");

      process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET = "";
      const [blankResult] = await captureConsole(() => verifyPlatformWebhookSignature(BODY, "x"));
      ok("9b. empty-string secret is also treated as absent",
        blankResult === false,
        "an env var present but blank does not re-open the hole");

      process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET = SENTINEL;
      const good = createHmac("sha256", SENTINEL).update(BODY).digest("hex");

      // 11. valid signature → true
      ok("11. correct signature → verification passes",
        verifyPlatformWebhookSignature(BODY, good) === true, "existing valid-signature behaviour preserved");

      // 10. invalid signature → false
      const wrong = createHmac("sha256", "not-the-secret").update(BODY).digest("hex");
      ok("10. signature from the wrong secret → verification fails",
        verifyPlatformWebhookSignature(BODY, wrong) === false, "same length, different digest");
      ok("10b. tampered body with a once-valid signature → fails",
        verifyPlatformWebhookSignature(BODY + " ", good) === false, "signature is over the exact raw body");

      // 12. short / wrong-length / empty signature must not throw
      let threw = "";
      let results: boolean[] = [];
      try {
        results = ["", "a", "sha256=", good.slice(0, 10), good + "ff", "!".repeat(64)]
          .map((s) => verifyPlatformWebhookSignature(BODY, s));
      } catch (e) { threw = (e as Error).message; }
      ok("12. short/long/empty signatures return false without throwing",
        threw === "" && results.length === 6 && results.every((r) => r === false),
        threw ? `THREW: ${threw}` : "6 malformed signatures, all false, no exception");

      // 13. the secret never reaches a log or an error message
      const [, logged] = await captureConsole(() => {
        verifyPlatformWebhookSignature(BODY, good);
        verifyPlatformWebhookSignature(BODY, wrong);
        verifyPlatformWebhookSignature(BODY, "");
        delete process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;
        verifyPlatformWebhookSignature(BODY, "x");   // the branch that does log
        process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET = SENTINEL;
      });
      ok("13. the secret and the expected digest never appear in logs",
        !logged.includes(SENTINEL) && !logged.includes(good),
        `${logged.split("\n").filter(Boolean).length} log line(s) captured, neither value present`);
    } finally {
      if (original === undefined) delete process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;
      else process.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET = original;
    }

    // ══ A2 PART 1 — Cal.com webhook secret settings ════════════════════════
    console.log("\n── A2/1  Cal.com webhook secret configuration ──");

    const PW = randomBytes(12).toString("hex") + "Aa1!";
    const emailA = `zz-whs-a-${TAG}@example.com`;
    const emailB = `zz-whs-b-${TAG}@example.com`;
    const { data: uA, error: uAErr } = await db.auth.admin.createUser({ email: emailA, password: PW, email_confirm: true });
    const { data: uB, error: uBErr } = await db.auth.admin.createUser({ email: emailB, password: PW, email_confirm: true });
    USER_A = uA?.user?.id ?? ""; USER_B = uB?.user?.id ?? "";

    if (!USER_A || !USER_B) {
      skip("S1–S6. settings authorization cases",
        `could not create test auth users: ${uAErr?.message ?? uBErr?.message ?? "unknown"}`);
    } else {
      await db.from("org_members").insert([
        { org_id: ORG_A, user_id: USER_A, role: "owner" },
        { org_id: ORG_B, user_id: USER_B, role: "owner" },
      ]);
      const cookieA = await signIn(emailA, PW);
      const cookieB = await signIn(emailB, PW);

      if (!cookieA || !cookieB) {
        skip("S1–S6. settings authorization cases", "sign-in did not return a session");
      } else {
        const SECRET_V1 = `zz_cal_wh_v1_${TAG}`;
        const SECRET_V2 = `zz_cal_wh_v2_${TAG}`;

        // 1. authenticated org member can save the webhook secret
        const s1 = await putIntegration(ORG_A, cookieA, { cal_link: "https://cal.com/zz-scratch", webhook_secret: SECRET_V1 });
        ok("S1. authenticated org member can save a Cal.com webhook secret",
          s1.status === 200, `status=${s1.status}`);

        // 2. secret is encrypted at rest, plaintext key absent
        const cfg1 = await calcomConfig(ORG_A);
        ok("S2. secret stored encrypted, no plaintext key written",
          !!cfg1.webhook_secret_enc && isEncrypted(cfg1.webhook_secret_enc)
          && cfg1.webhook_secret === undefined
          && decryptSecret(cfg1.webhook_secret_enc) === SECRET_V1,
          `webhook_secret_enc present and decrypts correctly; plaintext key absent`);
        ok("S2b. the stored value is not the plaintext secret",
          !JSON.stringify(cfg1).includes(SECRET_V1),
          "the raw secret string appears nowhere in the stored config");

        // 3. GET never exposes the plaintext secret
        const g1 = await getIntegrations(ORG_A, cookieA);
        ok("S3. GET never returns the plaintext secret",
          g1.status === 200 && !g1.text.includes(SECRET_V1)
          && !g1.text.includes(cfg1.webhook_secret_enc)
          && g1.text.includes("••••••••"),
          "response carries the masked placeholder, neither the secret nor its ciphertext");

        // 4. saving again replaces the secret
        const s4 = await putIntegration(ORG_A, cookieA, { webhook_secret: SECRET_V2 });
        const cfg2 = await calcomConfig(ORG_A);
        ok("S4. saving again replaces the stored secret",
          s4.status === 200 && decryptSecret(cfg2.webhook_secret_enc) === SECRET_V2
          && cfg2.cal_link === "https://cal.com/zz-scratch",
          "new secret stored; cal_link preserved by the config merge");

        // 5. the secret never reaches the client — API responses or page HTML
        const pageRes = await fetch(`${BASE}/org/zz-whs-a-${TAG}/settings/cal`, { headers: { cookie: cookieA } });
        const pageHtml = await pageRes.text();
        ok("S5. secret absent from API responses and from the settings page HTML",
          !s4.text.includes(SECRET_V2) && !pageHtml.includes(SECRET_V2)
          && !!cfg2.webhook_secret_enc && !pageHtml.includes(cfg2.webhook_secret_enc),
          `page ${pageRes.status}, ${pageHtml.length} bytes — neither secret nor ciphertext present`);

        // 6. a member of another org cannot modify this org's Cal.com config
        const before6 = await calcomConfig(ORG_A);
        const s6 = await putIntegration(ORG_A, cookieB, { webhook_secret: "attacker-supplied" });
        const after6 = await calcomConfig(ORG_A);
        ok("S6. a member of another org cannot modify this org's Cal.com config",
          s6.status === 401 && JSON.stringify(before6) === JSON.stringify(after6),
          `status=${s6.status}, stored config byte-identical`);
        ok("S6b. an unauthenticated caller cannot modify it either",
          (await putIntegration(ORG_A, null, { webhook_secret: "anon" })).status === 401
          && JSON.stringify(await calcomConfig(ORG_A)) === JSON.stringify(before6),
          "401 with no session; config unchanged");
        ok("S6c. GET is refused across orgs too",
          (await getIntegrations(ORG_A, cookieB)).status === 401, "no cross-org read of integration config");

        // ── Legacy plaintext twin cleanup ──────────────────────────────────
        // Rows written before the encrypted form existed can carry a plaintext
        // `webhook_secret` next to `webhook_secret_enc`. Saving a new secret
        // must not leave the readable copy behind.
        const LEGACY = `zz_cal_legacy_${TAG}`;
        const SECRET_V3 = `zz_cal_wh_v3_${TAG}`;
        await db.from("integrations")
          .update({ config: { cal_link: "https://cal.com/zz-scratch", webhook_secret: LEGACY, api_key: "zz-legacy-apikey" } })
          .eq("org_id", ORG_A).eq("provider", "calcom");

        const s7 = await putIntegration(ORG_A, cookieA, { webhook_secret: SECRET_V3 });
        const cfg3 = await calcomConfig(ORG_A);
        ok("S7. saving an encrypted secret removes the legacy plaintext twin",
          s7.status === 200 && cfg3.webhook_secret === undefined
          && !!cfg3.webhook_secret_enc && decryptSecret(cfg3.webhook_secret_enc) === SECRET_V3,
          `webhook_secret key deleted; webhook_secret_enc decrypts to the new value`);
        ok("S7b. the legacy value is gone from the row entirely",
          !JSON.stringify(cfg3).includes(LEGACY), "the old plaintext secret appears nowhere in the stored config");
        ok("S7c. unrelated fields survive the merge",
          cfg3.cal_link === "https://cal.com/zz-scratch", `cal_link preserved`);
        ok("S7d. a plaintext field the caller did NOT resend is left alone",
          cfg3.api_key === "zz-legacy-apikey",
          "only fields encrypted by this request are cleared — the last copy of an untouched secret is never destroyed");

        // The decrypt/read path must still work end to end after the cleanup.
        const rd = bookingBody({ uid: `zz-decrypt-${TAG}`, email: `zz-a-${TAG}@example.test` });
        const rdRes = await postCal(ORG_A, rd, signCal(rd, SECRET_V3));
        ok("S7e. the webhook still verifies against the newly stored secret",
          rdRes.status !== 401 && rdRes.status !== 503,
          `status=${rdRes.status} — signature accepted, so getWebhookSecret decrypted it`);
        await db.from("bookings").delete().eq("org_id", ORG_A).eq("cal_booking_uid", `zz-decrypt-${TAG}`);

        // Other providers share this mechanism and must behave identically.
        await db.from("integrations").insert({
          org_id: ORG_A, provider: "razorpay", active: true,
          config: { key_id: "rzp_test_zz", key_secret: `zz_rzp_legacy_${TAG}`, webhook_secret: `zz_rzp_wh_legacy_${TAG}` },
        });
        const rzRes = await fetch(`${BASE}/api/orgs/${ORG_A}/integrations`, {
          method: "PUT", headers: { "content-type": "application/json", cookie: cookieA },
          body: JSON.stringify({ provider: "razorpay", config: { key_id: "rzp_test_zz", key_secret: `zz_rzp_new_${TAG}` }, active: true }),
        });
        const { data: rzRow } = await db.from("integrations").select("config")
          .eq("org_id", ORG_A).eq("provider", "razorpay").maybeSingle();
        const rzCfg = ((rzRow as { config?: Record<string, string> } | null)?.config ?? {}) as Record<string, string>;
        ok("S8. other providers on the shared mechanism behave identically",
          rzRes.status === 200
          && rzCfg.key_secret === undefined
          && decryptSecret(rzCfg.key_secret_enc) === `zz_rzp_new_${TAG}`
          && rzCfg.key_id === "rzp_test_zz",
          "razorpay key_secret twin cleared, encrypted value correct, key_id preserved");
        ok("S8b. a secret the caller did not resend is untouched for other providers too",
          rzCfg.webhook_secret === `zz_rzp_wh_legacy_${TAG}`,
          "razorpay webhook_secret was not resent, so its existing value survives");

        // Restore ORG_A's known secret for the duplicate-booking section.
        await putIntegration(ORG_A, cookieA, { webhook_secret: SECRET_A });
      }
    }

    // ══ A2 PART 2 — duplicate booking protection ═══════════════════════════
    console.log("\n── A2/2  Cal.com duplicate booking protection ──");

    const hasIndex = await (async () => {
      // Probe the constraint directly rather than trusting the migration file.
      const { data: lead } = await db.from("leads").insert({
        org_id: ORG_A, channel: "manual", external_id: `zz-idx-${TAG}@example.test`, name: "Index probe", stage: "cold", metadata: {},
      }).select("id").single();
      const row = { org_id: ORG_A, lead_id: lead.id, cal_booking_uid: `zz-idxprobe-${TAG}`, status: "confirmed" };
      await db.from("bookings").insert(row);
      const { error } = await db.from("bookings").insert(row);
      const applied = error?.code === "23505";
      await db.from("bookings").delete().eq("cal_booking_uid", `zz-idxprobe-${TAG}`);
      await db.from("leads").delete().eq("id", lead.id);
      return applied;
    })();
    console.log(`  migration 039 unique index applied: ${hasIndex ? "YES ✅" : "NO — duplicate cases will be reported as blocked"}`);

    const DUP_UID = `zz-dup-${TAG}`;
    const dupBody = bookingBody({ uid: DUP_UID, email: `zz-a-${TAG}@example.test` });
    const dupSig  = signCal(dupBody, SECRET_A);
    const countByUid = async (orgId: string, uid: string) =>
      (await db.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("cal_booking_uid", uid)).count as number;

    if (!hasIndex) {
      skip("7–12. duplicate booking protection", "migration 039 has not been applied to this database");
    } else {
      const d1 = await postCal(ORG_A, dupBody, dupSig);
      ok("7. first delivery creates exactly one booking",
        (await countByUid(ORG_A, DUP_UID)) === 1, `bookings with that uid = ${await countByUid(ORG_A, DUP_UID)}`);

      const leadBeforeDup = await leadSnapshot(LEAD_A);
      const d2 = await postCal(ORG_A, dupBody, dupSig);
      ok("8. duplicate delivery does not create a second booking",
        (await countByUid(ORG_A, DUP_UID)) === 1, `still ${await countByUid(ORG_A, DUP_UID)} booking`);
      ok("9/10. duplicate takes the no-op branch — no second event, confirmation or reminder chain",
        d2.json.duplicate === true,
        `response reports duplicate=true, so the emit block ran with the same deterministic ids and no DB side effect repeated`);
      ok("10b. duplicate does not re-mutate the lead",
        (await leadSnapshot(LEAD_A))?.updated_at === leadBeforeDup?.updated_at,
        "lead updated_at unchanged by the duplicate");
      if (INNGEST_KEY) {
        ok("6/9c. duplicate returns a 2xx no-op so Cal.com stops retrying",
          d2.status === 200 && d1.status === 200, `first=${d1.status} duplicate=${d2.status}`);
      } else {
        skip("6/9c. duplicate returns a 2xx no-op",
          `INNGEST_EVENT_KEY empty → the emit fails and the route deliberately answers ${d2.status} so Cal.com retries; ` +
          `the duplicate branch itself is proven by duplicate=true above`);
      }

      // 11. same uid in a different org stays independent
      const bBody = bookingBody({ uid: DUP_UID });
      await postCal(ORG_B, bBody, signCal(bBody, SECRET_B));
      ok("11. the same Cal.com uid in another org is independent",
        (await countByUid(ORG_B, DUP_UID)) === 1 && (await countByUid(ORG_A, DUP_UID)) === 1,
        "one booking in each org — the constraint is scoped by org_id");

      // 12. concurrent duplicate deliveries
      const CONC_UID = `zz-conc-${TAG}`;
      const cBody = bookingBody({ uid: CONC_UID, email: `zz-a-${TAG}@example.test` });
      const cSig  = signCal(cBody, SECRET_A);
      const conc  = await Promise.all(Array.from({ length: 6 }, () => postCal(ORG_A, cBody, cSig)));
      ok("12. six concurrent identical deliveries create exactly one booking",
        (await countByUid(ORG_A, CONC_UID)) === 1,
        `${conc.length} concurrent posts → ${await countByUid(ORG_A, CONC_UID)} booking`);
      ok("12b. exactly one of the concurrent deliveries was the winner",
        conc.filter((r) => r.json.duplicate === false).length === 1
        && conc.filter((r) => r.json.duplicate === true).length === conc.length - 1,
        `winners=${conc.filter((r) => r.json.duplicate === false).length}, no-ops=${conc.filter((r) => r.json.duplicate === true).length}`);
    }
  } finally {
    for (const org of [ORG_A, ORG_B, ORG_NS]) {
      for (const t of ["lead_events", "audit_log", "bookings", "messages", "conversations", "leads", "org_members", "integrations"]) {
        await db.from(t).delete().eq("org_id", org);
      }
      await db.from("orgs").delete().eq("id", org);
    }
    for (const uid of [USER_A, USER_B]) {
      if (uid) await db.auth.admin.deleteUser(uid).catch(() => null);
    }
    const left = (await db.from("orgs").select("id", { count: "exact", head: true }).in("id", [ORG_A, ORG_B, ORG_NS])).count;
    const usersLeft = USER_A || USER_B
      ? ((await db.auth.admin.listUsers()).data?.users ?? []).filter((u: { email?: string }) => (u.email ?? "").includes(`zz-whs-`) && (u.email ?? "").includes(TAG)).length
      : 0;
    console.log(`\n  cleanup: scratch orgs left=${left} ${left === 0 ? "✅" : "❌"}, scratch auth users left=${usersLeft} ${usersLeft === 0 ? "✅" : "❌"}`);
  }

  const after = await outsideFingerprint();
  console.log(`  data outside the scratch orgs: ${before} → ${after} ${before === after ? "✅ unchanged" : "❌ CHANGED"}`);
  console.log("\n" + "═".repeat(72));
  console.log(`RESULT: ${pass} passed, ${fail} failed, ${blocked} blocked`);
  console.log("═".repeat(72));
  process.exit(fail === 0 && before === after ? 0 : 1);
})().catch((e) => { console.error("FATAL: " + (e as Error).message); process.exit(2); });
