import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

// A form inside the modal reports whether it holds unsaved input, so that
// dismissing the modal by accident — a click on the backdrop, Escape, the X —
// asks first instead of throwing the input away.
const ModalDirtyContext = createContext<((dirty: boolean) => void) | null>(null);

/** Call from a form rendered inside a Modal with its unsaved state (react-hook-form's isDirty). */
export function useModalDirty(isDirty: boolean) {
  const setDirty = useContext(ModalDirtyContext);
  useEffect(() => {
    setDirty?.(isDirty);
  }, [setDirty, isDirty]);
  useEffect(() => () => setDirty?.(false), [setDirty]);
}

/**
 * The Cancel / Save row of a form in a Modal, pinned to the bottom of the
 * dialog while the form scrolls under it. It bleeds through the body padding
 * of the Modal (px-4 py-3 sm:px-6 sm:py-4) so it spans the dialog.
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 -mb-3 sm:-mx-6 sm:-mb-4 flex justify-end gap-3",
        "border-t border-(--color-border-primary) bg-(--color-bg-elevated) px-4 py-3 sm:px-6",
        className
      )}
    >
      {children}
    </div>
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Unsaved input held by the owner itself; a form rendered inside can report it with useModalDirty instead. */
  isDirty?: boolean;
  /**
   * false for a decision that cannot be put off (an offline conflict): no
   * close button, and Escape or a click outside leave it open.
   */
  dismissible?: boolean;
}

/**
 * Accessible modal built on Radix Dialog: role="dialog" + aria-modal, focus
 * moved into (and trapped inside) the dialog on open, restored on close,
 * Escape / overlay-click to dismiss, and body scroll lock — all handled by
 * Radix. The props API is unchanged from the previous hand-rolled version.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  isDirty: ownerDirty = false,
  dismissible = true,
}: ModalProps) {
  const { t } = useTranslation("common");
  const [isDirty, setIsDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (open || !dismissible) return;
        // The owner closing it on purpose (after a save, or its own Cancel)
        // sets isOpen and never comes through here.
        if (isDirty || ownerDirty) setConfirmingClose(true);
        else onClose();
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
              {/* A title carrying a name ("Statement — <client>") wraps rather
                  than pushing the close button off the dialog. */}
              <Dialog.Title className="min-w-0 wrap-anywhere text-base sm:text-lg font-semibold text-(--color-text-primary)">
                {title}
              </Dialog.Title>
              {dismissible && (
              <Dialog.Close asChild>
                <button
                  aria-label={t("aria.close")}
                  // 44px on a phone, where it is the one way out a thumb can reach.
                  className="-me-2 sm:-me-1 shrink-0 rounded-md p-3 sm:p-1.5 text-(--color-text-tertiary) transition-colors hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary)"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
              )}
            </div>
            <div className="px-4 py-3 sm:px-6 sm:py-4">
              <ModalDirtyContext.Provider value={setIsDirty}>{children}</ModalDirtyContext.Provider>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
      {/* Mounted only while asked: a Modal always rendering its own
          confirmation would nest one inside the other without end. */}
      {confirmingClose && (
        <Modal isOpen onClose={() => setConfirmingClose(false)} title={t("unsavedChanges.title")} size="sm">
          <p className="text-sm text-(--color-text-secondary) mb-4">{t("unsavedChanges.closeMessage")}</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setConfirmingClose(false)}>
              {t("unsavedChanges.stay")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmingClose(false);
                onClose();
              }}
            >
              {t("unsavedChanges.discard")}
            </Button>
          </div>
        </Modal>
      )}
    </Dialog.Root>
  );
}
