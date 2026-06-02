"use client";

/**
 * /reset/update — Set a new password after clicking the reset link.
 *
 * Flow:
 *  1. User clicks the reset email link
 *  2. Supabase redirects to /auth/callback?code=PKCE_CODE&type=recovery
 *  3. /auth/callback exchanges the code (server-side) → user now has a
 *     recovery session → redirects here
 *  4. This page verifies the session exists, shows the new-password form
 *  5. On submit: supabase.auth.updateUser({ password })
 *  6. On success: sign out + redirect to /login?message=password_updated
 *
 * If there is NO active session when this page loads, the reset link was
 * either expired, already used, or the user navigated here directly.
 * We show a clear error and link them back to /reset.
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function passwordStrength(p: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (p.length < 8) return { level: 0, label: "Too short" };
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasNum    = /[0-9]/.test(p);
  const hasSpec   = /[^a-zA-Z0-9]/.test(p);
  if (hasLetter && hasNum && hasSpec && p.length >= 12) return { level: 3, label: "Strong" };
  if (hasLetter && hasNum) return { level: 2, label: "Good" };
  return { level: 1, label: "Weak" };
}

const STRENGTH_BAR   = ["bg-red-500", "bg-red-400", "bg-amber-400", "bg-green-400"];
const STRENGTH_LABEL = ["text-red-400", "text-red-400", "text-amber-400", "text-green-400"];

export default function ResetUpdatePage() {
  const supabase = createClient();
  const router   = useRouter();

  const [sessionReady, setSessionReady] = useState<boolean | null>(null); // null = checking
  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  // Verify we have an active session (the callback already exchanged the code)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    // Sign out so the user must explicitly log in with the new password.
    // This closes the recovery session and any other open sessions.
    await supabase.auth.signOut({ scope: "global" }).catch(() => null);
    setSuccess(true);

    // Redirect after a brief confirmation moment
    setTimeout(() => router.push("/login?message=password_updated"), 2000);
  }

  const strength = passwordStrength(password);

  const inputCls =
    "w-full rounded-md border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm " +
    "text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  // ── Loading state ──────────────────────────────────────────────────────────
  if (sessionReady === null) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0C]">
        <p className="text-sm text-[var(--text-3)]">Verifying reset link…</p>
      </main>
    );
  }

  // ── No session — link expired / already used ───────────────────────────────
  if (!sessionReady) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0C]">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
            Reset link expired
          </h1>
          <p className="text-sm text-[var(--text-2)]">
            This password reset link has expired or has already been used.
            Please request a new one.
          </p>
          <a
            href="/reset"
            className="inline-block rounded-md bg-[var(--brand)] text-[#0A0A0C] px-4 py-2 text-sm font-semibold"
          >
            Request new reset link
          </a>
        </div>
      </main>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0C]">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="text-4xl">✓</div>
          <h1 className="font-display text-xl font-semibold text-[var(--text)]">
            Password updated!
          </h1>
          <p className="text-sm text-[var(--text-2)]">
            Sign in with your new password. Redirecting…
          </p>
        </div>
      </main>
    );
  }

  // ── Set new password form ──────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0C]">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
            Set new password
          </h1>
          <p className="text-sm text-[var(--text-3)]">
            Choose a strong password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New password */}
          <div className="space-y-1">
            <label htmlFor="new-pass" className="text-sm font-medium text-[var(--text)]">
              New password <span className="text-[var(--brand)]">*</span>
            </label>
            <input
              id="new-pass"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 chars, include a number"
              className={inputCls}
            />
            {password.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength.level ? STRENGTH_BAR[strength.level] : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs ${STRENGTH_LABEL[strength.level]}`}>{strength.label}</p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1">
            <label htmlFor="confirm-pass" className="text-sm font-medium text-[var(--text)]">
              Confirm password <span className="text-[var(--brand)]">*</span>
            </label>
            <input
              id="confirm-pass"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className={inputCls}
            />
            {confirm.length > 0 && password !== confirm && (
              <p className="text-xs text-destructive">Passwords don&apos;t match</p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || strength.level === 0}
            className="w-full rounded-md bg-[var(--brand)] text-[#0A0A0C] px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
