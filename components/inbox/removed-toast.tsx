"use client";

/**
 * RemovedToast — shows a brief notification when the user was redirected
 * back to /inbox because the conversation they navigated to no longer exists
 * (e.g. after a re-seed).
 *
 * Uses sessionStorage so it survives the client-side redirect without
 * needing URL search params or a Suspense boundary.
 */

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

export function RemovedToast() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      const flag = sessionStorage.getItem("inbox_removed_toast");
      if (flag === "1") {
        sessionStorage.removeItem("inbox_removed_toast");
        setVisible(true);
        const t = setTimeout(() => setVisible(false), 3500);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore — sessionStorage may be unavailable in some sandboxes */
    }
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2
                     rounded-[var(--radius-md)] border border-[var(--border)]
                     bg-[var(--bg-2)] px-4 py-2 text-xs text-[var(--text-2)] shadow-elevated"
        >
          That conversation was removed — try re-seeding to refresh.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
