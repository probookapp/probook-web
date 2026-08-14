import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

/**
 * Accessible modal built on Radix Dialog: role="dialog" + aria-modal, focus
 * moved into (and trapped inside) the dialog on open, restored on close,
 * Escape / overlay-click to dismiss, and body scroll lock — all handled by
 * Radix. The props API is unchanged from the previous hand-rolled version.
 */
export function Modal({ isOpen, onClose, title, children, size = "md" }: ModalProps) {
  const { t } = useTranslation("common");

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        {/* Warm-tinted rather than pure black: a neutral scrim over warm paper
            drains the colour out of the page behind it. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-gray-950/45 backdrop-blur-[2px]" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Content
            aria-describedby={undefined}
            className={cn(
              // A dialog genuinely floats, so this is one of the few places a
              // real shadow is earned.
              "relative bg-(--color-bg-elevated) rounded-xl border border-(--color-border-primary)",
              "shadow-lg max-h-[90vh] overflow-auto focus:outline-none",
              {
                "w-full max-w-[calc(100%-2rem)] sm:max-w-sm": size === "sm",
                "w-full max-w-[calc(100%-2rem)] sm:max-w-md": size === "md",
                "w-full max-w-[calc(100%-2rem)] sm:max-w-lg": size === "lg",
                "w-full max-w-[calc(100%-2rem)] sm:max-w-2xl": size === "xl",
              }
            )}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-(--color-border-primary)">
              <Dialog.Title className="text-base sm:text-lg font-semibold text-(--color-text-primary)">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label={t("aria.close")}
                  className="-me-1 shrink-0 rounded-md p-1.5 text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary)"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
            <div className="px-4 py-3 sm:px-6 sm:py-4">{children}</div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
