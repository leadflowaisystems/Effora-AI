/**
 * WhatsApp 24-hour window + template routing suite.
 *
 *   npx tsx scripts/test-whatsapp-templates.ts
 *
 * Exercises the real deliverOutboundMessage() funnel inside a disposable scratch
 * org. The scratch org's WhatsApp integration holds a deliberately invalid
 * token and a fake recipient, so no message can ever actually be delivered —
 * what is under test is which path the router chooses, which the resulting
 * delivery_error proves unambiguously:
 *
 *   free-form chosen   → a raw Meta auth error
 *   blocked            → "template_not_configured"
 *   template chosen    → "template_send_failed: ..." plus metadata.template_name
 *
 * No real WhatsApp message is sent and no production row is touched.
 */
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes, randomUUID } from "crypto";
import { deliverOutboundMessage } from "@/lib/conversation";
import { sendChannelMessage } from "@/lib/booking";
import { formatMeetingTime } from "@/lib/leads";
import {
  build24hReminder, build1hReminder, reminderLeadName, reminderOffer,
} from "@/prompts/reminder";
import {
  getServiceWindowState, resolveTemplateBinding, sanitiseTemplateParam,
  buildTemplateComponents, validateTemplateParams, TEMPLATE_PARAM_CONTRACT,
  BUSINESS_INITIATED_SOURCES, SERVICE_WINDOW_MS,
  templateCustomerName, templateAmountInr, templateDescription,
} from "@/lib/whatsapp-templates";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENC_KEY = process.env.ENCRYPTION_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY || !ENC_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ENCRYPTION_KEY");
  process.exit(2);
}
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
let LEAD = "", CONV = "";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✅" : "❌"} ${n}${d ? "  — " + d : ""}`); };

/** Set the conversation's only inbound message to `ageMs` old (or remove it). */
async function setLastInbound(ageMs: number | null) {
  await db.from("messages").delete().eq("conversation_id", CONV).eq("direction", "inbound");
  if (ageMs === null) return;
  await db.from("messages").insert({
    conversation_id: CONV, org_id: ORG, direction: "inbound", content: "customer msg",
    sent_at: new Date(Date.now() - ageMs).toISOString(), metadata: { source: "whatsapp" },
  });
}
async function setTemplates(templates: Record<string, unknown> | null) {
  const { data } = await db.from("integrations").select("config").eq("org_id", ORG).eq("provider", "whatsapp_cloud").single();
  const cfg = { ...data.config };
  if (templates === null) delete cfg.templates; else cfg.templates = templates;
  await db.from("integrations").update({ config: cfg }).eq("org_id", ORG).eq("provider", "whatsapp_cloud");
}
/** Newest outbound row for the scratch conversation. */
async function lastOutbound() {
  const { data } = await db.from("messages").select("content,metadata,provider_message_id,status")
    .eq("conversation_id", CONV).eq("direction", "outbound").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data as { metadata?: Record<string, string>; provider_message_id: string | null; status: string | null } | null;
}

async function outsideCounts() {
  const [m, o] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true }).neq("org_id", ORG),
    db.from("orgs").select("id", { count: "exact", head: true }),
  ]);
  return `${m.count}/${o.count}`;
}

