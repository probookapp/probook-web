import { forwardRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, name, type, lang, ...props }, ref) => {
    // useTranslation hook to reactively get the current language
    const { i18n } = useTranslation();
    // For date inputs, use the app's language for locale-aware formatting
    const inputLang = type === "date" ? (lang || i18n.language) : lang;
    // Use id if provided, otherwise fall back to name for label association
    const inputId = id || name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={type}
          lang={inputLang}
          className={cn(
            "w-full px-3 py-2 border rounded-lg shadow-sm transition-colors",
            "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
            "disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed",
            "placeholder:text-gray-400 dark:placeholder:text-gray-500",
            error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300 dark:border-gray-600",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
