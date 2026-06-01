"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Animates from 0 → `target` over `duration` ms (ease-out cubic).
 *
 * Re-triggers whenever `target` changes — critical so the hero tiles
 * animate correctly after the dashboard data refreshes (e.g. post-seed
 * or when the user switches the date range).
 */
export function useCountUp(target: number, duration = 1400, delay = 0): number {
  const [value, setValue]  = useState(0);
  const rafId    = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel any in-flight animation from the previous target
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelAnimationFrame(rafId.current);

    if (target === 0) { setValue(0); return; }

    let startTs: number | null = null;
    const snap = target; // freeze snapshot so a rapid second change doesn't corrupt this run

    timerRef.current = setTimeout(() => {
      const tick = (ts: number) => {
        if (startTs === null) startTs = ts;
        const elapsed  = ts - startTs;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setValue(Math.round(eased * snap));
        if (progress < 1) rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(rafId.current);
    };
  }, [target, duration, delay]); // ← target in deps so re-fires on data change

  return value;
}
