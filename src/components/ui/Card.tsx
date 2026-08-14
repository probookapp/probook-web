import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Defined by its hairline, not by a shadow. A card sitting flat on the page is
 * a region of it; a drop shadow claims the card is floating, which is a lie
 * everywhere except a menu or a dialog — and when everything floats, the thing
 * that genuinely does has no way left to say so.
 */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-(--color-bg-primary) rounded-lg border border-(--color-border-primary)",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn("px-4 py-3 sm:px-6 sm:py-4 border-b border-(--color-border-primary)", className)} {...props}>
      {children}
    </div>
  );
}

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <h3 className={cn("text-base sm:text-lg font-semibold text-(--color-text-primary)", className)} {...props}>
      {children}
    </h3>
  );
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardContent({ className, children, ...props }: CardContentProps) {
  return (
    <div className={cn("px-4 py-3 sm:px-6 sm:py-4", className)} {...props}>
      {children}
    </div>
  );
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div className={cn("px-4 py-3 sm:px-6 sm:py-4 border-t border-(--color-border-primary) bg-(--color-bg-secondary)", className)} {...props}>
      {children}
    </div>
  );
}
