"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Tab = "password" | "magic" | "google";
type SentReason = "magic" | "reset" | null;

export function LoginForm() {
  const supabase = createClient();
  const router   = useRouter();

  const [tab,        setTab]        = useState<Tab>("password");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [sentReason, setSentReason] = useState<SentReason>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [errorCode,  setErrorCode]  = useState<string | null>(null);

  // ── Email/password sign in ────────────────────────────────────
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res  = await fetch("/api/auth/signin-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Sign in failed. Please check your credentials.");
      setErrorCode(data.error_code ?? null);
      setLoading(false);
      return;
    }

    // Session cookie was set server-side — reload to pick it up
    router.push("/");
    router.refresh();
  }

  // ── Magic link ───────────────────────────────────────────────────────────────
  // Await the API — don't show success until we know the email was actually sent.
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res  = await fetch("/api/auth/magic-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, redirectTo: `${location.origin}/auth/callback` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send magic link. Please try email/password instead.");
      } else {
        setSentReason("magic");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Google OAuth ──────────────────────────────────────────────
  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options:  { redirectTo: `${location.origin}/auth/callback` },
    });
    if (err) { setError(err.message); setLoading(false); }
  }

  // ── Forgot password ───────────────────────────────────────────
  // redirectTo must go through /auth/callback so the server Route Handler
  // can exchange the PKCE code, then forward to /reset/update.
  // We include type=recovery so the callback knows NOT to provision an org
  // or redirect to the dashboard — it should redirect to the update form.
  async function handleForgotPassword() {
    if (!email) { setError("Enter your email address first."); return; }
    setLoading(true);
    setError(null);
    // redirectTo becomes ?next= in the Supabase email template token-hash URL.
    // /auth/confirm with type=recovery always redirects to /reset/update.
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/reset/update`,
    });
    setLoading(false);
    if (err) { setError(err.message); }
    else      { setError(null); setSentReason("reset"); }
  }

  const inputCls = "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
  const btnCls   = "w-full rounded-[var(--radius-sm)] bg-[var(--brand)] text-[#0A0A0C] px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity";

  // Email sent confirmation screen
  if (sentReason) {
    return (
      <div className="rounded-lg border p-4 text-sm text-center space-y-2">
        <p className="font-semibold text-base">Check your inbox ✓</p>
        {sentReason === "magic" && (
          <p className="text-muted-foreground">
            We sent a sign-in link to <strong>{email}</strong>. It expires in 1 hour.
          </p>
        )}
        {sentReason === "reset" && (
          <p className="text-muted-foreground">
            We sent a password reset link to <strong>{email}</strong>.
            Click it to set a new password — don&apos;t close that tab.
          </p>
        )}
        <button
          onClick={() => { setSentReason(null); setError(null); setErrorCode(null); }}
          className="text-xs text-primary underline underline-offset-2 mt-1"
        >
          ← Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
        {(["password", "magic", "google"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); setErrorCode(null); setSentReason(null); }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-[var(--brand)] text-[#0A0A0C]"
                : "bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--bg-3)]"
            }`}
          >
            {t === "password" ? "Email/Password" : t === "magic" ? "Magic Link" : "Google"}
          </button>
        ))}
      </div>

      {/* Email/Password tab */}
      {tab === "password" && (
        <form onSubmit={handlePassword} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="ep-email" className="text-sm font-medium">
              Email <span className="text-[var(--brand)]">*</span>
            </label>
            <input
              id="ep-email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="ep-pass" className="text-sm font-medium">
              Password <span className="text-[var(--brand)]">*</span>
            </label>
            <div className="relative">
              <input
                id="ep-pass" type={showPass ? "text" : "password"} required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" className={`${inputCls} pr-10`}
              />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-2)]">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <div className="space-y-1">
              <p className="text-sm text-destructive">{error}</p>
              {errorCode === "email_not_confirmed" && (
                <p className="text-xs text-muted-foreground">
                  Didn&apos;t get the email?{" "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={async () => {
                      setLoading(true);
                      const { error: err } = await supabase.auth.resend({
                        type: "signup", email,
                      });
                      setLoading(false);
                      if (err) setError(err.message);
                      else { setError(null); setErrorCode(null); setSentReason("magic"); }
                    }}
                  >
                    Resend confirmation email
                  </button>
                </p>
              )}
            </div>
          )}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="hover:underline disabled:opacity-50"
            >
              Forgot password?
            </button>
            <Link href="/signup" className="hover:underline">
              Create account →
            </Link>
          </div>
        </form>
      )}

      {/* Magic link tab */}
      {tab === "magic" && (
        <form onSubmit={handleMagicLink} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="ml-email" className="text-sm font-medium">
              Email <span className="text-[var(--brand)]">*</span>
            </label>
            <input
              id="ml-email" type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" className={inputCls}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}

      {/* Google tab */}
      {tab === "google" && (
        <div className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full rounded-md border px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2.5 hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <GoogleIcon />
            {loading ? "Redirecting…" : "Continue with Google"}
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
