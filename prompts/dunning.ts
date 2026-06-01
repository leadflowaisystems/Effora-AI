/**
 * Template-based dunning message builders (no LLM — reliable for payment follow-ups).
 * Three attempts with escalating urgency.
 */

function firstName(name: string | null): string {
  if (!name) return "";
  const f = name.trim().split(/\s+/)[0];
  return f ? `, ${f}` : "";
}

export interface DunningParams {
  leadName:    string | null;
  attempt:     1 | 2 | 3;
  paymentUrl:  string | null;
  amountInr:   number;
  coachOffer:  string;
}

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style:    "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function buildDunningMessage(p: DunningParams): string {
  const name   = firstName(p.leadName);
  const amount = formatInr(p.amountInr);
  const offer  = p.coachOffer || "the program";

  const lines: string[] = [];

  if (p.attempt === 1) {
    lines.push(
      `Hey${name}! Just checking in — I noticed the payment link for ${offer} (${amount}) is still open.`,
      ``,
      `Sometimes these get buried in notifications. Let me know if you have any questions or if something came up!`
    );
  } else if (p.attempt === 2) {
    lines.push(
      `Hey${name}! Following up on the ${amount} payment for ${offer}.`,
      ``,
      `If price or timing is a concern, I'm happy to chat about it — there may be options that work better for you.`
    );
  } else {
    lines.push(
      `Hey${name}! Last follow-up on this — the payment link for ${offer} (${amount}) is still available if you'd like to move forward.`,
      ``,
      `No pressure at all — just wanted to make sure it didn't get missed. Feel free to reach out anytime.`
    );
  }

  if (p.paymentUrl) {
    lines.push(``, `Payment link: ${p.paymentUrl}`);
  }

  return lines.join("\n");
}
