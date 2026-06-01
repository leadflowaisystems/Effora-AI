"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * FilmGrain — wraps children with a ~3% opacity noise overlay.
 * Works as a layout wrapper; the grain layer is pointer-events:none.
 */
export function FilmGrain({
  children,
  className,
  intensity = "default",
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: "subtle" | "default" | "strong";
}) {
  const opacityMap = {
    subtle:  0.02,
    default: 0.03,
    strong:  0.05,
  };

  return (
    <div className={cn("relative isolate", className)}>
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] select-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
          opacity: opacityMap[intensity],
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}

/**
 * JadeGlow — soft radial jade gradient positioned at the top of its container.
 * Attach as an absolute overlay inside a relative parent.
 */
export function JadeGlow({
  className,
  size = "default",
}: {
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const sizeMap = {
    sm:      "ellipse 40% 20% at 50% 0%",
    default: "ellipse 60% 30% at 50% 0%",
    lg:      "ellipse 80% 50% at 50% 0%",
  };

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-0 select-none", className)}
      style={{
        background: `radial-gradient(${sizeMap[size]}, rgba(54, 230, 160, 0.07) 0%, transparent 70%)`,
      }}
    />
  );
}
