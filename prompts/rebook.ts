/**
 * Template-based re-book offer message builder.
 * Sent after a no-show — up to 2 attempts, 24h apart.
 * No LLM — deterministic so recovery always fires.
 */

function firstName(name: string | null): string {
  if (!name) return "";
  const first = name.trim().split(/\s+/)[0];
  return first ? `, ${first}` : "";
}

export interface RebookParams {
  leadName:   string | null;
  attempt:    1 | 2;
  calLink:    string | null;
  coachOffer: string;
}

export function buildRebookOffer(p: RebookParams): string {
  const name  = firstName(p.leadName);
  const offer = p.coachOffer || "working together";

  const lines: string[] = [];

  if (p.attempt === 1) {
    lines.push(
      `Hey${name}! We missed you on our call today — no worries at all, life gets busy!`,
      ``,
      `I'd still love to connect and chat about ${offer}. Want to pick a new time that works better for you?`
    );
  } else {
    lines.push(
      `Hey${name}! I know things have been hectic — this is my last nudge, I promise.`,
      ``,
      `If you ever want to explore ${offer}, the door is always open. You can book a slot whenever you're ready.`
    );
  }

  if (p.calLink) {
    lines.push(``, p.calLink);
  }

  return lines.join("\n");
}
