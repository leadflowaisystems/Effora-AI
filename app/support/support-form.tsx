"use client";

import * as React from "react";
import { Send, Loader2, CheckCircle2 } from "lucide-react";

export function SupportForm() {
  const [name,    setName]    = React.useState("");
  const [email,   setEmail]   = React.useState("");
  const [subject, setSubject] = React.useState("Question");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent,    setSent]    = React.useState(false);
  const [error,   setError]   = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/contact", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `Error ${res.status}`);
      }
      setSent(true);
      setName(""); setEmail(""); setSubject("Question"); setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send. Please email us directly.");
    } finally {
      setSending(false);
    }
  }

  const inputCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

  if (sent) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-6 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-[var(--brand)] shrink-0" />
        <div>
          <p className="font-semibold text-[var(--text)]">Message sent!</p>
          <p className="text-sm text-[var(--text-3)] mt-0.5">We&apos;ll get back to you within 24 hours on weekdays.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-2)] p-6">
      <h2 className="font-semibold text-lg mb-4">Send us a message</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Email <span className="text-[var(--brand)]">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Subject</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
            <option>Question</option>
            <option>Bug report</option>
            <option>Billing issue</option>
            <option>Feature request</option>
            <option>Account / data deletion</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Message <span className="text-[var(--brand)]">*</span></label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={5}
            placeholder="Describe your issue or question in detail…"
            className={`${inputCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={sending || !email.trim() || !message.trim()}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[#0A0A0C] hover:opacity-90 disabled:opacity-50 transition-opacity">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}
