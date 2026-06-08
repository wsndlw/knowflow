ALTER TABLE "agent_runtime_traces" DROP CONSTRAINT "agent_runtime_traces_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" DROP CONSTRAINT "agent_runtime_traces_message_id_conversation_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtime_traces" ADD CONSTRAINT "agent_runtime_traces_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;