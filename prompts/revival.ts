/**
 * Prompt builder for ghost revival nudges.
 * LLM-powered — personalises to the lead's conversation history + voice profile.
 *
 * Returns { system, user } for a plain-text completion.
 * The model must return ONLY the nudge text — no labels, no JSON.
 */

export interface RevivalInput {
  messages: Array<{ direction: "inbound" | "outbound"; content: string }>;
  voiceProfile: {
    tone:        string;
    offer:       string;
    sells:       string;
    objections:  string[];
    extra_context: string;
  } | null;
  inactiveDays: number;
  attempt:      1 | 2 | 3;
  calLink?:     string | null;
}

const ATTEMPT_INSTRUCTIONS: Record<number, string> = {
  1: "Gentle check-in. Reference something specific from their previous conversation. Keep it warm and curiosity-driven — no ask yet.",
  2: "A bit more direct. Offer a fresh angle, a quick win, or an invitation to hop on a short call. Still friendly, not pushy.",
  3: "Warm closing message. Acknowledge they've been busy. Leave the door wide open. Optionally share a booking link if available.",
};

export function buildRevivalPrompt(input: RevivalInput): {
  system: string;
  user:   string;
} {
  const vp = input.voiceProfile;

  const system = [
    `You are a DM copywriter helping a coach re-engage a lead who went quiet.`,
    `Your job: write ONE short, warm, personal message to restart the conversation.`,
    ``,
    `VOICE & CONTEXT`,
    `Tone: ${vp?.tone ?? "friendly and conversational"}`,
    vp?.sells       ? `What we help with: ${vp.sells}` : "",
    vp?.offer       ? `Our offer: ${vp.offer}` : "",
    vp?.extra_context ? `Extra context: ${vp.extra_context}` : "",
    ``,
    `SITUATION`,
    `This lead has been inactive for ${input.inactiveDays} days.`,
    `This is revival nudge ${input.attempt} of 3.`,
    ``,
    `INSTRUCTIONS FOR THIS NUDGE`,
    ATTEMPT_INSTRUCTIONS[input.attempt] ?? ATTEMPT_INSTRUCTIONS[1],
    ...(input.attempt === 3 && input.calLink
      ? [`If appropriate, include this booking link: ${input.calLink}`]
      : []),
    ``,
    `RULES`,
    `- 1–3 sentences max.`,
    `- Sound human, not salesy. Never start with "Hey [Name]!" if it feels forced.`,
    `- Reference their previous conversation naturally (what they asked, their situation).`,
    `- Never mention you are an AI.`,
    `- Output ONLY the message text. No labels, no JSON, no explanation.`,
  ].filter(Boolean).join("\n");

  const transcript = input.messages
    .slice(-10) // last 10 messages for context
    .map((m) => `${m.direction === "inbound" ? "LEAD" : "COACH"}: ${m.content}`)
    .join("\n");

  const user = `Previous conversation:\n${transcript}\n\nWrite nudge ${input.attempt}:`;

  return { system, user };
}
