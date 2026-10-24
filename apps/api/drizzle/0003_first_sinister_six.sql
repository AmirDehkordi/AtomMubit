CREATE TABLE "request_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_runs" ADD CONSTRAINT "request_runs_request_id_extraction_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."extraction_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_runs" ADD CONSTRAINT "request_runs_run_id_extraction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_runs_membership" ON "request_runs" USING btree ("request_id","run_id");