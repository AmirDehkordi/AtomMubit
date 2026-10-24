CREATE TABLE "project_filings" (
	"project_id" text NOT NULL,
	"accession" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_filings_project_id_accession_pk" PRIMARY KEY("project_id","accession")
);
--> statement-breakpoint
ALTER TABLE "project_filings" ADD CONSTRAINT "project_filings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_filings" ADD CONSTRAINT "project_filings_accession_filings_accession_fk" FOREIGN KEY ("accession") REFERENCES "public"."filings"("accession") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_filings_accession_idx" ON "project_filings" USING btree ("accession");
--> statement-breakpoint
INSERT INTO "project_filings" ("project_id", "accession") SELECT "project_id", "accession" FROM "filings" WHERE "project_id" IS NOT NULL ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "project_filings" ("project_id", "accession") SELECT c."project_id", a.acc FROM "messages" m JOIN "conversations" c ON c."id" = m."conversation_id", jsonb_array_elements(m."tool_trace") t, jsonb_array_elements_text(t->'args'->'accessions') a(acc) WHERE t->>'tool' = 'add_filings' AND (t->>'ok')::boolean AND a.acc IN (SELECT "accession" FROM "filings") ON CONFLICT DO NOTHING;
