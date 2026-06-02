/**
 * lib/copilot/agent.ts
 * Tool-calling agent loop for Ace the strategic copilot.
 * Uses Groq's OpenAI-compatible function-calling API with the
 * llama-3.3-70b-versatile model. Loops until the model stops
 * calling tools and returns a final text response.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { TOOL_MAP, toGroqToolSchema } from "./tools";

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

interface ToolCall {
  id:       string;
  type:     "function";
  function: { name: string; arguments: string };
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?:    string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
}

const MAX_TOOL_ROUNDS = 6; // safety limit

export interface AgentResult {
  reply:       string;
  tools_used:  string[];
}

export async function runCopilotAgent(opts: {
  orgId:     string;
  message:   string;
  history:   { role: string; content: string }[];
  systemPrompt: string;
  apiKey:    string;
  baseURL:   string;
  model:     string;
}): Promise<AgentResult> {
  const { orgId, message, history, systemPrompt, apiKey, baseURL, model } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const toolSchemas = toGroqToolSchema();
  const toolsUsed: string[] = [];

  // Build initial messages array
  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-16).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 20_000);

    let res: Response;
    try {
      res = await fetch(`${baseURL}/chat/completions`, {
        method:  "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          model,
          messages,
          tools: toolSchemas,
          tool_choice: "auto",
          max_tokens: 600,
          temperature: 0.55,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Groq error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data: GroqResponse = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("Empty response from Groq");

    const msg = choice.message;
    if (!msg) throw new Error("No message in Groq response");

    // If there are no tool calls, we have the final response
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = msg.content?.trim() ?? "";
      if (!reply) throw new Error("Empty final reply from Groq");
      return { reply, tools_used: toolsUsed };
    }

    // Append assistant message with tool_calls
    messages.push({
      role:       "assistant",
      content:    msg.content ?? null,
      tool_calls: msg.tool_calls,
    });

    // Execute each tool call
    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name;
      toolsUsed.push(toolName);
      const tool = TOOL_MAP.get(toolName);

      let result: unknown;
      if (!tool) {
        result = { error: `Unknown tool: ${toolName}` };
      } else {
        try {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* empty args */ }
          result = await tool.execute(args, orgId, svc);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[copilot-agent] tool ${toolName} failed:`, msg);
          result = { error: `Tool execution failed: ${msg}` };
        }
      }

      // Append tool result as a tool message
      messages.push({
        role:        "tool",
        tool_call_id: tc.id,
        name:        toolName,
        content:     JSON.stringify(result),
      });
    }
    // Loop back to call Groq again with tool results
  }

  throw new Error("Agent exceeded maximum tool rounds");
}

// ── System prompt builder ─────────────────────────────────────────────────────

export function buildSystemPrompt(opts: {
  orgName: string;
  userName?: string | null;
  plan:    string;
  totalLeads: number;
  trialEndsAt?: string | null;
}): string {
  const { orgName, userName, plan, totalLeads, trialEndsAt } = opts;
  const now        = new Date();
  const dateStr    = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const trialNote  = trialEndsAt
    ? `Trial ends ${new Date(trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
    : "";

  return [
    `You are Ace, the strategic business advisor for ${orgName}.`,
    `Today is ${dateStr}. ${userName ? `The coach's name is ${userName}.` : ""}`,
    `Org context: ${plan} plan, ${totalLeads} total leads. ${trialNote}`,
    ``,
    `PERSONALITY AND STYLE:`,
    `- Sharp, direct, business-minded. Like a senior operator giving a 60-second brief.`,
    `- Not formal, not robotic, not sycophantic. Never start with "Great question!" or any filler opener.`,
    `- Use specific numbers and names from the data you fetch. Never hedge — say "Do this." not "you might want to consider."`,
    `- 3-5 sentences for most answers. Bullet lists for ranked items. Keep it tight.`,
    `- If data shows something bad, say so: "Your conversion rate dropped 30% this week."`,
    `- Always end with one concrete suggestion when helpful. If you just drafted a message, ask if they want it refined.`,
    `- No em dashes. Short, punchy sentences.`,
    ``,
    `TOOL USAGE:`,
    `- Always call the relevant tools to fetch real data before answering factual questions.`,
    `- For "how am I doing" → call get_revenue_comparison + get_pipeline_overview.`,
    `- For "who should I follow up with" → call get_top_leads + get_todays_schedule.`,
    `- For "draft a message for [name]" → first call search_leads to get their lead_id, then call draft_message.`,
    `- For scheduling questions → call get_todays_schedule or get_bookings.`,
    `- Call multiple tools in parallel when needed.`,
    `- Cap responses to what's needed. Don't dump all data — synthesize it.`,
    ``,
    `GUARDRAILS:`,
    `- Never suggest deleting data or taking destructive actions.`,
    `- draft_message only drafts — never implies the message will be sent automatically.`,
    `- If a lead can't be found, say so clearly.`,
  ].join("\n");
}
