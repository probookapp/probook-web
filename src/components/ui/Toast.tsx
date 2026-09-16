import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastType } from "@/stores/useToastStore";
import { useTranslation } from "react-i18next";

const iconMap: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

/**
 * The toast sits on the page surface and carries its meaning in a coloured
 * rail down its leading edge, rather than tinting the whole panel. A full wash
 * of colour has to stay pale to keep the text legible, which is precisely when
 * the four kinds stop being distinguishable at a glance.
 */
const styleMap: Record<ToastType, string> = {
  success: "border-success-200 dark:border-success-800 border-s-4 border-s-success-500",
  error: "border-danger-200 dark:border-danger-800 border-s-4 border-s-danger-500",
  warning: "border-warning-200 dark:border-warning-800 border-s-4 border-s-warning-500",
  info: "border-info-200 dark:border-info-800 border-s-4 border-s-info-500",
};

const iconStyleMap: Record<ToastType, string> = {
  success: "text-success-600 dark:text-success-400",
  error: "text-danger-600 dark:text-danger-400",
  warning: "text-warning-600 dark:text-warning-400",
  info: "text-info-600 dark:text-info-400",
};

interface ToastItemProps {
  type: ToastType;
  message: string;
  onClose: () => void;
}

function ToastItem({ type, message, onClose }: ToastItemProps) {
  const { t } = useTranslation("common");
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const Icon = iconMap[type];

  useEffect(() => {
    // Trigger enter animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 200);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border shadow-md transition-all duration-200",
        "bg-(--color-bg-elevated) text-(--color-text-primary)",
        styleMap[type],
        isVisible && !isLeaving
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-4"
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconStyleMap[type])} />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={handleClose}
        className="shrink-0 -m-1.5 p-2.5 lg:m-0 lg:p-1 rounded-sm text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary)"
        aria-label={t("aria.closeNotification")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 inset-e-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem
            type={toast.type}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
