"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { RefreshCw, Save, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";

interface Settings {
  meta_app_id:                 string | null;
  meta_webhook_verify_token:   string | null;
  meta_app_mode:               string | null;
  last_verified_at:            string | null;
  updated_at:                  string | null;
}

export default function PlatformSettingsPage() {
  const [settings,    setSettings]    = useState<Settings | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState<{ ok: boolean; msg: string } | null>(null);

  // Form state
  const [appId,        setAppId]        = useState("");
  const [appSecret,    setAppSecret]    = useState("");
  const [verifyToken,  setVerifyToken]  = useState("");
  const [appMode,      setAppMode]      = useState<"dev" | "live">("dev");
  const [showSecret,   setShowSecret]   = useState(false);

  useEffect(() => {
    fetch("/api/admin/platform-settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings as Settings | null;
        setSettings(s);
        if (s) {
          setAppId(s.meta_app_id ?? "");
          setVerifyToken(s.meta_webhook_verify_token ?? "");
          setAppMode((s.meta_app_mode as "dev" | "live") ?? "dev");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setToast(null);
    const res = await fetch("/api/admin/platform-settings", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta_app_id:               appId,
        meta_app_secret:           appSecret || undefined,
        meta_webhook_verify_token: verifyToken,
        meta_app_mode:             appMode,
      }),
    });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; verified?: boolean; error?: string };
    setSaving(false);
    if (res.ok) {
      setToast({ ok: true, msg: data.verified ? "Saved & verified with Meta ✓" : "Saved (could not verify app ID — check credentials)" });
      setAppSecret("");
      // Reload settings
      const fresh = await fetch("/api/admin/platform-settings").then((r) => r.json()) as { settings: Settings };
      setSettings(fresh.settings);
    } else {
      setToast({ ok: false, msg: data.error ?? "Save failed" });
    }
  }

  function regenerateVerifyToken() {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 32);
    setVerifyToken(token);
  }

  const inputCls = "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
  const labelCls = "block text-sm font-medium text-[var(--text-2)] mb-1";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)]">Platform Settings</h1>
        <p className="text-sm text-[var(--text-3)] mt-1">Manage platform-wide credentials. Changes affect all orgs unless overridden per-org.</p>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-4 py-3 text-sm border ${
          toast.ok
            ? "border-[var(--brand)]/30 bg-[var(--brand)]/8 text-[var(--brand)]"
            : "border-red-500/30 bg-red-500/8 text-red-400"
        }`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Meta / Facebook section */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-[var(--text)]">Meta / Facebook</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">Used for Instagram DMs and WhatsApp Cloud API (all orgs)</p>
          </div>
          {settings?.last_verified_at && (
            <span className="text-xs text-[var(--brand)]">
              Last verified: {new Date(settings.last_verified_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-9 rounded bg-[var(--bg-3)]" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Meta App ID</label>
              <input value={appId} onChange={(e) => setAppId(e.target.value)}
                className={inputCls} placeholder="1234567890" />
            </div>

            <div>
              <label className={labelCls}>Meta App Secret <span className="text-[var(--text-3)] font-normal">(leave blank to keep existing)</span></label>
              <div className="relative">
                <input value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
                  type={showSecret ? "text" : "password"}
                  className={`${inputCls} pr-10`}
                  placeholder={settings?.meta_app_id ? "••••••••••••••••" : "Paste app secret"} />
                <button type="button" onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-2)]">
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelCls}>Webhook Verify Token</label>
              <div className="flex gap-2">
                <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)}
                  className={`${inputCls} font-mono text-xs`} placeholder="effora_verify_token" />
                <button type="button" onClick={regenerateVerifyToken}
                  className="shrink-0 flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-3)] transition-colors whitespace-nowrap">
                  <RefreshCw className="h-3 w-3" /> Regenerate
                </button>
              </div>
              <p className="text-xs text-[var(--text-3)] mt-1">
                Use this in Meta Webhooks setup. Callback URL:{" "}
                <code className="text-[var(--brand)] text-[11px]">/api/webhooks/meta/instagram</code> and{" "}
                <code className="text-[var(--brand)] text-[11px]">/api/webhooks/whatsapp</code>
              </p>
            </div>

            <div>
              <label className={labelCls}>App Mode</label>
              <select value={appMode} onChange={(e) => setAppMode(e.target.value as "dev" | "live")}
                className={inputCls}>
                <option value="dev">Development — test accounts only</option>
                <option value="live">Live — all users (requires App Review)</option>
              </select>
            </div>

            <button onClick={handleSave} disabled={saving || !appId}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--brand)] text-[#0A0A0C] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Meta credentials"}
            </button>
          </div>
        )}
      </section>

      {/* Read-only env-var sections */}
      {[
        { title: "Razorpay Platform",  note: "Platform billing credentials. Manage via Vercel env vars.", vars: ["RAZORPAY_KEY_ID", "RAZORPAY_WEBHOOK_SECRET"] },
        { title: "Brevo SMTP",          note: "Transactional email. Manage via Vercel env vars.",           vars: ["BREVO_SMTP_USER", "BREVO_SMTP_KEY"] },
        { title: "Upstash / Redis",     note: "Rate limiting store. Manage via Vercel env vars.",           vars: ["UPSTASH_REDIS_REST_URL"] },
        { title: "Inngest",             note: "Background job engine. Manage via Vercel env vars.",         vars: ["INNGEST_EVENT_KEY"] },
        { title: "Groq / LLM",         note: "AI inference. Manage via Vercel env vars.",                  vars: ["LLM_BASE_URL", "LLM_MODEL_FAST", "LLM_MODEL_SMART"] },
      ].map(({ title, note, vars }) => (
        <section key={title} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-[var(--text)] text-sm">{title}</h2>
              <p className="text-xs text-[var(--text-3)] mt-0.5">{note}</p>
            </div>
            <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-3)]">
              env vars
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {vars.map((v) => (
              <code key={v} className="text-[11px] font-mono bg-[var(--bg-3)] px-2 py-0.5 rounded text-[var(--text-3)]">{v}</code>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
