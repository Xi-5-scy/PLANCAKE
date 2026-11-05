PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 username TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, active_plan_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plans (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL DEFAULT '我的旅行规划', data TEXT NOT NULL DEFAULT '{}',
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plan_members (
 plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL DEFAULT 'editor', joined_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(plan_id,user_id)
);
CREATE TABLE IF NOT EXISTS invites (
 code_hash TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 created_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL,
 used_by TEXT REFERENCES users(id), used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON plan_members(user_id);
