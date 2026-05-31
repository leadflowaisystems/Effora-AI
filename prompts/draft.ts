/**
 * Prompt builder for reply drafting.
 * Returns { system, user } for a plain-text completion.
 * The LLM must return ONLY the reply text — no labels, no JSON, no commentary.
 */

function sanitize(text: string): string {
  return text
    .replace(/`{3}[\s\S]*?`{3}/g, "[code block removed]")
    .replace(/`/g, "'")
    .replace(/"{3}/g, "'''")
    .replace(/ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions?/gi, "[filtered]")
    .replace(/forget\s+everything\s+(I\s+said|above|prior)/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+(a|an)\s+/gi, "[filtered] ");
}

export interface DraftInput {
  messages: Array<{ direction: "inbound" | "outbound"; content: string }>;
  voiceProfile: {
    tone: string;
    offer: string;
    price_range: string;
    sells: string;
    objections: string[];
    extra_context: string;
  } | null;
  score:    number;
  stage:    string;
  /** Cal.com booking URL to embed in hot-lead replies. */
  calLink?: string | null;
}

export function buildDraftPrompt(input: DraftInput): {
  system: string;
  user: string;
} {
  const vp = input.voiceProfile;
  const isHot = input.stage === "hot" || input.stage === "won" || input.stage === "paid" || input.score >= 75;

  const lines: string[] = [];

  lines.push(
    `You are a sharp, human DM assistant writing on behalf of a coaching business. ` +
    `Your job is to write the coach's next reply. Sound like a real person, not a template.`
  );
  lines.push(``);

  // ── Voice & context ──────────────────────────────────────────
  lines.push(`## COACH VOICE`);
  lines.push(`Tone: ${vp?.tone ?? "direct, warm, professional — no filler"}`);
  if (vp?.sells)        lines.push(`What we sell: ${vp.sells}`);
  if (vp?.offer)        lines.push(`The offer: ${vp.offer}`);
  if (vp?.price_range)  lines.push(`Price range: ${vp.price_range}`);
  if (vp?.objections?.length)
    lines.push(`Common objections to handle gracefully: ${vp.objections.join(", ")}`);
  if (vp?.extra_context) lines.push(`Extra context: ${vp.extra_context}`);

  // ── Lead signal ───────────────────────────────────────────────
  lines.push(``);
  lines.push(`## LEAD SIGNAL`);
  lines.push(`Score: ${input.score}/100  Stage: ${input.stage}`);

  if (isHot) {
    if (input.calLink) {
      lines.push(`Intent: HIGH — they are ready or near-ready to buy.`);
      lines.push(`Action: Acknowledge their specific message briefly, then give them the booking link.`);
      lines.push(``);
      lines.push(
        `CALENDAR LINK RULE — non-negotiable: ` +
        `you MUST paste the full URL verbatim inside your reply text. ` +
        `Do not write "here's my link" or "click here" and leave the URL out. ` +
        `The exact URL to use is: ${input.calLink}`
      );
    } else {
      lines.push(`Intent: HIGH — they are ready or near-ready to buy.`);
      lines.push(`Action: Acknowledge their message briefly, nudge toward a discovery call.`);
    }
  } else {
    lines.push(`Intent: WARM/COLD — exploring.`);
    lines.push(`Action: Answer their question helpfully. No hard push to book yet.`);
  }

  // ── Writing rules ─────────────────────────────────────────────
  lines.push(``);
  lines.push(`## RULES`);
  lines.push(`1. Under 50 words. 2–4 sentences maximum.`);
  lines.push(`2. Open by acknowledging their SPECIFIC question or comment — never with "Hey!" or a generic opener.`);
  lines.push(`3. Sound like a busy, confident professional. No "I hope this helps!", no excessive emojis, no sales-bot patterns.`);
  lines.push(`4. Never reveal you are an AI or a script.`);
  lines.push(`5. Output ONLY the reply text. No labels, no quotes, no explanation.`);
  if (input.calLink) {
    lines.push(`6. The booking URL MUST appear verbatim in the reply. If you forget to include the URL the reply is invalid.`);
  }

  // ── Few-shot examples ─────────────────────────────────────────
  lines.push(``);
  lines.push(`## EXAMPLES`);

  if (isHot && input.calLink) {
    const link = input.calLink;
    lines.push(`### Hot lead — price question`);
    lines.push(`Lead: "How much is your 1:1 program? I'm ready to invest."`);
    lines.push(`Reply: "1:1 starts at ${vp?.price_range ?? "₹25k"}/month depending on your goal. Quickest way to figure out fit is a short discovery call — grab a slot here: ${link}"`);
    lines.push(``);
    lines.push(`### Hot lead — ready to start now`);
    lines.push(`Lead: "Can we get on a call this week? I'm serious about starting."`);
    lines.push(`Reply: "Absolutely — pick whatever slot works: ${link}  We'll go over your goal and make sure the program's the right fit before anything else."`);
    lines.push(``);
    lines.push(`### Hot lead — long-term follower`);
    lines.push(`Lead: "I've been following you for months, when's your next intake?"`);
    lines.push(`Reply: "Intake is ongoing — I take a handful of new clients each month. Book a discovery call and we'll see if the timing works: ${link}"`);
    lines.push(``);
    lines.push(`### Hot lead — results question`);
    lines.push(`Lead: "What results have your clients typically seen?"`);
    lines.push(`Reply: "Most hit 8–12kg down and real strength gains by month 2. Book a call and I'll walk you through a few client journeys that match your situation: ${link}"`);
  } else if (isHot) {
    lines.push(`### Hot lead — price question (no link)`);
    lines.push(`Lead: "How much is your 1:1 program? I'm ready to invest."`);
    lines.push(`Reply: "1:1 starts at ${vp?.price_range ?? "₹25k"}/month. Let's do a quick 20-min call this week to see if it's the right fit — what day works for you?"`);
    lines.push(``);
    lines.push(`### Hot lead — ready to start`);
    lines.push(`Lead: "Can we get on a call this week? I'm serious about starting."`);
    lines.push(`Reply: "Let's do it — drop me 2–3 times that work and I'll confirm one. We'll sort out goal and structure on the call."`);
    lines.push(``);
    lines.push(`### Hot lead — results question`);
    lines.push(`Lead: "What results have your clients typically seen?"`);
    lines.push(`Reply: "Most see 8–12kg down and clear strength gains in the first 8 weeks. Happy to walk you through a couple of client examples on a quick call — does this week work?"`);
  } else {
    lines.push(`### Warm lead — program details`);
    lines.push(`Lead: "What exactly is included in your program?"`);
    lines.push(`Reply: "Fully custom training plan + nutrition, weekly check-ins, WhatsApp support, and plan adjustments every 2 weeks. Built around your schedule, not a template."`);
    lines.push(``);
    lines.push(`### Warm lead — time commitment`);
    lines.push(`Lead: "How long is the program and what's the time commitment?"`);
    lines.push(`Reply: "3 months — 4 workouts a week, 45–60 min each. Nutrition is custom so no calorie counting from your side. Happy to go into more detail if it's helpful."`);
    lines.push(``);
    lines.push(`### Cold lead — casual engagement`);
    lines.push(`Lead: "Love your content! 🔥"`);
    lines.push(`Reply: "Appreciate that! 🙏 What part of your fitness are you working on right now?"`);
  }

  // ── Transcript ────────────────────────────────────────────────
  const transcript = input.messages
    .map((m) => `${m.direction === "inbound" ? "LEAD" : "COACH"}: ${sanitize(m.content)}`)
    .join("\n");

  const user = `Conversation so far:\n${transcript}\n\nWrite the coach's next reply:`;

  return { system: lines.join("\n"), user };
}
