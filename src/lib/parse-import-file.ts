import * as XLSX from "xlsx";
import { resolveHeader } from "./import-columns";

/** Import caps: keep uploads small enough to parse and insert safely. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5000;

/** User-facing import file problem (too large, too many rows, ...). */
export class ImportFileError extends Error {}

/**
 * Parse an uploaded import file (CSV or XLSX) into normalized rows.
 * Headers are resolved to internal keys using the localized column mappings.
 * Returns an array of objects keyed by internal column names.
 *
 * Throws {@link ImportFileError} when the file exceeds the size or row caps.
 */
export async function parseImportFile(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError(
      `File is too large (max ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB)`
    );
  }

  const isXlsx =
    file.name.endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (isXlsx) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

function assertRowCap(rowCount: number): void {
  if (rowCount > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Too many rows (max ${MAX_IMPORT_ROWS} data rows)`);
  }
}

/**
 * RFC 4180-style CSV parser: handles double-quoted fields, escaped quotes
 * ("") inside quoted fields, and commas / CR / LF inside quoted fields.
 * Accepts LF, CRLF and CR line endings.
 */
function parseCsvText(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote inside a quoted field
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++; // CRLF
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  // Flush the last record when the file doesn't end with a newline.
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

async function parseCsv(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const text = await file.text();
  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, "");
  // Drop fully-empty records (blank lines)
  const records = parseCsvText(clean).filter((r) => r.some((v) => v.trim()));
  if (records.length < 2) {
    return { headers: [], rows: [] };
  }
  assertRowCap(records.length - 1);

  const rawHeaders = records[0].map((h) => h.trim());
  const headers = rawHeaders.map((h) => resolveHeader(h) || h.toLowerCase());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

async function parseXlsx(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (data.length < 2) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = data[0].map((h) => String(h).trim());
  const headers = rawHeaders.map((h) => resolveHeader(h) || h.toLowerCase());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < data.length; i++) {
    const values = data[i];
    // Skip empty rows
    if (!values || values.every((v) => !String(v).trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = String(values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  assertRowCap(rows.length);

  return { headers, rows };
}
