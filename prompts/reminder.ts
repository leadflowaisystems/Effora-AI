/**
 * Template-based reminder message builders.
 * No LLM — kept deterministic so they always fire correctly.
 */

function firstName(name: string | null): string {
  if (!name) return "";
  const first = name.trim().split(/\s+/)[0];
  return first ? `, ${first}` : "";
}

export interface ReminderParams {
  leadName:   string | null;
  startsAt:   string;
  meetingUrl: string | null;
  coachOffer: string;
}

export function build24hReminder(p: ReminderParams): string {
  const name  = firstName(p.leadName);
  // Strip any accidental leading "our " from the stored offer so the template
  // "our ${offer}" never produces "our our ...".
  const offer = (p.coachOffer?.trim() || "upcoming session").replace(/^our\s+/i, "");

  const lines = [
    `Hey${name}! Just a quick heads-up — our ${offer} is coming up soon.`,
    ``,
    `Really looking forward to chatting and figuring out how I can help you move things forward.`,
  ];

  if (p.meetingUrl) {
    lines.push(``, `Here's your meeting link whenever you're ready: ${p.meetingUrl}`);
  }

  lines.push(``, `See you soon! 🙌`);
  return lines.join("\n");
}

export function build1hReminder(p: ReminderParams): string {
  const name  = firstName(p.leadName);
  const offer = (p.coachOffer?.trim() || "call").replace(/^our\s+/i, "");

  const lines = [`Hey${name}! Our ${offer} is coming up in about an hour ⏰`];

  if (p.meetingUrl) {
    lines.push(``, `Click here to join when you're ready: ${p.meetingUrl}`);
  } else {
    lines.push(``, `Looking forward to our chat!`);
  }

  return lines.join("\n");
}
