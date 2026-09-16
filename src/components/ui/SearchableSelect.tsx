import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useId } from "react";
import { useTranslation } from "react-i18next";
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

/** Gap between the field and the panel, and the least room kept to the screen edge. */
const GAP = 4;
const EDGE = 8;
/** The tallest the list grows when there is room for it. */
const LIST_MAX = 288;
/** Below this much room under the field, the panel opens upward if there is more above. */
const MIN_BELOW = 200;

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
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

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

  /**
   * Where the panel goes.
   *
   * It used to hang below the field as an absolute child, which a modal's
   * scrolling body clipped, and which opened off the bottom of the screen for
   * the last field of a form. It is now `position: fixed`, placed from the
   * field's own rectangle every time the page moves. It stays in this
   * component's DOM rather than being portalled to the body: inside a dialog
   * that keeps it within the focus trap and the dialog's idea of "inside", so
   * choosing an option is not taken for a click outside the modal.
   *
   * The visual viewport, not the window, is the room available — on a phone
   * the keyboard takes the bottom half of the window without resizing it.
   */
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    const list = listRef.current;
    if (!anchor || !panel || !list) return;

    const field = anchor.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewBottom = viewTop + (vv?.height ?? window.innerHeight);

    const below = viewBottom - field.bottom - GAP - EDGE;
    const above = field.top - viewTop - GAP - EDGE;
    const up = below < MIN_BELOW && above > below;

    // The list gives up height before the panel is allowed past the edge.
    const chrome = panel.offsetHeight - list.offsetHeight;
    list.style.maxHeight = `${Math.max(96, Math.min(LIST_MAX, (up ? above : below) - chrome))}px`;

    const top = up ? field.top - GAP - panel.offsetHeight : field.bottom + GAP;
    panel.style.width = `${field.width}px`;
    panel.style.left = `${field.left}px`;
    panel.style.top = `${top}px`;

    // A transformed ancestor makes itself the origin of `fixed`. Measure where
    // the panel actually landed and take the difference back out, so the panel
    // still meets its field in that case.
    const landed = panel.getBoundingClientRect();
    const dx = landed.left - field.left;
    const dy = landed.top - top;
    if (Math.abs(dx) > 0.5) panel.style.left = `${field.left - dx}px`;
    if (Math.abs(dy) > 0.5) panel.style.top = `${top - dy}px`;

    // Written to the DOM like the coordinates, not kept in state: this runs on
    // every scroll, and the side only changes which end the filter sits at.
    panel.dataset.side = up ? "top" : "bottom";
  }, []);

  // Placed before paint so the panel never flashes at the top of the screen,
  // and again whenever its content (and so its height) changes.
  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, filtered.length, place]);

  // Any scroll — the page, a modal's body, a table — moves the field, so the
  // panel follows. Scrolling the list itself does not.
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      place();
    };
    const vv = window.visualViewport;
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [isOpen, place]);

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

  // Focus the filter when the panel opens — with a mouse. On a touch screen
  // that focus raises the keyboard, which covers the very list the tap was
  // meant to show; the filter is one more tap away when the list is long.
  useEffect(() => {
    if (isOpen && window.matchMedia("(pointer: fine)").matches) {
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
        triggerRef.current?.focus();
        break;
      case "Tab":
        close();
        break;
    }
  };

  const clearable = !!value && !disabled;

  return (
    // `data-popup-open` lets a surrounding Modal leave this Escape to the list:
    // the dialog hears the key first (it listens on the document, capturing),
    // and would otherwise close itself and the form with it.
    <div className={cn("w-full", className)} ref={containerRef} data-popup-open={isOpen || undefined}>
      {label && <label className={fieldLabel}>{label}</label>}
      <div className="relative" ref={anchorRef}>
        {/* Trigger button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (isOpen ? close() : open())}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          className={fieldBase(
            !!error,
            cn(FIELD_HEIGHT, "flex items-center gap-2 text-start", clearable && "pe-10")
          )}
        >
          <span className={cn("flex-1 truncate", !selectedOption && "text-(--color-text-tertiary)")}>
            {selectedOption?.label || placeholder || ""}
          </span>
          {!clearable && (
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-(--color-text-tertiary) transition-transform",
                isOpen && "rotate-180"
              )}
            />
          )}
        </button>

        {/* A button of its own beside the trigger, not an icon inside it: a
            button in a button is invalid, unreachable from the keyboard, and
            its 16px was the whole target. It covers the field's end corner. */}
        {clearable && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              close();
            }}
            aria-label={t("aria.clearValue")}
            title={t("aria.clearValue")}
            className="absolute inset-y-0 inset-e-0 flex w-10 items-center justify-center rounded-e-md text-(--color-text-tertiary) transition-colors hover:text-(--color-text-primary)"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Dropdown — genuinely floating above the form, so it earns a shadow.
            Fixed and placed by `place()`; see there. Opening upward, the filter
            sits at the bottom so it stays next to the field. */}
        {isOpen && (
          <div
            ref={panelRef}
            className="group/panel fixed z-50 flex flex-col data-[side=top]:flex-col-reverse rounded-lg border border-(--color-border-primary) bg-(--color-bg-elevated) shadow-lg"
            style={{ top: 0, left: 0 }}
          >
            {/* Search input */}
            <div className="p-2 border-b border-(--color-border-primary) group-data-[side=top]/panel:border-t group-data-[side=top]/panel:border-b-0">
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
                  aria-label={t("aria.filterOptions")}
                  aria-controls={listId}
                  aria-activedescendant={
                    highlightedIndex >= 0 && filtered[highlightedIndex]
                      ? `${listId}-${highlightedIndex}`
                      : undefined
                  }
                  className="w-full ps-8 pe-3 py-1.5 max-lg:min-h-10 text-base sm:text-sm rounded-sm border border-(--color-border-input) bg-(--color-bg-secondary) text-(--color-text-primary) placeholder:text-(--color-text-tertiary) focus:outline-none focus:border-primary-500"
                  placeholder="..."
                />
              </div>
            </div>

            {/* Options list */}
            <ul
              ref={listRef}
              id={listId}
              className="overflow-y-auto overscroll-contain py-1"
              style={{ maxHeight: LIST_MAX }}
              role="listbox"
            >
              {filtered.length > 0 ? (
                filtered.map((option, i) => (
                  <li
                    key={option.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={option.value === value}
                    className={cn(
                      // Taller rows below lg, where an option is chosen with a finger.
                      "px-3 py-2.5 lg:py-2 text-sm cursor-pointer transition-colors",
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
