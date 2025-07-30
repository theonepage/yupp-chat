-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"embedding" vector(1536),
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query" text NOT NULL,
	"query_embedding" vector(1536),
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_message_id_Message_v2_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."Message_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_sessions" ADD CONSTRAINT "search_sessions_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Create vector similarity index for message embeddings
CREATE INDEX IF NOT EXISTS "message_embeddings_vector_idx" ON "message_embeddings" USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint
-- Create unique constraint on message_id
CREATE UNIQUE INDEX IF NOT EXISTS "message_embeddings_message_id_unique" ON "message_embeddings" ("message_id");
