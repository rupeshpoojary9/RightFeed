CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  search_query TEXT NOT NULL DEFAULT '',
  last_searched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- kind: 'channel' (YouTube channel RSS) or 'feed' (any article/podcast RSS)
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  trusted INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  last_fetched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, ref)
);

-- status: 'new' -> 'filtered' (dropped by hard rules) | 'scored'
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL DEFAULT '',
  channel_title TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  duration_sec INTEGER,
  thumbnail TEXT,
  is_short INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'channel',
  origin_goal_id INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  filter_reason TEXT,
  score REAL,
  score_reason TEXT,
  goal_id INTEGER,
  summary TEXT,
  transcript TEXT,
  transcript_status TEXT,
  watch_later INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status, score);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  source_id INTEGER NOT NULL,
  source_title TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'article',
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  filter_reason TEXT,
  score REAL,
  score_reason TEXT,
  goal_id INTEGER,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  video_id TEXT PRIMARY KEY,
  value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_picks (
  day TEXT NOT NULL,
  video_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (day, video_id)
);

CREATE TABLE IF NOT EXISTS watch_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  day TEXT NOT NULL,
  intent TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_watch_day ON watch_sessions(day);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  ts_sec INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quizzes (
  video_id TEXT PRIMARY KEY,
  questions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  due_day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS path_items (
  path_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (path_id, video_id)
);

CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
