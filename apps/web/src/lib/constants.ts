import type { ModelUsageType } from "@knowflow/shared";

export const MODEL_USAGE_TYPE_LABELS: Record<ModelUsageType, string> = {
  chat: "对话生成",
  query_understanding: "问题理解",
  document_processing: "文档处理",
  embedding: "向量嵌入",
  rerank: "结果重排",
  ocr: "图像识别",
  vision: "视觉理解",
  knowledge_production: "知识生产",
  agent_generation: "Agent 生成",
};
