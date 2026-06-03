ALTER TABLE "audit_logs" ADD COLUMN "knowledge_base_id" uuid;--> statement-breakpoint
CREATE INDEX "audit_logs_knowledge_base_idx" ON "audit_logs" USING btree ("knowledge_base_id","created_at");