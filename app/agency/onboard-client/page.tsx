"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function OnboardClientPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState("");

  const [form, setForm] = React.useState({
    orgName:    "",
    coachEmail: "",
    calLink:    "",
    tone:       "friendly and direct",
    offer:      "",
    priceRange: "",
  });

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agency/onboard", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      router.push(`/org/${json.slug}/dashboard`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Onboard a client</h1>
        <p className="text-sm text-[var(--text-3)] mt-1">Create a new org on behalf of a coach.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { key: "orgName",    label: "Coach / Org name",       placeholder: "Riya Fitness", required: true   },
          { key: "coachEmail", label: "Coach's email",           placeholder: "riya@gmail.com", required: false },
          { key: "calLink",    label: "Cal.com booking URL",     placeholder: "https://cal.com/riya/15min", required: false },
          { key: "offer",      label: "What they sell (brief)",  placeholder: "3-month 1:1 fitness transformation", required: false },
          { key: "priceRange", label: "Price range",             placeholder: "₹25,000–₹50,000", required: false },
          { key: "tone",       label: "Voice tone",              placeholder: "friendly and direct", required: false },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">{f.label}</label>
            <input
              value={form[f.key as keyof typeof form]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              required={f.required}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none focus:border-[var(--brand)] transition-colors"
            />
          </div>
        ))}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] py-2.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? "Creating org…" : "Create client org →"}
        </button>
      </form>
    </div>
  );
}
