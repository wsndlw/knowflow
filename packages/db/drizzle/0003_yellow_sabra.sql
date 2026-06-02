CREATE TYPE "public"."analytics_event_type" AS ENUM('knowledge_base_viewed', 'document_viewed', 'knowledge_item_viewed', 'knowledge_searched', 'question_asked', 'answer_generated', 'agent_called', 'citation_clicked', 'feedback_submitted', 'attachment_ingestion_requested');--> statement-breakpoint
CREATE TYPE "public"."analytics_target_type" AS ENUM('knowledge_base', 'document', 'knowledge_item', 'agent', 'message', 'conversation', 'citation', 'attachment');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "analytics_event_type" NOT NULL,
	"target_type" "analytics_target_type",
	"target_id" uuid,
	"knowledge_base_id" uuid,
	"session_id" varchar(160),
	"agent_id" uuid,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_event_type_idx" ON "analytics_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "analytics_events_knowledge_base_date_idx" ON "analytics_events" USING btree ("knowledge_base_id","created_date");--> statement-breakpoint
CREATE INDEX "analytics_events_user_date_idx" ON "analytics_events" USING btree ("user_id","created_date");--> statement-breakpoint
CREATE INDEX "analytics_events_agent_date_idx" ON "analytics_events" USING btree ("agent_id","created_date");