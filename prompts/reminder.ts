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
  const name   = firstName(p.leadName);
  const when   = formatStart(p.startsAt);
  const offer  = p.coachOffer || "how I can help";

  const lines = [
    `Hey${name}! Just a quick reminder — we have a discovery call booked for tomorrow at ${when}.`,
    ``,
    `I'm really looking forward to chatting about ${offer}.`,
  ];

  if (p.meetingUrl) {
    lines.push(``, `Here's your meeting link: ${p.meetingUrl}`);
  }

  lines.push(``, `See you tomorrow!`);
  return lines.join("\n");
}

export function build1hReminder(p: ReminderParams): string {
  const name = firstName(p.leadName);

  const lines = [`Hey${name}! Our call starts in 1 hour ⏰`];

  if (p.meetingUrl) {
    lines.push(``, `Click here to join when you're ready: ${p.meetingUrl}`);
  } else {
    lines.push(``, `Get ready — looking forward to our chat!`);
  }

  return lines.join("\n");
}
