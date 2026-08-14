import { forwardRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { fieldBase, fieldError, fieldLabel, FIELD_HEIGHT } from "./field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/** Figures are set in the mono face so columns of money line up. */
const NUMERIC_TYPES = new Set(["number", "tel"]);

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, name, type, lang, inputMode, ...props }, ref) => {
    // useTranslation hook to reactively get the current language
    const { i18n } = useTranslation();
    // For date inputs, use the app's language for locale-aware formatting
    const inputLang = type === "date" ? (lang || i18n.language) : lang;
    // Use id if provided, otherwise fall back to name for label association
    const inputId = id || name;
    const isNumeric = NUMERIC_TYPES.has(type ?? "") || inputMode === "decimal" || inputMode === "numeric";

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className={fieldLabel}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={type}
          lang={inputLang}
          inputMode={inputMode}
          className={fieldBase(
            !!error,
            cn(FIELD_HEIGHT, isNumeric && "font-mono tabular-nums", className)
          )}
          {...props}
        />
        {error && <p className={fieldError}>{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