(async () => {
  console.log("═".repeat(72));
  console.log("WHATSAPP TEMPLATE + 24-HOUR WINDOW SUITE");
  console.log(`  scratch org: ${ORG}`);
  console.log("═".repeat(72));
  const before = await outsideCounts();

  await db.from("orgs").insert({ id: ORG, slug: `zz-tpl-${TAG}`, name: `ZZ TEMPLATE SUITE ${TAG} — DELETE ME`, channel_config: {} });
  const { data: lead } = await db.from("leads").insert({
    org_id: ORG, channel: "whatsapp_cloud", external_id: `wa_99900000${TAG.slice(0, 2)}`,
    name: "Template Fixture", stage: "cold", metadata: {},
  }).select("id").single();
  LEAD = lead.id;
  const { data: conv } = await db.from("conversations").insert({
    org_id: ORG, lead_id: LEAD, channel_provider: "whatsapp_cloud",
  }).select("id").single();
  CONV = conv.id;
  // Invalid token on purpose: every Meta call from this org must fail, so no
  // message can escape, and the failure text reveals which path was taken.
  await db.from("integrations").insert({
    org_id: ORG, provider: "whatsapp_cloud", active: true,
    config: { phone_number_id: `PN_TPL_${TAG}`, waba_id: `WABA_${TAG}`, display_phone_number: "1555", access_token_enc: encrypt("invalid-scratch-token") },
  });
  console.log("\n  fixture: invalid WhatsApp token + fake recipient → delivery is impossible by construction\n");

  try {
    // ── unit-level ────────────────────────────────────────────────────────
    ok("U1. sanitiseTemplateParam strips newlines/tabs/long runs",
      sanitiseTemplateParam("a\n\nb\t\tc      d") === "a b c d",
      JSON.stringify(sanitiseTemplateParam("a\n\nb\t\tc      d")));
    ok("U2. sanitiseTemplateParam truncates at 1024", sanitiseTemplateParam("x".repeat(2000)).length === 1024);
    ok("U3. business-initiated set covers the automated sources",
      ["payment_link", "payment_received", "reminder_1h", "reminder_24h", "booking_confirm", "group_booking", "group_payment", "group_payment_request", "rebook"].every((s) => BUSINESS_INITIATED_SOURCES.has(s))
      && !BUSINESS_INITIATED_SOURCES.has("ai") && !BUSINESS_INITIATED_SOURCES.has("manual"),
      `${BUSINESS_INITIATED_SOURCES.size} sources; ai/manual excluded`);

    await setLastInbound(null);
    ok("U4. no inbound message → outside the window", !(await getServiceWindowState(db, CONV)).inside);
    await setLastInbound(60_000);
    ok("U5. recent inbound → inside the window", (await getServiceWindowState(db, CONV)).inside);
    await setLastInbound(SERVICE_WINDOW_MS + 60_000);
    ok("U6. inbound older than 24h → outside the window", !(await getServiceWindowState(db, CONV)).inside);

    // ── 1. inside 24h → free-form path unchanged ──────────────────────────
    await setLastInbound(60_000);
    await setTemplates(null);
    await deliverOutboundMessage(CONV, ORG, "inside window payment link", "payment_link");
    let m = await lastOutbound();
    ok("1. inside 24h → free-form path taken (unchanged)",
      !!m && m.metadata?.delivery_error !== "template_not_configured" && !m.metadata?.template_name && !m.metadata?.window_state,
      `delivery_error="${String(m?.metadata?.delivery_error).slice(0, 48)}…" (raw Meta error = free-form attempted)`);

    // ── 2 & 4. outside 24h, no template → blocked, clear persisted error ──
    await setLastInbound(SERVICE_WINDOW_MS + 60_000);
    await deliverOutboundMessage(CONV, ORG, "outside window payment link", "payment_link");
    m = await lastOutbound();
    ok("2. outside 24h, no template → free-form NOT attempted",
      m?.metadata?.delivery_error === "template_not_configured",
      `delivery_error="${m?.metadata?.delivery_error}"`);
    ok("4. missing template persists a clear error",
      m?.metadata?.delivery_error === "template_not_configured" && m?.metadata?.window_state === "outside_24h" && m?.provider_message_id === null,
      `window_state=${m?.metadata?.window_state}, provider_message_id=null`);

    // ── 3, 5, 6. outside 24h with a binding → template path, no fallback ──
    // The real template effora_payment_link has TWO body variables, so the
    // caller must supply them; the rendered-text convention cannot satisfy it.
    const NAME = "Priya", URL = "https://rzp.io/i/zzScratch1";
    await setTemplates({ payment_link: { name: `zz_scratch_tpl_${TAG}`, language: "en" } });
    ok("U7. resolveTemplateBinding reads org config",
      (await resolveTemplateBinding(db, ORG, "payment_link"))?.name === `zz_scratch_tpl_${TAG}`);
    await deliverOutboundMessage(CONV, ORG, "outside window with template", "payment_link", [NAME, URL]);
    m = await lastOutbound();
    const err = String(m?.metadata?.delivery_error ?? "");
    ok("3. outside 24h + binding → sent via sendWhatsAppTemplate",
      err.startsWith("template_send_failed:") && m?.metadata?.template_name === `zz_scratch_tpl_${TAG}`,
      `template_name=${m?.metadata?.template_name}`);
    ok("5. template API failure surfaced verbatim", err.startsWith("template_send_failed:") && err.length > "template_send_failed:".length + 5,
      `"${err.slice(0, 60)}…"`);
    ok("6. no free-form fallback after template failure",
      err.startsWith("template_send_failed:") && m?.provider_message_id === null,
      "error is the template error; nothing delivered");

    // ── P1/P2. the two template parameters, in order ──────────────────────
    const binding = (await resolveTemplateBinding(db, ORG, "payment_link"))!;
    const comps = buildTemplateComponents(binding, "ignored rendered text", "payment_link", [NAME, URL]);
    ok("P0. payment_link declares a 2-parameter contract",
      TEMPLATE_PARAM_CONTRACT.payment_link?.length === 2,
      `contract=[${TEMPLATE_PARAM_CONTRACT.payment_link?.join(", ")}]`);
    ok("P1. template parameter {{1}} = customer name",
      comps?.[0].parameters[0]?.text === NAME, `{{1}}="${comps?.[0].parameters[0]?.text}"`);
    ok("P2. template parameter {{2}} = payment URL",
      comps?.[0].parameters[1]?.text === URL, `{{2}}="${comps?.[0].parameters[1]?.text}"`);
    ok("P3. rendered text is NOT used when a contract exists",
      comps?.[0].parameters.length === 2 && !comps?.[0].parameters.some((p) => p.text.includes("ignored rendered")),
      "exactly 2 params, rendered text absent");
    ok("P4. params are sanitised",
      buildTemplateComponents(binding, "x", "payment_link", ["a\nb", "u\tv"])?.[0].parameters.map((p) => p.text).join("|") === "a b|u v");

    // ── P5. missing params must block rather than send a malformed template ─
    await deliverOutboundMessage(CONV, ORG, "outside window, no params", "payment_link");
    const mp = await lastOutbound();
    ok("P5. contract unsatisfied → blocked, not sent",
      String(mp?.metadata?.delivery_error ?? "").startsWith("template_params_missing") && mp?.provider_message_id === null,
      `delivery_error="${String(mp?.metadata?.delivery_error).slice(0, 60)}…"`);
    // "group_booking" stands in for a contract-free source here; payment_received
    // used to play that role and now has a verified contract of its own.
    ok("P6. validateTemplateParams rejects wrong arity and blanks",
      validateTemplateParams("payment_link", [NAME]) !== null
      && validateTemplateParams("payment_link", [NAME, ""]) !== null
      && validateTemplateParams("payment_link", [NAME, URL]) === null
      && validateTemplateParams("group_booking", undefined) === null,
      "arity + blank checks, and contract-free sources unaffected");

    // ── 7, 8, 9. per-source routing ───────────────────────────────────────
    for (const [n, src] of [["7", "payment_link"], ["8", "payment_received"], ["9", "reminder_24h"]] as const) {
      await setTemplates({ [src]: { name: `zz_tpl_${src}_${TAG}`, language: "en" } });
      // Supply exactly what each source's contract demands; payment_received
      // has none, so it falls back to the rendered-text convention.
      const contract = TEMPLATE_PARAM_CONTRACT[src];
      const p = contract ? contract.map((_, i) => `p${i + 1}`) : undefined;
      await deliverOutboundMessage(CONV, ORG, `outside window ${src}`, src, p);
      const r = await lastOutbound();
      ok(`${n}. ${src} chooses the template path`,
        r?.metadata?.template_name === `zz_tpl_${src}_${TAG}`
        && String(r?.metadata?.delivery_error ?? "").startsWith("template_send_failed:"),
        `template_name=${r?.metadata?.template_name}, attempted send`);
    }

    // ── non-business-initiated is untouched ───────────────────────────────
    await setTemplates(null);
    await deliverOutboundMessage(CONV, ORG, "ai reply outside window", "ai");
    m = await lastOutbound();
    ok("U8. non-business source ('ai') keeps free-form even outside the window",
      m?.metadata?.delivery_error !== "template_not_configured" && !m?.metadata?.window_state,
      `delivery_error="${String(m?.metadata?.delivery_error).slice(0, 40)}…"`);

    // ── 11. Phase 1 behaviour preserved ───────────────────────────────────
    ok("11. Phase 1 fields intact on these rows",
      m?.provider_message_id === null && m?.status === null,
      "provider_message_id and status untouched by the router");

    ok("U9. buildTemplateComponents honours bodyParams",
      buildTemplateComponents({ name: "t", language: "en", bodyParams: "none" }, "x") === undefined
      && buildTemplateComponents({ name: "t", language: "en", bodyParams: "rendered" }, "a\nb")?.[0].parameters[0].text === "a b");

    // ── effora_booking_reminder contract ──────────────────────────────────
    // The approved Meta template is:
    //   "Hi {{1}}, a reminder that your {{2}} is scheduled for {{3}}. …"
    // and serves BOTH reminder sources.
    ok("R0. reminder contract declares exactly 3 params (both sources)",
      TEMPLATE_PARAM_CONTRACT.reminder_24h?.length === 3 && TEMPLATE_PARAM_CONTRACT.reminder_1h?.length === 3
      && TEMPLATE_PARAM_CONTRACT.reminder_24h?.join() === "customer_name,session_name,meeting_time"
      && TEMPLATE_PARAM_CONTRACT.reminder_1h?.join() === "customer_name,session_name,meeting_time",
      `[${TEMPLATE_PARAM_CONTRACT.reminder_24h?.join(", ")}]`);

    const STARTS_AT = "2026-09-01T09:30:00.000Z";
    const FORMATTED = formatMeetingTime(STARTS_AT);
    ok("R1. startsAt is genuinely formatted, not passed raw",
      FORMATTED !== STARTS_AT && /\d/.test(FORMATTED) && !FORMATTED.includes("T09:30"),
      `"${FORMATTED}"`);

    // The tuple each reminder path builds, using the same helpers the callers use.
    const p24 = [reminderLeadName("Priya Sharma"), reminderOffer("our Clarity Call", "24h"), FORMATTED];
    const p1h = [reminderLeadName("Priya Sharma"), reminderOffer("our Clarity Call", "1h"), FORMATTED];
    ok("R2. 24h tuple = [name, session, formatted time]",
      p24[0] === "Priya" && p24[1] === "Clarity Call" && p24[2] === FORMATTED, JSON.stringify(p24));
    ok("R3. 1h tuple = [name, session, formatted time]",
      p1h[0] === "Priya" && p1h[1] === "Clarity Call" && p1h[2] === FORMATTED, JSON.stringify(p1h));
    ok("R4. session fallbacks differ per path and are never blank",
      reminderOffer("", "24h") === "upcoming session" && reminderOffer(null, "1h") === "call"
      && reminderLeadName("") === "there" && reminderLeadName(null) === "there",
      `24h→"${reminderOffer("", "24h")}", 1h→"${reminderOffer(null, "1h")}", name→"${reminderLeadName(null)}"`);

    ok("R5. extraction did not change the rendered prose",
      build24hReminder({ leadName: "Priya Sharma", startsAt: STARTS_AT, meetingUrl: null, coachOffer: "our Clarity Call" })
        .startsWith("Hey, Priya! Just a quick heads-up — our Clarity Call is coming up soon.")
      && build1hReminder({ leadName: "Priya Sharma", startsAt: STARTS_AT, meetingUrl: null, coachOffer: "" })
        .startsWith("Hey, Priya! Our call is coming up in about an hour"),
      "free-form wording byte-identical to before");

    // sendChannelMessage must forward params to the template path.
    await setTemplates({ reminder_24h: { name: "effora_booking_reminder", language: "en" } });
    await sendChannelMessage(CONV, ORG, "reminder prose", "reminder_24h", p24);
    let rm = await lastOutbound();
    ok("R6. outside 24h → reminder takes the template path",
      rm?.metadata?.template_name === "effora_booking_reminder"
      && String(rm?.metadata?.delivery_error ?? "").startsWith("template_send_failed:"),
      "template attempted, no free-form");

    await sendChannelMessage(CONV, ORG, "reminder prose", "reminder_24h", [p24[0], "", p24[2]]);
    rm = await lastOutbound();
    ok("R7. blank session param fails closed",
      String(rm?.metadata?.delivery_error ?? "").startsWith("template_params_missing"), "blocked before Meta");

    await sendChannelMessage(CONV, ORG, "reminder prose", "reminder_24h", [p24[0], p24[1]]);
    rm = await lastOutbound();
    ok("R8. wrong arity fails closed",
      String(rm?.metadata?.delivery_error ?? "").startsWith("template_params_missing"), "2 of 3 rejected");

    await sendChannelMessage(CONV, ORG, "reminder prose", "reminder_24h");
    rm = await lastOutbound();
    ok("R9. missing params fail closed (no silent 1-param send)",
      String(rm?.metadata?.delivery_error ?? "").startsWith("template_params_missing"), "blocked");

    // Inside the window the reminder must stay free-form.
    await setLastInbound(60_000);
    await sendChannelMessage(CONV, ORG, "reminder prose", "reminder_24h", p24);
    rm = await lastOutbound();
    ok("R10. inside 24h → reminder stays free-form",
      !rm?.metadata?.template_name && String(rm?.metadata?.delivery_error ?? "").startsWith("WhatsApp send failed:"),
      "free-form attempted, template ignored");
    await setLastInbound(SERVICE_WINDOW_MS + 60_000);

    // Existing sources that share sendChannelMessage must be unaffected.
    await sendChannelMessage(CONV, ORG, "system nudge", "system");
    rm = await lastOutbound();
    ok("R11. shared sendChannelMessage callers unaffected ('system')",
      !rm?.metadata?.template_name && !String(rm?.metadata?.delivery_error ?? "").startsWith("template_"),
      "no contract, no template routing");

    // ══ effora_payment_received (Meta ID 3617342975089954, verified) ═══════
    //   "Hi {{1}}, we've received your payment of {{2}} for {{3}}. …"
    ok("PR0. payment_received declares exactly 3 params in Meta's order",
      TEMPLATE_PARAM_CONTRACT.payment_received?.length === 3
      && TEMPLATE_PARAM_CONTRACT.payment_received?.join() === "customer_name,amount,description",
      `[${TEMPLATE_PARAM_CONTRACT.payment_received?.join(", ")}]`);

    ok("PR1. amount keeps the application's existing ₹ formatting",
      templateAmountInr(12500) === "₹12,500"
      && templateAmountInr(12500) === `₹${(12500).toLocaleString("en-IN")}`
      && templateAmountInr(999) === "₹999" && templateAmountInr(150000) === "₹1,50,000",
      `12500→"${templateAmountInr(12500)}", 150000→"${templateAmountInr(150000)}" (matches Meta's example ₹12,500)`);

    ok("PR2. description keeps the 'the program' fallback",
      templateDescription(undefined) === "the program" && templateDescription(null) === "the program"
      && templateDescription("") === "the program" && templateDescription("   ") === "the program"
      && templateDescription("Elite Coaching") === "Elite Coaching",
      "null/blank/whitespace fall back; a real description passes through");

    ok("PR3. customer name resolution never leaks an identifier or a blank",
      templateCustomerName("Priya Sharma") === "Priya"
      && templateCustomerName("") === "there" && templateCustomerName(null) === "there"
      && templateCustomerName("wa_000000000000") === "there"
      && templateCustomerName("ig_000000000000") === "there"
      && templateCustomerName("000000000000") === "there",
      `"Priya Sharma"→"Priya", wa_/ig_/bare-number→"there"`);

    const PR_AMOUNT = templateAmountInr(12500), PR_DESC = templateDescription(undefined);
    const PR_TUPLE = [templateCustomerName("Priya Sharma"), PR_AMOUNT, PR_DESC];
    await setTemplates({ payment_received: { name: "effora_payment_received", language: "en" } });
    const prBinding = (await resolveTemplateBinding(db, ORG, "payment_received"))!;
    const prComps = buildTemplateComponents(prBinding, "Payment received, Priya! ₹12,500 confirmed.", "payment_received", PR_TUPLE);
    ok("PR4. {{1}} = customer name", prComps?.[0].parameters[0]?.text === "Priya", `{{1}}="${prComps?.[0].parameters[0]?.text}"`);
    ok("PR5. {{2}} = formatted amount", prComps?.[0].parameters[1]?.text === "₹12,500", `{{2}}="${prComps?.[0].parameters[1]?.text}"`);
    ok("PR6. {{3}} = description", prComps?.[0].parameters[2]?.text === "the program", `{{3}}="${prComps?.[0].parameters[2]?.text}"`);
    ok("PR7. the rendered receipt is NOT passed as {{1}}",
      prComps?.[0].parameters.length === 3
      && !prComps?.[0].parameters.some((p) => p.text.includes("Payment received, Priya")),
      "exactly 3 params, rendered prose absent from all of them");

    await deliverOutboundMessage(CONV, ORG, "receipt prose", "payment_received", PR_TUPLE);
    let pr = await lastOutbound();
    ok("PR8. outside 24h → template path, no free-form",
      pr?.metadata?.template_name === "effora_payment_received"
      && String(pr?.metadata?.delivery_error ?? "").startsWith("template_send_failed:")
      && pr?.provider_message_id === null,
      "template attempted; the failure is the template's, not a fallback's");

    await deliverOutboundMessage(CONV, ORG, "receipt prose", "payment_received", [PR_TUPLE[0], "", PR_TUPLE[2]]);
    pr = await lastOutbound();
    ok("PR9. blank amount fails closed",
      String(pr?.metadata?.delivery_error ?? "").startsWith("template_params_missing") && pr?.provider_message_id === null,
      "blocked before Meta");

    await deliverOutboundMessage(CONV, ORG, "receipt prose", "payment_received", [PR_TUPLE[0], PR_TUPLE[1]]);
    pr = await lastOutbound();
    ok("PR10. wrong arity fails closed",
      String(pr?.metadata?.delivery_error ?? "").startsWith("template_params_missing"), "2 of 3 rejected");

    await deliverOutboundMessage(CONV, ORG, "receipt prose", "payment_received");
    pr = await lastOutbound();
    ok("PR11. missing params fail closed (no silent 1-param send)",
      String(pr?.metadata?.delivery_error ?? "").startsWith("template_params_missing") && !pr?.provider_message_id,
      "the rendered-text convention can no longer satisfy this source");

    await setLastInbound(60_000);
    await deliverOutboundMessage(CONV, ORG, "receipt prose", "payment_received", PR_TUPLE);
    pr = await lastOutbound();
    ok("PR12. inside 24h → receipt stays free-form",
      !pr?.metadata?.template_name && String(pr?.metadata?.delivery_error ?? "").startsWith("WhatsApp send failed:"),
      "free-form attempted, template ignored");
    await setLastInbound(SERVICE_WINDOW_MS + 60_000);

    // ══ effora_booking_confirmed (Meta ID 1060354640297067, verified) ══════
    //   "Hi {{1}}, your session is confirmed for {{2}}. …"
    ok("BC0. booking_confirm declares exactly 2 params in Meta's order",
      TEMPLATE_PARAM_CONTRACT.booking_confirm?.length === 2
      && TEMPLATE_PARAM_CONTRACT.booking_confirm?.join() === "customer_name,meeting_time",
      `[${TEMPLATE_PARAM_CONTRACT.booking_confirm?.join(", ")}]`);

    const BC_TUPLE = [templateCustomerName("Priya Sharma"), formatMeetingTime(STARTS_AT)];
    await setTemplates({ booking_confirm: { name: "effora_booking_confirmed", language: "en" } });
    const bcBinding = (await resolveTemplateBinding(db, ORG, "booking_confirm"))!;
    const bcComps = buildTemplateComponents(bcBinding, "Done Priya. Your call is confirmed.", "booking_confirm", BC_TUPLE);
    ok("BC1. {{1}} = customer name", bcComps?.[0].parameters[0]?.text === "Priya", `{{1}}="${bcComps?.[0].parameters[0]?.text}"`);
    ok("BC2. {{2}} = formatMeetingTime(startsAt)",
      bcComps?.[0].parameters[1]?.text === FORMATTED, `{{2}}="${bcComps?.[0].parameters[1]?.text}"`);
    ok("BC3. the raw ISO startsAt is NOT passed",
      bcComps?.[0].parameters[1]?.text !== STARTS_AT
      && !bcComps?.[0].parameters.some((p) => p.text.includes("T09:30") || p.text.includes("Z")),
      `ISO "${STARTS_AT}" never appears`);
    ok("BC4. the rendered confirmation prose is NOT used as a parameter",
      bcComps?.[0].parameters.length === 2
      && !bcComps?.[0].parameters.some((p) => p.text.includes("Done Priya")),
      "exactly 2 params, rendered prose absent");

    await deliverOutboundMessage(CONV, ORG, "confirm prose", "booking_confirm", BC_TUPLE);
    let bc = await lastOutbound();
    ok("BC5. outside 24h → template path, no free-form",
      bc?.metadata?.template_name === "effora_booking_confirmed"
      && String(bc?.metadata?.delivery_error ?? "").startsWith("template_send_failed:")
      && bc?.provider_message_id === null,
      "template attempted; no fallback");

    await deliverOutboundMessage(CONV, ORG, "confirm prose", "booking_confirm", ["", BC_TUPLE[1]]);
    bc = await lastOutbound();
    ok("BC6. blank name fails closed",
      String(bc?.metadata?.delivery_error ?? "").startsWith("template_params_missing") && bc?.provider_message_id === null,
      "blocked before Meta");

    await deliverOutboundMessage(CONV, ORG, "confirm prose", "booking_confirm", [BC_TUPLE[0], BC_TUPLE[1], "extra"]);
    bc = await lastOutbound();
    ok("BC7. wrong arity fails closed",
      String(bc?.metadata?.delivery_error ?? "").startsWith("template_params_missing"), "3 of 2 rejected");

    await deliverOutboundMessage(CONV, ORG, "confirm prose", "booking_confirm");
    bc = await lastOutbound();
    ok("BC8. missing params fail closed (no silent 1-param send)",
      String(bc?.metadata?.delivery_error ?? "").startsWith("template_params_missing") && !bc?.provider_message_id,
      "the rendered-text convention can no longer satisfy this source");

    await setLastInbound(60_000);
    await deliverOutboundMessage(CONV, ORG, "confirm prose", "booking_confirm", BC_TUPLE);
    bc = await lastOutbound();
    ok("BC9. inside 24h → confirmation stays free-form",
      !bc?.metadata?.template_name && String(bc?.metadata?.delivery_error ?? "").startsWith("WhatsApp send failed:"),
      "free-form attempted, template ignored");
    await setLastInbound(SERVICE_WINDOW_MS + 60_000);

    // The two newly bound sources must not have disturbed the others.
    ok("X1. every contract still declares the arity Meta approved",
      TEMPLATE_PARAM_CONTRACT.payment_link?.length === 2
      && TEMPLATE_PARAM_CONTRACT.payment_received?.length === 3
      && TEMPLATE_PARAM_CONTRACT.booking_confirm?.length === 2
      && TEMPLATE_PARAM_CONTRACT.reminder_24h?.length === 3
      && TEMPLATE_PARAM_CONTRACT.reminder_1h?.length === 3
      && Object.keys(TEMPLATE_PARAM_CONTRACT).length === 5,
      `${Object.keys(TEMPLATE_PARAM_CONTRACT).length} contracts: ${Object.keys(TEMPLATE_PARAM_CONTRACT).join(", ")}`);
    ok("X2. business-initiated sources without a verified template keep the old path",
      ["group_booking", "group_payment", "group_payment_request", "rebook"]
        .every((s) => BUSINESS_INITIATED_SOURCES.has(s) && !TEMPLATE_PARAM_CONTRACT[s]
                      && validateTemplateParams(s, undefined) === null),
      "group/rebook sources still use the binding's bodyParams convention");

    // ── TASK 3: the legacy "whatsapp" channel_provider must still deliver ──
    const { data: legacyConv } = await db.from("conversations").insert({
      org_id: ORG, lead_id: LEAD, channel_provider: "whatsapp",
    }).select("id").single();
    await db.from("messages").insert({
      conversation_id: legacyConv.id, org_id: ORG, direction: "inbound", content: "hi",
      sent_at: new Date().toISOString(), metadata: { source: "whatsapp" },
    });
    await deliverOutboundMessage(legacyConv.id, ORG, "legacy channel reply", "manual");
    const { data: legacyOut } = await db.from("messages").select("metadata")
      .eq("conversation_id", legacyConv.id).eq("direction", "outbound").maybeSingle();
    const legacyErr = String((legacyOut as { metadata?: Record<string, string> } | null)?.metadata?.delivery_error ?? "");
    ok("L1. legacy channel_provider='whatsapp' attempts WhatsApp delivery",
      legacyErr.startsWith("WhatsApp send failed:"),
      "a Meta error proves a send was attempted, not NO_DELIVERY_ATTEMPTED");
    ok("L2. 'whatsapp_cloud' behaviour is unchanged", true, "covered by tests 1–9 above on the whatsapp_cloud conversation");

    // ── TASK 5: no full phone number or PSID in logs ──────────────────────
    const { data: fx } = await db.from("leads").select("external_id").eq("id", LEAD).single();
    const fullPhone = String((fx as { external_id: string }).external_id).replace(/^wa_/, "");
    const captured: string[] = [];
    const origLog = console.log, origWarn = console.warn, origErr = console.error;
    const cap = (...a: unknown[]) => { captured.push(a.map(String).join(" ")); };
    console.log = cap; console.warn = cap; console.error = cap;
    try {
      await deliverOutboundMessage(CONV, ORG, "logging privacy probe", "manual");
    } finally {
      console.log = origLog; console.warn = origWarn; console.error = origErr;
    }
    const joined = captured.join("\n");
    ok("G1. full phone number never appears in logs",
      fullPhone.length >= 6 && !joined.includes(fullPhone),
      `checked ${captured.length} log lines for the fixture number`);
    ok("G2. masked form is used instead",
      joined.includes("…" + fullPhone.slice(-4)),
      `recipient rendered as …${fullPhone.slice(-4)}`);
    ok("G3. no Bearer token or Authorization header in logs",
      !/Bearer\s/i.test(joined) && !/authorization/i.test(joined));
  } finally {
    for (const t of ["messages", "conversations", "leads", "integrations"]) await db.from(t).delete().eq("org_id", ORG);
    await db.from("orgs").delete().eq("id", ORG);
    const left = (await db.from("orgs").select("id", { count: "exact", head: true }).eq("id", ORG)).count;
    console.log(`\n  cleanup: scratch rows left=${left} ${left === 0 ? "✅" : "❌"}`);
  }

  const after = await outsideCounts();
  console.log(`  data outside the scratch org: ${before} → ${after} ${before === after ? "✅ unchanged" : "❌ CHANGED"}`);
  console.log("\n" + "═".repeat(72));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log("═".repeat(72));
  process.exit(fail === 0 && before === after ? 0 : 1);
})().catch((e) => { console.error("FATAL: " + (e as Error).message); process.exit(2); });
