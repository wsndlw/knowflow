import { db, documents, files, knowledgeBases, parentChunks, childChunks } from "@knowflow/db";
import type { DocumentSourceType } from "@knowflow/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import mammoth from "mammoth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

import { readSpreadsheet } from "../../../shared/import/spreadsheet-reader.js";
import {
  createAliyunLlmClient,
  EXPECTED_EMBEDDING_DIMENSION,
} from "../../../shared/llm/aliyun-llm.js";
import { callModelByUsage } from "../../../shared/llm/model-usage-client.js";
import { resolveLocalStorageRoot } from "../../../shared/storage/local-storage.js";
import { createImprovementQueue } from "../knowledge-base/knowledge-improvement-queue.js";
import type { DocumentProcessResult } from "./document-queue.js";
import { publishDocumentProgress } from "./document-progress.js";

const PARENT_TARGET_CHARS = 2600;
const PARENT_MAX_CHARS = 4000;
const CHILD_TARGET_CHARS = 900;
const CHILD_OVERLAP_CHARS = 120;
const EMBEDDING_BATCH_SIZE = 10;
const MAX_SPREADSHEET_ROWS = 10000;
const MAX_VISION_IMAGES_PER_DOCUMENT = 20;
const DECORATIVE_IMAGE_MIN_LONG_EDGE = 120;
const DECORATIVE_IMAGE_MIN_AREA = 10000;
const PDF_SCANNED_MIN_CHARS_PER_PAGE = 40;
const PDF_SCREENSHOT_WIDTH = 1400;
const VISION_IMAGE_PROMPT =
  "图中若主要是文字/表格，转写为 markdown（表格务必保留为 markdown 表格）；若是照片/图表/示意图，用一段简洁中文描述其内容与关键信息。";
const CLEANER_VERSION = "document-cleaner-v1";
const CHUNKER_VERSION = "semantic-chunker-v1";
const PAGE_BREAK_MARKER_PREFIX = "[[KNOWFLOW_PAGE_BREAK:";
const DOCUMENT_PROCESS_VERSION_KEY = "__processVersion";

type ProcessableDocument = {
  id: string;
  knowledgeBaseId: string;
  sourceType: DocumentSourceType;
  sourceUri: string | null;
  fileId: string | null;
  fileType: string | null;
  title: string;
  embeddingModel: string;
  metadata: unknown;
};

type ParsedDocument = {
  text: string;
  metadata: {
    parser:
      | "pdf-parse"
      | "plain-text"
      | "mammoth"
      | "csv-parse"
      | "read-excel-file"
      | "@e965/xlsx"
      | "vision-ocr";
    parsedAt: string;
    textLength: number;
    originalFormat?: "docx";
    sheetCount?: number;
    rowCount?: number;
    mimeType?: string;
    rawTextLength: number;
    cleanedTextLength: number;
    cleanerVersion: string;
    cleaningWarnings: string[];
    pageInfoUnavailable?: true;
    pdfPageCount?: number;
    scannedPdfDetected?: true;
    visionImageLimit?: number;
    visionImageCount?: number;
    visionImageInsertedCount?: number;
    visionImageSkippedCount?: number;
    visionImageFailedCount?: number;
    visionImageTruncated?: true;
    multimodalWarnings?: string[];
  };
};

type ParsedDocumentExtraMetadata = Partial<
  Omit<
    ParsedDocument["metadata"],
    | "parser"
    | "parsedAt"
    | "textLength"
    | "rawTextLength"
    | "cleanedTextLength"
    | "cleanerVersion"
    | "cleaningWarnings"
    | "pageInfoUnavailable"
  >
>;

type BoundaryType = "heading" | "table" | "list" | "paragraph" | "sentence" | "length";

type ParentChunkInput = {
  title: string | null;
  content: string;
  headingPath: string[];
  boundaryType: BoundaryType;
  pageStart: number | null;
  pageEnd: number | null;
  lines: PageAwareLine[];
};

type ChildChunkInput = {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  boundaryType: BoundaryType;
};

type PageAwareLine = {
  text: string;
  page: number | null;
};

type TextBlock = {
  content: string;
  boundaryType: BoundaryType;
  lines: PageAwareLine[];
};

type SemanticParentPiece = {
  content: string;
  boundaryType: BoundaryType;
  pageStart: number | null;
  pageEnd: number | null;
};

type ProcessJobKey = {
  documentId: string;
  processVersion: number | null;
};

type VisionImageInput = {
  buffer: Buffer;
  mimeType: string;
  sourceLabel: string;
  width: number | null;
  height: number | null;
  skipDecorative: boolean;
};

type CapturedDocxImage = VisionImageInput & {
  placeholder: string;
};

type VisionBudget = {
  limit: number;
  used: number;
};

type VisionStats = {
  attempted: number;
  inserted: number;
  skippedDecorative: number;
  failed: number;
  truncated: boolean;
  warnings: string[];
};

export type VisionDescription = {
  sourceLabel: string;
  text: string;
  pageNumber: number | null;
};

