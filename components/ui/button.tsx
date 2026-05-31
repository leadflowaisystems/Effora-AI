import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  /* base */
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-medium transition-all duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        /** Solid jade with subtle glow */
        primary: [
          "bg-[var(--brand)] text-[#0A0A0C] font-semibold",
          "shadow-[0_0_0_0_var(--brand-glow)]",
          "hover:bg-[var(--brand-deep)] hover:shadow-[0_0_16px_2px_var(--brand-glow)]",
        ],
        /** Ghost / outline */
        secondary: [
          "border border-[var(--border-strong)] bg-transparent text-[var(--text-2)]",
          "hover:bg-[var(--bg-3)] hover:text-[var(--text)] hover:border-[var(--brand)]",
        ],
        /** Muted filled */
        ghost: [
          "bg-[var(--bg-3)] text-[var(--text-2)]",
          "hover:bg-[var(--bg-2)] hover:text-[var(--text)]",
        ],
        /** Destructive */
        destructive: [
          "bg-[var(--danger)] text-white font-semibold",
          "hover:opacity-90",
        ],
        /** Link style */
        link: [
          "bg-transparent text-[var(--brand)] underline-offset-4",
          "hover:underline",
        ],
      },
      size: {
        sm:  "h-8  px-3  text-xs  rounded-[var(--radius-sm)]",
        md:  "h-9  px-4  text-sm  rounded-[var(--radius-md)]",
        lg:  "h-11 px-6  text-sm  rounded-[var(--radius-md)]",
        xl:  "h-12 px-8  text-base rounded-[var(--radius-lg)]",
        icon:"h-9  w-9       rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size:    "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
