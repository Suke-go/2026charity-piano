CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  stream_live_input_uid TEXT,
  stream_playback_uid TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  comment_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_session_id TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  server_received_at TEXT NOT NULL,
  display_status TEXT NOT NULL,
  moderation_status TEXT NOT NULL,
  deleted_flag INTEGER NOT NULL DEFAULT 0,
  moderation_reason TEXT,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_comments_event_time
ON comments(event_id, server_received_at);

CREATE INDEX IF NOT EXISTS idx_comments_event_deleted_time
ON comments(event_id, deleted_flag, server_received_at);

CREATE TABLE IF NOT EXISTS comment_request_dedup (
  dedup_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_session_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(event_id, user_session_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  log_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_id TEXT,
  actor_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_event_time
ON admin_audit_logs(event_id, created_at);
