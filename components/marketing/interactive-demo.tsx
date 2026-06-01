"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Check, Calendar, CreditCard, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Demo data ── */
const SCENARIOS = [
  {
    id:      "hot",
    label:   "Price asker (Hot)",
    emoji:   "🔥",
    dm:      "How much is your 1:1 coaching program? I want to join asap.",
    score:   88,
    stage:   "hot" as const,
    reply:   "Hey! So excited you asked 🙌 My 1:1 transformation program is ₹35,000 for 3 months — includes weekly calls, meal plans, and daily check-ins. Ready to start? Here's my calendar to book a quick 15-min call: https://cal.com/riyacoach/discovery",
    activity: [
      { icon: MessageSquare, text: "Lead qualified — Hot (88/100)",  color: "text-[var(--brand)]" },
      { icon: Calendar,      text: "Booking link offered",           color: "text-blue-400"        },
      { icon: Zap,           text: "AI reply sent in 42s",           color: "text-purple-400"      },
    ],
  },
  {
    id:    "cold",
    label: "Casual fan (Cold)",
    emoji: "👀",
    dm:    "Your reels are so good omg 🔥",
    score: 12,
    stage: "cold" as const,
    reply: "That genuinely means so much, thank you! 😊 If you ever want to know more about my programs or how I can help you reach your goals, just ask — I'm always here.",
    activity: [
      { icon: MessageSquare, text: "Lead qualified — Cold (12/100)", color: "text-[var(--text-3)]" },
      { icon: Check,         text: "Warm reply sent",                color: "text-[var(--text-3)]" },
      { icon: Zap,           text: "Re-engagement tracked",          color: "text-purple-400"      },
    ],
  },
  {
    id:    "warm",
    label: "EMI question (Warm)",
    emoji: "💬",
    dm:    "Is there an EMI option for your program? What are the payment terms?",
    score: 58,
    stage: "warm" as const,
    reply: "Great question! Yes, we do have EMI — 3 months at ₹12,500/month, or you can pay ₹35,000 upfront and save ₹2,500. Lots of my clients use the 3-month option. Want me to walk you through what's included in the program before you decide?",
    activity: [
      { icon: MessageSquare, text: "Lead qualified — Warm (58/100)", color: "text-[var(--warn)]"   },
      { icon: Check,         text: "Objection addressed",            color: "text-[var(--brand)]"  },
      { icon: CreditCard,    text: "Payment intent tracked",         color: "text-purple-400"      },
    ],
  },
];

const STAGE_COLORS = {
  hot:  { bg: "bg-red-950/60",    text: "text-red-400",    glow: "shadow-[0_0_12px_rgba(239,68,68,0.3)]"   },
  warm: { bg: "bg-amber-950/60",  text: "text-amber-400",  glow: "shadow-[0_0_12px_rgba(245,158,11,0.3)]"  },
  cold: { bg: "bg-[var(--bg-3)]", text: "text-[var(--text-3)]", glow: "" },
};

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[var(--text-3)]"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

