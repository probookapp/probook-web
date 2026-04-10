import * as XLSX from "xlsx";
import { resolveHeader } from "./import-columns";

/**
 * Parse an uploaded import file (CSV or XLSX) into normalized rows.
 * Headers are resolved to internal keys using the localized column mappings.
 * Returns an array of objects keyed by internal column names.
 */
export async function parseImportFile(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const isXlsx =
    file.name.endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (isXlsx) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

async function parseCsv(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const text = await file.text();
  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = lines[0].split(",").map((h) => h.trim());
  const headers = rawHeaders.map((h) => resolveHeader(h) || h.toLowerCase());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
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

  return { headers, rows };
}
