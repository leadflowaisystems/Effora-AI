/**
 * lib/copilot/tools.ts
 * 14 Supabase-backed tool definitions for the Ace copilot agent.
 * All tools are read-only. Execute functions return plain JSON objects
 * that get stringified and injected as tool result messages.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface CopilotTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, orgId: string, svc: SupabaseClient) => Promise<unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

function isoDate(d: string | undefined): string {
  return d ? new Date(d).toISOString() : new Date(Date.now() - 30 * 86400000).toISOString();
}

function periodBounds(period: string): { from: string; to: string } {
  const now = new Date();
  if (period === "week") {
    const start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === "year") {
    const start = new Date(now); start.setFullYear(start.getFullYear() - 1); start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  // month (default)
  const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: now.toISOString() };
}

function prevBounds(current: { from: string; to: string }): { from: string; to: string } {
  const ms = new Date(current.to).getTime() - new Date(current.from).getTime();
  return {
    from: new Date(new Date(current.from).getTime() - ms).toISOString(),
    to:   current.from,
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export const COPILOT_TOOLS: CopilotTool[] = [

  // 1. search_leads
  {
    name: "search_leads",
    description: "Search leads by name, Instagram handle, phone, or email. Optionally filter by stage.",
    parameters: {
      type: "object",
      properties: {
        query:  { type: "string",  description: "Search term (name, handle, phone, email)" },
        stage:  { type: "string",  description: "Optional: cold | warm | hot | booked | qualified | won | paid | churned" },
        limit:  { type: "number",  description: "Max results (default 10, max 20)" },
      },
      required: ["query"],
    },
    async execute(args, orgId, svc) {
      const q     = String(args.query ?? "").toLowerCase();
      const limit = Math.min(Number(args.limit ?? 10), 20);
      let query = svc.from("leads").select("id, name, external_id, stage, score, ltv_inr, last_seen_at, phone, email, instagram_handle")
        .eq("org_id", orgId).is("deleted_at", null).limit(limit);
      if (args.stage) query = query.eq("stage", args.stage);
      // Use ilike for text search
      query = query.or(`name.ilike.%${q}%,external_id.ilike.%${q}%,instagram_handle.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
      const { data } = await query;
      return { leads: data ?? [] };
    },
  },

  // 2. get_lead_details
  {
    name: "get_lead_details",
    description: "Fetch full details for a specific lead: contact info, score, stage, tags, LTV, all activities.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "UUID of the lead" },
      },
      required: ["lead_id"],
    },
    async execute(args, orgId, svc) {
      const leadId = String(args.lead_id);
      const [leadRes, bookingsRes, paymentsRes, convRes] = await Promise.all([
        svc.from("leads").select("*").eq("id", leadId).eq("org_id", orgId).single(),
        svc.from("bookings").select("id, status, starts_at, ends_at, meeting_url").eq("lead_id", leadId).order("starts_at", { ascending: false }).limit(5),
        svc.from("payments").select("id, amount_inr, status, created_at").eq("lead_id", leadId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
        svc.from("conversations").select("id, channel_provider, last_message_at").eq("lead_id", leadId).is("deleted_at", null).limit(1).single(),
      ]);

      let recentMessages: unknown[] = [];
      if (convRes.data?.id) {
        const { data: msgs } = await svc.from("messages").select("direction, content, sent_at")
          .eq("conversation_id", convRes.data.id)
          .order("sent_at", { ascending: false }).limit(5);
        recentMessages = msgs ?? [];
      }

      return {
        lead:     leadRes.data,
        bookings: bookingsRes.data ?? [],
        payments: paymentsRes.data ?? [],
        recent_messages: recentMessages,
        conversation: convRes.data ?? null,
      };
    },
  },

  // 3. get_top_leads
  {
    name: "get_top_leads",
    description: "Get top N leads ranked by score, LTV, or recency of last interaction.",
    parameters: {
      type: "object",
      properties: {
        criterion: { type: "string", description: "score | ltv | recency" },
        limit:     { type: "number", description: "Number of leads (default 5, max 15)" },
        stage:     { type: "string", description: "Optional: filter by stage" },
      },
      required: ["criterion"],
    },
    async execute(args, orgId, svc) {
      const criterion = String(args.criterion ?? "score");
      const limit     = Math.min(Number(args.limit ?? 5), 15);
      const col       = criterion === "ltv" ? "ltv_inr" : criterion === "recency" ? "last_seen_at" : "score";
      let q = svc.from("leads").select("id, name, external_id, stage, score, ltv_inr, last_seen_at")
        .eq("org_id", orgId).is("deleted_at", null)
        .order(col, { ascending: false, nullsFirst: false }).limit(limit);
      if (args.stage) q = q.eq("stage", args.stage);
      const { data } = await q;
      return { leads: data ?? [], ranked_by: criterion };
    },
  },

  // 4. get_bookings
  {
    name: "get_bookings",
    description: "Get bookings filtered by date range, status, or lead. Default: upcoming bookings.",
    parameters: {
      type: "object",
      properties: {
        from:    { type: "string", description: "ISO date string (optional)" },
        to:      { type: "string", description: "ISO date string (optional)" },
        status:  { type: "string", description: "confirmed | pending | cancelled | completed (optional)" },
        lead_id: { type: "string", description: "Filter by lead UUID (optional)" },
        limit:   { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
    async execute(args, orgId, svc) {
      const from  = args.from  ? isoDate(String(args.from))  : new Date().toISOString();
      const to    = args.to    ? isoDate(String(args.to))    : new Date(Date.now() + 30 * 86400000).toISOString();
      const limit = Math.min(Number(args.limit ?? 10), 20);
      let q = svc.from("bookings")
        .select("id, status, starts_at, ends_at, attendee_name, meeting_url, lead_id")
        .eq("org_id", orgId)
        .gte("starts_at", from).lte("starts_at", to)
        .order("starts_at", { ascending: true }).limit(limit);
      if (args.status)  q = q.eq("status", args.status);
      if (args.lead_id) q = q.eq("lead_id", args.lead_id);
      const { data } = await q;
      return { bookings: data ?? [], from, to };
    },
  },

  // 5. get_payments
  {
    name: "get_payments",
    description: "Get payments filtered by date range, status (paid|pending), or lead.",
    parameters: {
      type: "object",
      properties: {
        from:    { type: "string", description: "ISO date string (optional)" },
        to:      { type: "string", description: "ISO date string (optional)" },
        status:  { type: "string", description: "paid | pending (optional)" },
        lead_id: { type: "string", description: "Filter by lead UUID (optional)" },
        limit:   { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
    async execute(args, orgId, svc) {
      const from  = args.from ? isoDate(String(args.from)) : new Date(Date.now() - 30 * 86400000).toISOString();
      const to    = args.to   ? isoDate(String(args.to))   : new Date().toISOString();
      const limit = Math.min(Number(args.limit ?? 10), 20);
      let q = svc.from("payments")
        .select("id, amount_inr, status, created_at, updated_at, lead_id")
        .eq("org_id", orgId).is("deleted_at", null)
        .gte("created_at", from).lte("created_at", to)
        .order("created_at", { ascending: false }).limit(limit);
      if (args.status)  q = q.eq("status", args.status);
      if (args.lead_id) q = q.eq("lead_id", args.lead_id);
      const { data } = await q;
      return { payments: data ?? [], from, to };
    },
  },

  // 6. get_revenue_summary
  {
    name: "get_revenue_summary",
    description: "Get total revenue, payment count, and average ticket size for a date range.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date string" },
        to:   { type: "string", description: "ISO date string" },
      },
      required: ["from", "to"],
    },
    async execute(args, orgId, svc) {
      const { data } = await svc.from("payments")
        .select("amount_inr")
        .eq("org_id", orgId).eq("status", "paid").is("deleted_at", null)
        .gte("updated_at", isoDate(String(args.from)))
        .lte("updated_at", isoDate(String(args.to)));
      const payments = (data ?? []) as { amount_inr: number }[];
      const total    = payments.reduce((s, r) => s + r.amount_inr, 0);
      const count    = payments.length;
      return {
        total_inr: total,
        count,
        avg_inr: count > 0 ? Math.round(total / count) : 0,
        from: args.from,
        to:   args.to,
      };
    },
  },

  // 7. get_revenue_comparison
  {
    name: "get_revenue_comparison",
    description: "Compare this week/month/year vs the prior same period: revenue, bookings, leads counts with deltas.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: "week | month | year" },
      },
      required: ["period"],
    },
    async execute(args, orgId, svc) {
      const curr = periodBounds(String(args.period ?? "month"));
      const prev = prevBounds(curr);

      const [currPay, prevPay, currBooks, prevBooks, currLeads, prevLeads] = await Promise.all([
        svc.from("payments").select("amount_inr").eq("org_id", orgId).eq("status", "paid").is("deleted_at", null).gte("updated_at", curr.from).lte("updated_at", curr.to),
        svc.from("payments").select("amount_inr").eq("org_id", orgId).eq("status", "paid").is("deleted_at", null).gte("updated_at", prev.from).lte("updated_at", prev.to),
        svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", curr.from).lte("created_at", curr.to),
        svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", prev.from).lte("created_at", prev.to),
        svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).gte("created_at", curr.from).lte("created_at", curr.to),
        svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).gte("created_at", prev.from).lte("created_at", prev.to),
      ]);

      const currRev  = ((currPay.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
      const prevRev  = ((prevPay.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
      const pct = (curr: number, prev: number) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

      return {
        period: args.period,
        current: { revenue_inr: currRev, bookings: currBooks.count ?? 0, new_leads: currLeads.count ?? 0 },
        previous: { revenue_inr: prevRev, bookings: prevBooks.count ?? 0, new_leads: prevLeads.count ?? 0 },
        deltas: {
          revenue_pct: pct(currRev, prevRev),
          bookings_pct: pct(currBooks.count ?? 0, prevBooks.count ?? 0),
          leads_pct: pct(currLeads.count ?? 0, prevLeads.count ?? 0),
        },
      };
    },
  },

  // 8. get_activity_summary
  {
    name: "get_activity_summary",
    description: "What happened in a time window: messages sent, bookings, payments, new leads.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date string" },
        to:   { type: "string", description: "ISO date string" },
      },
      required: ["from", "to"],
    },
    async execute(args, orgId, svc) {
      const from = isoDate(String(args.from));
      const to   = isoDate(String(args.to));
      const [msgs, books, pays, newLeads] = await Promise.all([
        svc.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "outbound").gte("sent_at", from).lte("sent_at", to),
        svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", from).lte("created_at", to),
        svc.from("payments").select("amount_inr").eq("org_id", orgId).eq("status", "paid").is("deleted_at", null).gte("updated_at", from).lte("updated_at", to),
        svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).gte("created_at", from).lte("created_at", to),
      ]);
      const revenue = ((pays.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
      return {
        from, to,
        messages_sent: msgs.count ?? 0,
        bookings: books.count ?? 0,
        payments_collected: pays.data?.length ?? 0,
        revenue_inr: revenue,
        new_leads: newLeads.count ?? 0,
      };
    },
  },

  // 9. get_todays_schedule
  {
    name: "get_todays_schedule",
    description: "Today's bookings, pending payments overdue, follow-ups due, and leads that have gone quiet.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(_args, orgId, svc) {
      const todayStart = today();
      const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [bookings, pendingPays, ghosted] = await Promise.all([
        svc.from("bookings").select("id, starts_at, ends_at, attendee_name, meeting_url, lead_id, status")
          .eq("org_id", orgId).gte("starts_at", todayStart).lte("starts_at", todayEnd.toISOString())
          .order("starts_at", { ascending: true }),
        svc.from("payments").select("id, amount_inr, lead_id, created_at")
          .eq("org_id", orgId).eq("status", "pending").is("deleted_at", null)
          .lte("created_at", sevenDaysAgo).order("created_at", { ascending: true }).limit(10),
        svc.from("leads").select("id, name, external_id, stage, score, last_seen_at")
          .eq("org_id", orgId).is("deleted_at", null)
          .in("stage", ["hot", "warm"]).lte("last_seen_at", sevenDaysAgo)
          .order("score", { ascending: false }).limit(5),
      ]);

      return {
        todays_bookings: bookings.data ?? [],
        overdue_payments: pendingPays.data ?? [],
        ghosted_leads:    ghosted.data ?? [],
        date: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }),
      };
    },
  },

  // 10. get_pipeline_overview
  {
    name: "get_pipeline_overview",
    description: "Snapshot of the pipeline: hot/warm/cold lead counts, pending payment total, upcoming bookings, recently ghosted leads.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(_args, orgId, svc) {
      const [hotRes, warmRes, coldRes, pendingPay, upcomingBooks, stagesRes] = await Promise.all([
        svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).eq("stage", "hot"),
        svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).eq("stage", "warm"),
        svc.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).eq("stage", "cold"),
        svc.from("payments").select("amount_inr").eq("org_id", orgId).eq("status", "pending").is("deleted_at", null),
        svc.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", orgId)
          .gte("starts_at", new Date().toISOString()).eq("status", "confirmed"),
        svc.from("leads").select("stage").eq("org_id", orgId).is("deleted_at", null),
      ]);

      const pendingTotal = ((pendingPay.data ?? []) as { amount_inr: number }[]).reduce((s, r) => s + r.amount_inr, 0);
      const stageCounts: Record<string, number> = {};
      for (const l of (stagesRes.data ?? []) as { stage: string }[]) {
        stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;
      }

      return {
        pipeline: {
          hot: hotRes.count ?? 0,
          warm: warmRes.count ?? 0,
          cold: coldRes.count ?? 0,
          all_stages: stageCounts,
        },
        pending_payment_total_inr: pendingTotal,
        pending_payment_count: (pendingPay.data ?? []).length,
        upcoming_bookings: upcomingBooks.count ?? 0,
      };
    },
  },

  // 11. analyze_lead
  {
    name: "analyze_lead",
    description: "Analyze a lead: engagement level, recommended next action, churn risk, value tier.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "UUID of the lead" },
      },
      required: ["lead_id"],
    },
    async execute(args, orgId, svc) {
      const leadId = String(args.lead_id);
      const [leadRes, convRes, payRes, bookRes] = await Promise.all([
        svc.from("leads").select("id, name, stage, score, ltv_inr, last_seen_at, created_at").eq("id", leadId).eq("org_id", orgId).single(),
        svc.from("conversations").select("id, last_message_at").eq("lead_id", leadId).is("deleted_at", null).order("last_message_at", { ascending: false }).limit(1).single(),
        svc.from("payments").select("amount_inr, status").eq("lead_id", leadId).is("deleted_at", null),
        svc.from("bookings").select("id, status").eq("lead_id", leadId),
      ]);

      const lead = leadRes.data;
      if (!lead) return { error: "Lead not found" };

      const daysSinceLastSeen = lead.last_seen_at
        ? Math.floor((Date.now() - new Date(lead.last_seen_at).getTime()) / 86400000)
        : null;
      const paidAmount = ((payRes.data ?? []) as { amount_inr: number; status: string }[])
        .filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_inr, 0);

      const engagementLevel = daysSinceLastSeen === null ? "unknown"
        : daysSinceLastSeen <= 1 ? "very_active"
        : daysSinceLastSeen <= 3 ? "active"
        : daysSinceLastSeen <= 7 ? "cooling"
        : daysSinceLastSeen <= 14 ? "cold"
        : "ghosted";

      const churnRisk = engagementLevel === "ghosted" ? "high"
        : engagementLevel === "cold" ? "medium"
        : "low";

      const valueTier = paidAmount > 20000 ? "high"
        : paidAmount > 5000 ? "medium"
        : paidAmount > 0 ? "low"
        : lead.score > 80 ? "potential_high"
        : "unknown";

      return {
        lead_name: lead.name,
        stage: lead.stage,
        score: lead.score,
        days_since_last_seen: daysSinceLastSeen,
        engagement_level: engagementLevel,
        churn_risk: churnRisk,
        value_tier: valueTier,
        total_paid_inr: paidAmount,
        bookings_count: (bookRes.data ?? []).length,
        recommended_action:
          engagementLevel === "ghosted"
            ? "Send a revival message — reference their original goal"
            : engagementLevel === "cold"
            ? "Follow up with a value-add message or offer"
            : lead.stage === "hot" && (bookRes.data ?? []).length === 0
            ? "Send booking link — they're ready"
            : lead.stage === "booked"
            ? "Send payment link if not already done"
            : "Continue conversation and nurture",
      };
    },
  },

  // 12. draft_message
  {
    name: "draft_message",
    description: "Draft a personalized message for a lead using the coach's voice profile and lead context.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "UUID of the lead" },
        intent:  { type: "string", description: "What the message should achieve: follow_up | revival | booking | payment | check_in | custom" },
        custom_instruction: { type: "string", description: "Optional: extra guidance for the draft" },
      },
      required: ["lead_id", "intent"],
    },
    async execute(args, orgId, svc) {
      const leadId = String(args.lead_id);
      const [leadRes, vpRes, convLookup] = await Promise.all([
        svc.from("leads").select("name, stage, score, last_seen_at, metadata").eq("id", leadId).eq("org_id", orgId).single(),
        svc.from("voice_profiles").select("tone, offer, price_range, extra_context, objections").eq("org_id", orgId).single(),
        svc.from("conversations").select("id").eq("lead_id", leadId).is("deleted_at", null).limit(1).single(),
      ]);
      const convRes = convLookup;

      let lastMessages: string[] = [];
      if (convRes.data?.id) {
        const { data: msgs } = await svc.from("messages").select("content, direction")
          .eq("conversation_id", convRes.data.id).order("sent_at", { ascending: false }).limit(3);
        lastMessages = ((msgs ?? []) as { content: string; direction: string }[]).map((m) => `[${m.direction}] ${m.content.slice(0, 150)}`);
      }

      return {
        lead:    leadRes.data,
        voice:   vpRes.data,
        recent_messages: lastMessages,
        intent:  args.intent,
        custom_instruction: args.custom_instruction ?? null,
        note: "Use this context to draft a personalized message in the coach's voice. Be brief, specific, and natural. Reference the lead's situation.",
      };
    },
  },

  // 13. search_conversations
  {
    name: "search_conversations",
    description: "Search message content across all conversations.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term to find in message content" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
    async execute(args, orgId, svc) {
      const q     = String(args.query ?? "");
      const limit = Math.min(Number(args.limit ?? 5), 10);
      const { data } = await svc.from("messages").select("content, direction, sent_at, conversation_id")
        .eq("org_id", orgId).ilike("content", `%${q}%`)
        .order("sent_at", { ascending: false }).limit(limit);
      return { messages: data ?? [], query: q };
    },
  },

  // 14. get_voice_profile
  {
    name: "get_voice_profile",
    description: "Return the coach's voice/tone preferences, offer, pricing, and deep context.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(_args, orgId, svc) {
      const [vpRes, orgRes] = await Promise.all([
        svc.from("voice_profiles").select("*").eq("org_id", orgId).single(),
        svc.from("orgs").select("name, deep_context").eq("id", orgId).single(),
      ]);
      return {
        voice_profile: vpRes.data,
        deep_context:  (orgRes.data as { deep_context?: unknown } | null)?.deep_context ?? null,
        org_name: (orgRes.data as { name?: string } | null)?.name,
      };
    },
  },
];

// ── Tool registry ─────────────────────────────────────────────────────────────

export const TOOL_MAP = new Map(COPILOT_TOOLS.map((t) => [t.name, t]));

/** OpenAI/Groq-compatible tool schema array for the chat completion request. */
export function toGroqToolSchema() {
  return COPILOT_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.parameters,
    },
  }));
}
