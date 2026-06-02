import type { DocumentSourceType } from "@knowflow/shared";
import path from "node:path";

export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_IMPORT_BYTES = 10 * 1024 * 1024;

type FileMetadata = {
  originalname: string;
  mimetype: string;
};

type FileWithBuffer = FileMetadata & {
  buffer: Buffer;
};

export type DocumentUploadKind = {
  sourceType: Extract<
    DocumentSourceType,
    "pdf" | "markdown" | "txt" | "docx" | "csv" | "excel" | "image"
  >;
  extension: ".pdf" | ".md" | ".txt" | ".docx" | ".csv" | ".xlsx" | ".png" | ".jpg" | ".jpeg" | ".webp";
};

export type BatchImportKind = "csv" | "excel";

type DocumentRule = DocumentUploadKind & {
  extensions: readonly string[];
  mimeTypes: readonly string[];
};

const DOCUMENT_RULES: readonly DocumentRule[] = [
  {
    sourceType: "pdf",
    extension: ".pdf",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  {
    sourceType: "markdown",
    extension: ".md",
    extensions: [".md", ".markdown"],
    mimeTypes: ["text/markdown"],
  },
  {
    sourceType: "txt",
    extension: ".txt",
    extensions: [".txt"],
    mimeTypes: ["text/plain"],
  },
  {
    sourceType: "docx",
    extension: ".docx",
    extensions: [".docx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  {
    sourceType: "csv",
    extension: ".csv",
    extensions: [".csv"],
    mimeTypes: ["text/csv"],
  },
  {
    sourceType: "excel",
    extension: ".xlsx",
    extensions: [".xlsx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
  {
    sourceType: "image",
    extension: ".png",
    extensions: [".png"],
    mimeTypes: ["image/png"],
  },
  {
    sourceType: "image",
    extension: ".jpg",
    extensions: [".jpg"],
    mimeTypes: ["image/jpeg"],
  },
  {
    sourceType: "image",
    extension: ".jpeg",
    extensions: [".jpeg"],
    mimeTypes: ["image/jpeg"],
  },
  {
    sourceType: "image",
    extension: ".webp",
    extensions: [".webp"],
    mimeTypes: ["image/webp"],
  },
];

const BATCH_IMPORT_RULES: readonly { kind: BatchImportKind; extensions: readonly string[]; mimeTypes: readonly string[] }[] = [
  { kind: "csv", extensions: [".csv"], mimeTypes: ["text/csv"] },
  {
    kind: "excel",
    extensions: [".xlsx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
];

export function detectDocumentUploadKind(file: FileMetadata): DocumentUploadKind | null {
  const extension = normalizedExtension(file.originalname);
  const rule = DOCUMENT_RULES.find(
    (candidate) =>
      candidate.extensions.includes(extension) && candidate.mimeTypes.includes(file.mimetype),
  );
  return rule === undefined
    ? null
    : { sourceType: rule.sourceType, extension: rule.extension };
}

export function detectBatchImportKind(file: FileMetadata): BatchImportKind | null {
  const extension = normalizedExtension(file.originalname);
  return (
    BATCH_IMPORT_RULES.find(
      (rule) => rule.extensions.includes(extension) && rule.mimeTypes.includes(file.mimetype),
    )?.kind ?? null
  );
}

export function validateDocumentUploadContent(file: FileWithBuffer, kind: DocumentUploadKind): boolean {
  switch (kind.sourceType) {
    case "pdf":
      return startsWithAscii(file.buffer, "%PDF-");
    case "markdown":
    case "txt":
    case "csv":
      return isLikelyText(file.buffer);
    case "docx":
      return hasZipSignature(file.buffer) && bufferIncludesAscii(file.buffer, "word/");
    case "excel":
      return hasZipSignature(file.buffer) && bufferIncludesAscii(file.buffer, "xl/");
    case "image":
      return hasImageSignature(file.buffer, kind.extension);
  }
}

export function validateBatchImportContent(file: FileWithBuffer, kind: BatchImportKind): boolean {
  if (kind === "csv") {
    return isLikelyText(file.buffer);
  }
  return hasZipSignature(file.buffer) && bufferIncludesAscii(file.buffer, "xl/");
}

function normalizedExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function startsWithAscii(buffer: Buffer, prefix: string): boolean {
  return buffer.subarray(0, prefix.length).equals(Buffer.from(prefix, "ascii"));
}

function bufferIncludesAscii(buffer: Buffer, value: string): boolean {
  return buffer.includes(Buffer.from(value, "ascii"));
}

function hasZipSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  const first = buffer[0];
  const second = buffer[1];
  const third = buffer[2];
  const fourth = buffer[3];
  return (
    first === 0x50 &&
    second === 0x4b &&
    third !== undefined &&
    fourth !== undefined &&
    (third === 0x03 || third === 0x05 || third === 0x07) &&
    (fourth === 0x04 || fourth === 0x06 || fourth === 0x08)
  );
}

function hasImageSignature(buffer: Buffer, extension: DocumentUploadKind["extension"]): boolean {
  if (extension === ".png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === ".webp") {
    return startsWithAscii(buffer, "RIFF") && bufferIncludesAscii(buffer.subarray(8, 12), "WEBP");
  }
  return false;
}

function isLikelyText(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }
  return !buffer.includes(0x00);
}
