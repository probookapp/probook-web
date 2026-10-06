import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tagColorClasses } from "@/lib/tag-colors";

interface TagChipProps {
  name: string;
  color?: string | null;
  /** A remove button, a checkmark — whatever the surrounding control needs. */
  children?: ReactNode;
  className?: string;
}

/**
 * A label the business attached to a document.
 *
 * Fully rounded, where the status Badge is squared — and that is the whole
 * point of the shape. A squared chip says *this is what the document is*; a
 * capsule says *this is something we stuck on it*. The two sit next to each
 * other in the quote list, and a reader has to be able to tell the state that
 * drives the expiry sweep from the word someone typed in Settings without
 * reading either of them.
 */
export function TagChip({ name, color, children, className }: TagChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tagColorClasses(color),
        className
      )}
    >
      {name}
      {children}
    </span>
  );
}
