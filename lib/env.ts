/**
 * Typed env loader — throws loudly at access time if a required var is missing.
 * Getters are lazy so importing this module never throws; only accessing a missing
 * var does. This means Phase-0 boots fine even when LLM / Razorpay vars aren't set yet.
 */

function get(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(
      `[Effora AI] Missing required environment variable: ${name}\n` +
        `Add it to your .env.local file. See .env.example for all required vars.`
    );
  }
  return value;
}

export const env = {
  // ── Supabase ────────────────────────────────────────────────────────────────
  get NEXT_PUBLIC_SUPABASE_URL() {
    return get("NEXT_PUBLIC_SUPABASE_URL");
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return get("SUPABASE_SERVICE_ROLE_KEY");
  },

  // ── LLM (OpenAI-compatible / Groq) ─────────────────────────────────────────
  get LLM_BASE_URL() {
    return get("LLM_BASE_URL");
  },
  get LLM_API_KEY() {
    return get("LLM_API_KEY");
  },
  get LLM_MODEL_FAST() {
    return get("LLM_MODEL_FAST");
  },
  get LLM_MODEL_SMART() {
    return get("LLM_MODEL_SMART");
  },

  // ── Razorpay ─────────────────────────────────────────────────────────────────
  get RAZORPAY_KEY_ID() {
    return get("RAZORPAY_KEY_ID");
  },
  get RAZORPAY_KEY_SECRET() {
    return get("RAZORPAY_KEY_SECRET");
  },

  // ── Cal.com ──────────────────────────────────────────────────────────────────
  get CAL_API_KEY() {
    return get("CAL_API_KEY");
  },
  get CAL_WEBHOOK_SECRET() {
    return get("CAL_WEBHOOK_SECRET");
  },

  // ── Inngest (optional in local dev) ──────────────────────────────────────────
  get INNGEST_EVENT_KEY() {
    return get("INNGEST_EVENT_KEY", "local");
  },
  get INNGEST_SIGNING_KEY() {
    return get("INNGEST_SIGNING_KEY", "");
  },

  // ── Encryption (for storing integration credentials) ─────────────────────────
  get ENCRYPTION_KEY() {
    return get("ENCRYPTION_KEY");
  },

  // ── Meta / Instagram ─────────────────────────────────────────────────────────
  get META_APP_ID() {
    return get("META_APP_ID");
  },
  get META_APP_SECRET() {
    return get("META_APP_SECRET");
  },
  get META_WEBHOOK_VERIFY_TOKEN() {
    return get("META_WEBHOOK_VERIFY_TOKEN");
  },
  get NEXT_PUBLIC_META_APP_ID() {
    return get("NEXT_PUBLIC_META_APP_ID");
  },

  // ── App ──────────────────────────────────────────────────────────────────────
  get NEXT_PUBLIC_APP_URL() {
    return get("NEXT_PUBLIC_APP_URL", "https://www.effora.co.in");
  },
};