export async function processDocument(documentJobId: string): Promise<DocumentProcessResult> {
  const jobKey = decodeProcessJobDocumentId(documentJobId);
  try {
    const document = await findProcessableDocument(jobKey.documentId);
    if (document === undefined) {
      throw new Error(`未找到文档: ${jobKey.documentId}`);
    }
    const currentProcessVersion = readProcessVersion(document.metadata);
    if (jobKey.processVersion !== null && currentProcessVersion !== jobKey.processVersion) {
      return {
        documentId: jobKey.documentId,
        status: "completed",
      };
    }
    const processVersion = jobKey.processVersion ?? currentProcessVersion;
    const claimed = await markParsing(document.id, processVersion);
    if (!claimed) {
      return {
        documentId: document.id,
        status: "completed",
      };
    }

    await publishProgress(document.id, "pending", 5, "文档处理已进入队列");
    await publishProgress(document.id, "parsing", 15, "正在解析文档文本");
    const parsed = await parseDocument(document);
    await markParsed(document.id, parsed, processVersion);
    await markChunking(document.id, processVersion);
    await publishProgress(document.id, "chunking", 35, "正在切分文档内容");
    await replaceChunks(document, parsed, processVersion);
    await markChunked(document.id, processVersion);
    await publishProgress(document.id, "embedding", 60, "正在向量化文档片段");
    await embedChildChunks(document, processVersion);
    await markCompleted(document.id, processVersion);
    await enqueueDocumentExtractionAfterCompletion(document.id, parsed.metadata.parsedAt);
    await publishProgress(document.id, "completed", 100, "文档处理已完成");

    return {
      documentId: document.id,
      status: "completed",
    };
  } catch (error) {
    await markFailed(jobKey.documentId, error, jobKey.processVersion);
    await publishProgress(
      jobKey.documentId,
      "failed",
      100,
      error instanceof Error ? error.message : "文档处理失败",
    );
    return {
      documentId: jobKey.documentId,
      status: "failed",
    };
  }
}

async function enqueueDocumentExtractionAfterCompletion(
  documentId: string,
  parsedAt: string,
): Promise<void> {
  try {
    await enqueueDocumentExtraction(documentId, parsedAt);
  } catch (error) {
    console.warn(`文档 ${documentId} 已完成处理，但知识抽取任务入队失败`, error);
  }
}

async function enqueueDocumentExtraction(documentId: string, parsedAt: string): Promise<void> {
  const queue = createImprovementQueue();
  try {
    await queue.add(
      "document_extraction",
      { documentId },
      {
        jobId: `document-extraction-${documentId}-${parsedAt.replace(/[^0-9A-Za-z_-]/g, "")}`,
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    );
  } finally {
    await queue.close();
  }
}

async function publishProgress(
  documentId: string,
  stage: "pending" | "parsing" | "chunking" | "embedding" | "completed" | "failed",
  percent: number,
  message: string,
): Promise<void> {
  await publishDocumentProgress({
    documentId,
    stage,
    percent,
    message,
  });
}

async function findProcessableDocument(
  documentId: string,
): Promise<ProcessableDocument | undefined> {
  const [document] = await db
    .select({
      id: documents.id,
      knowledgeBaseId: documents.knowledgeBaseId,
      sourceType: documents.sourceType,
      sourceUri: documents.sourceUri,
      fileId: documents.fileId,
      fileType: documents.fileType,
      title: documents.title,
      embeddingModel: knowledgeBases.embeddingModel,
      metadata: documents.metadata,
    })
    .from(documents)
    .innerJoin(knowledgeBases, eq(knowledgeBases.id, documents.knowledgeBaseId))
    .where(and(eq(documents.id, documentId), isNull(knowledgeBases.deletedAt)))
    .limit(1);

  return document;
}

async function markParsing(documentId: string, processVersion: number): Promise<boolean> {
  const rows = await db
    .update(documents)
    .set({
      processStatus: "parsing",
      parseStatus: "parsing",
      chunkStatus: "pending",
      embeddingStatus: "pending",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.id, documentId),
        inArray(documents.processStatus, ["pending", "failed"]),
        processVersionCondition(processVersion),
      ),
    )
    .returning({ id: documents.id });
  return rows.length > 0;
}

