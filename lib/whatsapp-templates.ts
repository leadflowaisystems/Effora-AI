/**
 * WhatsApp business-initiated messaging: the 24-hour customer-service window
 * and approved-template routing.
 *
 * Meta only permits free-form ("session") messages within 24 hours of the
 * customer's last inbound message. Outside that window a free-form send is
 * rejected with error 131047 — which is exactly what production has been doing:
 * payment links, receipts and booking reminders were being attempted as plain
 * text and silently failing whenever a lead had gone quiet for a day.
 *
 * This module decides, per outbound automated message, whether a free-form send
 * is still legal and — when it is not — which approved template to use instead.
 *
 * It deliberately contains NO template names. Nothing here assumes a template
 * exists in Meta. Bindings are configuration supplied per org; when a binding is
 * missing the caller fails loudly with `template_not_configured` rather than
 * pretending the message went out.
 */

/** Meta's customer-service window. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Sources that are business-initiated: Effora starts the conversation, so
 * outside the service window they require an approved template.
 *
 * Anything not listed here keeps its existing free-form behaviour untouched —
 * `ai` replies answer an inbound message and are inside the window by
 * construction, and `manual` is an operator typing in the Inbox, which surfaces
 * its own failure to that operator.
 */
export const BUSINESS_INITIATED_SOURCES = new Set([
  "payment_link",
  "payment_received",
  "group_booking",
  "group_payment",
  "group_payment_request",
  "booking_confirm",
  "reminder_1h",
  "reminder_24h",
  "rebook",
]);

/**
 * Ordered body parameters a source's template requires, {{1}} first.
 *
 * A source listed here can ONLY be sent as a template when the caller supplies
 * exactly this many values — the rendered-message convention cannot satisfy a
 * multi-variable template, and sending the wrong number of parameters produces
 * a malformed message rather than an error. Where a contract exists it governs,
 * and the binding's `bodyParams` is ignored.
 *
 * Names are documentation for whoever writes the template copy; only the order
 * matters at send time.
 */
export const TEMPLATE_PARAM_CONTRACT: Record<string, readonly string[]> = {
  // effora_payment_link: {{1}} customer name, {{2}} payment URL
  payment_link: ["customer_name", "payment_url"],

  // effora_payment_received — read back from Meta and verified verbatim:
  //   "Hi {{1}}, we've received your payment of {{2}} for {{3}}. Thank you —
  //    we'll be in touch with next steps shortly."
  // Meta's own examples are ["Om", "₹12,500", "the program"], which is exactly
  // what templateAmountInr and templateDescription produce.
  payment_received: ["customer_name", "amount", "description"],

  // effora_booking_confirmed — read back from Meta and verified verbatim:
  //   "Hi {{1}}, your session is confirmed for {{2}}. We look forward to
  //    seeing you."
  // Keyed by the existing source name, which is "booking_confirm" — the trailing
  // "ed" belongs to the Meta template name, not to Effora's message source.
  booking_confirm: ["customer_name", "meeting_time"],

  // effora_booking_reminder — one approved template serves both reminder
  // sources, the time variable carrying the difference between them:
  //   "Hi {{1}}, a reminder that your {{2}} is scheduled for {{3}}. …"
  reminder_24h: ["customer_name", "session_name", "meeting_time"],
  reminder_1h:  ["customer_name", "session_name", "meeting_time"],
};

/** One org's binding of a message source to an approved Meta template. */
export interface TemplateBinding {
  /** Template name exactly as approved in the WhatsApp Manager. */
  name: string;
  /** Language code as approved, e.g. "en" or "en_US". Defaults to "en". */
  language: string;
  /**
   * How the template body is filled.
   *  - "rendered" (default): one positional {{1}} carrying the fully rendered
   *    message text. Matches the convention the broadcast path already uses.
   *  - "none": the template takes no variables.
   */
  bodyParams: "rendered" | "none";
}

export interface WindowState {
  inside: boolean;
  lastInboundAt: string | null;
}

/**
 * Is this conversation still inside the customer-service window?
 *
 * Determined from the most recent INBOUND message, not `conversations
 * .last_message_at`, which our own outbound writes also advance and would
 * therefore keep the window looking open forever.
 *
 * A conversation with no inbound message at all has never been opened by the
 * customer, so it is outside the window.
 */
