CREATE TABLE "knowledge_map_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"reference_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_map_nodes" ADD CONSTRAINT "knowledge_map_nodes_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_map_nodes" ADD CONSTRAINT "knowledge_map_nodes_parent_id_knowledge_map_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_map_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_map_nodes" ADD CONSTRAINT "knowledge_map_nodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_map_nodes_kb_idx" ON "knowledge_map_nodes" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_map_nodes_parent_idx" ON "knowledge_map_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "knowledge_map_nodes_status_idx" ON "knowledge_map_nodes" USING btree ("knowledge_base_id","status");