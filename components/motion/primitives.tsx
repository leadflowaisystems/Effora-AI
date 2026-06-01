"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  type Variants,
  type HTMLMotionProps,
  type Transition,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from "framer-motion";

/* ────────────────────────────────────────────
   EASING + DURATION CONSTANTS
──────────────────────────────────────────── */
export const ease = [0.22, 1, 0.36, 1] as const;

export const duration = {
  fast:   0.16,
  base:   0.22,
  slow:   0.32,
} as const;

const transition: Transition = { duration: duration.base, ease };

/* ────────────────────────────────────────────
   VARIANT PRESETS
──────────────────────────────────────────── */
export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition },
};

export const slideUp: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition },
};

export const slideDown: Variants = {
  hidden:  { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition },
};

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: duration.fast, ease } },
};

/** Staggered list — wrap children in <StaggerItem> */
export const staggerList: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition },
};

/* ────────────────────────────────────────────
   HELPER COMPONENTS
──────────────────────────────────────────── */

/** Fade + slide up on mount */
export function FadeUp({
  children,
  delay = 0,
  className,
  ...props
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "variants" | "initial" | "animate">) {
  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="visible"
      transition={{ ...transition, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list wrapper */
export function StaggerList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerList}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Individual stagger item */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

/** Hover lift — translateY -2px + border brightens via opacity */
export function HoverLift({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "whileHover">) {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: duration.fast, ease } }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Page transition wrapper — fade + 8px slide */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────
   COUNT-UP COMPONENT
──────────────────────────────────────────── */

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({
  value,
  duration: dur = 1.2,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startValue = useRef(0);

  useEffect(() => {
    // Respect reduced motion
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setDisplayValue(value);
      return;
    }

    startValue.current = displayValue;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = (timestamp - startTime.current) / 1000;
      const progress = Math.min(elapsed / dur, 1);
      // cubic-bezier-like easing: ease-out-quint
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = startValue.current + (value - startValue.current) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatted = displayValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease }}
      className={className}
    >
      {prefix}{formatted}{suffix}
    </motion.span>
  );
}

/* ────────────────────────────────────────────
   PRESENCE WRAPPER (AnimatePresence re-export helper)
──────────────────────────────────────────── */
export { AnimatePresence };