export function InteractiveDemo() {
  const [activeId,     setActiveId]     = React.useState<string | null>(null);
  const [phase,        setPhase]        = React.useState<"idle" | "dm" | "scoring" | "reply" | "done">("idle");
  const [displayedReply, setDisplayedReply] = React.useState("");
  const [activityItems, setActivityItems]   = React.useState<number>(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenario = SCENARIOS.find((s) => s.id === activeId) ?? null;
  const stageColor = scenario ? STAGE_COLORS[scenario.stage] : null;

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function runScenario(id: string) {
    clearTimers();
    setActiveId(id);
    setPhase("dm");
    setDisplayedReply("");
    setActivityItems(0);

    const sc = SCENARIOS.find((s) => s.id === id)!;

    // Phase: scoring after 800ms
    timerRef.current = setTimeout(() => {
      setPhase("scoring");

      // Phase: start reply typing after 600ms more
      timerRef.current = setTimeout(() => {
        setPhase("reply");
        const chars = sc.reply.split("");
        let idx = 0;
        function typeNext() {
          if (idx >= chars.length) {
            setPhase("done");
            setActivityItems(1);
            setTimeout(() => setActivityItems(2), 500);
            setTimeout(() => setActivityItems(3), 1000);
            return;
          }
          const chunkSize = Math.floor(Math.random() * 3) + 1;
          setDisplayedReply(sc.reply.slice(0, idx + chunkSize));
          idx += chunkSize;
          timerRef.current = setTimeout(typeNext, 18 + Math.random() * 12);
        }
        typeNext();
      }, 600);
    }, 800);
  }

  React.useEffect(() => () => clearTimers(), []);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-1)] overflow-hidden">
      {/* Scenario picker */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 bg-[var(--bg-2)] flex-wrap">
        <span className="text-xs text-[var(--text-3)] mr-1 shrink-0">Try a scenario:</span>
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            onClick={() => runScenario(sc.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all",
              activeId === sc.id
                ? "border-[var(--brand)] bg-[var(--brand-glow)] text-[var(--brand)]"
                : "border-[var(--border)] text-[var(--text-3)] hover:border-[var(--border-strong)] hover:text-[var(--text-2)]",
            )}
          >
            {sc.emoji} {sc.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] min-h-[320px]">
        {/* Left: Inbox pane */}
        <div className="flex flex-col border-r border-[var(--border)] p-4 gap-3">
          {/* Inbound DM */}
          <AnimatePresence>
            {(phase !== "idle") && scenario && (
              <motion.div
                key={`dm-${scenario.id}`}
                initial={{ opacity: 0, x: -16, y: 8 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.35 }}
                className="flex justify-start"
              >
                <div className="max-w-[80%]">
                  <div className="mb-1 flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-[var(--bg-3)] flex items-center justify-center text-xs font-bold text-[var(--text-3)]">
                      U
                    </div>
                    <span className="text-xs text-[var(--text-3)]">Lead</span>
                  </div>
                  <div className="rounded-[var(--radius)] rounded-tl-none bg-[var(--bg-2)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]">
                    {scenario.dm}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI score badge */}
          <AnimatePresence>
            {phase !== "idle" && phase !== "dm" && scenario && stageColor && (
              <motion.div
                key={`score-${scenario.id}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
                className="flex justify-center"
              >
                <div className={cn(
                  "flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium",
                  stageColor.bg, stageColor.text, stageColor.glow,
                )}>
                  <Zap className="h-3 w-3" />
                  AI Score: {scenario.score}/100 — {scenario.stage.charAt(0).toUpperCase() + scenario.stage.slice(1)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI reply */}
          <AnimatePresence>
            {(phase === "reply" || phase === "done") && scenario && (
              <motion.div
                key={`reply-${scenario.id}`}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex justify-end"
              >
                <div className="max-w-[80%]">
                  <div className="mb-1 flex items-center justify-end gap-2">
                    <span className="text-xs text-[var(--text-3)]">Effora AI</span>
                    <div className="h-6 w-6 rounded-full bg-[var(--brand-glow)] border border-[var(--brand)]/30 flex items-center justify-center">
                      <Zap className="h-3 w-3 text-[var(--brand)]" />
                    </div>
                  </div>
                  <div className="rounded-[var(--radius)] rounded-tr-none bg-[var(--brand-glow)] border border-[var(--brand)]/20 px-3 py-2 text-sm text-[var(--text)]">
                    {displayedReply}
                    {phase === "reply" && (
                      <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-[var(--brand)] animate-pulse" />
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {phase === "scoring" && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-end"
              >
                <div className="rounded-[var(--radius)] rounded-tr-none bg-[var(--bg-2)] border border-[var(--border)]">
                  <TypingIndicator />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Idle state */}
          {phase === "idle" && (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-3)]">
              ← Pick a scenario to see the AI respond
            </div>
          )}
        </div>

        {/* Right: Activity log */}
        <div className="p-4 flex flex-col">
          <p className="text-xs font-medium text-[var(--text-3)] mb-3 uppercase tracking-wide">Activity</p>
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {scenario && Array.from({ length: activityItems }).map((_, i) => {
                const item = scenario.activity[i];
                if (!item) return null;
                return (
                  <motion.div
                    key={`${scenario.id}-act-${i}`}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] px-2.5 py-2"
                  >
                    <item.icon className={cn("h-3.5 w-3.5 shrink-0", item.color)} />
                    <span className="text-xs text-[var(--text-2)]">{item.text}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {activityItems === 0 && (
              <p className="text-xs text-[var(--text-3)] mt-2">Activity will appear here…</p>
            )}
          </div>

          {/* Dashboard mini-widget */}
          {phase === "done" && scenario && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-auto pt-4"
            >
              <div className="rounded-[var(--radius-sm)] border border-[var(--brand)]/20 bg-[var(--brand-glow)] p-3">
                <p className="text-xs font-medium text-[var(--brand)] mb-1">Pipeline updated</p>
                <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
                  <span>Stage</span>
                  <span className={cn("font-medium", STAGE_COLORS[scenario.stage].text)}>
                    {scenario.stage.charAt(0).toUpperCase() + scenario.stage.slice(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-3)] mt-0.5">
                  <span>Score</span>
                  <span className="font-medium text-[var(--text)]">{scenario.score}/100</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
