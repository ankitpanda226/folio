ALTER TABLE shares ADD COLUMN role TEXT NOT NULL DEFAULT 'editor';
--> statement-breakpoint
CREATE TABLE comments (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX comments_document ON comments(document_id, created_at);
--> statement-breakpoint
CREATE TABLE document_versions (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, version INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, saved_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(document_id, version));
--> statement-breakpoint
CREATE TABLE presence (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, session_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), editing INTEGER NOT NULL DEFAULT 0, last_seen TEXT NOT NULL, PRIMARY KEY(document_id, session_id));
--> statement-breakpoint
CREATE INDEX presence_active ON presence(document_id, last_seen);
