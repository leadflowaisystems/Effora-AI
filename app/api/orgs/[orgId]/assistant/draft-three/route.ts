import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { draftReplyThree, qualifyLead } from "@/lib/ai";
import { rateLimitAsync } from "@/lib/ratelimit";
import { sanitizeText } from "@/lib/sanitize";
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

const Schema = z.object({
  firstName: z.string().min(1).max(100),
  handle:    z.string().max(100).optional(),
  message:   z.string().min(1).max(2000),
  context:   z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = await rateLimitAsync(`assistant:${params.orgId}`, { limit: 100 });
  if (!allowed) return NextResponse.json({ error: "Rate limit reached. Try again in a minute." }, { status: 429 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { firstName, handle, message, context } = parsed.data;
  const cleanMsg  = sanitizeText(message);
  const cleanCtx  = sanitizeText(context);
  const orgId     = params.orgId;

  const svc = createServiceClient();
  const [vpRow, calRow, orgRow] = await Promise.all([
    svc.from("voice_profiles").select("*").eq("org_id", orgId).single(),
    svc.from("integrations").select("config").eq("org_id", orgId).eq("provider", "calcom").eq("active", true).maybeSingle(),
    svc.from("orgs").select("slug").eq("id", orgId).single(),
  ]);

  const calLink  = ((calRow.data?.config as Record<string,string> | null)?.booking_url) ?? null;
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://effora-ai.vercel.app";
  const orgSlug  = (orgRow.data as { slug: string } | null)?.slug ?? "";
  const funnelUrl = `${appUrl}/c/${orgSlug}`;

  // Qualify the lead first
  const qualification = await qualifyLead({
    messages:     [{ direction: "inbound", content: cleanMsg }],
    voiceProfile: vpRow.data as Parameters<typeof qualifyLead>[0]["voiceProfile"],
    orgId,
  }).catch(() => ({ score: 20, stage: "cold", reasoning: "" }));

  const replies = await draftReplyThree({
    leadFirstName: sanitizeText(firstName),
    leadHandle:    sanitizeText(handle) || null,
    message:       cleanMsg,
    context:       cleanCtx || null,
    voiceProfile:  vpRow.data as Parameters<typeof draftReplyThree>[0]["voiceProfile"],
    score:         qualification.score,
    stage:         qualification.stage,
    orgId,
    calLink,
    funnelUrl,
  });

  return NextResponse.json({
    score:   qualification.score,
    label:   qualification.stage,
    replies,
  });
}
