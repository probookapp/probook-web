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
        {/* On a phone the dialog is a sheet on the bottom edge, full width: the
            actions at the foot of a form land under the thumb instead of in the
            middle of the screen, and no width is lost to side margins. From sm
            up it floats in the centre as before. */}
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pt-4 sm:p-4">
          <Dialog.Content
            aria-describedby={undefined}
            // Escape inside an open dropdown (SearchableSelect) closes the
            // dropdown, not the whole form.
            onEscapeKeyDown={(e) => {
              if ((e.target as Element | null)?.closest?.("[data-popup-open]")) e.preventDefault();
            }}
            className={cn(
              // A dialog genuinely floats, so this is one of the few places a
              // real shadow is earned.
              "relative bg-(--color-bg-elevated) rounded-t-xl sm:rounded-xl border border-(--color-border-primary)",
              "max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
              // dvh, not vh: on a phone vh ignores the browser bars and the keyboard,
              // and the bottom of a long form (its buttons) ends up under them.
              // No max-width below sm: the sheet spans the phone edge to edge.
              "shadow-lg max-h-[92dvh] sm:max-h-[90dvh] overflow-auto overscroll-contain focus:outline-none",
              {
                "w-full sm:max-w-sm": size === "sm",
                "w-full sm:max-w-md": size === "md",
                "w-full sm:max-w-lg": size === "lg",
                "w-full sm:max-w-2xl": size === "xl",
              }
            )}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-1 sm:px-6 sm:py-4 border-b border-(--color-border-primary) bg-(--color-bg-elevated) rounded-t-xl">
              <Dialog.Title className="text-base sm:text-lg font-semibold text-(--color-text-primary)">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label={t("aria.close")}
                  // 44px on a phone, where it is the one way out a thumb can reach.
                  className="-me-2 sm:-me-1 shrink-0 rounded-md p-3 sm:p-1.5 text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary)"
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
