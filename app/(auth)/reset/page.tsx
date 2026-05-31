"use client";

/**
 * /reset — Password reset page.
 * Supabase redirects here after the user clicks "Reset password" in their email.
 * The URL will contain #access_token=... which Supabase SDK handles automatically.
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);
  const [hasSession, setHasSession] = useState(false);

  // Supabase fires SIGNED_IN with type=RECOVERY when the reset link is clicked
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasSession(true);
    });
    // Also check if already signed in (direct navigation after clicking link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  function passwordStrength(p: string): { label: string; color: string } {
    if (p.length < 8) return { label: "Too short", color: "text-red-400" };
    const hasLetter = /[a-zA-Z]/.test(p);
    const hasNum    = /[0-9]/.test(p);
    const hasSpec   = /[^a-zA-Z0-9]/.test(p);
    if (hasLetter && hasNum && hasSpec && p.length >= 12) return { label: "Strong", color: "text-green-400" };
    if (hasLetter && hasNum) return { label: "Medium", color: "text-amber-400" };
    return { label: "Weak", color: "text-red-400" };
  }

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
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSuccess(true);
    setTimeout(() => router.push("/"), 2000);
  }

  const strength = passwordStrength(password);

  if (!hasSession) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            This link has expired or is invalid. Please request a new password reset from the login page.
          </p>
          <a href="/login" className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
            Back to login
          </a>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="text-4xl">✓</div>
          <h1 className="font-display text-xl font-semibold">Password updated!</h1>
          <p className="text-sm text-muted-foreground">Redirecting to your dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Set new password</h1>
          <p className="text-sm text-muted-foreground">Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">New password <span className="text-[var(--brand)]">*</span></label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required minLength={8}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {password.length > 0 && (
              <p className={`text-xs ${strength.color}`}>{strength.label}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Confirm password <span className="text-[var(--brand)]">*</span></label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {confirm.length > 0 && password !== confirm && (
              <p className="text-xs text-red-400">Passwords don&apos;t match</p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || password.length < 8}
            className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
