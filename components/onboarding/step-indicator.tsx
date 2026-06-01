"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  sublabel?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number; // 0-based index
  className?: string;
}

export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  const progress = ((currentStep) / (steps.length - 1)) * 100;

  return (
    <div className={cn("w-full", className)}>
      {/* Progress bar */}
      <div className="relative h-0.5 w-full bg-[var(--bg-3)] rounded-full overflow-hidden mb-6">
        <motion.div
          className="absolute inset-y-0 left-0 bg-[var(--brand)] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Step dots */}
      <div className="flex items-start justify-between">
        {steps.map((step, i) => {
          const done    = i < currentStep;
          const current = i === currentStep;

          return (
            <div key={step.label} className="flex flex-col items-center gap-1.5 flex-1">
              {/* Circle */}
              <motion.div
                animate={{
                  backgroundColor: done
                    ? "var(--brand)"
                    : current
                    ? "var(--brand)"
                    : "var(--bg-3)",
                  borderColor: done || current ? "var(--brand)" : "var(--border)",
                  scale: current ? 1.1 : 1,
                }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2"
              >
                {done ? (
                  <Check className="h-3.5 w-3.5 text-[#0A0A0C]" />
                ) : (
                  <span
                    className={cn(
                      "text-[10px] font-mono font-semibold",
                      current ? "text-[#0A0A0C]" : "text-[var(--text-3)]"
                    )}
                  >
                    {i + 1}
                  </span>
                )}
              </motion.div>

              {/* Labels — only show on md+ */}
              <div className="hidden sm:flex flex-col items-center text-center max-w-[80px]">
                <span
                  className={cn(
                    "text-[10px] font-medium leading-tight",
                    current ? "text-[var(--text)]" : done ? "text-[var(--text-2)]" : "text-[var(--text-3)]"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
