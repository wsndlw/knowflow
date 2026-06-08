import {
  readSpreadsheet,
  type SpreadsheetKind,
} from "./spreadsheet-reader.js";

export type BatchImportRow = {
  row: number;
  title: string;
  content: string;
  summary: string | null;
};

export type BatchImportParseResult = {
  rows: BatchImportRow[];
  skipped: number;
  errors: { row: number; reason: string }[];
};

const MAX_IMPORT_ROWS = 500;

const TITLE_HEADERS = new Set(["title", "\u6807\u9898"]);
const CONTENT_HEADERS = new Set(["content", "\u5185\u5bb9"]);
const SUMMARY_HEADERS = new Set(["summary", "\u6458\u8981"]);

export async function parseSpreadsheetForBatchImport(
  buffer: Buffer,
  kind: SpreadsheetKind,
): Promise<BatchImportParseResult> {
  const spreadsheet = await readSpreadsheet(buffer, kind);
  const firstSheet = spreadsheet.sheets[0];
  if (firstSheet === undefined) {
    return { rows: [], skipped: 0, errors: [{ row: 1, reason: "表格文件没有工作表" }] };
  }

  const rows = firstSheet.rows;
  if (rows.length === 0) {
    return { rows: [], skipped: 0, errors: [] };
  }

  const mapping = detectMapping(rows[0] ?? []);
  const dataStartIndex = mapping.hasHeader ? 1 : 0;
  const candidateRows = rows.slice(dataStartIndex);
  if (candidateRows.length > MAX_IMPORT_ROWS) {
    throw new Error("批量导入最多支持 500 行");
  }

  const result: BatchImportParseResult = { rows: [], skipped: 0, errors: [] };
  candidateRows.forEach((row, index) => {
    const physicalRow = dataStartIndex + index + 1;
    if (row.every((cell) => cell.length === 0)) {
      result.skipped += 1;
      return;
    }

    const title = (row[mapping.titleIndex] ?? "").trim();
    const content = (row[mapping.contentIndex] ?? "").trim();
    const summary = mapping.summaryIndex === null ? "" : (row[mapping.summaryIndex] ?? "").trim();
    if (title.length === 0 || content.length === 0) {
      result.skipped += 1;
      result.errors.push({ row: physicalRow, reason: "标题和内容不能为空" });
      return;
    }

    result.rows.push({
      row: physicalRow,
      title: title.slice(0, 255),
      content: content.slice(0, 20000),
      summary: summary.length === 0 ? null : summary.slice(0, 2000),
    });
  });

  return result;
}

function detectMapping(header: string[]): {
  hasHeader: boolean;
  titleIndex: number;
  contentIndex: number;
  summaryIndex: number | null;
} {
  const normalizedHeader = header.map((cell) => cell.trim().toLowerCase());
  const titleIndex = normalizedHeader.findIndex((cell) => TITLE_HEADERS.has(cell));
  const contentIndex = normalizedHeader.findIndex((cell) => CONTENT_HEADERS.has(cell));
  const summaryIndex = normalizedHeader.findIndex((cell) => SUMMARY_HEADERS.has(cell));

  if (titleIndex >= 0 && contentIndex >= 0) {
    return {
      hasHeader: true,
      titleIndex,
      contentIndex,
      summaryIndex: summaryIndex >= 0 ? summaryIndex : null,
    };
  }

  return { hasHeader: false, titleIndex: 0, contentIndex: 1, summaryIndex: null };
}
