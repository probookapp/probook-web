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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Content
            aria-describedby={undefined}
            className={cn(
              "relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-[90vh] overflow-auto focus:outline-none",
              {
                "w-full max-w-[calc(100%-2rem)] sm:max-w-sm": size === "sm",
                "w-full max-w-[calc(100%-2rem)] sm:max-w-md": size === "md",
                "w-full max-w-[calc(100%-2rem)] sm:max-w-lg": size === "lg",
                "w-full max-w-[calc(100%-2rem)] sm:max-w-2xl": size === "xl",
              }
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-gray-700">
              <Dialog.Title className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label={t("aria.close")}
                  className="p-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
