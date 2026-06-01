/**
 * POST /api/orgs/[orgId]/copilot/message
 * Sends a message to Ace the strategic copilot.
 *
 * Uses native fetch for the Groq call (avoids the `openai` SDK which can crash
 * at module-load time on Vercel cold-starts due to its HTTP client initialization).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/ratelimit";
import { sanitizeText } from "@/lib/sanitize";
import { extractEntities, fetchRelevantData, buildContextPrompt } from "@/lib/copilot-context";
import { getAccessState } from "@/lib/access";
import { z } from "zod";

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
  const orgId = params.orgId;
  console.log("[copilot] handler entry, orgId:", orgId);

  try {
    // ── Verify env vars early ─────────────────────────────────────
    const apiKey = process.env.GROQ_API_KEYS?.split(",")[0]?.trim() || process.env.LLM_API_KEY;
    if (!apiKey) {
      console.error("[copilot] no Groq key — set GROQ_API_KEYS or LLM_API_KEY in Vercel env vars");
      return NextResponse.json({ error: "AI not configured — contact support." }, { status: 500 });
    }

    // ── Auth ──────────────────────────────────────────────────────
    let user;
    try {
      user = await assertMember(orgId);
    } catch (authErr) {
      console.error("[copilot] auth check threw:", authErr);
      return NextResponse.json({ error: "Auth check failed" }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.log("[copilot] authed userId:", user.id);

    // ── Access gate ───────────────────────────────────────────────
    let access;
    try {
      access = await getAccessState(orgId);
    } catch (accErr) {
      console.warn("[copilot] access check failed (non-fatal, allowing through):", accErr);
      // Allow through — don't block the user because of a plan-check failure
      access = { canUseCopilot: true, copilotDailyLimit: 60 };
    }
    if (!access.canUseCopilot) {
      return NextResponse.json({ error: "Copilot is not available on your current plan. Upgrade to access Ace." }, { status: 403 });
    }

    // ── Rate limit ────────────────────────────────────────────────
    const msgLimit = (access.copilotDailyLimit as number) > 0 ? (access.copilotDailyLimit as number) : 60;
    try {
      const { allowed } = await rateLimitAsync(`copilot:${orgId}`, { limit: msgLimit });
      if (!allowed) return NextResponse.json({ error: "Daily copilot message limit reached. Resets tomorrow." }, { status: 429 });
    } catch (rlErr) {
      console.warn("[copilot] rate-limit check threw (non-fatal):", rlErr);
    }

    // ── Parse body ────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

    const message = sanitizeText(parsed.data.message);
    console.log("[copilot] message:", message.slice(0, 80));

    // ── Load chat history (best-effort) ───────────────────────────
    let history: { role: string; content: string }[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      const { data: historyRows } = await svc
        .from("copilot_chats").select("role, content").eq("org_id", orgId)
        .order("created_at", { ascending: false }).limit(20);
      history = ((historyRows ?? []) as { role: string; content: string }[]).reverse();
    } catch (histErr) {
      console.warn("[copilot] history load failed (copilot_chats table missing?):", histErr);
    }

    // ── Build context (best-effort) ───────────────────────────────
    let ctxBlock = "No prior context available.";
    let bizDataName = "your business";
    try {
      const entities = extractEntities(message);
      const bizData  = await fetchRelevantData(orgId, entities);
      ctxBlock       = buildContextPrompt(bizData);
      bizDataName    = bizData.org.name;
    } catch (ctxErr) {
      console.warn("[copilot] context fetch failed (non-fatal):", ctxErr);
    }

    // ── Build prompt ──────────────────────────────────────────────
    const systemPrompt = [
      `You are Ace, a strategic business advisor for ${bizDataName}.`,
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

    const messages = [
      { role: "system",    content: systemPrompt },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user",      content: message },
    ];

    const model = process.env.LLM_MODEL_SMART ?? "llama-3.3-70b-versatile";
    const baseURL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
    console.log("[copilot] calling LLM:", model, "at", baseURL, "| prompt chars:", systemPrompt.length + message.length);

    // ── Call Groq via native fetch (avoids openai SDK cold-start issues) ─
    let reply = "";
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 22_000);
      let groqRes: Response;
      try {
        groqRes = await fetch(`${baseURL}/chat/completions`, {
          method:  "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 280, temperature: 0.65, messages }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!groqRes.ok) {
        const errText = await groqRes.text().catch(() => "(unreadable)");
        console.error("[copilot] Groq error:", groqRes.status, errText.slice(0, 200));
        return NextResponse.json({ error: `AI service error ${groqRes.status}` }, { status: 500 });
      }

      const groqData = await groqRes.json() as { choices?: Array<{ message?: { content?: string } }> };
      reply = groqData.choices?.[0]?.message?.content?.trim() ?? "";
      if (!reply) {
        console.error("[copilot] Groq returned empty content:", JSON.stringify(groqData).slice(0, 200));
        return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
      }
    } catch (groqErr) {
      const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      console.error("[copilot] Groq call failed:", msg);
      return NextResponse.json({ error: "AI call failed — check Vercel logs for details." }, { status: 500 });
    }

    const actionMatch      = reply.match(/Next action:(.*?)(?:\n|$)/i);
    const suggested_action = actionMatch?.[1]?.trim() ?? null;
    console.log("[copilot] ✓ reply length:", reply.length);

    // ── Persist to copilot_chats (best-effort) ────────────────────
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createServiceClient() as any;
      await svc.from("copilot_chats").insert([
        { org_id: orgId, role: "user",      content: message },
        { org_id: orgId, role: "assistant", content: reply   },
      ]);
    } catch (saveErr) {
      console.warn("[copilot] history save failed (copilot_chats table missing? — run migration 013):", saveErr);
      // Non-fatal: user still gets the reply
    }

    return NextResponse.json({ reply, suggested_action });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[copilot] FATAL unhandled error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
