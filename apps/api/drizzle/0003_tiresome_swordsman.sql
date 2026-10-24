CREATE TABLE "corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"block_id" text NOT NULL,
	"accession" text NOT NULL,
	"section_id" text NOT NULL,
	"project_id" text,
	"note" text NOT NULL,
	"rule_id" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"reread_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrections_block_idx" ON "corrections" USING btree ("block_id");