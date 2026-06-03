ALTER TABLE "child_chunks" DROP CONSTRAINT "child_chunks_parent_chunk_id_parent_chunks_id_fk";
--> statement-breakpoint
ALTER TABLE "child_chunks" DROP CONSTRAINT "child_chunks_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" DROP CONSTRAINT "knowledge_improvement_tasks_published_item_id_knowledge_items_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_item_feedback" DROP CONSTRAINT "knowledge_item_feedback_knowledge_item_id_knowledge_items_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP CONSTRAINT "knowledge_items_source_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "message_citations" DROP CONSTRAINT "message_citations_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "message_citations" DROP CONSTRAINT "message_citations_knowledge_item_id_knowledge_items_id_fk";
--> statement-breakpoint
ALTER TABLE "parent_chunks" DROP CONSTRAINT "parent_chunks_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_parent_chunk_id_parent_chunks_id_fk" FOREIGN KEY ("parent_chunk_id") REFERENCES "public"."parent_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" ADD CONSTRAINT "knowledge_improvement_tasks_published_item_id_knowledge_items_id_fk" FOREIGN KEY ("published_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item_feedback" ADD CONSTRAINT "knowledge_item_feedback_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;