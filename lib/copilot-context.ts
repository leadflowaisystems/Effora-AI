/**
 * lib/copilot-context.ts — entity extraction + data fetching for the strategic copilot.
 * Keeps Ace grounded in real business data without dumping everything into every prompt.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { cache } from "@/lib/cache";

// ── Entity extraction ────────────────────────────────────────────

export interface ExtractedEntities {
  leadNames:   string[];
  timeRange:   { from: string; to: string } | null;
  topics:      ("lead" | "booking" | "payment" | "revenue" | "conversion" | "source" | "general")[];
}

const TIME_PATTERNS: { pattern: RegExp; getRange: () => { from: string; to: string } }[] = [
  {
    pattern: /\btoday\b/i,
    getRange: () => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to: new Date().toISOString() };
    },
  },
  {
    pattern: /\bthis\s+week\b/i,
    getRange: () => {
      const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to: new Date().toISOString() };
    },
  },
  {
    pattern: /\blast\s+week\b/i,
    getRange: () => {
      const end = new Date(); end.setDate(end.getDate() - end.getDay()); end.setHours(0, 0, 0, 0);
      const start = new Date(end); start.setDate(start.getDate() - 7);
      return { from: start.toISOString(), to: end.toISOString() };
    },
  },
  {
    pattern: /\bthis\s+month\b/i,
    getRange: () => {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to: new Date().toISOString() };
    },
  },
  {
    pattern: /\blast\s+(?:30|thirty)\s+days?\b/i,
    getRange: () => ({ from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date().toISOString() }),
  },
  {
    pattern: /\blast\s+(?:7|seven)\s+days?\b/i,
    getRange: () => ({ from: new Date(Date.now() - 7 * 86400000).toISOString(), to: new Date().toISOString() }),
  },
  {
    pattern: /\blast\s+(?:90|ninety)\s+days?\b/i,
    getRange: () => ({ from: new Date(Date.now() - 90 * 86400000).toISOString(), to: new Date().toISOString() }),
  },
];

export function extractEntities(query: string): ExtractedEntities {
  // Time range
  let timeRange: { from: string; to: string } | null = null;
  for (const tp of TIME_PATTERNS) {
    if (tp.pattern.test(query)) { timeRange = tp.getRange(); break; }
  }
  if (!timeRange) timeRange = { from: new Date(Date.now() - 7 * 86400000).toISOString(), to: new Date().toISOString() };

  // Topics
  const topics: ExtractedEntities["topics"] = [];
  if (/\blead|contact|prospect|follow.?up\b/i.test(query))   topics.push("lead");
  if (/\bbooking|call|schedule|appointment\b/i.test(query))  topics.push("booking");
  if (/\bpayment|paid|invoice|collect|money\b/i.test(query)) topics.push("payment");
  if (/\brevenue|income|earn|₹|INR\b/i.test(query))          topics.push("revenue");
  if (/\bconver(t|sion)|rate|funnel\b/i.test(query))         topics.push("conversion");
  if (/\bsource|attribution|where.*(come|coming)\b/i.test(query)) topics.push("source");
  if (topics.length === 0) topics.push("general");

  // Lead names — capitalized 1-3 word sequences that look like names
  const nameMatches = query.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) ?? [];
  const stopWords = new Set(["What", "Who", "How", "Why", "When", "Which", "Show", "Tell", "Give", "List"]);
  const leadNames = nameMatches.filter((n) => !stopWords.has(n.split(" ")[0]));

  return { leadNames, timeRange, topics };
}

// ── Data fetching ────────────────────────────────────────────────

export interface CopilotData {
  org:         { name: string; plan: string; totalLeads: number };
  vp:          { tone: string; offer: string } | null;
  deepCtx:     Record<string, unknown>;
  metrics:     { newLeads: number; bookings: number; revenueInr: number; aiReplies: number; timeLabel: string };
  prevMetrics: { revenueInr: number; newLeads: number } | null;
  leads:       Array<{ name: string; stage: string; score: number; lastSeen: string | null; ltv: number; bookingCount: number; paymentCount: number; paidTotal: number; messages: string[] }>;
  upcoming:    Array<{ leadName: string | null; startsAt: string; meetingUrl: string | null }>;
  topSources:  Array<{ source: string; count: number; revenue: number }>;
}

export async function fetchRelevantData(orgId: string, entities: ExtractedEntities): Promise<CopilotData> {
  const cacheKey = `copilot-ctx:${orgId}`;
  const cached   = await cache.get<CopilotData>(cacheKey);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc  = createServiceClient() as any;
  const { from, to } = entities.timeRange ?? { from: new Date(Date.now() - 7 * 86400000).toISOString(), to: new Date().toISOString() };

  // Prev period for comparison
  const periodMs   = new Date(to).getTime() - new Date(from).getTime();
  const prevFrom   = new Date(new Date(from).getTime() - periodMs).toISOString();
  const prevTo     = from;

  const [
    orgRes, vpRes, leadsCountRes, bookingsRes, paymentsRes,
    prevPayRes, prevLeadsRes, upcomingRes, allLeadsRes,
  ] = await Promise.all([
    svc.from("orgs").select("name, plan, deep_context").eq("id", orgId).single(),
    svc.from("voice_profiles").select("tone, offer").eq("org_id", orgId).single(),
    svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", from).lte("created_at", to),
    svc.from("payments").select("amount_inr, lead_id").eq("org_id", orgId).eq("status", "paid").gte("updated_at", from).lte("updated_at", to),
    svc.from("payments").select("amount_inr").eq("org_id", orgId).eq("status", "paid").gte("updated_at", prevFrom).lte("updated_at", prevTo),
    svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", prevFrom).lte("created_at", prevTo),
    svc.from("bookings").select("attendee_name, starts_at, meeting_url").eq("org_id", orgId).eq("status", "confirmed").gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(5),
    svc.from("leads").select("id, name, stage, score, last_seen_at, ltv_inr, external_id").eq("org_id", orgId).is("deleted_at", null).order("score", { ascending: false }).limit(20),
  ]);

  type LeadRow = { id: string; name: string | null; stage: string; score: number; last_seen_at: string | null; ltv_inr: number | null; external_id: string | null };
  const paidPayments = (paymentsRes.data ?? []) as { amount_inr: number; lead_id: string }[];
  const revenueInr   = paidPayments.reduce((s: number, r: { amount_inr: number }) => s + r.amount_inr, 0);
  const prevRevenue  = ((prevPayRes.data ?? []) as { amount_inr: number }[]).reduce((s: number, r: { amount_inr: number }) => s + r.amount_inr, 0);

  // Fetch top sources
  const allLeadsList = (allLeadsRes.data ?? []) as LeadRow[];
  const paidLeadSet  = new Set(paidPayments.map((p: { lead_id: string }) => p.lead_id));
  // We don't have source on allLeadsRes — do a quick source query
  const { data: srcLeads } = await svc.from("leads").select("source, id").eq("org_id", orgId).gte("created_at", from).limit(500);
  const srcMap = new Map<string, { count: number; revenue: number }>();
  for (const l of (srcLeads ?? []) as { source: string | null; id: string }[]) {
    const s = l.source ?? "organic";
    if (!srcMap.has(s)) srcMap.set(s, { count: 0, revenue: 0 });
    const e = srcMap.get(s)!;
    e.count++;
    if (paidLeadSet.has(l.id)) {
      const paid = paidPayments.filter((p: { lead_id: string; amount_inr: number }) => p.lead_id === l.id).reduce((s: number, p: { amount_inr: number }) => s + p.amount_inr, 0);
      e.revenue += paid;
    }
  }
  const topSources = Array.from(srcMap.entries())
    .map(([source, v]) => ({ source, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
    .slice(0, 5);

  // Match specific leads by name if entity extraction found names
  const enrichedLeads = await Promise.all(
    allLeadsList.slice(0, 10).map(async (l: LeadRow) => {
      const [bRes, pRes, mRes] = await Promise.all([
        svc.from("bookings").select("id", { count: "exact", head: true }).eq("lead_id", l.id),
        svc.from("payments").select("amount_inr").eq("lead_id", l.id).eq("status", "paid"),
        svc.from("messages").select("content, direction").eq("org_id", orgId)
          .eq("direction", "inbound").order("sent_at", { ascending: false }).limit(3)
          .in("conversation_id",
            (await svc.from("conversations").select("id").eq("lead_id", l.id).limit(1)).data?.map((c: { id: string }) => c.id) ?? []
          ),
      ]);
      const paidTotal = ((pRes.data ?? []) as { amount_inr: number }[]).reduce((s: number, r: { amount_inr: number }) => s + r.amount_inr, 0);
      return {
        name:         l.name ?? l.external_id ?? "Unknown",
        stage:        l.stage,
        score:        l.score,
        lastSeen:     l.last_seen_at,
        ltv:          l.ltv_inr ?? paidTotal,
        bookingCount: bRes.count ?? 0,
        paymentCount: ((pRes.data ?? []) as unknown[]).length,
        paidTotal,
        messages:     ((mRes.data ?? []) as { content: string }[]).map((m) => m.content.slice(0, 100)),
      };
    })
  );

  const periodLabel = periodMs <= 86400000 * 1.5 ? "today"
    : periodMs <= 86400000 * 8 ? "last 7 days"
    : periodMs <= 86400000 * 32 ? "last 30 days"
    : "last 90 days";

  const data: CopilotData = {
    org:         { name: (orgRes.data as { name: string; plan: string } | null)?.name ?? "Coach", plan: (orgRes.data as { plan: string } | null)?.plan ?? "trial", totalLeads: leadsCountRes.count ?? 0 },
    vp:          vpRes.data as { tone: string; offer: string } | null,
    deepCtx:     ((orgRes.data as { deep_context?: Record<string, unknown> } | null)?.deep_context) ?? {},
    metrics:     { newLeads: (await svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", from)).count ?? 0, bookings: bookingsRes.count ?? 0, revenueInr, aiReplies: 0, timeLabel: periodLabel },
    prevMetrics: { revenueInr: prevRevenue, newLeads: prevLeadsRes.count ?? 0 },
    leads:       enrichedLeads,
    upcoming:    (upcomingRes.data ?? []) as Array<{ attendee_name: string | null; starts_at: string; meeting_url: string | null }> extends infer T ? T extends Array<{ attendee_name: string | null; starts_at: string; meeting_url: string | null }> ? Array<{ leadName: string | null; startsAt: string; meetingUrl: string | null }> : never : never,
    topSources,
  };
  // map attendee_name → leadName
  data.upcoming = (upcomingRes.data ?? []).map((b: { attendee_name: string | null; starts_at: string; meeting_url: string | null }) => ({
    leadName:   b.attendee_name,
    startsAt:   b.starts_at,
    meetingUrl: b.meeting_url,
  }));

  await cache.set(cacheKey, data, 30); // 30s cache
  return data;
}

// ── Context prompt builder ────────────────────────────────────────

export function buildContextPrompt(data: CopilotData): string {
  const { org, vp, metrics, prevMetrics, leads, upcoming, topSources } = data;

  const revChange = prevMetrics && prevMetrics.revenueInr > 0
    ? ` (${metrics.revenueInr >= prevMetrics.revenueInr ? "+" : ""}${Math.round(((metrics.revenueInr - prevMetrics.revenueInr) / prevMetrics.revenueInr) * 100)}% vs prior period)`
    : "";
  const leadChange = prevMetrics && prevMetrics.newLeads > 0
    ? ` (${metrics.newLeads >= prevMetrics.newLeads ? "+" : ""}${Math.round(((metrics.newLeads - prevMetrics.newLeads) / prevMetrics.newLeads) * 100)}% vs prior period)`
    : "";

  const lines = [
    `ORG: ${org.name} (${org.plan} plan, ${org.totalLeads} total leads)`,
    vp ? `COACH PROFILE: ${vp.tone} tone, offer: ${vp.offer}` : "",
    ``,
    `METRICS (${metrics.timeLabel}):`,
    `- New leads: ${metrics.newLeads}${leadChange}`,
    `- Bookings: ${metrics.bookings}`,
    `- Revenue: ₹${metrics.revenueInr.toLocaleString("en-IN")}${revChange}`,
    ``,
    leads.length > 0 ? `TOP LEADS (by score):` : "",
    ...leads.slice(0, 8).map((l) =>
      `- ${l.name} (${l.stage}, score ${l.score}/100, LTV ₹${l.ltv.toLocaleString("en-IN")}, ${l.bookingCount} booking${l.bookingCount !== 1 ? "s" : ""}, ${l.paymentCount} payment${l.paymentCount !== 1 ? "s" : ""}${l.messages.length > 0 ? `, last msg: "${l.messages[0]}"` : ""})`
    ),
    ``,
    upcoming.length > 0 ? `UPCOMING CALLS:` : "",
    ...upcoming.slice(0, 3).map((u) =>
      `- ${u.leadName ?? "Unknown"} on ${new Date(u.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at ${new Date(u.startsAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
    ),
    ``,
    topSources.length > 0 ? `TOP SOURCES (${metrics.timeLabel}):` : "",
    ...topSources.map((s) => `- ${s.source}: ${s.count} leads, ₹${s.revenue.toLocaleString("en-IN")} revenue`),
  ];

  return lines.filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
