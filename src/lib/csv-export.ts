// Shared client-side CSV export helper.
//
// Matches the format used by the Reports page: values are joined with a
// ';' delimiter and numbers use a comma as the decimal separator (French/
// Excel-friendly). A UTF-8 BOM is prepended so Excel opens Arabic text and
// accented characters correctly.

export interface CsvColumn<T> {
  /** Column header label (already translated). */
  header: string;
  /** Extracts the cell value for a given row. */
  accessor: (row: T) => string | number | null | undefined;
}

const BOM = "﻿";

/** Formats a single cell value, matching the Reports export conventions. */
function formatCell(value: string | number | null | undefined): string {
  if (value == null) return "";

  // Numbers: use comma as decimal separator (matches ReportsPage export).
  const raw =
    typeof value === "number" ? value.toString().replace(".", ",") : String(value);

  // Quote the field when it contains the delimiter, quotes or line breaks.
  if (/[;"\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Builds a ';'-delimited CSV (with UTF-8 BOM) from `rows` using the given
 * `columns` spec and triggers a browser download named `filename`.
 *
 * Only the rows passed in are exported — callers pass the already
 * filtered/loaded list, so no extra fetching happens here.
 */
export function exportToCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  filename: string
): void {
  const headerLine = columns.map((c) => formatCell(c.header)).join(";");
  const dataLines = rows.map((row) =>
    columns.map((c) => formatCell(c.accessor(row))).join(";")
  );
  const csvContent = BOM + [headerLine, ...dataLines].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