export async function getServiceWindowState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  conversationId: string,
  now: number = Date.now(),
): Promise<WindowState> {
  const { data } = await svc
    .from("messages")
    .select("sent_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastInboundAt = (data as { sent_at?: string } | null)?.sent_at ?? null;
  if (!lastInboundAt) return { inside: false, lastInboundAt: null };

  const age = now - Date.parse(lastInboundAt);
  return { inside: Number.isFinite(age) && age < SERVICE_WINDOW_MS, lastInboundAt };
}

/**
 * Look up the approved template bound to a message source for this org.
 * Returns null when nothing is configured — the caller must then fail rather
 * than guess a template name.
 *
 * Bindings live in the whatsapp_cloud integration config so no schema change is
 * needed and they stay org-scoped alongside the rest of the WhatsApp settings:
 *
 *   config.templates = {
 *     payment_link: { name: "...", language: "en", bodyParams: "rendered" },
 *     ...
 *   }
 */
export async function resolveTemplateBinding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  orgId: string,
  source: string,
): Promise<TemplateBinding | null> {
  const { data } = await svc
    .from("integrations")
    .select("config")
    .eq("org_id", orgId)
    .eq("provider", "whatsapp_cloud")
    .eq("active", true)
    .maybeSingle();

  const templates = (data as { config?: Record<string, unknown> } | null)?.config?.templates as
    | Record<string, { name?: string; language?: string; bodyParams?: string }>
    | undefined;

  const binding = templates?.[source];
  if (!binding?.name) return null;

  return {
    name:       binding.name,
    language:   binding.language ?? "en",
    bodyParams: binding.bodyParams === "none" ? "none" : "rendered",
  };
}

/**
 * Make a string safe to pass as a template parameter.
 *
 * Meta rejects parameters containing newlines, tabs or runs of four or more
 * spaces, and caps them at 1024 characters. Rendered payment-link and receipt
 * copy is multi-line, so it would be rejected verbatim.
 */
export function sanitiseTemplateParam(text: string): string {
  return String(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, " ")
    .trim()
    .slice(0, 1024);
}

/**
 * {{1}} for every contract: a customer name that is safe to put in front of a
 * customer, never blank.
 *
 * `getLeadFirstName` falls back to `external_id` when a lead has no name, and
 * for WhatsApp and Instagram leads that is "wa_<phone>" / "ig_<psid>" — an
 * internal identifier. That is tolerable in free-form prose, which this does not
 * touch, but it must never reach an approved template body: it is
 * customer-visible, and on WhatsApp it would greet the customer with their own
 * phone number. Those cases become "there", the same fallback the rest of the
 * product already uses for an unnamed lead.
 *
 * Blank is also rejected here rather than left to fail validation, so a lead
 * with no name still receives their receipt instead of being silently blocked.
 */
export function templateCustomerName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return "there";
  if (/^(wa_|ig_)/i.test(first)) return "there";
  if (/^\+?\d[\d\s()-]*$/.test(first)) return "there";
  return first;
}

/**
 * {{2}} of effora_payment_received: the amount exactly as the rest of the
 * application already renders it — "₹12,500" — matching the receipt email, the
 * lead-event titles and Meta's own approved example.
 */
export function templateAmountInr(amountInr: number): string {
  return `₹${Number(amountInr).toLocaleString("en-IN")}`;
}

/**
 * {{3}} of effora_payment_received: what the payment was for, preserving the
 * long-standing "the program" fallback. Whitespace-only descriptions (a payment
 * row whose notes were saved blank) take the fallback too, so an outside-window
 * receipt is not blocked by an empty column.
 */
export function templateDescription(description: string | null | undefined): string {
  return String(description ?? "").trim() || "the program";
}

export type TemplateComponents =
  Array<{ type: string; parameters: Array<{ type: string; text: string }> }> | undefined;

/**
 * Build the components payload.
 *
 * When the source has a parameter contract, `params` must match it exactly and
 * is used positionally as {{1}}, {{2}}, … Otherwise the binding's `bodyParams`
 * decides: one parameter carrying the rendered text, or none at all.
 *
 * Every value is sanitised — Meta rejects parameters containing newlines, tabs
 * or runs of four or more spaces, and rendered payment copy is multi-line.
 */
export function buildTemplateComponents(
  binding: TemplateBinding,
  renderedText: string,
  source?: string,
  params?: readonly string[],
): TemplateComponents {
  const contract = source ? TEMPLATE_PARAM_CONTRACT[source] : undefined;
  if (contract) {
    // Callers must satisfy the contract; validateTemplateParams gates this
    // before we get here, so a mismatch at this point is a programming error.
    return [{
      type: "body",
      parameters: (params ?? []).map((p) => ({ type: "text", text: sanitiseTemplateParam(p) })),
    }];
  }
  if (binding.bodyParams === "none") return undefined;
  return [{ type: "body", parameters: [{ type: "text", text: sanitiseTemplateParam(renderedText) }] }];
}

/**
 * Does this source require structured parameters, and were they supplied?
 * Returns null when satisfied, or a short reason code when not.
 */
export function validateTemplateParams(
  source: string,
  params?: readonly string[],
): string | null {
  const contract = TEMPLATE_PARAM_CONTRACT[source];
  if (!contract) return null;
  if (!params || params.length !== contract.length) {
    return `template_params_missing: expected ${contract.length} (${contract.join(", ")}), got ${params?.length ?? 0}`;
  }
  if (params.some((p) => !String(p ?? "").trim())) {
    return `template_params_missing: one or more of (${contract.join(", ")}) is empty`;
  }
  return null;
}
