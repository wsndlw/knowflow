CREATE TYPE "public"."retrieval_mode" AS ENUM('hybrid', 'hybrid_rerank', 'vector_only', 'fts_only', 'ki_only');--> statement-breakpoint
CREATE TABLE "document_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_item_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieval_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"mode" "retrieval_mode" DEFAULT 'hybrid_rerank' NOT NULL,
	"top_k" integer DEFAULT 5 NOT NULL,
	"similarity_threshold" numeric(3, 2) DEFAULT '0.70' NOT NULL,
	"rerank_enabled" boolean DEFAULT true NOT NULL,
	"rerank_top_n" integer DEFAULT 30 NOT NULL,
	"rerank_keep_n" integer DEFAULT 10 NOT NULL,
	"vector_weight" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"fts_weight" numeric(3, 2) DEFAULT '0.30' NOT NULL,
	"ki_weight" numeric(3, 2) DEFAULT '0.20' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_knowledge_base_id_knowledge_bases_id_fk";
--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "knowledge_base_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "color" SET DATA TYPE varchar(7);--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "color" SET DEFAULT '#3B82F6';--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item_tags" ADD CONSTRAINT "knowledge_item_tags_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item_tags" ADD CONSTRAINT "knowledge_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_settings" ADD CONSTRAINT "retrieval_settings_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_tags_document_tag_uidx" ON "document_tags" USING btree ("document_id","tag_id");--> statement-breakpoint
CREATE INDEX "document_tags_document_idx" ON "document_tags" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_tags_tag_idx" ON "document_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_item_tags_item_tag_uidx" ON "knowledge_item_tags" USING btree ("knowledge_item_id","tag_id");--> statement-breakpoint
CREATE INDEX "knowledge_item_tags_item_idx" ON "knowledge_item_tags" USING btree ("knowledge_item_id");--> statement-breakpoint
CREATE INDEX "knowledge_item_tags_tag_idx" ON "knowledge_item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_settings_knowledge_base_uidx" ON "retrieval_settings" USING btree ("knowledge_base_id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_knowledge_base_name_uidx" ON "tags" USING btree ("knowledge_base_id","name");