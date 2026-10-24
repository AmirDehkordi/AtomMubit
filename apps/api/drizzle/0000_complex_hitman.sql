CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"accession" text NOT NULL,
	"type" text NOT NULL,
	"key" text,
	"label" text NOT NULL,
	"period_end" text,
	"months" integer,
	"value" double precision,
	"unit" text,
	"scale" text,
	"text" text,
	"quote" text NOT NULL,
	"span_start" integer,
	"span_end" integer,
	"status" text DEFAULT 'unchecked' NOT NULL,
	"mubit_request_id" text,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(label, '') || ' ' || coalesce(text, '') || ' ' || quote)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" text PRIMARY KEY NOT NULL,
	"block_id" text NOT NULL,
	"verifier" text NOT NULL,
	"passed" boolean NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"cik" integer PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"fiscal_year_end" text NOT NULL,
	CONSTRAINT "companies_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"cik" integer NOT NULL,
	"concept" text NOT NULL,
	"unit" text NOT NULL,
	"period_start" text,
	"period_end" text NOT NULL,
	"value" double precision NOT NULL,
	"fy" integer,
	"fp" text,
	"form" text,
	"accession" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filings" (
	"accession" text PRIMARY KEY NOT NULL,
	"cik" integer NOT NULL,
	"project_id" text,
	"form" text NOT NULL,
	"period_end" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"fiscal_period" text NOT NULL,
	"filed_at" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'found' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"mubit_request_id" text,
	"recorded" boolean NOT NULL,
	"prompt_cache_key" text,
	"model" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" text PRIMARY KEY NOT NULL,
	"accession" text NOT NULL,
	"item" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"char_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "views" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_cik_companies_cik_fk" FOREIGN KEY ("cik") REFERENCES "public"."companies"("cik") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_accession_filings_accession_fk" FOREIGN KEY ("accession") REFERENCES "public"."filings"("accession") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_section_idx" ON "blocks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "blocks_accession_key_idx" ON "blocks" USING btree ("accession","key");--> statement-breakpoint
CREATE INDEX "blocks_tsv_idx" ON "blocks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "checks_block_idx" ON "checks" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "facts_lookup_idx" ON "facts" USING btree ("cik","concept","period_end");--> statement-breakpoint
CREATE INDEX "filings_project_idx" ON "filings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "filings_cik_idx" ON "filings" USING btree ("cik");--> statement-breakpoint
CREATE INDEX "llm_calls_task_idx" ON "llm_calls" USING btree ("task");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "sections_accession_idx" ON "sections" USING btree ("accession");--> statement-breakpoint
CREATE INDEX "views_project_idx" ON "views" USING btree ("project_id");