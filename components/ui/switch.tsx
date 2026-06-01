"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
      "disabled:cursor-not-allowed disabled:opacity-40",
      "data-[state=unchecked]:bg-[var(--bg-3)]",
      "data-[state=checked]:bg-[var(--brand)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-[var(--text-3)]",
        "data-[state=checked]:translate-x-4 data-[state=checked]:bg-[#0A0A0C]"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
