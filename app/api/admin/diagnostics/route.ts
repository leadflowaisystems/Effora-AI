/**
 * GET /api/admin/diagnostics
 * Returns env-var presence and runtime info — admin-only.
 *
 * Use this after deployment to confirm production has the same env vars as local.
 * curl https://effora-ai-qh35.vercel.app/api/admin/diagnostics  (must be logged in as admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Admin gate ────────────────────────────────────────────────
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch (authErr) {
    console.error("[diagnostics] auth check failed:", authErr);
    return NextResponse.json({ error: "Auth failed" }, { status: 401 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!userEmail || !adminEmails.includes(userEmail)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Env var presence (values never exposed — only booleans) ───
  const groqKey = !!(process.env.GROQ_API_KEYS?.trim() || process.env.LLM_API_KEY?.trim());
  const groqKeys = process.env.GROQ_API_KEYS?.split(",").length ?? 0;

  return NextResponse.json({
    env_present: {
      supabase_url:           !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_anon:          !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase_service:       !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      groq:                   groqKey,
      groq_keys_count:        groqKeys,
      llm_base_url:           process.env.LLM_BASE_URL ?? "(default: api.groq.com)",
      llm_model_smart:        process.env.LLM_MODEL_SMART ?? "(default: llama-3.3-70b-versatile)",
      encryption_key:         !!process.env.ENCRYPTION_KEY,
      app_url:                process.env.NEXT_PUBLIC_APP_URL ?? "(not set — will use hardcoded fallback)",
      inngest_event_key:      !!process.env.INNGEST_EVENT_KEY,
      inngest_signing_key:    !!process.env.INNGEST_SIGNING_KEY,
      upstash_redis_url:      !!process.env.UPSTASH_REDIS_REST_URL,
      upstash_redis_token:    !!process.env.UPSTASH_REDIS_REST_TOKEN,
      meta_app_id:            !!process.env.META_APP_ID,
      meta_app_secret:        !!process.env.META_APP_SECRET,
      meta_webhook_verify:    !!process.env.META_WEBHOOK_VERIFY_TOKEN,
      razorpay_key_id:        !!process.env.RAZORPAY_KEY_ID,
      razorpay_key_secret:    !!process.env.RAZORPAY_KEY_SECRET,
      admin_emails:           adminEmails.length,
    },
    runtime:   process.env.VERCEL ? "vercel" : "local",
    node_env:  process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    // Quick sanity check: any critical vars missing?
    warnings: [
      !process.env.NEXT_PUBLIC_SUPABASE_URL    && "NEXT_PUBLIC_SUPABASE_URL missing",
      !process.env.SUPABASE_SERVICE_ROLE_KEY   && "SUPABASE_SERVICE_ROLE_KEY missing",
      !groqKey                                  && "No Groq API key — copilot will fail",
      !process.env.ENCRYPTION_KEY              && "ENCRYPTION_KEY missing — Meta/WhatsApp integration broken",
      !process.env.NEXT_PUBLIC_APP_URL         && "NEXT_PUBLIC_APP_URL not set — OAuth redirects may use wrong domain",
    ].filter(Boolean),
  });
}
