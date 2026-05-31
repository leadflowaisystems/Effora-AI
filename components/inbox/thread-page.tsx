"use client";

/**
 * ThreadPage — client component that fetches thread data via API.
 *
 * Why client-side?
 *   The [convId]/page server component only does auth + org lookup (2 fast queries).
 *   All message/draft data fetches happen here so the browser can show a skeleton
 *   immediately and load the thread in parallel, keeping navigation under ~200ms.
 *
 * Stale-conv handling:
 *   If the API returns 404 (conv deleted after re-seed), redirects to /inbox
 *   and persists a toast flag in sessionStorage for InboxShell to display.
 */

import * as React       from "react";
import { useRouter }    from "next/navigation";
import { ThreadView, ThreadSkeleton } from "./thread-view";
import type { InboxLead, InboxMessage, InboxDraft } from "@/types/inbox";
import type { LeadStage }                           from "@/types/database";

interface Props {
  orgId:   string;
  convId:  string;
  orgSlug: string;
}

type ApiLead = {
  id: string; name: string | null; external_id: string; channel: string;
  score: number; stage: string; avatar_url: string | null; created_at?: string;
};

type ApiData = {
  conversation: {
    id: string; channel_provider: string; last_message_at: string | null;
    lead: ApiLead | null;
  };
  messages:     InboxMessage[];
  pendingDraft: InboxDraft | null;
};

export function ThreadPage({ orgId, convId, orgSlug }: Props) {
  // orgSlug is passed through so ThreadView can build the back-to-inbox link
  const router = useRouter();
  const [data,       setData]       = React.useState<ApiData | null>(null);
  const [status,     setStatus]     = React.useState<"loading" | "ok" | "gone" | "error">("loading");
  const [retryCount, setRetryCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    // Reset on conv change (or retry) so skeleton re-shows while fetching
    setData(null);
    setStatus("loading");

    fetch(`/api/orgs/${orgId}/conversations/${convId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) { setStatus("gone"); return; }
        if (!res.ok) {
          console.error(`[ThreadPage] fetch failed: status=${res.status} convId=${convId}`);
          setStatus("error");
          return;
        }
        const json: ApiData = await res.json();
        if (!cancelled) { setData(json); setStatus("ok"); }
      })
      .catch((err) => {
        console.error(`[ThreadPage] fetch error: convId=${convId}`, err);
        if (!cancelled) setStatus("error");
      });

    return () => { cancelled = true; };
  }, [orgId, convId, retryCount]);

  // Redirect gracefully when conv is gone (deleted by re-seed)
  React.useEffect(() => {
    if (status !== "gone") return;
    // Signal InboxShell to show a toast once we land back on /inbox
    try { sessionStorage.setItem("inbox_removed_toast", "1"); } catch { /* ignore */ }
    router.replace(`/org/${orgSlug}/inbox`);
  }, [status, orgSlug, router]);

  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-[var(--text-3)]">Could not load conversation.</p>
        <button
          onClick={() => { setStatus("loading"); setRetryCount((c) => c + 1); }}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-4 py-1.5 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--bg-3)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || status === "loading" || status === "gone") {
    return <ThreadSkeleton />;
  }

  const leadRaw = data.conversation.lead;
  const lead: InboxLead | null = leadRaw
    ? { ...leadRaw, stage: leadRaw.stage as LeadStage }
    : null;

  const messages: InboxMessage[] = (data.messages ?? []).map((m) => ({
    id:        m.id,
    direction: m.direction as "inbound" | "outbound",
    content:   m.content,
    sent_at:   m.sent_at,
    metadata:  m.metadata,
  }));

  return (
    <ThreadView
      orgId={orgId}
      orgSlug={orgSlug}
      convId={convId}
      lead={lead}
      initialMessages={messages}
      initialDraft={data.pendingDraft}
    />
  );
}
