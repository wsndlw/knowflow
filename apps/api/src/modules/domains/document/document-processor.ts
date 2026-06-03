import {
  db,
  documents,
  files,
  knowledgeBases,
  parentChunks,
  childChunks,
} from "@knowflow/db";
import type { DocumentSourceType } from "@knowflow/shared";
import { asc, eq, sql } from "drizzle-orm";
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

const PARENT_TARGET_CHARS = 4000;
const CHILD_TARGET_CHARS = 900;
const CHILD_OVERLAP_CHARS = 120;
const EMBEDDING_BATCH_SIZE = 16;
const MAX_SPREADSHEET_ROWS = 10000;

type ProcessableDocument = {
  id: string;
  knowledgeBaseId: string;
  sourceType: DocumentSourceType;
  sourceUri: string | null;
  fileId: string | null;
  fileType: string | null;
  title: string;
  embeddingModel: string;
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
  };
};

type ParentChunkInput = {
  title: string | null;
  content: string;
  headingPath: string[];
};

type ChildChunkInput = {
  content: string;
  chunkIndex: number;
  tokenCount: number;
};

export async function processDocument(
  documentId: string,
): Promise<DocumentProcessResult> {
  try {
    const document = await findProcessableDocument(documentId);
    if (document === undefined) {
      throw new Error(`Document not found: ${documentId}`);
    }

    await publishProgress(document.id, "pending", 5, "Document processing queued");
    await markParsing(document.id);
    await publishProgress(document.id, "parsing", 15, "Parsing document text");
    const parsed = await parseDocument(document);
    await markParsed(document.id, parsed);
    await markChunking(document.id);
    await publishProgress(document.id, "chunking", 35, "Splitting document into chunks");
    await replaceChunks(document, parsed);
    await markChunked(document.id);
    await publishProgress(document.id, "embedding", 60, "Embedding child chunks");
    await embedChildChunks(document);
    await markCompleted(document.id);
    await enqueueDocumentExtractionAfterCompletion(document.id, parsed.metadata.parsedAt);
    await publishProgress(document.id, "completed", 100, "Document processing completed");

    return {
      documentId: document.id,
      status: "completed",
    };
  } catch (error) {
    await markFailed(documentId, error);
    await publishProgress(
      documentId,
      "failed",
      100,
      error instanceof Error ? error.message : "Document processing failed",
    );
    return {
      documentId,
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
    console.warn(
      `Document ${documentId} completed, but document extraction enqueue failed`,
      error,
    );
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
    })
    .from(documents)
    .innerJoin(knowledgeBases, eq(knowledgeBases.id, documents.knowledgeBaseId))
    .where(eq(documents.id, documentId))
    .limit(1);

  return document;
}

