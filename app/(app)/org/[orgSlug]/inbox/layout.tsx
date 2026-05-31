/**
 * Inbox layout — fetches conversation list and wraps pages in InboxShell.
 * The shell owns the two-pane split, auto-send toggle, and New DM sheet.
 */

import { redirect }       from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { InboxShell }     from "@/components/inbox/inbox-shell";
import type { InboxConversation, InboxLead } from "@/types/inbox";
import type { LeadStage } from "@/types/database";
import { getPlanLimits } from "@/lib/plan";

interface Props {
  children: React.ReactNode;
  params:   { orgSlug: string };
}

export default async function InboxLayout({ children, params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Org data — include plan + AI usage fields
  const { data: orgRow } = await supabase
    .from("orgs")
    .select("id, name, auto_send_replies, plan, trial_ends_at, monthly_ai_msg_count")
    .eq("slug", params.orgSlug)
    .single();

  const org = orgRow as {
    id: string; name: string; auto_send_replies: boolean;
    plan: string; trial_ends_at: string | null; monthly_ai_msg_count: number;
  } | null;

  if (!org) redirect("/");

  const svc = createServiceClient();

  // Conversations with lead info
  const { data: convRows } = await svc
    .from("conversations")
    .select(`
      id, channel_provider, last_message_at, last_message_preview,
      lead:leads (id, name, external_id, channel, score, stage, avatar_url)
    `)
    .eq("org_id", org.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(60);

  const convIds = (convRows ?? []).map((c) => c.id as string);

  // Which conversations have a pending draft?
  const { data: draftRows } = convIds.length
    ? await svc.from("ai_drafts")
        .select("conversation_id")
        .in("conversation_id", convIds)
        .eq("status", "pending")
    : { data: [] };

  const draftSet = new Set((draftRows ?? []).map((d) => d.conversation_id as string));

  const conversations: InboxConversation[] = (convRows ?? []).map((c) => ({
    id:                   c.id,
    channel_provider:     c.channel_provider,
    last_message_at:      c.last_message_at,
    last_message_preview: c.last_message_preview,
    hasPendingDraft:      draftSet.has(c.id),
    lead: (() => {
          const l = c.lead as unknown as {
            id: string; name: string | null; external_id: string; channel: string;
            score: number; stage: string; avatar_url: string | null;
          } | null;
          return l ? { ...l, stage: l.stage as LeadStage } as InboxLead : null;
        })(),
  }));

  // Monthly AI cost
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const { data: usage } = await svc
    .from("ai_usage")
    .select("cost_inr")
    .eq("org_id", org.id)
    .eq("month", month)
    .single();

  const monthCostInr = Number((usage as { cost_inr?: number } | null)?.cost_inr ?? 0);

  // AI limit info for the banner
  const limits = getPlanLimits(org.plan ?? "trial");
  const aiMsgsPerMonth     = limits.aiMsgsPerMonth;      // -1 = unlimited
  const monthlyAiMsgCount  = org.monthly_ai_msg_count ?? 0;

  return (
    <InboxShell
      orgSlug={params.orgSlug}
      orgId={org.id}
      orgName={org.name}
      autoSendReplies={org.auto_send_replies ?? false}
      conversations={conversations}
      monthCostInr={monthCostInr}
      aiMsgsPerMonth={aiMsgsPerMonth}
      monthlyAiMsgCount={monthlyAiMsgCount}
    >
      {children}
    </InboxShell>
  );
}
