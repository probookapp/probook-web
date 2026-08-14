import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { fieldBase, fieldError, fieldLabel, FIELD_HEIGHT } from "./field";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, name, options, ...props }, ref) => {
    // Use id if provided, otherwise fall back to name for label association
    const selectId = id || name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className={fieldLabel}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          name={name}
          className={fieldBase(
            !!error,
            // The native arrow is replaced by one drawn in the text colour, so
            // the control matches the rest of the form in both themes instead
            // of showing the operating system's own blue-grey chevron.
            cn(
              FIELD_HEIGHT,
              "appearance-none bg-no-repeat pe-9",
              "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%228%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M1%201.5%206%206.5%2011%201.5%22%20stroke%3D%22%23837d73%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')]",
              "bg-position-[right_0.75rem_center] rtl:bg-position-[left_0.75rem_center]",
              className
            )
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className={fieldError}>{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
