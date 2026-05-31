/**
 * GET  /api/orgs/[orgId]/leads   — paginated CRM list
 * POST /api/orgs/[orgId]/leads   — create lead manually
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { getOrCreateConversation, insertOutboundMessage } from "@/lib/conversation";
import { randomBytes } from "crypto";
import { z } from "zod";

interface Params { params: { orgId: string } }

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp      = req.nextUrl.searchParams;
  const cursor  = sp.get("cursor");
  const limit   = Math.min(Number(sp.get("limit") ?? 50), 100);
  const search  = sp.get("search") ?? "";
  const stage   = sp.get("stage") ?? "";
  const tag     = sp.get("tag")   ?? "";

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = svc
    .from("leads")
    .select("id, name, external_id, channel, score, stage, tags, notes, ltv_inr, last_seen_at, created_at, source, avatar_url")
    .eq("org_id", params.orgId)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);

  if (cursor)  query = query.lt("last_seen_at", cursor);
  if (stage)   query = query.eq("stage", stage);
  if (search)  query = query.ilike("name", `%${search}%`);
  if (tag)     query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows       = data ?? [];
  const hasMore    = rows.length > limit;
  const items      = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.last_seen_at ?? null : null;

  return NextResponse.json({ leads: items, next_cursor: nextCursor });
}

const CreateSchema = z.object({
  name:         z.string().min(1).max(200),
  handle:       z.string().max(100).optional(),
  phone:        z.string().max(20).optional(),
  email:        z.string().email().optional().or(z.literal("")),
  channel:      z.string().max(50).optional(),
  stage:        z.string().max(30).optional(),
  score:        z.number().min(0).max(100).optional(),
  tags:         z.array(z.string()).optional(),
  notes:        z.string().max(5000).optional(),
  source:       z.string().max(50).optional(),
  firstMessage: z.string().max(2000).optional(),
  context:      z.string().max(500).optional(),
}).refine(
  (d) => !!(d.handle?.trim() || d.phone?.trim() || d.channel),
  { message: "Either Instagram handle or phone number is required", path: ["handle"] }
);

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Plan gate: CRM lead limit ──────────────────────────────────
  const { getAccessState: _getAccess } = await import("@/lib/access");
  const access = await _getAccess(params.orgId);
  if (access.canUseCRM === 0) {
    return NextResponse.json({ error: "CRM requires Starter plan or above." }, { status: 403 });
  }
  if (access.canUseCRM > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cntResult = await (createServiceClient() as any)
      .from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", params.orgId).is("deleted_at", null);
    if ((cntResult.count ?? 0) >= access.canUseCRM) {
      return NextResponse.json({ error: `Lead limit reached (${access.canUseCRM} on your plan). Upgrade to add more.` }, { status: 403 });
    }
  }

  const raw    = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { name, handle, phone, email, channel, stage, score, tags, notes, source } = parsed.data;
  const now = new Date().toISOString();
  // Cast to any — tags/notes/ltv_inr added in migration 012, not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // Generate a unique external_id that encodes the contact type.
  // Always add a random suffix to avoid unique constraint conflicts.
  const suffix = randomBytes(4).toString("hex");
  let externalId: string;
  if (handle) {
    const clean = sanitizeText(handle).toLowerCase().replace(/^@/, "").replace(/\s+/g, "_") || "handle";
    externalId = `ig_${clean}_${suffix}`;
  } else if (phone) {
    const clean = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    externalId = `wa_${clean}_${suffix}`;
  } else {
    externalId = `manual_${Date.now()}_${suffix}`;
  }

  // Build metadata including all contact fields
  const metadata: Record<string, string> = {};
  if (email)  metadata.email            = email;
  if (handle) metadata.instagram_handle = handle.replace(/^@/, "");
  if (phone)  metadata.phone            = phone;

  const { data: lead, error } = await svc.from("leads").insert({
    org_id:      params.orgId,
    name:        sanitizeText(name),
    external_id: externalId,
    channel:     handle ? "instagram" : phone ? "whatsapp" : (channel ?? "manual"),
    stage:       stage   ?? "cold",
    score:       score   ?? 0,
    source:      source  ?? "manual",
    tags:        tags    ?? [],
    notes:       sanitizeText(notes) || null,
    metadata,
    last_seen_at: now,
    updated_at:   now,
  }).select("id, name, stage, score, external_id, channel, tags, ltv_inr, last_seen_at, created_at, source, metadata").single();

  if (error) {
    const isUnique = (error as { code?: string }).code === "23505";
    return NextResponse.json(
      { error: isUnique ? "A lead with this handle already exists in your CRM." : error.message },
      { status: isUnique ? 409 : 500 }
    );
  }
  const newLead = lead as { id: string; name: string | null; stage: string; score: number };

  // ── Auto-create conversation so lead appears in /inbox immediately ──
  // Uses getOrCreateConversation to handle the unique(org_id, lead_id, channel_provider)
  // constraint gracefully — returns existing conversation if one already exists.
  let conversationId: string | null = null;
  try {
    conversationId = await getOrCreateConversation(params.orgId, newLead.id, "manual_crm");
    // direction must be 'outbound' (messages table CHECK constraint: 'inbound'|'outbound')
    await insertOutboundMessage(conversationId, params.orgId, "Lead added via CRM.", "crm");
  } catch (e) {
    // Non-fatal — lead is created; log so we can debug if it fails
    console.error("[leads/POST] conversation auto-create failed:", e);
  }

  return NextResponse.json({ lead: newLead, conversation_id: conversationId });
}
