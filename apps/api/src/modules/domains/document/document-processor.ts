import {
  db,
  documents,
  files,
  knowledgeBases,
} from "@knowflow/db";
import type { DocumentSourceType } from "@knowflow/shared";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

import type { DocumentProcessResult } from "./document-queue.js";

type ProcessableDocument = {
  id: string;
  knowledgeBaseId: string;
  sourceType: DocumentSourceType;
  sourceUri: string | null;
  fileId: string | null;
  title: string;
  embeddingModel: string;
};

type ParsedDocument = {
  text: string;
  metadata: {
    parser: "pdf-parse" | "plain-text";
    parsedAt: string;
    textLength: number;
  };
};

export async function processDocument(
  documentId: string,
): Promise<DocumentProcessResult> {
  try {
    const document = await findProcessableDocument(documentId);
    if (document === undefined) {
      throw new Error(`Document not found: ${documentId}`);
    }

    await markParsing(document.id);
    const parsed = await parseDocument(document);
    await markParsed(document.id, parsed);

    return {
      documentId: document.id,
      status: "completed",
    };
  } catch (error) {
    await markFailed(documentId, error);
    return {
      documentId,
      status: "failed",
    };
  }
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

  throw new Error(`Unsupported document source type: ${document.sourceType}`);
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

  const storageRoot = path.resolve(process.env["LOCAL_STORAGE_ROOT"] ?? "storage");
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
    },
  };
}
