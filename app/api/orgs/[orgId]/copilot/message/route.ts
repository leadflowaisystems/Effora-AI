/**
 * POST /api/orgs/[orgId]/copilot/message
 * Data-aware Ace copilot using a Groq tool-calling agent loop.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/ratelimit";
import { sanitizeText } from "@/lib/sanitize";
import { getAccessState } from "@/lib/access";
import { runCopilotAgent, buildSystemPrompt } from "@/lib/copilot/agent";
import { z } from "zod";

export const maxDuration = 45;

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

const Schema = z.object({
  message: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = params.orgId;

  try {
    const apiKey = process.env.GROQ_API_KEYS?.split(",")[0]?.trim() || process.env.LLM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured — contact support." }, { status: 500 });
    }

    const user = await assertMember(orgId);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let access;
    try {
      access = await getAccessState(orgId);
    } catch {
      access = { canUseCopilot: true, copilotDailyLimit: 60 };
    }
    if (!access.canUseCopilot) {
      return NextResponse.json({ error: "Copilot is not available on your plan. Upgrade to access Ace." }, { status: 403 });
    }

    const msgLimit = Number(access.copilotDailyLimit) > 0 ? Number(access.copilotDailyLimit) : 60;
    try {
      const { allowed } = await rateLimitAsync(`copilot:${orgId}`, { limit: msgLimit });
      if (!allowed) return NextResponse.json({ error: "Daily copilot message limit reached. Resets tomorrow." }, { status: 429 });
    } catch { /* non-fatal */ }

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const message = sanitizeText(parsed.data.message);

    // Load history and org context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    const [historyRes, orgRes] = await Promise.all([
      svc.from("copilot_chats").select("role, content").eq("org_id", orgId)
        .order("created_at", { ascending: false }).limit(20)
        .then((r: { data: { role: string; content: string }[] | null }) => r),
      svc.from("orgs").select("name, plan, trial_ends_at").eq("id", orgId).single(),
    ]);

    const history  = ((historyRes.data ?? []) as { role: string; content: string }[]).reverse();
    const orgData  = orgRes.data as { name: string; plan: string; trial_ends_at: string | null } | null;

    // Total leads count
    const { count: totalLeads } = await svc.from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).is("deleted_at", null);

    const systemPrompt = buildSystemPrompt({
      orgName:    orgData?.name ?? "your business",
      plan:       orgData?.plan ?? "trial",
      totalLeads: totalLeads ?? 0,
      trialEndsAt: orgData?.trial_ends_at,
    });

    const model   = process.env.LLM_MODEL_SMART ?? "llama-3.3-70b-versatile";
    const baseURL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";

    const { reply, tools_used } = await runCopilotAgent({
      orgId, message, history, systemPrompt, apiKey, baseURL, model,
    });

    const actionMatch      = reply.match(/(?:Next action|Suggested action):(.*?)(?:\n|$)/i);
    const suggested_action = actionMatch?.[1]?.trim() ?? null;

    // Persist conversation
    try {
      await svc.from("copilot_chats").insert([
        { org_id: orgId, role: "user",      content: message },
        { org_id: orgId, role: "assistant", content: reply   },
      ]);
    } catch (saveErr) {
      console.warn("[copilot] history save failed:", saveErr);
    }

    return NextResponse.json({ reply, suggested_action, tools_used });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[copilot] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
