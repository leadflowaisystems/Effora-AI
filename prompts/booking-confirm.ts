/**
 * Prompt builder for booking confirmation messages.
 *
 * Generates a short (~35 word), warm outbound message sent immediately after
 * a booking is confirmed. The meeting URL MUST appear verbatim when present.
 *
 * Returns { system, user } for a plain-text LLM completion.
 * The model should output ONLY the message text.
 */

export interface BookingConfirmInput {
  leadFirstName:        string;
  meetingTimeFormatted: string;  // e.g. "Friday, 31 May at 3:00 PM"
  meetingUrl:           string | null;
  coachTone:            string;
  coachOffer:           string;
}

export function buildBookingConfirmPrompt(input: BookingConfirmInput): {
  system: string;
  user:   string;
} {
  const { leadFirstName, meetingTimeFormatted, meetingUrl, coachTone, coachOffer } = input;

  const nameSuffix = leadFirstName ? `, ${leadFirstName}` : "";

  const lines: string[] = [
    `You are a sharp human assistant for a coaching business.`,
    `Write ONE booking confirmation message to send to the lead right now.`,
    ``,
    `## COACH VOICE`,
    `Tone: ${coachTone || "direct, warm, confident — no filler"}`,
    `Offer: ${coachOffer || "coaching"}`,
    ``,
    `## BOOKING DETAILS`,
    `Meeting time: ${meetingTimeFormatted}`,
    meetingUrl
      ? `Meeting URL: ${meetingUrl}`
      : `Meeting URL: not available yet — skip the URL; just say the link will come shortly.`,
    ``,
    `## RULES`,
    `1. Under 40 words total.`,
    `2. Open by confirming with the lead's name${nameSuffix ? ` ("Done${nameSuffix}." / "Locked in${nameSuffix}." / "Confirmed${nameSuffix}." — vary it)` : " (no name available — skip it)"}`,
    `3. State the exact meeting time: ${meetingTimeFormatted}`,
    meetingUrl
      ? `4. You MUST paste the full URL verbatim inside the message. Do NOT paraphrase ("here's the link") without including the actual URL. Use: ${meetingUrl}`
      : `4. No URL available — tell them the meeting link will be sent shortly before the call.`,
    `5. Close briefly: e.g. "Talk soon." / "See you there." / "Reminder coming 1 hour out."`,
    `6. Output ONLY the message text. No labels, no quotes, no explanation.`,
    ``,
    `## EXAMPLES`,
  ];

  if (meetingUrl) {
    const u = meetingUrl;
    lines.push(
      `"Done${nameSuffix}. ${meetingTimeFormatted} is locked in. ${u} Quick reminder will hit you 1 hour before."`,
      `"Confirmed${nameSuffix}. ${meetingTimeFormatted} — see you there. ${u} I'll send a 1-hour heads-up."`,
      `"Locked in${nameSuffix}. ${meetingTimeFormatted} on the calendar. Join here when ready: ${u} Talk soon."`,
    );
  } else {
    lines.push(
      `"Done${nameSuffix}. ${meetingTimeFormatted} is on the calendar. Meeting link will arrive 30 min before. See you then."`,
      `"Booked${nameSuffix}. ${meetingTimeFormatted} — I'll send the meeting link shortly. Talk soon."`,
    );
  }

  return {
    system: lines.join("\n"),
    user:   "Write the confirmation message now:",
  };
}
