"use client";

/**
 * /reset — Request a password reset email.
 *
 * This page ONLY handles the "enter your email" step.
 * When the user clicks the link in the email they arrive at /auth/callback
 * (which exchanges the PKCE code and detects type=recovery), and are then
 * forwarded to /reset/update where they set the new password.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPage() {
  const supabase = createClient();

  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const appUrl = window.location.origin;

    // redirectTo must go through the server Route Handler (/auth/callback)
    // so it can exchange the PKCE code. We tag it with type=recovery so the
    // callback skips org-provisioning and forwards to /reset/update instead.
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback?type=recovery`,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
  }

  const inputCls =
    "w-full rounded-md border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm " +
    "text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0C]">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-4xl">✉️</div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
            Check your inbox
          </h1>
          <p className="text-sm text-[var(--text-2)]">
            We sent a password reset link to <strong>{email}</strong>.
            Click it to set a new password — the link expires in 1 hour.
          </p>
          <p className="text-xs text-[var(--text-3)]">
            Didn&apos;t receive it? Check your spam folder, or{" "}
            <button
              onClick={() => setSent(false)}
              className="underline text-[var(--text-3)] hover:text-[var(--text)]"
            >
              try again
            </button>
            .
          </p>
          <a
            href="/login"
            className="inline-block text-sm text-[var(--brand)] hover:underline mt-2"
          >
            ← Back to login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0C]">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
            Reset your password
          </h1>
          <p className="text-sm text-[var(--text-3)]">
            Enter your account email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="reset-email" className="text-sm font-medium text-[var(--text)]">
              Email <span className="text-[var(--brand)]">*</span>
            </label>
            <input
              id="reset-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-md bg-[var(--brand)] text-[#0A0A0C] px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <p className="text-center text-xs text-[var(--text-3)]">
            Remember your password?{" "}
            <a href="/login" className="text-[var(--brand)] hover:underline font-medium">
              Sign in
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
