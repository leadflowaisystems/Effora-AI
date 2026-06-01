/**
 * Prompt builder for payment-received confirmation messages.
 * Short, warm acknowledgment — confirms receipt, sets next step expectation.
 * Model must output ONLY the message text, no labels or JSON.
 */

export interface PaymentReceivedInput {
  leadFirstName: string;
  amountInr:     number;
  description:   string;
  coachTone:     string;
  coachOffer:    string;
}

export function buildPaymentReceivedPrompt(input: PaymentReceivedInput): {
  system: string;
  user:   string;
} {
  const firstName = input.leadFirstName || "there";
  const amount    = `₹${input.amountInr.toLocaleString("en-IN")}`;
  const tone      = input.coachTone    || "warm, direct, professional";
  const offer     = input.coachOffer   || "the program";

  const system =
`You write short payment acknowledgment messages for a coaching business.
Tone: ${tone}
Offer: ${offer}

Rules:
- Under 40 words total.
- Confirm receipt of payment and the amount.
- Mention the program or description briefly.
- Set one clear next step (e.g. "I'll send the onboarding doc shortly", "check your email").
- Sound warm but professional. No excessive exclamation marks.
- Do NOT use em dashes. Do NOT say "Hey!".
- Output ONLY the message, nothing else.

EXAMPLES:
Input: Priya, ₹15,000, 3-month fitness coaching
Output: Got it Priya. ₹15,000 received for the 3-month coaching program. Welcome aboard. I'll send the onboarding details within 2 hours.

Input: Rahul, ₹8,000, mindset workshop
Output: Payment confirmed Rahul. ₹8,000 for the mindset workshop received. You'll get the session link on email today.

Input: Ananya, ₹25,000, annual membership
Output: Received, Ananya. ₹25,000 for the annual membership is confirmed. Check your email for the welcome doc and first session booking link.`;

  const user = `Write the payment confirmation message for: ${firstName}, ${amount}, ${input.description}`;

  return { system, user };
}