async function markParsing(documentId: string): Promise<void> {
  await db
    .update(documents)
    .set({
      processStatus: "parsing",
      parseStatus: "parsing",
      chunkStatus: "pending",
      embeddingStatus: "pending",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function markParsed(
  documentId: string,
  parsed: ParsedDocument,
): Promise<void> {
  await db
    .update(documents)
    .set({
      processStatus: "chunking",
      parseStatus: "completed",
      metadata: parsed.metadata,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function markChunking(documentId: string): Promise<void> {
  await db
    .update(documents)
    .set({
      processStatus: "chunking",
      chunkStatus: "chunking",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function markChunked(documentId: string): Promise<void> {
  await db
    .update(documents)
    .set({
      processStatus: "embedding",
      chunkStatus: "completed",
      embeddingStatus: "embedding",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function markCompleted(documentId: string): Promise<void> {
  await db
    .update(documents)
    .set({
      processStatus: "completed",
      embeddingStatus: "completed",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function markFailed(documentId: string, error: unknown): Promise<void> {
  await db
    .update(documents)
    .set({
      processStatus: "failed",
      parseStatus: "failed",
      chunkStatus: "failed",
      embeddingStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "Document processing failed",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function replaceChunks(
  document: ProcessableDocument,
  parsed: ParsedDocument,
): Promise<void> {
  const parents = splitParentChunks(parsed.text);
  await db.transaction(async (tx) => {
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
          metadata: {},
        })
        .returning({ id: parentChunks.id });
      if (createdParent === undefined) {
        throw new Error("Failed to create parent chunk");
      }

      const children = splitChildChunks(parent.content);
      if (children.length === 0) {
        throw new Error("Document chunking produced no child chunks");
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
          },
          embeddingStatus: "pending" as const,
        })),
      );
    }
  });
}

async function embedChildChunks(document: ProcessableDocument): Promise<void> {
  const chunks = await db
    .select({
      id: childChunks.id,
      content: childChunks.content,
    })
    .from(childChunks)
    .where(eq(childChunks.documentId, document.id))
    .orderBy(asc(childChunks.chunkIndex));
  if (chunks.length === 0) {
    throw new Error("Document has no child chunks to embed");
  }

  const client = createAliyunLlmClient();
  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const embeddings = await client.embedTexts(
      batch.map((chunk) => chunk.content),
      document.embeddingModel,
    );
    if (embeddings.length !== batch.length) {
      throw new Error("Embedding response count does not match input count");
    }

    await db.transaction(async (tx) => {
      for (let index = 0; index < batch.length; index += 1) {
        const chunk = batch[index];
        const embedding = embeddings[index];
        if (chunk === undefined || embedding === undefined) {
          throw new Error("Embedding response is incomplete");
        }
        if (embedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
          throw new Error(`Embedding dimension mismatch: ${String(embedding.length)}`);
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

function splitParentChunks(text: string): ParentChunkInput[] {
  const sections = splitHeadingSections(text);
  const parents: ParentChunkInput[] = [];

  for (const section of sections) {
    const pieces = splitByLength(section.content, PARENT_TARGET_CHARS, 0);
    pieces.forEach((piece, index) => {
      parents.push({
        title:
          index === 0
            ? section.title
            : section.title === null
              ? null
              : `${section.title} (${String(index + 1)})`,
        content: piece,
        headingPath: section.headingPath,
      });
    });
  }

  return parents;
}

function splitHeadingSections(text: string): ParentChunkInput[] {
  const lines = text.split("\n");
  const sections: ParentChunkInput[] = [];
  let currentTitle: string | null = null;
  let currentHeadingPath: string[] = [];
  let currentLines: string[] = [];

  function flush(): void {
    const content = currentLines.join("\n").trim();
    if (content.length === 0) {
      return;
    }
    sections.push({
      title: currentTitle,
      headingPath: currentHeadingPath,
      content,
    });
    currentLines = [];
  }

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      flush();
      const level = heading[1]?.length ?? 1;
      const title = heading[2]?.trim() ?? "";
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
    : splitByLength(text, PARENT_TARGET_CHARS, 0).map((content, index) => ({
        title: index === 0 ? null : `Part ${String(index + 1)}`,
        headingPath: [],
        content,
      }));
}

function splitChildChunks(content: string): ChildChunkInput[] {
  return splitByLength(content, CHILD_TARGET_CHARS, CHILD_OVERLAP_CHARS).map((chunk, index) => ({
    content: chunk,
    chunkIndex: index,
    tokenCount: estimateTokenCount(chunk),
  }));
}

function splitByLength(
  text: string,
  targetChars: number,
  overlapChars: number,
): string[] {
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

async function parseDocument(document: ProcessableDocument): Promise<ParsedDocument> {
  const absolutePath = await resolveDocumentPath(document);
  const buffer = await readFile(absolutePath);
  if (document.sourceType === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return toParsedDocument(result.text, "pdf-parse");
    } finally {
      await parser.destroy();
    }
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
    return parseImageDocument(document, buffer);
  }

  throw new Error(`Unsupported document source type: ${document.sourceType}`);
}

async function parseDocxDocument(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  return toParsedDocument(result.value, "mammoth", { originalFormat: "docx" });
}

async function parseCsvExcelDocument(
  buffer: Buffer,
  kind: "csv" | "excel",
): Promise<ParsedDocument> {
  const spreadsheet = await readSpreadsheet(buffer, kind);
  const sheetTexts: string[] = [];
  if (spreadsheet.rowCount > MAX_SPREADSHEET_ROWS) {
    throw new Error("Spreadsheet exceeds 10000 rows");
  }

  for (const sheet of spreadsheet.sheets) {
    sheetTexts.push(`## Sheet: ${sheet.name}\n\n${rowsToMarkdownTable(sheet.rows)}`);
  }

  return toParsedDocument(sheetTexts.join("\n\n"), spreadsheet.parser, {
    sheetCount: spreadsheet.sheets.length,
    rowCount: spreadsheet.rowCount,
  });
}

async function parseImageDocument(
  document: ProcessableDocument,
  buffer: Buffer,
): Promise<ParsedDocument> {
  const mimeType = document.fileType ?? "image/png";
  const text = await callModelByUsage(
    "ocr",
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all text from this image. If it contains tables, output them as Markdown tables and preserve the original structure.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${buffer.toString("base64")}`,
            },
          },
        ],
      },
    ],
    { temperature: 0, maxOutputTokens: 4000 },
  );

  return toParsedDocument(text, "vision-ocr", { mimeType });
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

async function resolveDocumentPath(document: ProcessableDocument): Promise<string> {
  if (document.fileId === null) {
    throw new Error("Document file is missing");
  }

  const [file] = await db
    .select({ storagePath: files.storagePath })
    .from(files)
    .where(eq(files.id, document.fileId))
    .limit(1);
  if (file === undefined) {
    throw new Error("Document file metadata is missing");
  }

  const storageRoot = resolveLocalStorageRoot();
  const absolutePath = path.resolve(storageRoot, file.storagePath);
  const relativePath = path.relative(storageRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Document storage path is invalid");
  }

  return absolutePath;
}

function toParsedDocument(
  text: string,
  parser: ParsedDocument["metadata"]["parser"],
  extraMetadata: Omit<ParsedDocument["metadata"], "parser" | "parsedAt" | "textLength"> = {},
): ParsedDocument {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    throw new Error("Document contains no extractable text");
  }

  return {
    text: normalized,
    metadata: {
      parser,
      parsedAt: new Date().toISOString(),
      textLength: normalized.length,
      ...extraMetadata,
    },
  };
}
