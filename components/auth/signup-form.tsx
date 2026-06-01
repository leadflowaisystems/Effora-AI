"use client";

import { useState } from "react";
import Link from "next/link";
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

const STRENGTH_COLOR = ["bg-red-500", "bg-red-400", "bg-amber-400", "bg-green-400"];
const STRENGTH_TEXT  = ["text-red-400", "text-red-400", "text-amber-400", "text-green-400"];

export function SignupForm() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState<"confirm" | "in" | null>(null);

  const strength = passwordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (strength.level === 0) { setError("Password must be at least 8 characters."); return; }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }

    setLoading(true);
    setError(null);

    const res  = await fetch("/api/auth/signup-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) { setLoading(false); setError(data.error ?? "Signup failed."); return; }

    if (data.requires_email_confirm) {
      setLoading(false);
      setDone("confirm");
    } else {
      // Immediately push — loading spinner stays briefly, dashboard streams in fast
      router.push("/");
      router.refresh();
    }
  }

  const inputCls = "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  if (done === "confirm") {
    return (
      <div className="rounded-lg border p-4 text-center space-y-2">
        <p className="font-semibold">Check your inbox ✓</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="su-email" className="text-sm font-medium">
          Email <span className="text-[var(--brand)]">*</span>
        </label>
        <input
          id="su-email" type="email" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className={inputCls}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="su-pass" className="text-sm font-medium">
          Password <span className="text-[var(--brand)]">*</span>
        </label>
        <input
          id="su-pass" type="password" required autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 chars, include a number" className={inputCls}
        />
        {password.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="flex gap-1">
              {[1,2,3].map((i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.level ? STRENGTH_COLOR[strength.level] : "bg-muted"}`} />
              ))}
            </div>
            <p className={`text-xs ${STRENGTH_TEXT[strength.level]}`}>{strength.label}</p>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="su-confirm" className="text-sm font-medium">
          Confirm password <span className="text-[var(--brand)]">*</span>
        </label>
        <input
          id="su-confirm" type="password" required autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password" className={inputCls}
        />
        {confirm.length > 0 && password !== confirm && (
          <p className="text-xs text-destructive">Passwords don&apos;t match</p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading || strength.level === 0}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] text-[#0A0A0C] px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
