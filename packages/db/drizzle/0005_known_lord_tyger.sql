CREATE TABLE "knowledge_improvement_scan_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"last_source_created_at" timestamp with time zone,
	"last_source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_improvement_scan_cursors" ADD CONSTRAINT "knowledge_improvement_scan_cursors_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_improvement_scan_cursors_kb_source_uidx" ON "knowledge_improvement_scan_cursors" USING btree ("knowledge_base_id","source_type");--> statement-breakpoint
CREATE INDEX "knowledge_improvement_scan_cursors_kb_idx" ON "knowledge_improvement_scan_cursors" USING btree ("knowledge_base_id");