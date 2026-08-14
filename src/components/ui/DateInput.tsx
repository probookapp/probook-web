import { forwardRef, useState, useRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase, fieldError, fieldLabel, FIELD_HEIGHT } from "./field";

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
          <label htmlFor={inputId} className={fieldLabel}>
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
            // A date is a number: mono keeps 01/09 and 11/09 the same width.
            className={fieldBase(
              !!error,
              cn(FIELD_HEIGHT, "pe-10 font-mono tabular-nums", className)
            )}
            {...props}
          />
          <button
            type="button"
            onClick={handleCalendarClick}
            disabled={disabled}
            aria-label={t("aria.openCalendar")}
            // Logical inset, so the icon sits inside the padding in Arabic too
            // rather than landing on top of the text.
            className="absolute inset-e-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-(--color-text-tertiary) transition-colors hover:text-(--color-text-primary) disabled:opacity-50 disabled:cursor-not-allowed"
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
        {error && <p className={fieldError}>{error}</p>}
      </div>
    );
  }
);

DateInput.displayName = "DateInput";

export { DateInput };