async function markParsed(
  documentId: string,
  parsed: ParsedDocument,
  processVersion: number,
): Promise<void> {
  await ensureUpdated(
    db
      .update(documents)
      .set({
        processStatus: "chunking",
        parseStatus: "completed",
        metadata: sql`${documents.metadata} || ${JSON.stringify(parsed.metadata)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), processVersionCondition(processVersion)))
      .returning({ id: documents.id }),
  );
}

async function markChunking(documentId: string, processVersion: number): Promise<void> {
  await ensureUpdated(
    db
      .update(documents)
      .set({
        processStatus: "chunking",
        chunkStatus: "chunking",
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), processVersionCondition(processVersion)))
      .returning({ id: documents.id }),
  );
}

async function markChunked(documentId: string, processVersion: number): Promise<void> {
  await ensureUpdated(
    db
      .update(documents)
      .set({
        processStatus: "embedding",
        chunkStatus: "completed",
        embeddingStatus: "embedding",
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), processVersionCondition(processVersion)))
      .returning({ id: documents.id }),
  );
}

async function markCompleted(documentId: string, processVersion: number): Promise<void> {
  await ensureUpdated(
    db
      .update(documents)
      .set({
        processStatus: "completed",
        embeddingStatus: "completed",
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), processVersionCondition(processVersion)))
      .returning({ id: documents.id }),
  );
}

async function markFailed(
  documentId: string,
  error: unknown,
  processVersion: number | null,
): Promise<void> {
  const condition =
    processVersion === null
      ? eq(documents.id, documentId)
      : and(eq(documents.id, documentId), processVersionCondition(processVersion));
  await db
    .update(documents)
    .set({
      processStatus: "failed",
      parseStatus: "failed",
      chunkStatus: "failed",
      embeddingStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "文档处理失败",
      updatedAt: new Date(),
    })
    .where(condition);
}

async function replaceChunks(
  document: ProcessableDocument,
  parsed: ParsedDocument,
  processVersion: number,
): Promise<void> {
  const parents = splitParentChunks(parsed.text);
  await db.transaction(async (tx) => {
    const [currentDocument] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, document.id), processVersionCondition(processVersion)))
      .limit(1);
    if (currentDocument === undefined) {
      throw new Error("文档处理版本已过期");
    }

    await tx.delete(childChunks).where(eq(childChunks.documentId, document.id));
    await tx.delete(parentChunks).where(eq(parentChunks.documentId, document.id));

    let nextChildIndex = 0;
    for (const parent of parents) {
      const [createdParent] = await tx
        .insert(parentChunks)
        .values({
          documentId: document.id,
          knowledgeBaseId: document.knowledgeBaseId,
          title: parent.title,
          content: parent.content,
          headingPath: parent.headingPath,
          pageStart: parent.pageStart,
          pageEnd: parent.pageEnd,
          metadata: {
            chunkerVersion: CHUNKER_VERSION,
            boundaryType: parent.boundaryType,
            processVersion,
          },
        })
        .returning({ id: parentChunks.id });
      if (createdParent === undefined) {
        throw new Error("创建文档父片段失败");
      }

      const children = splitChildChunks(parent.content);
      if (children.length === 0) {
        throw new Error("文档切分未生成子片段");
      }

      await tx.insert(childChunks).values(
        children.map((child) => ({
          parentChunkId: createdParent.id,
          documentId: document.id,
          knowledgeBaseId: document.knowledgeBaseId,
          content: child.content,
          chunkIndex: nextChildIndex++,
          tokenCount: child.tokenCount,
          metadata: {
            parentTitle: parent.title,
            headingPath: parent.headingPath,
            chunkerVersion: CHUNKER_VERSION,
            boundaryType: child.boundaryType,
            processVersion,
            pageStart: parent.pageStart,
            pageEnd: parent.pageEnd,
          },
          embeddingStatus: "pending" as const,
        })),
      );
    }
  });
}

async function embedChildChunks(
  document: ProcessableDocument,
  processVersion: number,
): Promise<void> {
  const [currentDocument] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, document.id), processVersionCondition(processVersion)))
    .limit(1);
  if (currentDocument === undefined) {
    throw new Error("文档处理版本已过期");
  }

  const chunks = await db
    .select({
      id: childChunks.id,
      content: childChunks.content,
    })
    .from(childChunks)
    .where(eq(childChunks.documentId, document.id))
    .orderBy(asc(childChunks.chunkIndex));
  if (chunks.length === 0) {
    throw new Error("文档没有可向量化的子片段");
  }

  const client = createAliyunLlmClient();
  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const embeddings = await client.embedTexts(
      batch.map((chunk) => chunk.content),
      document.embeddingModel,
    );
    if (embeddings.length !== batch.length) {
      throw new Error("向量化返回数量与输入片段数量不一致");
    }

    await db.transaction(async (tx) => {
      for (let index = 0; index < batch.length; index += 1) {
        const chunk = batch[index];
        const embedding = embeddings[index];
        if (chunk === undefined || embedding === undefined) {
          throw new Error("向量化返回内容不完整");
        }
        if (embedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
          throw new Error(`向量维度不匹配：${String(embedding.length)}`);
        }

        await tx
          .update(childChunks)
          .set({
            embedding,
            searchVector: sql`to_tsvector('simple', ${chunk.content})`,
            embeddingStatus: "completed",
            updatedAt: new Date(),
          })
          .where(eq(childChunks.id, chunk.id));
      }
    });
  }
}

export function splitParentChunks(text: string): ParentChunkInput[] {
  const sections = splitHeadingSections(text);
  const parents: ParentChunkInput[] = [];

  for (const section of sections) {
    const pieces = splitSemanticParentLines(section.lines);
    pieces.forEach((piece, index) => {
      parents.push({
        title:
          index === 0
            ? section.title
            : section.title === null
              ? null
              : `${section.title} (${String(index + 1)})`,
        content: piece.content,
        headingPath: section.headingPath,
        boundaryType: index === 0 && section.title !== null ? "heading" : piece.boundaryType,
        pageStart: piece.pageStart,
        pageEnd: piece.pageEnd,
        lines: [],
      });
    });
  }

  return parents;
}

function splitHeadingSections(text: string): ParentChunkInput[] {
  const lines = toPageAwareLines(text);
  const sections: ParentChunkInput[] = [];
  let currentTitle: string | null = null;
  let currentHeadingPath: string[] = [];
  let currentLines: PageAwareLine[] = [];

  function flush(): void {
    const content = currentLines
      .map((line) => line.text)
      .join("\n")
      .trim();
    if (content.length === 0) {
      return;
    }
    const range = pageRange(currentLines);
    sections.push({
      title: currentTitle,
      headingPath: currentHeadingPath,
      content,
      boundaryType: currentTitle === null ? inferBoundaryType(content) : "heading",
      pageStart: range.pageStart,
      pageEnd: range.pageEnd,
      lines: [...currentLines],
    });
    currentLines = [];
  }

  for (const line of lines) {
    const heading = detectHeadingLine(line.text);
    if (heading !== null) {
      flush();
      const { level, title } = heading;
      currentHeadingPath = [...currentHeadingPath.slice(0, level - 1), title];
      currentTitle = title;
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections.length > 0
    ? sections
    : splitSemanticParentLines(toPageAwareLines(stripPageMarkers(text))).map((piece, index) => ({
        title: index === 0 ? null : `Part ${String(index + 1)}`,
        headingPath: [],
        boundaryType: piece.boundaryType,
        pageStart: piece.pageStart,
        pageEnd: piece.pageEnd,
        content: piece.content,
        lines: [],
      }));
}

function splitChildChunks(content: string): ChildChunkInput[] {
  return splitByLength(content, CHILD_TARGET_CHARS, CHILD_OVERLAP_CHARS).map((chunk, index) => ({
    content: chunk,
    chunkIndex: index,
    tokenCount: estimateTokenCount(chunk),
    boundaryType: inferBoundaryType(chunk),
  }));
}

function splitSemanticParentLines(lines: PageAwareLine[]): SemanticParentPiece[] {
  const blocks = splitTextBlocks(lines);
  const chunks: SemanticParentPiece[] = [];
  let currentLines: PageAwareLine[] = [];

  function pushCurrent(): void {
    const content = currentLines
      .map((line) => line.text)
      .join("\n")
      .trim();
    if (content.length > 0) {
      const range = pageRange(currentLines);
      chunks.push({
        content,
        boundaryType: inferBoundaryType(content),
        pageStart: range.pageStart,
        pageEnd: range.pageEnd,
      });
    }
    currentLines = [];
  }

  for (const block of blocks) {
    const pieces =
      block.content.length > PARENT_MAX_CHARS
        ? splitBlockBySentenceThenLength(block, PARENT_TARGET_CHARS, PARENT_MAX_CHARS)
        : [block.lines];
    for (const piece of pieces) {
      if (currentLines.length === 0) {
        currentLines = piece;
        continue;
      }
      const currentContent = currentLines
        .map((line) => line.text)
        .join("\n")
        .trim();
      const pieceContent = piece
        .map((line) => line.text)
        .join("\n")
        .trim();
      const next = `${currentContent}\n\n${pieceContent}`;
      if (
        next.length <= PARENT_TARGET_CHARS ||
        currentContent.length < Math.floor(PARENT_TARGET_CHARS * 0.65)
      ) {
        currentLines = [...currentLines, { text: "", page: null }, ...piece];
      } else {
        pushCurrent();
        currentLines = piece;
      }
    }
  }
  pushCurrent();

  return chunks.flatMap((chunk) =>
    chunk.content.length <= PARENT_MAX_CHARS
      ? [chunk]
      : splitByLength(chunk.content, PARENT_MAX_CHARS, 0).map((content) => ({
          content,
          boundaryType: inferBoundaryType(content),
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
        })),
  );
}

function splitTextBlocks(lines: PageAwareLine[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let currentLines: PageAwareLine[] = [];
  let currentType: BoundaryType | null = null;
  let currentPage: number | null | undefined;

  function flush(): void {
    const text = currentLines
      .map((line) => line.text)
      .join("\n")
      .trim();
    if (text.length > 0) {
      blocks.push({
        content: text,
        boundaryType: currentType ?? "paragraph",
        lines: [...currentLines],
      });
    }
    currentLines = [];
    currentType = null;
    currentPage = undefined;
  }

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed.length === 0) {
      flush();
      continue;
    }
    const type = classifyBlockLine(trimmed);
    if (
      currentType !== null &&
      (type !== currentType ||
        type === "heading" ||
        currentType === "paragraph" ||
        line.page !== currentPage)
    ) {
      flush();
    }
    currentType = type;
    currentPage = line.page;
    currentLines.push(line);
  }
  flush();

  return blocks;
}

function splitBlockBySentenceThenLength(
  block: TextBlock,
  targetChars: number,
  maxChars: number,
): PageAwareLine[][] {
  const sentences = block.content.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [block.content];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const next = current.length === 0 ? trimmed : `${current}${trimmed}`;
    if (next.length <= targetChars || current.length < Math.floor(targetChars * 0.5)) {
      current = next;
    } else {
      chunks.push(current);
      current = trimmed;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  const range = pageRange(block.lines);
  return chunks.flatMap((chunk) =>
    chunk.length <= maxChars
      ? [[{ text: chunk, page: range.pageStart }]]
      : splitByLength(chunk, maxChars, 0).map((content) => [
          { text: content, page: range.pageStart },
        ]),
  );
}

function detectHeadingLine(line: string): { title: string; level: number } | null {
  const trimmed = line.trim();
  const markdown = /^(#{1,6})\s+(.+)$/.exec(trimmed);
  if (markdown !== null) {
    return { level: markdown[1]?.length ?? 1, title: markdown[2]?.trim() ?? "" };
  }

  const numbered = /^(\d+(?:\.\d+){0,3})[.、]?\s+(.{2,80})$/.exec(trimmed);
  if (numbered !== null && !/[。！？.!?]$/.test(trimmed)) {
    const level = Math.min(numbered[1]?.split(".").length ?? 1, 6);
    return { level, title: trimmed };
  }

  const chineseChapter = /^(第[一二三四五六七八九十百千万\d]+[章节篇部])\s*(.{0,80})$/.exec(
    trimmed,
  );
  if (chineseChapter !== null) {
    return { level: 1, title: trimmed };
  }

  const chineseNumbered =
    /^([一二三四五六七八九十]+[、.．]|（[一二三四五六七八九十]+）)\s*(.{2,80})$/.exec(trimmed);
  if (chineseNumbered !== null && !/[。！？.!?]$/.test(trimmed)) {
    return { level: trimmed.startsWith("（") ? 3 : 2, title: trimmed };
  }

  return null;
}

function classifyBlockLine(line: string): BoundaryType {
  if (detectHeadingLine(line) !== null) {
    return "heading";
  }
  if (isMarkdownTableLine(line)) {
    return "table";
  }
  if (isListLine(line)) {
    return "list";
  }
  return "paragraph";
}

function inferBoundaryType(content: string): BoundaryType {
  const firstLine = content.trim().split("\n")[0] ?? "";
  return classifyBlockLine(firstLine);
}

function isMarkdownTableLine(line: string): boolean {
  return /^\|.*\|$/.test(line.trim());
}

function isListLine(line: string): boolean {
  return /^(\s*[-*+]\s+|\s*\d+[.)、]\s+|\s*[（(]?[一二三四五六七八九十]+[）).、]\s+)/.test(line);
}

function toPageAwareLines(text: string): PageAwareLine[] {
  const lines: PageAwareLine[] = [];
  let currentPage: number | null = text.includes(PAGE_BREAK_MARKER_PREFIX) ? 1 : null;
  for (const line of text.split("\n")) {
    const marker = pageMarkerNumber(line);
    if (marker !== null) {
      currentPage = marker;
      continue;
    }
    lines.push({ text: line, page: currentPage });
  }
  return lines;
}

function pageMarkerNumber(line: string): number | null {
  const match = new RegExp(`^${escapeRegExp(PAGE_BREAK_MARKER_PREFIX)}(\\d+)\\]\\]$`).exec(
    line.trim(),
  );
  if (match === null) {
    return null;
  }
  const page = Number.parseInt(match[1] ?? "", 10);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function stripPageMarkers(text: string): string {
  return text
    .split("\n")
    .filter((line) => pageMarkerNumber(line) === null)
    .join("\n");
}

function pageRange(lines: PageAwareLine[]): { pageStart: number | null; pageEnd: number | null } {
  const pages = lines.map((line) => line.page).filter((page): page is number => page !== null);
  if (pages.length === 0) {
    return { pageStart: null, pageEnd: null };
  }
  return {
    pageStart: Math.min(...pages),
    pageEnd: Math.max(...pages),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitByLength(text: string, targetChars: number, overlapChars: number): string[] {
  const normalized = text.trim();
  if (normalized.length <= targetChars) {
    return normalized.length === 0 ? [] : [normalized];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const hardEnd = Math.min(start + targetChars, normalized.length);
    let end = hardEnd;
    if (hardEnd < normalized.length) {
      const newline = normalized.lastIndexOf("\n\n", hardEnd);
      const sentence = normalized.lastIndexOf("\u3002", hardEnd);
      const space = normalized.lastIndexOf(" ", hardEnd);
      const candidate = Math.max(newline, sentence, space);
      if (candidate > start + Math.floor(targetChars * 0.55)) {
        end = candidate + 1;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function decodeProcessJobDocumentId(documentJobId: string): ProcessJobKey {
  const separatorIndex = documentJobId.lastIndexOf(DOCUMENT_PROCESS_VERSION_KEY);
  if (separatorIndex < 0) {
    return { documentId: documentJobId, processVersion: null };
  }
  const documentId = documentJobId.slice(0, separatorIndex);
  const versionText = documentJobId.slice(separatorIndex + DOCUMENT_PROCESS_VERSION_KEY.length);
  const processVersion = Number.parseInt(versionText, 10);
  if (documentId.length === 0 || !Number.isInteger(processVersion) || processVersion <= 0) {
    return { documentId: documentJobId, processVersion: null };
  }
  return { documentId, processVersion };
}

function readProcessVersion(metadata: unknown): number {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return 0;
  }
  const value = (metadata as Record<string, unknown>)["processVersion"];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function processVersionCondition(processVersion: number) {
  return sql`coalesce((${documents.metadata}->>'processVersion')::integer, 0) = ${processVersion}`;
}

async function ensureUpdated(update: Promise<{ id: string }[]>): Promise<void> {
  const rows = await update;
  if (rows.length === 0) {
    throw new Error("文档处理版本已过期");
  }
}

async function parseDocument(document: ProcessableDocument): Promise<ParsedDocument> {
  const absolutePath = await resolveDocumentPath(document);
  const buffer = await readFile(absolutePath);
  if (document.sourceType === "pdf") {
    return parsePdfDocument(buffer);
  }
  if (document.sourceType === "markdown" || document.sourceType === "txt") {
    return toParsedDocument(buffer.toString("utf8"), "plain-text");
  }
  if (document.sourceType === "docx") {
    return parseDocxDocument(buffer);
  }
  if (document.sourceType === "csv") {
    return parseCsvExcelDocument(buffer, "csv");
  }
  if (document.sourceType === "excel") {
    return parseCsvExcelDocument(buffer, "excel");
  }
  if (document.sourceType === "image") {
    return parseImageDocument(document, buffer, newVisionStats());
  }

  throw new Error(`不支持的文档来源类型：${document.sourceType}`);
}

async function parseDocxDocument(buffer: Buffer): Promise<ParsedDocument> {
  const stats = newVisionStats();
  const images: CapturedDocxImage[] = [];
  let nextImageIndex = 0;
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        nextImageIndex += 1;
        const placeholder = `[[KNOWFLOW_DOCX_IMAGE:${String(nextImageIndex)}]]`;
        const imageBuffer = await image.readAsBuffer();
        images.push({
          placeholder,
          buffer: imageBuffer,
          mimeType: image.contentType,
          sourceLabel: `DOCX 图片 ${String(nextImageIndex)}`,
          ...readImageDimensions(imageBuffer, image.contentType),
          skipDecorative: true,
        });
        return { src: placeholder };
      }),
    },
  );
  const text = await replaceDocxImagePlaceholders(htmlToMarkdownText(result.value), images, stats);
  return toParsedDocument(text, "mammoth", {
    originalFormat: "docx",
    ...visionStatsMetadata(stats),
  });
}

async function parseCsvExcelDocument(
  buffer: Buffer,
  kind: "csv" | "excel",
): Promise<ParsedDocument> {
  const spreadsheet = await readSpreadsheet(buffer, kind);
  const sheetTexts: string[] = [];
  if (spreadsheet.rowCount > MAX_SPREADSHEET_ROWS) {
    throw new Error("表格文档不能超过 10000 行");
  }

  for (const sheet of spreadsheet.sheets) {
    sheetTexts.push(`## 工作表：${sheet.name}\n\n${rowsToMarkdownTable(sheet.rows)}`);
  }

  return toParsedDocument(sheetTexts.join("\n\n"), spreadsheet.parser, {
    sheetCount: spreadsheet.sheets.length,
    rowCount: spreadsheet.rowCount,
  });
}

