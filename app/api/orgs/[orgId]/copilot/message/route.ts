/**
 * POST /api/orgs/[orgId]/copilot/message
 * Sends a message to Ace the strategic copilot.
 * Injects real business data into the system prompt based on the user's question.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/ratelimit";
import { sanitizeText } from "@/lib/sanitize";
import { extractEntities, fetchRelevantData, buildContextPrompt } from "@/lib/copilot-context";
import { getAccessState } from "@/lib/access";
import { z } from "zod";
import OpenAI from "openai";

export const maxDuration = 30;

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({ message: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAccessState(params.orgId);
  if (!access.canUseCopilot) {
    return NextResponse.json({ error: "Copilot is not available on your current plan. Upgrade to access Ace." }, { status: 403 });
  }

  const msgLimit = access.copilotDailyLimit > 0 ? access.copilotDailyLimit : 60;
  const { allowed } = await rateLimitAsync(`copilot:${params.orgId}`, { limit: msgLimit });
  if (!allowed) return NextResponse.json({ error: "Daily copilot message limit reached. Resets tomorrow." }, { status: 429 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const message = sanitizeText(parsed.data.message);
  const orgId   = params.orgId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Load chat history
  const { data: historyRows } = await svc
    .from("copilot_chats").select("role, content").eq("org_id", orgId)
    .order("created_at", { ascending: false }).limit(20);
  const history = ((historyRows ?? []) as { role: string; content: string }[]).reverse();

  // Extract entities + fetch business data
  const entities = extractEntities(message);
  const bizData  = await fetchRelevantData(orgId, entities);
  const ctxBlock = buildContextPrompt(bizData);

  const systemPrompt = [
    `You are Ace, a strategic business advisor for ${bizData.org.name}.`,
    `You have direct access to their live business data (leads, bookings, payments, revenue).`,
    ``,
    `PERSONALITY:`,
    `- Sharp, direct, no filler. Never start with "Great question!" or any opener.`,
    `- End EVERY response with exactly one concrete next action prefixed "Next action:"`,
    `- No em dashes. Short sentences. Max 180 words.`,
    `- Cite specific numbers from the data whenever relevant.`,
    `- If asked about a lead not in context, say you don't have their data and suggest checking CRM.`,
    ``,
    `LIVE BUSINESS DATA:`,
    ctxBlock,
  ].filter(Boolean).join("\n");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  const apiKey = process.env.GROQ_API_KEYS?.split(",")[0]?.trim() ?? process.env.LLM_API_KEY ?? "no-key";
  const client = new OpenAI({ apiKey, baseURL: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1", maxRetries: 1, timeout: 20_000 });
  const resp = await client.chat.completions.create({
    model: process.env.LLM_MODEL_SMART ?? "llama-3.3-70b-versatile",
    max_tokens:  280,
    temperature: 0.65,
    messages,
  });

  const reply          = resp.choices[0]?.message?.content?.trim() ?? "...";
  const actionMatch    = reply.match(/Next action:(.*?)(?:\n|$)/i);
  const suggested_action = actionMatch?.[1]?.trim() ?? null;

  await svc.from("copilot_chats").insert([
    { org_id: orgId, role: "user",      content: message },
    { org_id: orgId, role: "assistant", content: reply   },
  ]);

  return NextResponse.json({ reply, suggested_action });
}
