ALTER TABLE "conversations" ADD COLUMN "rolling_summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summarized_message_count" integer DEFAULT 0 NOT NULL;