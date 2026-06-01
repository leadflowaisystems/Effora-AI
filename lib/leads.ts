/**
 * Lead display helpers used across prompts and Inngest functions.
 *
 * getLeadFirstName  — first word of name, or handle without @, or ""
 * formatMeetingTime — ISO → "Friday, 31 May at 3:00 PM" (IST)
 */

interface LeadNameInput {
  name?:              string | null;
  instagram_handle?:  string | null;
  /** Fallback identifier (e.g. manual_123, email address, etc.) */
  external_id?:       string | null;
}

/**
 * Returns the lead's first name for use inside a conversational message.
 *
 * Priority order:
 *   1. First whitespace-separated word of `name`  (e.g. "Priya Sharma" → "Priya")
 *   2. `instagram_handle` with leading @ stripped  (e.g. "@priya_fitness" → "priya_fitness")
 *   3. `external_id` with leading @ stripped
 *   4. Empty string (caller decides whether to omit the name entirely)
 */
export function getLeadFirstName(lead: LeadNameInput): string {
  const full = lead.name?.trim();
  if (full) {
    const first = full.split(/\s+/)[0];
    if (first) return first;
  }

  const handle =
    lead.instagram_handle?.trim() ||
    lead.external_id?.trim()      ||
    "";

  return handle ? handle.replace(/^@/, "") : "";
}

/**
 * Formats an ISO date string as a readable meeting time in IST.
 * Example output: "Friday, 31 May at 3:00 PM"
 */
export function formatMeetingTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("en-IN", {
      weekday:  "long",
      day:      "numeric",
      month:    "long",
      hour:     "numeric",
      minute:   "2-digit",
      hour12:   true,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return isoString;
  }
}
