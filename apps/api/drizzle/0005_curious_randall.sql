CREATE TABLE "extraction_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"text" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"decision" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_feedback_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "extraction_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"text" text NOT NULL,
	"parent_id" text,
	"state" text DEFAULT 'queued' NOT NULL,
	"question" text,
	"plan" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_requests_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"request_id" text,
	"document_id" text NOT NULL,
	"identity" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"rule_version" integer DEFAULT 0 NOT NULL,
	"specification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "extraction_runs_identity_unique" UNIQUE("identity")
);
--> statement-breakpoint
CREATE TABLE "inference_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"run_id" text,
	"task" text NOT NULL,
	"route" text NOT NULL,
	"model" text NOT NULL,
	"request_id" text,
	"provider" text,
	"latency_ms" double precision NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision,
	"ok" boolean NOT NULL,
	"error" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_watchlist" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"ticker" text NOT NULL,
	"last_checked_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"version" integer NOT NULL,
	"ticker" text,
	"feedback_id" text,
	"lesson" text NOT NULL,
	"target" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"document_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"next_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"accession" text,
	"ticker" text,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"checksum" text NOT NULL,
	"content" text NOT NULL,
	"raw_base64" text,
	"source_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_jobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "project_filings" ADD COLUMN "id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "project_filings" ADD COLUMN "team_id" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "team_id" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
-- Keep existing filing memberships attached to their project tenant.
UPDATE "project_filings" SET "team_id" = "projects"."team_id" FROM "projects" WHERE "projects"."id" = "project_filings"."project_id";--> statement-breakpoint
ALTER TABLE "extraction_feedback" ADD CONSTRAINT "extraction_feedback_run_id_extraction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_requests" ADD CONSTRAINT "extraction_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_runs" ADD CONSTRAINT "request_runs_request_id_extraction_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."extraction_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_runs" ADD CONSTRAINT "request_runs_run_id_extraction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_events_project" ON "extraction_events" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_watchlist_member" ON "monitoring_watchlist" USING btree ("team_id","project_id","ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_sequence" ON "policy_versions" USING btree ("team_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "project_documents_membership" ON "project_documents" USING btree ("project_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_runs_membership" ON "request_runs" USING btree ("request_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_identity" ON "source_documents" USING btree ("team_id","checksum","name","ticker");--> statement-breakpoint
CREATE INDEX "work_jobs_available" ON "work_jobs" USING btree ("state","available_at");--> statement-breakpoint
ALTER TABLE "project_filings" ADD CONSTRAINT "project_filings_id_unique" UNIQUE("id");