async function parseImageDocument(
  document: ProcessableDocument,
  buffer: Buffer,
  stats: VisionStats,
): Promise<ParsedDocument> {
  const mimeType = document.fileType ?? "image/png";
  const text = await describeImageWithVision(
    {
      buffer,
      mimeType,
      sourceLabel: "图片文档",
      width: null,
      height: null,
      skipDecorative: false,
    },
    newVisionBudget(),
    stats,
  );
  if (text === null) {
    throw new Error("图片文档视觉 OCR 失败，请检查 OCR 模型配置后重试");
  }

  return toParsedDocument(text, "vision-ocr", { mimeType, ...visionStatsMetadata(stats) });
}

async function parsePdfDocument(buffer: Buffer): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer });
  const stats = newVisionStats();
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const pageCount = Math.max(result.total, result.pages.length, 1);
    const markedText = markPdfPages(result.pages);
    const scannedPdfDetected = isScannedPdfText(markedText, pageCount);
      const visualTexts = scannedPdfDetected
        ? await describePdfPageScreenshots(parser, pageCount, stats)
        : await describePdfEmbeddedImages(parser, stats);
    if (scannedPdfDetected && visualTexts.length === 0) {
      throw new Error("扫描件 PDF 视觉 OCR 失败，请检查 OCR 模型配置后重试");
    }
    const combinedText = buildPdfTextWithVisualDescriptions(result.pages, visualTexts);

    if (combinedText.trim().length === 0) {
      throw new Error(
        scannedPdfDetected
          ? "扫描件 PDF 无法完成图片渲染或视觉 OCR，请检查 OCR 模型配置后重试"
          : "PDF 文档没有可提取的文本内容",
      );
    }

    return toParsedDocument(combinedText, "pdf-parse", {
      pdfPageCount: pageCount,
      ...(scannedPdfDetected ? { scannedPdfDetected: true as const } : {}),
      ...visionStatsMetadata(stats),
    });
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      throw error;
    }
    throw new Error("PDF 文档解析失败，请确认文件未损坏且可读取");
  } finally {
    await parser.destroy();
  }
}

