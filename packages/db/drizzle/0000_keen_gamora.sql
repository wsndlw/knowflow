CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('draft', 'published', 'disabled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('global', 'official', 'personal');--> statement-breakpoint
CREATE TYPE "public"."agent_visibility" AS ENUM('global', 'knowledge_base_members', 'selected_members', 'private');--> statement-breakpoint
CREATE TYPE "public"."background_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."citation_source_type" AS ENUM('knowledge_document', 'knowledge_item', 'conversation_attachment');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('strong', 'medium', 'weak', 'not_found');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_source_type" AS ENUM('pdf', 'docx', 'txt', 'markdown', 'csv', 'excel', 'web_url', 'feishu_doc', 'feishu_sheet', 'image', 'manual');--> statement-breakpoint
CREATE TYPE "public"."embedding_status" AS ENUM('pending', 'embedding', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feedback_rating" AS ENUM('useful', 'not_useful', 'correction');--> statement-breakpoint
CREATE TYPE "public"."knowledge_base_index_status" AS ENUM('not_indexed', 'indexing', 'ready', 'partial_failed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_base_status" AS ENUM('active', 'disabled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_base_visibility" AS ENUM('public', 'department', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."knowledge_item_status" AS ENUM('draft', 'pending_review', 'published', 'unpublished', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."metadata_field_type" AS ENUM('text', 'single_select', 'multi_select', 'date', 'number', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."model_provider_type" AS ENUM('openai', 'azure_openai', 'aliyun', 'zhipu', 'deepseek', 'moonshot', 'ollama', 'openai_compatible');--> statement-breakpoint
CREATE TYPE "public"."model_type" AS ENUM('chat', 'embedding', 'rerank', 'ocr', 'vision', 'moderation');--> statement-breakpoint
CREATE TYPE "public"."model_usage_type" AS ENUM('chat', 'query_understanding', 'document_processing', 'embedding', 'rerank', 'ocr', 'vision', 'knowledge_production', 'agent_generation');--> statement-breakpoint
CREATE TYPE "public"."no_answer_type" AS ENUM('no_answer', 'low_confidence', 'knowledge_gap', 'permission_limited', 'attachment_parse_failed');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'department_admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."process_status" AS ENUM('pending', 'parsing', 'chunking', 'embedding', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('access', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "agent_knowledge_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"user_id" uuid NOT NULL,
	"graph_version" varchar(80) NOT NULL,
	"state_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieved_context" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_snapshot" text,
	"model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_level" "confidence_level",
	"no_answer_type" "no_answer_type",
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"avatar" text,
	"type" "agent_type" NOT NULL,
	"owner_id" uuid,
	"system_prompt" text,
	"opening_message" text,
	"recommended_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer_style" varchar(80),
	"fallback_strategy" text,
	"allow_attachments" boolean DEFAULT true NOT NULL,
	"force_citation" boolean DEFAULT true NOT NULL,
	"visibility" "agent_visibility" NOT NULL,
	"status" "agent_status" DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"model_provider" varchar(120),
	"model_name" varchar(120),
	"model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"knowledge_base_id" uuid,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"rating" "feedback_rating" NOT NULL,
	"reason" varchar(120),
	"correction_content" text,
	"suggested_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(160) NOT NULL,
	"target_type" varchar(120) NOT NULL,
	"target_id" uuid,
	"result" varchar(80) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(80),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(120) NOT NULL,
	"target_type" varchar(120) NOT NULL,
	"target_id" uuid,
	"status" "background_job_status" DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_chunk_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1024),
	"search_vector" "tsvector",
	"embedding_status" "embedding_status" DEFAULT 'pending' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"confidence_level" "confidence_level",
	"no_answer_type" "no_answer_type",
	"used_context" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"favorited" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"source_type" "document_source_type" NOT NULL,
	"source_uri" text,
	"file_id" uuid,
	"file_type" varchar(80),
	"file_size" bigint,
	"uploader_id" uuid NOT NULL,
	"process_status" "process_status" DEFAULT 'pending' NOT NULL,
	"parse_status" "process_status" DEFAULT 'pending' NOT NULL,
	"chunk_status" "process_status" DEFAULT 'pending' NOT NULL,
	"embedding_status" "embedding_status" DEFAULT 'pending' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" text NOT NULL,
	"filename" varchar(255) NOT NULL,
	"file_type" varchar(80) NOT NULL,
	"file_size" bigint NOT NULL,
	"hash" varchar(128) NOT NULL,
	"uploader_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"department_id" uuid NOT NULL,
	"visibility" "knowledge_base_visibility" DEFAULT 'department' NOT NULL,
	"status" "knowledge_base_status" DEFAULT 'active' NOT NULL,
	"index_status" "knowledge_base_index_status" DEFAULT 'not_indexed' NOT NULL,
	"creator_id" uuid NOT NULL,
	"embedding_model" varchar(120) DEFAULT 'text-embedding-v4' NOT NULL,
	"embedding_dimension" integer DEFAULT 1024 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"source_document_id" uuid,
	"status" "knowledge_item_status" DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1024),
	"search_vector" "tsvector",
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"source_type" "citation_source_type" NOT NULL,
	"knowledge_base_id" uuid,
	"document_id" uuid,
	"knowledge_item_id" uuid,
	"attachment_id" uuid,
	"chunk_id" uuid,
	"title" varchar(255) NOT NULL,
	"snippet" text,
	"page_or_section" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"type" "metadata_field_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT true NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_name" varchar(160) NOT NULL,
	"model_type" "model_type" NOT NULL,
	"context_window" integer,
	"supports_streaming" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"provider_type" "model_provider_type" NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_api_key" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"retry_count" integer DEFAULT 2 NOT NULL,
	"concurrency_limit" integer DEFAULT 5 NOT NULL,
	"daily_quota" integer,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_usage_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usage_type" "model_usage_type" NOT NULL,
	"default_model_id" uuid,
	"fallback_model_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"temperature" integer DEFAULT 70 NOT NULL,
	"max_output_tokens" integer,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"retry_count" integer DEFAULT 2 NOT NULL,
	"quota" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"type" "session_type" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"ip" varchar(80),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid,
	"name" varchar(80) NOT NULL,
	"color" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"department_id" uuid NOT NULL,
	"platform_role" "platform_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_bases" ADD CONSTRAINT "agent_knowledge_bases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_bases" ADD CONSTRAINT "agent_knowledge_bases_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_parent_chunk_id_parent_chunks_id_fk" FOREIGN KEY ("parent_chunk_id") REFERENCES "public"."parent_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_admins" ADD CONSTRAINT "department_admins_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_admins" ADD CONSTRAINT "department_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_admins" ADD CONSTRAINT "knowledge_base_admins_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_admins" ADD CONSTRAINT "knowledge_base_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_fields" ADD CONSTRAINT "metadata_fields_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog" ADD CONSTRAINT "model_catalog_provider_id_model_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."model_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_usage_policies" ADD CONSTRAINT "model_usage_policies_default_model_id_model_catalog_id_fk" FOREIGN KEY ("default_model_id") REFERENCES "public"."model_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_usage_policies" ADD CONSTRAINT "model_usage_policies_fallback_model_id_model_catalog_id_fk" FOREIGN KEY ("fallback_model_id") REFERENCES "public"."model_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_knowledge_bases_agent_kb_uidx" ON "agent_knowledge_bases" USING btree ("agent_id","knowledge_base_id");--> statement-breakpoint
CREATE INDEX "agent_runtime_traces_agent_idx" ON "agent_runtime_traces" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agents_type_idx" ON "agents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "agents_owner_idx" ON "agents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "answer_feedback_message_idx" ON "answer_feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "background_jobs_target_idx" ON "background_jobs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "background_jobs_status_idx" ON "background_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "child_chunks_parent_idx" ON "child_chunks" USING btree ("parent_chunk_id");--> statement-breakpoint
CREATE INDEX "child_chunks_document_idx" ON "child_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "child_chunks_knowledge_base_idx" ON "child_chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_user_agent_idx" ON "conversations" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "department_admins_department_user_uidx" ON "department_admins" USING btree ("department_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_name_uidx" ON "departments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "documents_knowledge_base_idx" ON "documents" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "documents_process_status_idx" ON "documents" USING btree ("process_status");--> statement-breakpoint
CREATE INDEX "files_uploader_idx" ON "files" USING btree ("uploader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_base_admins_kb_user_uidx" ON "knowledge_base_admins" USING btree ("knowledge_base_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_base_members_kb_user_uidx" ON "knowledge_base_members" USING btree ("knowledge_base_id","user_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_department_idx" ON "knowledge_bases" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_visibility_idx" ON "knowledge_bases" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "knowledge_items_knowledge_base_idx" ON "knowledge_items" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_status_idx" ON "knowledge_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_citations_message_idx" ON "message_citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "metadata_fields_knowledge_base_idx" ON "metadata_fields" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_catalog_provider_model_uidx" ON "model_catalog" USING btree ("provider_id","model_name");--> statement-breakpoint
CREATE UNIQUE INDEX "model_usage_policies_usage_type_uidx" ON "model_usage_policies" USING btree ("usage_type");--> statement-breakpoint
CREATE INDEX "parent_chunks_document_idx" ON "parent_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "parent_chunks_knowledge_base_idx" ON "parent_chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tags_knowledge_base_idx" ON "tags" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uidx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "child_chunks_search_vector_gin_idx" ON "child_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "knowledge_items_search_vector_gin_idx" ON "knowledge_items" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "child_chunks_embedding_cosine_idx" ON "child_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100) WHERE "embedding" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "knowledge_items_embedding_cosine_idx" ON "knowledge_items" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100) WHERE "embedding" IS NOT NULL;
