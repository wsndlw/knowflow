export type RetrievalChannel = "vector" | "fts" | "knowledge_item";

export type RetrievalSourceType = "knowledge_document" | "knowledge_item";

export type RetrievalCandidate = {
  id: string;
  sourceType: RetrievalSourceType;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  documentId: string | null;
  knowledgeItemId: string | null;
  childChunkId: string | null;
  parentChunkId: string | null;
  title: string;
  content: string;
  parentContent: string | null;
  snippet: string;
  pageOrSection: string | null;
  channels: RetrievalChannel[];
  initialScore: number;
  rerankScore: number | null;
  knowledgeItemVerified: boolean;
  sourceExpired: boolean;
  tokenCount: number;
};

export type RetrievalContextItem = RetrievalCandidate & {
  contextText: string;
  citationIndex: number;
};

export type RetrievalTrace = {
  allowedKnowledgeBaseIds: string[];
  recalled: {
    vector: number;
    fts: number;
    knowledgeItem: number;
  };
  merged: number;
  reranked: number;
  final: number;
};

export type RetrievalResult = {
  query: string;
  rewrittenQueries: string[];
  candidates: RetrievalCandidate[];
  contexts: RetrievalContextItem[];
  trace: RetrievalTrace;
};

