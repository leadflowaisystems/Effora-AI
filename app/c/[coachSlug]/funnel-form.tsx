"use client";

import * as React from "react";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  orgId:    string;
  orgName:  string;
  ctaText:  string;
}

const SOURCES = [
  { value: "instagram_post",  label: "Instagram post"  },
  { value: "instagram_reel",  label: "Instagram reel"  },
  { value: "instagram_story", label: "Instagram story" },
  { value: "referral",        label: "Referral"        },
  { value: "other",           label: "Other"           },
];

export function FunnelForm({ orgId, orgName, ctaText }: Props) {
  const [form, setForm]       = React.useState({ name: "", handle: "", email: "", goal: "", source: "" });
  const [loading, setLoading] = React.useState(false);
  const [done,    setDone]    = React.useState(false);
  const [error,   setError]   = React.useState<string | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.handle.trim() || !form.goal.trim()) {
      setError("Please fill in your name, Instagram handle, and goal.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/funnel/${orgId}/submit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "Submission failed");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-8 text-center space-y-3">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--brand)]" />
        <h2 className="font-display text-xl font-semibold text-[var(--text)]">Got it!</h2>
        <p className="text-sm text-[var(--text-3)]">
          {orgName} usually replies within an hour. Keep an eye on your Instagram DMs.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-1)] p-6">
      <div className="space-y-1.5">
        <Label htmlFor="f-name">
          Your name <span className="text-[var(--brand)] font-medium">*</span>
        </Label>
        <Input id="f-name" placeholder="Priya Sharma" value={form.name}
          onChange={(e) => set("name", e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-handle">
          Instagram handle <span className="text-[var(--brand)] font-medium">*</span>
        </Label>
        <Input id="f-handle" placeholder="@yourhandle" value={form.handle}
          onChange={(e) => set("handle", e.target.value)} required />
        <p className="text-[11px] text-[var(--text-3)]">So {orgName} can reply to you on Instagram.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-email">
          Email{" "}
          <span className="text-xs font-normal text-[var(--text-3)]">(optional — get a faster reply)</span>
        </Label>
        <Input id="f-email" type="email" placeholder="you@email.com" value={form.email}
          onChange={(e) => set("email", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-goal">
          What&apos;s your goal? <span className="text-[var(--brand)] font-medium">*</span>
        </Label>
        <Textarea
          id="f-goal"
          placeholder="Tell me what you're working towards and what's been holding you back…"
          maxLength={500}
          rows={3}
          value={form.goal}
          onChange={(e) => set("goal", e.target.value)}
          required
        />
        <p className="text-[11px] text-[var(--text-3)] text-right">{form.goal.length}/500</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-source">
          How did you find me?{" "}
          <span className="text-xs font-normal text-[var(--text-3)]">(optional)</span>
        </Label>
        <select
          id="f-source"
          value={form.source}
          onChange={(e) => set("source", e.target.value)}
          className={cn(
            "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)]",
            "px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          )}
        >
          <option value="">Select…</option>
          {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--brand)] py-3.5 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px]"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {loading ? "Sending…" : ctaText}
      </button>
    </form>
  );
}