async function describePdfPageScreenshots(
  parser: PDFParse,
  pageCount: number,
  stats: VisionStats,
): Promise<VisionDescription[]> {
  const descriptions: VisionDescription[] = [];
  const budget = newVisionBudget();
  for (let page = 1; page <= pageCount; page += 1) {
    if (budget.used >= budget.limit) {
      markVisionTruncated(stats);
      break;
    }
    try {
      const result = await parser.getScreenshot({
        partial: [page],
        desiredWidth: PDF_SCREENSHOT_WIDTH,
        imageDataUrl: false,
        imageBuffer: true,
      });
      const screenshot = result.pages[0];
      if (screenshot === undefined) {
        stats.failed += 1;
        pushUniqueWarning(stats, "pdf_screenshot_empty");
        continue;
      }
      const text = await describeImageWithVision(
        {
          buffer: Buffer.from(screenshot.data),
          mimeType: "image/png",
          sourceLabel: `PDF 第 ${String(page)} 页`,
          width: screenshot.width,
          height: screenshot.height,
          skipDecorative: false,
        },
        budget,
        stats,
      );
      if (text !== null) {
        descriptions.push({ sourceLabel: `PDF 第 ${String(page)} 页`, text, pageNumber: page });
      }
    } catch (error) {
      stats.failed += 1;
      pushUniqueWarning(stats, "pdf_screenshot_failed");
      console.warn("PDF 页面渲染失败，已跳过该页视觉解析", {
        page,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return descriptions;
}

async function describePdfEmbeddedImages(
  parser: PDFParse,
  stats: VisionStats,
): Promise<VisionDescription[]> {
  const descriptions: VisionDescription[] = [];
  const budget = newVisionBudget();
  try {
    const result = await parser.getImage({
      imageThreshold: 0,
      imageDataUrl: true,
      imageBuffer: true,
    });
    for (const page of result.pages) {
      for (const image of page.images) {
        const sourceLabel = `PDF 第 ${String(page.pageNumber)} 页图片 ${image.name}`;
        const text = await describeImageWithVision(
          {
            buffer: Buffer.from(image.data),
            mimeType: mimeTypeFromDataUrl(image.dataUrl),
            sourceLabel,
            width: image.width,
            height: image.height,
            skipDecorative: true,
          },
          budget,
          stats,
        );
        if (text !== null) {
          descriptions.push({ sourceLabel, text, pageNumber: page.pageNumber });
        }
      }
    }
  } catch (error) {
    pushUniqueWarning(stats, "pdf_embedded_image_extract_failed");
    console.warn("PDF 内嵌图片提取失败，已继续处理文本层", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return descriptions;
}

async function replaceDocxImagePlaceholders(
  text: string,
  images: CapturedDocxImage[],
  stats: VisionStats,
): Promise<string> {
  let output = text;
  const budget = newVisionBudget();
  for (const image of images) {
    const description = await describeImageWithVision(image, budget, stats);
    output = output.replace(
      image.placeholder,
      description === null
        ? ""
        : formatVisionDescriptions([
            { sourceLabel: image.sourceLabel, text: description, pageNumber: null },
          ]),
    );
  }
  return output;
}

async function describeImageWithVision(
  image: VisionImageInput,
  budget: VisionBudget,
  stats: VisionStats,
): Promise<string | null> {
  if (image.skipDecorative && isDecorativeImage(image.width, image.height)) {
    stats.skippedDecorative += 1;
    return null;
  }
  if (budget.used >= budget.limit) {
    markVisionTruncated(stats);
    return null;
  }

  budget.used += 1;
  stats.attempted += 1;
  try {
    const text = (
      await callModelByUsage(
        "ocr",
        [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_IMAGE_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
        { temperature: 0, maxOutputTokens: 4000 },
      )
    ).trim();
    if (text.length === 0) {
      stats.failed += 1;
      pushUniqueWarning(stats, "vision_empty_response");
      return null;
    }
    stats.inserted += 1;
    return text;
  } catch (error) {
    stats.failed += 1;
    pushUniqueWarning(stats, "vision_call_failed");
    console.warn("视觉 OCR 调用失败，已跳过该图片", {
      sourceLabel: image.sourceLabel,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function newVisionBudget(): VisionBudget {
  return { limit: MAX_VISION_IMAGES_PER_DOCUMENT, used: 0 };
}

function newVisionStats(): VisionStats {
  return {
    attempted: 0,
    inserted: 0,
    skippedDecorative: 0,
    failed: 0,
    truncated: false,
    warnings: [],
  };
}

function visionStatsMetadata(stats: VisionStats): ParsedDocumentExtraMetadata {
  return {
    visionImageLimit: MAX_VISION_IMAGES_PER_DOCUMENT,
    visionImageCount: stats.attempted,
    visionImageInsertedCount: stats.inserted,
    visionImageSkippedCount: stats.skippedDecorative,
    visionImageFailedCount: stats.failed,
    ...(stats.truncated ? { visionImageTruncated: true as const } : {}),
    ...(stats.warnings.length > 0 ? { multimodalWarnings: stats.warnings } : {}),
  };
}

function markVisionTruncated(stats: VisionStats): void {
  if (!stats.truncated) {
    stats.truncated = true;
    pushUniqueWarning(stats, "vision_image_limit_reached");
    console.warn("文档图片数量超过视觉 OCR 调用上限，后续图片已截断", {
      limit: MAX_VISION_IMAGES_PER_DOCUMENT,
    });
  }
}

function pushUniqueWarning(stats: VisionStats, warning: string): void {
  if (!stats.warnings.includes(warning)) {
    stats.warnings.push(warning);
  }
}

function markPdfPages(pages: { num: number; text: string }[]): string {
  return buildPdfTextWithVisualDescriptions(pages, []);
}

export function buildPdfTextWithVisualDescriptions(
  pages: { num: number; text: string }[],
  descriptions: VisionDescription[],
): string {
  const descriptionsByPage = new Map<number, VisionDescription[]>();
  const unpagedDescriptions: VisionDescription[] = [];
  for (const description of descriptions) {
    if (description.pageNumber === null) {
      unpagedDescriptions.push(description);
      continue;
    }
    const current = descriptionsByPage.get(description.pageNumber) ?? [];
    current.push(description);
    descriptionsByPage.set(description.pageNumber, current);
  }

  const parts = [...pages]
    .sort((left, right) => left.num - right.num)
    .map((page) => {
      const pageDescriptions = descriptionsByPage.get(page.num) ?? [];
      return [
        `${PAGE_BREAK_MARKER_PREFIX}${String(page.num)}]]`,
        page.text,
        formatVisionDescriptions(pageDescriptions),
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");
    });
  if (unpagedDescriptions.length > 0) {
    parts.push(formatVisionDescriptions(unpagedDescriptions));
  }
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

export function isScannedPdfText(text: string, pageCount: number): boolean {
  const contentChars = stripPageMarkers(text).replace(/\s/g, "").length;
  return contentChars < pageCount * PDF_SCANNED_MIN_CHARS_PER_PAGE;
}

export function isDecorativeImage(width: number | null, height: number | null): boolean {
  if (width === null || height === null) {
    return false;
  }
  const longEdge = Math.max(width, height);
  const area = width * height;
  return longEdge < DECORATIVE_IMAGE_MIN_LONG_EDGE || area < DECORATIVE_IMAGE_MIN_AREA;
}

export function readImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number | null; height: number | null } {
  if (mimeType === "image/png") {
    return readPngDimensions(buffer);
  }
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return readJpegDimensions(buffer);
  }
  return { width: null, height: null };
}

function readPngDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return { width: null, height: null };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { width: null, height: null };
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return { width: null, height: null };
    }
    if (marker !== undefined && isJpegStartOfFrame(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }

  return { width: null, height: null };
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function formatVisionDescriptions(descriptions: VisionDescription[]): string {
  return descriptions
    .map((description) => `## ${description.sourceLabel}\n\n${description.text}`)
    .join("\n\n");
}

export function htmlToMarkdownText(html: string): string {
  return html
    .replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, "\n\n$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h([1-6])>/gi, "\n\n")
    .replace(/<h([1-6])[^>]*>/gi, (_match, level: string) => `${"#".repeat(Number(level))} `)
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<t[dh][^>]*>/gi, "| ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match?.[1] ?? "image/png";
}

function rowsToMarkdownTable(rows: string[][]): string {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const lines: string[] = [];
  rows.forEach((row, index) => {
    const cells = Array.from({ length: columnCount }, (_value, columnIndex) =>
      markdownTableCell(row[columnIndex] ?? ""),
    );
    lines.push(`| ${cells.join(" | ")} |`);
    if (index === 0) {
      lines.push(`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`);
    }
  });
  return lines.join("\n");
}

function markdownTableCell(value: string): string {
  return value.replace(/\n/g, " ").replace(/\|/g, "\\|");
}

export function cleanParsedText(text: string): {
  text: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let cleaned = removeControlCharacters(text.replace(/\r\n?/g, "\n"));
  const beforeControlLength = text.length;
  if (cleaned.length !== beforeControlLength) {
    warnings.push("control_chars_removed");
  }

  cleaned = removeRepeatedPageChrome(cleaned, warnings);
  cleaned = mergeHardWrappedLines(cleaned);
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length === 0) {
    throw new Error("文档没有可提取的文本内容");
  }
  return { text: cleaned, warnings };
}

function prepareRawTextForCleaning(
  text: string,
  parser: ParsedDocument["metadata"]["parser"],
): {
  text: string;
  pageInfoUnavailable: boolean;
} {
  if (parser !== "pdf-parse") {
    return { text, pageInfoUnavailable: false };
  }
  if (text.includes(PAGE_BREAK_MARKER_PREFIX)) {
    return { text, pageInfoUnavailable: false };
  }
  if (!text.includes("\f")) {
    return { text, pageInfoUnavailable: true };
  }

  const pages = text.split("\f");
  const marked = pages
    .map((page, index) =>
      index === 0 ? page : `${PAGE_BREAK_MARKER_PREFIX}${String(index + 1)}]]\n${page}`,
    )
    .join("\n");
  return { text: marked, pageInfoUnavailable: false };
}

function removeRepeatedPageChrome(text: string, warnings: string[]): string {
  const pages = splitTextByPageMarker(text);
  const pageCount = pages.length;
  const repeated = new Map<string, number>();
  for (const page of pages) {
    const candidates = page.lines
      .map((line) => line.trim())
      .filter((line) => isPageChromeCandidate(line));
    for (const candidate of new Set(candidates)) {
      repeated.set(candidate, (repeated.get(candidate) ?? 0) + 1);
    }
  }
  const repeatedChrome = new Set(
    [...repeated.entries()]
      .filter(([, count]) => count >= Math.max(2, Math.ceil(pageCount * 0.6)))
      .map(([line]) => line),
  );
  if (repeatedChrome.size > 0) {
    warnings.push("repeated_page_chrome_removed");
  }

  return pages
    .map((page, index) => {
      const lines = page.lines.filter((line) => {
        const trimmed = line.trim();
        return !isStandalonePageNumber(trimmed) && !repeatedChrome.has(trimmed);
      });
      const prefix = index === 0 ? "" : `${PAGE_BREAK_MARKER_PREFIX}${String(page.page)}]]\n`;
      return `${prefix}${lines.join("\n")}`;
    })
    .join("\n");
}

function removeControlCharacters(text: string): string {
  let cleaned = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || (code > 31 && code !== 127)) {
      cleaned += char;
    }
  }
  return cleaned;
}

function splitTextByPageMarker(text: string): { page: number; lines: string[] }[] {
  const pages: { page: number; lines: string[] }[] = [{ page: 1, lines: [] }];
  let current = pages[0] as { page: number; lines: string[] };
  for (const line of text.split("\n")) {
    const marker = pageMarkerNumber(line);
    if (marker !== null) {
      current = { page: marker, lines: [] };
      pages.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return pages;
}

function mergeHardWrappedLines(text: string): string {
  const output: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const current = line.trimEnd();
    const previous = output[output.length - 1];
    if (previous !== undefined && shouldMergeHardWrappedLine(previous, current)) {
      const separator = needsSpaceBetween(previous, current) ? " " : "";
      output[output.length - 1] = `${previous}${separator}${current.trimStart()}`;
    } else {
      output.push(current);
    }
  }
  return output.join("\n");
}

function shouldMergeHardWrappedLine(previous: string, current: string): boolean {
  if (previous.trim().length === 0 || current.trim().length === 0) {
    return false;
  }
  if (isProtectedLine(previous) || isProtectedLine(current)) {
    return false;
  }
  if (/[。！？.!?:：；;]$/.test(previous.trim())) {
    return false;
  }
  if (detectHeadingLine(previous) !== null || detectHeadingLine(current) !== null) {
    return false;
  }
  return previous.trim().length >= 8 && current.trim().length >= 6;
}

function needsSpaceBetween(previous: string, current: string): boolean {
  return /[A-Za-z0-9]$/.test(previous.trim()) && /^[A-Za-z0-9]/.test(current.trim());
}

function isProtectedLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    pageMarkerNumber(trimmed) !== null ||
    isMarkdownTableLine(trimmed) ||
    isListLine(trimmed) ||
    isStandalonePageNumber(trimmed)
  );
}

function isPageChromeCandidate(line: string): boolean {
  if (line.length === 0 || line.length > 80) {
    return false;
  }
  return (
    isStandalonePageNumber(line) ||
    /^第\s*\d+\s*页(?:\s*\/\s*共\s*\d+\s*页)?$/.test(line) ||
    /^Page\s+\d+(?:\s+of\s+\d+)?$/i.test(line) ||
    /^[\w\s.-]{4,80}$/.test(line)
  );
}

function isStandalonePageNumber(line: string): boolean {
  return /^\d{1,4}$/.test(line) || /^[-–—]\s*\d{1,4}\s*[-–—]$/.test(line);
}

async function resolveDocumentPath(document: ProcessableDocument): Promise<string> {
  if (document.fileId === null) {
    throw new Error("文档文件缺失");
  }

  const [file] = await db
    .select({ storagePath: files.storagePath })
    .from(files)
    .where(eq(files.id, document.fileId))
    .limit(1);
  if (file === undefined) {
    throw new Error("文档文件元数据缺失");
  }

  const storageRoot = resolveLocalStorageRoot();
  const absolutePath = path.resolve(storageRoot, file.storagePath);
  const relativePath = path.relative(storageRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("文档存储路径无效");
  }

  return absolutePath;
}

function toParsedDocument(
  text: string,
  parser: ParsedDocument["metadata"]["parser"],
  extraMetadata: ParsedDocumentExtraMetadata = {},
): ParsedDocument {
  const rawTextLength = text.length;
  const prepared = prepareRawTextForCleaning(text, parser);
  const cleaned = cleanParsedText(prepared.text);

  return {
    text: cleaned.text,
    metadata: {
      parser,
      parsedAt: new Date().toISOString(),
      textLength: cleaned.text.length,
      rawTextLength,
      cleanedTextLength: cleaned.text.length,
      cleanerVersion: CLEANER_VERSION,
      cleaningWarnings: cleaned.warnings,
      ...(prepared.pageInfoUnavailable ? { pageInfoUnavailable: true as const } : {}),
      ...extraMetadata,
    },
  };
}
