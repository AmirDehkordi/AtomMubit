CREATE TABLE "mubit_status" (
	"task" text PRIMARY KEY NOT NULL,
	"kept" integer,
	"adapter_version" text,
	"adapter_state" text,
	"quality" double precision,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
