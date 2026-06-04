CREATE INDEX "knowledge_improvement_tasks_published_item_idx" ON "knowledge_improvement_tasks" USING btree ("published_item_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_source_document_idx" ON "knowledge_items" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "message_citations_document_idx" ON "message_citations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "message_citations_knowledge_item_idx" ON "message_citations" USING btree ("knowledge_item_id");