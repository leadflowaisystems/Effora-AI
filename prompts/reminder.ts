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

/**
 * Bare first name for a WhatsApp template parameter, never blank.
 *
 * Distinct from the private firstName() above, which yields ", Priya" for
 * inline prose. A template variable needs the name on its own, and Meta rejects
 * an empty parameter, so this falls back to "there".
 */
export function reminderLeadName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/**
 * Session/programme label, never blank — the single definition of the fallback
 * and the "our " strip, so the template parameter can never drift from the
 * wording used in the free-form prose below.
 */
export function reminderOffer(coachOffer: string | null | undefined, kind: "24h" | "1h"): string {
  const fallback = kind === "24h" ? "upcoming session" : "call";
  return (coachOffer?.trim() || fallback).replace(/^our\s+/i, "");
}

export function build24hReminder(p: ReminderParams): string {
  const name  = firstName(p.leadName);
  // Strip any accidental leading "our " from the stored offer so the template
  // "our ${offer}" never produces "our our ...".
  const offer = reminderOffer(p.coachOffer, "24h");

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
  const offer = reminderOffer(p.coachOffer, "1h");

  const lines = [`Hey${name}! Our ${offer} is coming up in about an hour ⏰`];

  if (p.meetingUrl) {
    lines.push(``, `Click here to join when you're ready: ${p.meetingUrl}`);
  } else {
    lines.push(``, `Looking forward to our chat!`);
  }

  return lines.join("\n");
}
