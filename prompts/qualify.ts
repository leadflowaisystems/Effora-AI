/**
 * Prompt builder for lead qualification.
 *
 * Uses a rubric + few-shot format tuned for llama-3.1-8b-instant.
 * Returns { system, user } for a JSON-mode completion.
 *
 * Model must return ONLY:
 *   {"score":"hot|warm|cold","stage":"hot|warm|cold","reasoning":"one short sentence"}
 */

/**
 * Strip prompt injection attempts from user-supplied text before sending to the LLM.
 * Removes patterns like "ignore previous instructions", triple-backtick fences, and
 * inline code blocks that could break structured output.
 */
function sanitize(text: string): string {
  return text
    .replace(/`{3}[\s\S]*?`{3}/g, "[code block removed]")   // triple-backtick fences
    .replace(/`/g, "'")                                        // inline backticks
    .replace(/"{3}/g, "'''")                                   // triple-double-quotes
    .replace(/ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions?/gi, "[filtered]")
    .replace(/forget\s+everything\s+(I\s+said|above|prior)/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+(a|an)\s+/gi, "[filtered] ");
}

export interface QualifyInput {
  messages: Array<{ direction: "inbound" | "outbound"; content: string }>;
  voiceProfile: {
    tone:          string;
    offer:         string;
    price_range:   string;
    sells:         string;
    objections:    string[];
    extra_context?: string;
  } | null;
}

export function buildQualifyPrompt(input: QualifyInput): {
  system: string;
  user:   string;
} {
  const vp = input.voiceProfile;

  // Fill template vars — fall back to sensible defaults when profile is empty
  const offer         = vp?.offer         || "coaching services";
  const priceRange    = vp?.price_range   || "not specified";
  const problemSolved = vp?.sells         || "coaching clients to grow and achieve their goals";
  const extraCtx      = vp?.extra_context || "";

  const system =
`You are a lead qualification engine for an Instagram coaching business. You read ONE \
incoming DM and decide how likely the sender is to become a paying client of the coach. \
Output ONLY valid JSON, nothing else.

Coach context:
- Sells: ${offer}
- Price range: ${priceRange}
- Helps: ${problemSolved}${extraCtx ? `\n- Additional context: ${extraCtx.slice(0, 300)}` : ""}

Score exactly one:
- "hot": clear buying intent. Asks price, asks how to start/join, asks to talk or book a \
call, says they're ready, or describes a specific problem the offer solves and asks for help.
- "warm": genuinely interested but still exploring. Asks general questions about the program \
or describes a relevant problem with no direct ask yet.
- "cold": no buying intent. Compliments only, greetings, spam, self-promo, collab/partnership \
pitches, or anything unrelated to buying coaching.

Rules:
- Someone in the same profession can still be HOT if they want the coach's help to grow \
(e.g. a small coach wanting mentorship to scale).
- "Can we talk?", "how much?", "how do I start?", "can you help me?" are strong HOT signals.
- Be decisive. Never default to cold when there is real interest.

Output JSON exactly:
{"score":"hot|warm|cold","stage":"hot|warm|cold","reasoning":"one short sentence"}

EXAMPLES:
DM: "Hi! I saw your post about scaling to ₹1L/month. I'm a fitness coach doing about ₹20k right now. Can we talk?"
{"score":"hot","stage":"hot","reasoning":"States current revenue and asks to talk about scaling, strong intent."}
DM: "Great work, love your reels!"
{"score":"cold","stage":"cold","reasoning":"Compliment only, no interest in the offer."}
DM: "What's included in your program and how long is it?"
{"score":"warm","stage":"warm","reasoning":"Asking about program details, exploring."}
DM: "Hey, I run an agency, want to collaborate?"
{"score":"cold","stage":"cold","reasoning":"Partnership pitch, not a buyer."}
DM: "I've struggled to lose weight for 2 years and saw your transformation. How much is coaching?"
{"score":"hot","stage":"hot","reasoning":"Clear painful problem plus a price question, ready to buy."}`;

  // Build the user turn: show the last inbound DM prominently,
  // prepend earlier context if the conversation has multiple turns.
  const inbound = input.messages.filter((m) => m.direction === "inbound");
  const lastDm  = sanitize(inbound[inbound.length - 1]?.content ?? "(no message)");

  let user: string;
  if (input.messages.length <= 1) {
    user = `USER MESSAGE TO ANALYZE:\n"""\n${lastDm}\n"""`;
  } else {
    const history = input.messages
      .slice(0, -1)
      .map((m) => `${m.direction === "inbound" ? "LEAD" : "COACH"}: ${sanitize(m.content)}`)
      .join("\n");
    user = `Previous context:\n${history}\n\nUSER MESSAGE TO ANALYZE:\n"""\n${lastDm}\n"""`;
  }

  return { system, user };
}
