import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase, fieldError, fieldLabel, FIELD_HEIGHT } from "./field";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  label,
  error,
  placeholder,
  disabled,
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!search) return options.filter((o) => o.value !== "");
    const lower = search.toLowerCase();
    return options.filter(
      (o) => o.value !== "" && o.label.toLowerCase().includes(lower)
    );
  }, [options, search]);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch("");
    setHighlightedIndex(-1);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
    setHighlightedIndex(-1);
  }, []);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      close();
    },
    [onChange, close]
  );

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [close]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
          select(filtered[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  };

  return (
    <div className={cn("w-full", className)} ref={containerRef}>
      {label && <label className={fieldLabel}>{label}</label>}
      <div className="relative">
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => (isOpen ? close() : open())}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={fieldBase(
            !!error,
            cn(FIELD_HEIGHT, "flex items-center gap-2 text-start")
          )}
        >
          <span className={cn("flex-1 truncate", !selectedOption && "text-(--color-text-tertiary)")}>
            {selectedOption?.label || placeholder || ""}
          </span>
          {value && !disabled ? (
            <X
              className="h-4 w-4 shrink-0 text-(--color-text-tertiary) hover:text-(--color-text-primary)"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          ) : (
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-(--color-text-tertiary) transition-transform",
                isOpen && "rotate-180"
              )}
            />
          )}
        </button>

        {/* Dropdown — genuinely floating above the form, so it earns a shadow. */}
        {isOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-(--color-border-primary) bg-(--color-bg-elevated) shadow-lg">
            {/* Search input */}
            <div className="p-2 border-b border-(--color-border-primary)">
              <div className="relative">
                <Search className="absolute inset-s-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-text-tertiary)" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full ps-8 pe-3 py-1.5 text-sm rounded-sm border border-(--color-border-input) bg-(--color-bg-secondary) text-(--color-text-primary) placeholder:text-(--color-text-tertiary) focus:outline-none focus:border-primary-500"
                  placeholder="..."
                />
              </div>
            </div>

            {/* Options list */}
            <ul
              ref={listRef}
              className="max-h-48 overflow-y-auto py-1"
              role="listbox"
            >
              {filtered.length > 0 ? (
                filtered.map((option, i) => (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    className={cn(
                      "px-3 py-2 text-sm cursor-pointer transition-colors",
                      option.value === value
                        ? "bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-medium"
                        : "text-(--color-text-primary)",
                      i === highlightedIndex && "bg-(--color-bg-tertiary)"
                    )}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    onClick={() => select(option.value)}
                  >
                    {option.label}
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-(--color-text-tertiary) italic">
                  —
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {error && <p className={fieldError}>{error}</p>}
    </div>
  );
}
