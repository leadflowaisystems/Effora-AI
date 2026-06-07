/**
 * Template-based reminder message builders.
 * No LLM — kept deterministic so they always fire correctly.
 */

function firstName(name: string | null): string {
  if (!name) return "";
  const first = name.trim().split(/\s+/)[0];
  return first ? `, ${first}` : "";
}

function formatStart(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("en-IN", {
      weekday: "short",
      month:   "short",
      day:     "numeric",
      hour:    "2-digit",
      minute:  "2-digit",
      timeZone: "Asia/Kolkata",
    }) + " IST";
  } catch {
    return isoString;
  }
}

export interface ReminderParams {
  leadName:   string | null;
  startsAt:   string;
  meetingUrl: string | null;
  coachOffer: string;
}

export function build24hReminder(p: ReminderParams): string {
  const name  = firstName(p.leadName);

  const lines = [
    `Hey${name}! Just a quick heads-up — we have a call coming up soon.`,
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
  const name = firstName(p.leadName);

  const lines = [`Hey${name}! Our call is coming up — just a quick heads-up ⏰`];

  if (p.meetingUrl) {
    lines.push(``, `Click here to join when you're ready: ${p.meetingUrl}`);
  } else {
    lines.push(``, `Looking forward to our chat!`);
  }

  return lines.join("\n");
}
