import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  disabledReason?: string;
}

/**
 * Fixed heights rather than padding alone, so a button placed beside an input
 * lines up with it instead of missing by a pixel or two — the kind of drift
 * that reads as sloppiness long before anyone can name it.
 */
const SIZES = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2",
} as const;

const VARIANTS = {
  // The accent is spent here and almost nowhere else: one primary action per
  // view, unmistakable because nothing around it competes.
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 " +
    "shadow-xs focus-visible:ring-primary-500",
  // A hairline on the page surface, not a filled grey block. Secondary actions
  // should recede; a grey fill has nearly the same visual weight as the accent.
  secondary:
    "bg-(--color-bg-primary) text-(--color-text-primary) border border-(--color-border-secondary) " +
    "hover:bg-(--color-bg-tertiary) active:bg-gray-200 dark:active:bg-gray-700 " +
    "shadow-xs focus-visible:ring-gray-500",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 " +
    "shadow-xs focus-visible:ring-danger-500",
  ghost:
    "bg-transparent text-(--color-text-secondary) hover:bg-(--color-bg-tertiary) " +
    "hover:text-(--color-text-primary) active:bg-gray-200 dark:active:bg-gray-700 " +
    "focus-visible:ring-gray-500",
} as const;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading,
      disabled,
      disabledReason,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    const button = (
      <button
        ref={disabledReason && isDisabled ? undefined : ref}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium",
          "transition-[background-color,border-color,color,box-shadow] duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-(--color-bg-primary)",
          "disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none",
          SIZES[size],
          VARIANTS[variant],
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );

    if (disabledReason && isDisabled) {
      return (
        <span ref={ref as React.Ref<HTMLSpanElement>} title={disabledReason} className="inline-flex">
          {button}
        </span>
      );
    }

    return button;
  }
);

Button.displayName = "Button";

export { Button };
