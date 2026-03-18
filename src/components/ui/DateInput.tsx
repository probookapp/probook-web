import { forwardRef, useState, useRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  label?: string;
  error?: string;
  value?: string; // ISO format: YYYY-MM-DD
  onChange?: (e: { target: { value: string } }) => void;
}

// Format date based on locale
function formatDateDisplay(isoDate: string, locale: string): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;

  switch (locale) {
    case "en":
      return `${month}/${day}/${year}`; // MM/DD/YYYY
    case "ar":
    case "fr":
    default:
      return `${day}/${month}/${year}`; // DD/MM/YYYY
  }
}

// Parse display format back to ISO
function parseToISO(displayDate: string, locale: string): string {
  if (!displayDate) return "";
  const parts = displayDate.split("/");
  if (parts.length !== 3) return displayDate;

  switch (locale) {
    case "en": {
      const [month, day, year] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    case "ar":
    case "fr":
    default: {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
}

// Get placeholder based on locale
function getPlaceholder(locale: string): string {
  switch (locale) {
    case "en":
      return "MM/DD/YYYY";
    case "ar":
    case "fr":
    default:
      return "DD/MM/YYYY";
  }
}

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, label, error, id, name, value, onChange, disabled, ...props }, ref) => {
    const { t, i18n } = useTranslation("common");
    const locale = i18n.language;
    const hiddenDateRef = useRef<HTMLInputElement>(null);
    // Use id if provided, otherwise fall back to name for label association
    const inputId = id || name;

    // Local state for the text display
    const [displayValue, setDisplayValue] = useState(() => formatDateDisplay(value || "", locale));

    // Update display when value prop changes
    if (value && formatDateDisplay(value, locale) !== displayValue) {
      setDisplayValue(formatDateDisplay(value, locale));
    }

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDisplayValue = e.target.value;
      setDisplayValue(newDisplayValue);

      // Try to parse and emit ISO format
      const isoValue = parseToISO(newDisplayValue, locale);
      // Validate it's a proper date
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(isoValue)) {
        const date = new Date(isoValue);
        if (!isNaN(date.getTime())) {
          onChange?.({ target: { value: isoValue } });
        }
      }
    };

    const handleBlur = () => {
      // On blur, reformat the display value if we have a valid ISO value
      if (value) {
        setDisplayValue(formatDateDisplay(value, locale));
      }
    };

    const handleCalendarClick = () => {
      hiddenDateRef.current?.showPicker();
    };

    const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const isoValue = e.target.value;
      setDisplayValue(formatDateDisplay(isoValue, locale));
      onChange?.({ target: { value: isoValue } });
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            name={name}
            type="text"
            value={displayValue}
            onChange={handleTextChange}
            onBlur={handleBlur}
            placeholder={getPlaceholder(locale)}
            disabled={disabled}
            className={cn(
              "w-full px-3 py-2 pr-10 border rounded-lg shadow-sm transition-colors",
              "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100",
              "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
              "disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed",
              "placeholder:text-gray-400 dark:placeholder:text-gray-500",
              error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300 dark:border-gray-600",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={handleCalendarClick}
            disabled={disabled}
            aria-label={t("aria.openCalendar")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calendar className="h-4 w-4" />
          </button>
          {/* Hidden native date input for picker */}
          <input
            ref={hiddenDateRef}
            id={inputId ? `${inputId}-picker` : undefined}
            name={name ? `${name}-picker` : undefined}
            type="date"
            value={value || ""}
            onChange={handleNativeDateChange}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

DateInput.displayName = "DateInput";

export { DateInput };
