"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-[380px] flex-col gap-2 p-0",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-[var(--radius-md)] border p-4 shadow-elevated transition-all duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out " +
  "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full " +
  "data-[state=open]:slide-in-from-bottom-4",
  {
    variants: {
      variant: {
        default:     "bg-[var(--bg-2)] border-[var(--border-strong)] text-[var(--text)]",
        success:     "bg-[var(--bg-2)] border-[rgba(54,230,160,0.25)] text-[var(--text)]",
        destructive: "bg-[var(--bg-2)] border-[rgba(255,93,93,0.25)] text-[var(--text)]",
        warning:     "bg-[var(--bg-2)] border-[rgba(246,184,96,0.25)] text-[var(--text)]",
        info:        "bg-[var(--bg-2)] border-[rgba(100,140,255,0.25)] text-[var(--text)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const iconMap = {
  default:     null,
  success:     <CheckCircle2 className="h-4 w-4 text-[var(--brand)] shrink-0 mt-0.5" />,
  destructive: <AlertCircle className="h-4 w-4 text-[var(--danger)] shrink-0 mt-0.5" />,
  warning:     <AlertTriangle className="h-4 w-4 text-[var(--warn)] shrink-0 mt-0.5" />,
  info:        <Info className="h-4 w-4 text-[#648CFF] shrink-0 mt-0.5" />,
};

type ToastVariant = "default" | "success" | "destructive" | "warning" | "info";

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant = "default", ...props }, ref) => {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      {variant && variant !== "default" && iconMap[variant as ToastVariant]}
      <div className="flex-1 min-w-0">{props.children}</div>
    </ToastPrimitive.Root>
  );
});
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-transparent px-3 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "rounded-full p-1 text-[var(--text-3)] opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold text-[var(--text)]", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[var(--text-3)]", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
