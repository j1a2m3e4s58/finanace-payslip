import * as React from "react";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = React.forwardRef(({ className, ...props }, ref) => (
  <section
    ref={ref}
    aria-label="System notifications"
    aria-live="polite"
    className={cn(
      "pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[200] flex max-h-[70dvh] flex-col-reverse gap-2.5 px-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(410px,calc(100vw-3rem))] sm:flex-col sm:px-0",
      className,
    )}
    {...props}
  />
));
ToastProvider.displayName = "ToastProvider";

const toastVariants = cva(
  "group pointer-events-auto relative grid w-full grid-cols-[auto,1fr,auto] items-start gap-3 overflow-hidden rounded-2xl border p-3.5 pr-2.5 shadow-[0_18px_50px_-18px_rgba(9,30,22,.55)] backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-bottom-3 sm:rounded-xl sm:slide-in-from-right-6 sm:data-[state=closed]:slide-out-to-right-5",
  {
    variants: {
      variant: {
        default: "border-sky-500/25 bg-background/95 text-foreground",
        info: "border-sky-500/25 bg-background/95 text-foreground",
        success: "border-emerald-500/30 bg-background/95 text-foreground",
        warning: "border-amber-500/35 bg-background/95 text-foreground",
        destructive: "border-red-500/30 bg-background/95 text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const Toast = React.forwardRef(({ className, variant, ...props }, ref) => (
  <article ref={ref} role={variant === "destructive" || variant === "warning" ? "alert" : "status"} className={cn(toastVariants({ variant }), className)} {...props} />
));
Toast.displayName = "Toast";

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <button ref={ref} className={cn("mt-2 inline-flex h-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring", className)} {...props} />
));
ToastAction.displayName = "ToastAction";

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <button ref={ref} aria-label="Dismiss notification" className={cn("rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring", className)} {...props}>
    <X className="h-4 w-4" />
  </button>
));
ToastClose.displayName = "ToastClose";

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => <h2 ref={ref} className={cn("text-sm font-bold tracking-tight", className)} {...props} />);
ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => <p ref={ref} className={cn("mt-0.5 text-xs leading-5 text-muted-foreground", className)} {...props} />);
ToastDescription.displayName = "ToastDescription";

export { ToastProvider, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction };
