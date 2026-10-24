DROP INDEX "source_documents_identity";--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_identity" ON "source_documents" USING btree ("team_id","checksum","name","ticker");