CREATE TYPE "public"."knowledge_item_feedback_rating" AS ENUM('like', 'dislike');--> statement-breakpoint
CREATE TABLE "knowledge_item_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" "knowledge_item_feedback_rating" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "cite_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "dislike_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_item_feedback" ADD CONSTRAINT "knowledge_item_feedback_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item_feedback" ADD CONSTRAINT "knowledge_item_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_item_feedback_item_user_uidx" ON "knowledge_item_feedback" USING btree ("knowledge_item_id","user_id");--> statement-breakpoint
CREATE INDEX "knowledge_item_feedback_user_idx" ON "knowledge_item_feedback" USING btree ("user_id");