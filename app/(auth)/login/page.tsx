import { LoginForm } from "@/components/auth/login-form";
import { BarChart3, MessageSquare, IndianRupee, Calendar } from "lucide-react";

export const metadata = { title: "Sign in — Effora AI" };

const STATS = [
  { value: "12,000+", label: "DMs processed this week" },
  { value: "₹2.4Cr",  label: "revenue recovered for users" },
  { value: "2.3 sec", label: "avg AI reply speed" },
];

const CHANGELOG = [
  { date: "May 30", text: "WhatsApp Cloud API integration — real-time inbox for WA DMs" },
  { date: "May 28", text: "Platform Meta credentials admin UI — configure once, works for all orgs" },
];

export default function LoginPage() {
  return (
    <main className="relative min-h-screen flex overflow-hidden bg-[#0A0A0C]">
      {/* Animated gradient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
      </div>

      {/* Left panel — value props */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-center px-16 xl:px-24 relative z-10">
        <div className="space-y-10 max-w-lg">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/20 bg-[var(--brand)]/8 px-3 py-1 text-xs font-medium text-[var(--brand)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
              Effora AI is live
            </div>
            <h1 className="font-display text-4xl xl:text-5xl font-bold text-[var(--text)] leading-[1.1] tracking-tight">
              Welcome back.<br />Your inbox awaits.
            </h1>
          </div>

          {/* Live stats */}
          <div className="grid grid-cols-3 gap-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)]/60 backdrop-blur-sm p-4 space-y-1">
                <p className="font-display text-xl font-bold text-[var(--brand)]">{s.value}</p>
                <p className="text-[11px] text-[var(--text-3)] leading-snug">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Changelog */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">What&apos;s new</p>
            <div className="space-y-2">
              {CHANGELOG.map((item) => (
                <div key={item.date} className="flex gap-3 items-start">
                  <span className="shrink-0 text-[11px] font-mono text-[var(--brand)] mt-0.5">{item.date}</span>
                  <p className="text-sm text-[var(--text-2)] leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[var(--text-3)]">
            Questions?{" "}
            <a href="mailto:hello@effora.ai" className="text-[var(--brand)] hover:underline">hello@effora.ai</a>
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex w-full lg:w-[45%] flex-col items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="auth-card w-full max-w-sm space-y-7">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)] text-[#0A0A0C]">
                <BarChart3 className="h-4 w-4" />
              </div>
              <span className="font-display font-bold text-base text-[var(--text)]">Effora AI</span>
            </div>
            <h2 className="font-display text-2xl font-semibold text-[var(--text)]">Log in to Effora AI</h2>
            <p className="text-sm text-[var(--text-3)]">
              Don&apos;t have an account?{" "}
              <a href="/signup" className="text-[var(--brand)] hover:underline font-medium">Create one free →</a>
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
