import { useEffect, useRef, useCallback } from "react";

interface UseBarcodeScanner {
  onScan: (barcode: string) => void;
  minLength?: number;
  scanTimeout?: number;
}

/**
 * Hook to detect barcode scanner input (USB scanners in keyboard mode)
 *
 * USB barcode scanners type characters very fast (< 50ms between chars)
 * and end with Enter key. This hook captures that pattern and triggers
 * the onScan callback with the complete barcode.
 *
 * @param onScan - Callback when a barcode is detected
 * @param minLength - Minimum barcode length (default: 4)
 * @param scanTimeout - Max time between chars in ms (default: 50)
 */
export function useBarcodeScanner({
  onScan,
  minLength = 4,
  scanTimeout = 50,
}: UseBarcodeScanner) {
  const buffer = useRef("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBuffer = useCallback(() => {
    buffer.current = "";
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if user is typing in an input (except barcode-designated inputs)
      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        // Allow scanning in inputs with data-barcode-input attribute
        if (!target.dataset.barcodeInput) {
          return;
        }
      }

      // Clear previous timeout
      if (timeout.current) {
        clearTimeout(timeout.current);
      }

      if (event.key === "Enter") {
        // Enter pressed - check if we have a valid barcode
        if (buffer.current.length >= minLength) {
          event.preventDefault();
          onScan(buffer.current);
        }
        clearBuffer();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        // Single character key (not modifier keys)
        buffer.current += event.key;

        // Set timeout to clear buffer if no more input
        timeout.current = setTimeout(() => {
          clearBuffer();
        }, scanTimeout);
      }
    },
    [onScan, minLength, scanTimeout, clearBuffer]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
    };
  }, [handleKeyDown]);

  return { clearBuffer };
}
