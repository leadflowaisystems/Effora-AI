"use client";

import { motion } from "framer-motion";
import { MessageSquareDashed, Plus } from "lucide-react";

export default function InboxEmptyPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center px-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-3)]">
          <MessageSquareDashed className="h-8 w-8 text-[var(--text-3)]" />
        </div>
        <div className="space-y-1.5 max-w-xs">
          <p className="font-display text-base font-semibold text-[var(--text)]">
            Select a conversation
          </p>
          <p className="text-sm text-[var(--text-3)] leading-relaxed">
            Pick a lead from the list, or click{" "}
            <span className="inline-flex items-center gap-1 text-[var(--brand)]">
              <Plus className="h-3 w-3" /> New DM
            </span>{" "}
            to simulate an inbound message and watch the AI qualify it live.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
