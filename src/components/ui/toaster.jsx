import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle } from "@/components/ui/toast";

const presentation = {
  default: { Icon: Info, title: "Information", icon: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  info: { Icon: Info, title: "Information", icon: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  success: { Icon: CheckCircle2, title: "Successful", icon: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  warning: { Icon: AlertTriangle, title: "Attention required", icon: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  destructive: { Icon: XCircle, title: "Something went wrong", icon: "bg-red-500/12 text-red-600 dark:text-red-400" },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, variant = "default", open, onOpenChange: _onOpenChange, duration: _duration, ...props }) => {
        const view = presentation[variant] || presentation.default;
        return (
          <Toast key={id} variant={variant} data-state={open === false ? "closed" : "open"} {...props}>
            <div className={`grid h-9 w-9 place-items-center rounded-xl ${view.icon}`}><view.Icon className="h-[18px] w-[18px]" /></div>
            <div className="min-w-0 py-0.5">
              <ToastTitle>{title || view.title}</ToastTitle>
              {description && <ToastDescription>{description}</ToastDescription>}
              {action}
            </div>
            <ToastClose onClick={() => dismiss(id)} />
            <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-0.5 ${variant === "success" ? "bg-emerald-500" : variant === "warning" ? "bg-amber-500" : variant === "destructive" ? "bg-red-500" : "bg-sky-500"}`} />
          </Toast>
        );
      })}
    </ToastProvider>
  );
}
