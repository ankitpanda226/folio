ALTER TABLE documents ADD COLUMN deleted_at TEXT;
--> statement-breakpoint
CREATE INDEX documents_trash ON documents(owner_id, deleted_at);
