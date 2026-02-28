CREATE TABLE "cli_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"project" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"started_at" timestamp,
	"last_active_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cli_usage_session_id_idx" ON "cli_usage" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cli_usage_user_id_idx" ON "cli_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cli_usage_created_at_idx" ON "cli_usage" USING btree ("created_at");