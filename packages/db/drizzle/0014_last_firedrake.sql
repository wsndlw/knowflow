ALTER TABLE "agent_runtime_traces" DROP CONSTRAINT "agent_runtime_traces_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" DROP CONSTRAINT "knowledge_improvement_tasks_source_message_id_conversation_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_improvement_tasks" ADD CONSTRAINT "knowledge_improvement_tasks_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_bases_deleted_at_idx" ON "knowledge_bases" USING btree ("deleted_at");