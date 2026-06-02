import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import type { ImprovementJobResult } from "./knowledge-improvement-queue.js";

export async function processImprovementScan(
  service: KnowledgeImprovementService,
): Promise<ImprovementJobResult> {
  const created = await service.scanAllKnowledgeBases();
  return { status: "completed", created };
}

export async function processImprovementGenerate(
  service: KnowledgeImprovementService,
  taskId: string,
): Promise<ImprovementJobResult> {
  await service.generateCandidate(taskId);
  return { status: "completed", taskId };
}

export async function processImprovementVerify(
  service: KnowledgeImprovementService,
  taskId: string,
): Promise<ImprovementJobResult> {
  await service.verifyPublishedTask(taskId);
  return { status: "completed", taskId };
}
