CREATE TABLE job_uploads (object_key TEXT NOT NULL, upload_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), attempt INTEGER NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', PRIMARY KEY(object_key,upload_id));
CREATE INDEX uploads_job ON job_uploads(job_id);
CREATE INDEX clips_context ON clips(context_clip_id);
