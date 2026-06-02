CREATE TYPE "public"."improvement_task_status" AS ENUM('pending', 'processing', 'candidate_ready', 'approved', 'rejected', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."improvement_trigger_type" AS ENUM('no_answer', 'low_confidence', 'knowledge_gap', 'user_correction', 'answer_dislike', 'item_dislike');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'still_failing', 'expired');--> statement-breakpoint
CREATE TABLE "knowledge_improvement_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"trigger_type" "improvement_trigger_type" NOT NULL,
	"source_message_id" uuid,
	"source_feedback_id" uuid,
	"source_question" text NOT NULL,
	"source_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "improvement_task_status" DEFAULT 'pending' NOT NULL,
	"candidate_title" text,
	"candidate_content" text,
	"candidate_summary" text,
	"candidate_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_confidence" real,
	"ai_reasoning" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"published_item_id" uuid,
	"verification_status" "verification_status",
	"verified_at" timestamp with time zone,
	"dedup_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" ADD CONSTRAINT "knowledge_improvement_tasks_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" ADD CONSTRAINT "knowledge_improvement_tasks_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" ADD CONSTRAINT "knowledge_improvement_tasks_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" ADD CONSTRAINT "knowledge_improvement_tasks_published_item_id_knowledge_items_id_fk" FOREIGN KEY ("published_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_improvement_tasks_kb_status_idx" ON "knowledge_improvement_tasks" USING btree ("knowledge_base_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_improvement_tasks_trigger_idx" ON "knowledge_improvement_tasks" USING btree ("trigger_type");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_improvement_tasks_dedup_uidx" ON "knowledge_improvement_tasks" USING btree ("dedup_key");