import { SignupForm } from "@/components/auth/signup-form";
import { Zap, Calendar, IndianRupee, BarChart3 } from "lucide-react";

export const metadata = { title: "Create account — Effora AI" };

const VALUE_CHIPS = [
  { icon: Zap,          text: "AI replies in your voice in 3 seconds" },
  { icon: Calendar,     text: "Cal.com bookings + auto-reminders" },
  { icon: IndianRupee,  text: "Razorpay / UPI payments, recovery sequences" },
  { icon: BarChart3,    text: "Real-time pipeline + revenue dashboard" },
];

const TESTIMONIALS = [
  {
    quote: "Effora replied to 47 DMs while I slept. Closed ₹68k of consults Friday morning.",
    name: "Dr. Anjali R",
    role: "Psychologist",
    city: "Mumbai",
  },
  {
    quote: "I stopped losing leads after my reels went viral. Effora handled 200+ DMs in 4 hours.",
    name: "Priya M",
    role: "Yoga Instructor",
    city: "Bangalore",
  },
  {
    quote: "My booking calendar went from half-empty to full within the first week.",
    name: "Rohan K",
    role: "Business Coach",
    city: "Pune",
  },
];

export default function SignupPage() {
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
              Free for solo founders
            </div>
            <h1 className="font-display text-4xl xl:text-5xl font-bold text-[var(--text)] leading-[1.1] tracking-tight">
              Turn every Instagram DM<br />into booked revenue
            </h1>
          </div>

          {/* Value chips */}
          <div className="grid grid-cols-2 gap-3">
            {VALUE_CHIPS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)]/60 backdrop-blur-sm p-4">
                <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)]/10 text-[var(--brand)]">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-[var(--text-2)] leading-snug">{text}</p>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">What coaches say</p>
            <div className="space-y-3">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)]/50 backdrop-blur-sm p-4">
                  <p className="text-sm text-[var(--text)] leading-relaxed italic">&ldquo;{t.quote}&rdquo;</p>
                  <p className="mt-2 text-xs text-[var(--text-3)]">— {t.name}, {t.role}, {t.city}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[var(--text-3)]">Built for 50+ Indian service businesses. Free forever for solo founders.</p>
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
            <h2 className="font-display text-2xl font-semibold text-[var(--text)]">Get started in 30 seconds</h2>
            <p className="text-sm text-[var(--text-3)]">
              Already have an account?{" "}
              <a href="/login" className="text-[var(--brand)] hover:underline font-medium">Log in →</a>
            </p>
          </div>
          <SignupForm />
          <p className="text-center text-[11px] text-[var(--text-3)]">
            By signing up you agree to our{" "}
            <a href="/terms" className="hover:underline text-[var(--text-3)]">Terms</a>
            {" "}and{" "}
            <a href="/privacy" className="hover:underline text-[var(--text-3)]">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
