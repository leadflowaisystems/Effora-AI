/**
 * Prompt builder for payment link messages.
 *
 * Generates a short (~35 word) outbound message sent when a payment link is
 * created. The payment URL MUST appear verbatim in the output.
 *
 * Returns { system, user } for a plain-text LLM completion.
 * The model should output ONLY the message text.
 */

export interface PaymentLinkInput {
  leadFirstName: string;
  amountInr:     number;
  description:   string;
  paymentUrl:    string;
  coachTone:     string;
  coachOffer:    string;
}

export function buildPaymentLinkPrompt(input: PaymentLinkInput): {
  system: string;
  user:   string;
} {
  const { leadFirstName, amountInr, description, paymentUrl, coachTone, coachOffer } = input;

  const amount    = `₹${amountInr.toLocaleString("en-IN")}`;
  const nameSuffix = leadFirstName ? `, ${leadFirstName}` : "";

  const lines: string[] = [
    `You are a sharp human assistant for a coaching business.`,
    `Write ONE message to send the lead their payment link right now.`,
    ``,
    `## COACH VOICE`,
    `Tone: ${coachTone || "direct, warm, confident — no filler"}`,
    `Offer: ${coachOffer || "coaching"}`,
    ``,
    `## PAYMENT DETAILS`,
    `Amount: ${amount}`,
    `What it's for: ${description}`,
    `Payment URL: ${paymentUrl}`,
    ``,
    `## RULES`,
    `1. Under 40 words total.`,
    `2. Open with a forward action${nameSuffix ? ` using the lead's name: e.g. "Here you go${nameSuffix}." / "Sending the link now${nameSuffix}." / "Done${nameSuffix} —"` : `: e.g. "Here you go." / "Sending the link now."`}`,
    `3. State the amount (${amount}) and what it's for (${description}).`,
    `4. You MUST paste the full payment URL exactly as written. Do NOT paraphrase it or omit it. URL: ${paymentUrl}`,
    `5. End with one brief benefit or reassurance: e.g. "Takes 30 seconds." / "You'll get access immediately." / "I'll send onboarding details once you're in."`,
    `6. Output ONLY the message text. No labels, no quotes, no explanation.`,
    ``,
    `## EXAMPLES`,
    `"Here you go${nameSuffix}. Payment link for ${description} (${amount}): ${paymentUrl} Takes 30 seconds and you'll get access right away."`,
    `"Sending the link now${nameSuffix}. ${amount} for ${description}: ${paymentUrl} Once you're in I'll share the onboarding doc."`,
    `"Done${nameSuffix} — ${amount} for ${description}: ${paymentUrl} You'll get program access within 5 min of paying."`,
  ];

  return {
    system: lines.join("\n"),
    user:   "Write the payment link message now:",
  };
}
