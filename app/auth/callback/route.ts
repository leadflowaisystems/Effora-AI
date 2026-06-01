import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { rateLimitAsync, getIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = getIp(request);

  // Rate limit callback attempts per IP: 10 per minute
  const rl = await rateLimitAsync(`auth-callback:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/login?error=too_many_attempts", request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    void logAudit(createServiceClient(), null, null, "auth.callback_failed", {
      ip,
      error: error.message?.slice(0, 200),
    });
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const userId = sessionData?.session?.user?.id ?? null;
  const user   = sessionData?.session?.user ?? null;

  if (userId) {
    void logAudit(createServiceClient(), null, userId, "user.login", {
      method:     "oauth_callback",
      ip,
      user_agent: request.headers.get("user-agent")?.slice(0, 200),
    });
  }

  // ── Auto-provision org for new users ─────────────────────────
  // If this user has no org_members row, create their org now so they
  // never land on a dashboard route that has no data to show.
  let resolvedOrgSlug: string | null = null;
  if (user) {
    try {
      resolvedOrgSlug = await provisionUserIfNew(user);
    } catch (provisionErr) {
      console.error("[auth/callback] provision failed:", provisionErr);
      // Non-fatal — let the app handle missing org via onboarding
    }
  }

  // ── Redirect logic ────────────────────────────────────────────
  // 1. If we just provisioned a new org, go straight there
  if (resolvedOrgSlug) {
    return NextResponse.redirect(`${origin}/org/${resolvedOrgSlug}`);
  }

  // 2. If next param is a safe relative path, use it
  //    (guards against open redirect — only allow relative /paths)
  const safeNext = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}

// ── Org provisioning ──────────────────────────────────────────────

async function provisionUserIfNew(
  user: { id: string; email?: string; user_metadata?: Record<string, string> }
): Promise<string | null> {
  // Use service client to bypass RLS for these inserts
  const svc = createServiceClient() as ReturnType<typeof createServiceClient> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
  };

  // Check if user already has an org
  const { data: existing } = await svc
    .from("org_members")
    .select("org_id, orgs(slug)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Already provisioned — return existing slug so we redirect there
    const slug = (existing as { orgs?: { slug?: string } | null }).orgs?.slug ?? null;
    return slug;
  }

  // ── Generate a unique slug from the user's email ──────────────
  const emailPrefix = (user.email?.split("@")[0] ?? "user")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "user";

  let slug = emailPrefix;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: conflict } = await svc
      .from("orgs")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!conflict) break;
    slug = `${emailPrefix}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ── Create org ────────────────────────────────────────────────
  // Only set the columns that definitely exist in the schema.
  // trial_ends_at, monthly_ai_msg_count, etc. have DB-level defaults.
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "My Workspace";

  const { data: newOrg, error: orgErr } = await svc
    .from("orgs")
    .insert({ name: displayName, slug })
    .select("id, slug")
    .single();

  if (orgErr || !newOrg) {
    throw new Error(`org insert failed: ${orgErr?.message ?? "no data returned"}`);
  }

  const orgId = (newOrg as { id: string; slug: string }).id;
  const newSlug = (newOrg as { id: string; slug: string }).slug;

  // ── Add user as owner ─────────────────────────────────────────
  const { error: memberErr } = await svc
    .from("org_members")
    .insert({ org_id: orgId, user_id: user.id, role: "owner" });

  if (memberErr) {
    // Best-effort rollback — delete the orphaned org
    try { await svc.from("orgs").delete().eq("id", orgId); } catch { /* ignore rollback failure */ }
    throw new Error(`org_members insert failed: ${memberErr.message}`);
  }

  console.log(`[auth/callback] provisioned new user ${user.email} → org slug "${newSlug}"`);
  return newSlug;
}
