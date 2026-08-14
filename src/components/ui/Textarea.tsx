import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { fieldBase, fieldError, fieldLabel } from "./field";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, name, ...props }, ref) => {
    // Use id if provided, otherwise fall back to name for label association
    const textareaId = id || name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className={fieldLabel}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          name={name}
          // No fixed height here: a textarea is sized by its rows, and padding
          // rather than a line-height guess keeps the first line where the eye
          // expects it.
          className={fieldBase(!!error, cn("py-2 min-h-25 leading-relaxed", className))}
          {...props}
        />
        {error && <p className={fieldError}>{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
