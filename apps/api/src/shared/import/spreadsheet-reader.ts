import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import type { CellValue } from "read-excel-file/node";

type SpreadsheetCellValue = CellValue | null;

export type SpreadsheetKind = "csv" | "excel";

export type SpreadsheetSheet = {
  name: string;
  rows: string[][];
};

export type SpreadsheetReadResult = {
  sheets: SpreadsheetSheet[];
  rowCount: number;
};

export async function readSpreadsheet(
  buffer: Buffer,
  kind: SpreadsheetKind,
): Promise<SpreadsheetReadResult> {
  if (kind === "csv") {
    const rows = parseCsvRows(buffer);
    return {
      sheets: rows.length === 0 ? [] : [{ name: "Sheet1", rows }],
      rowCount: rows.length,
    };
  }

  const parsedSheets = await readXlsxFile(buffer);
  const sheets = parsedSheets
    .map((sheet) => ({ name: sheet.sheet, rows: worksheetRows(sheet.data) }))
    .filter((sheet) => sheet.rows.length > 0);
  const rowCount = sheets.reduce((total, sheet) => total + sheet.rows.length, 0);

  return { sheets, rowCount };
}

function parseCsvRows(buffer: Buffer): string[][] {
  const records = parseCsv(buffer, {
    bom: true,
    relaxColumnCount: true,
    skipEmptyLines: true,
  }) as unknown;

  if (!Array.isArray(records)) {
    throw new Error("CSV parse result is invalid");
  }

  return records
    .filter((record): record is unknown[] => Array.isArray(record))
    .map((record) => record.map((cell) => normalizeCell(cell)));
}

function worksheetRows(rows: SpreadsheetCellValue[][]): string[][] {
  return rows
    .map((row) => {
      const normalized = row.map((value) => normalizeCell(value));
      return trimTrailingEmptyCells(normalized);
    })
    .filter((row) => row.some((cell) => cell.length > 0));
}

function normalizeCell(cell: unknown): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  if (
    typeof cell === "string" ||
    typeof cell === "number" ||
    typeof cell === "boolean" ||
    typeof cell === "bigint"
  ) {
    return normalizeText(String(cell));
  }
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  if (typeof cell === "object") {
    return normalizeObjectCell(cell as Record<string, unknown>);
  }
  return "";
}

function normalizeObjectCell(cell: Record<string, unknown>): string {
  const text = cell["text"];
  if (typeof text === "string") {
    return normalizeText(text);
  }

  const result = cell["result"];
  if (
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean" ||
    typeof result === "bigint"
  ) {
    return normalizeText(String(result));
  }

  const richText = cell["richText"];
  if (Array.isArray(richText)) {
    return normalizeText(
      richText
        .map((part) =>
          typeof part === "object" &&
          part !== null &&
          typeof (part as Record<string, unknown>)["text"] === "string"
            ? ((part as Record<string, unknown>)["text"] as string)
            : "",
        )
        .join(""),
    );
  }

  return "";
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function trimTrailingEmptyCells(row: string[]): string[] {
  let lastIndex = row.length - 1;
  while (lastIndex >= 0 && row[lastIndex]?.length === 0) {
    lastIndex -= 1;
  }
  return row.slice(0, lastIndex + 1);
}
