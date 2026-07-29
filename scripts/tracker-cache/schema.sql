-- Tracker cache schema — see scripts/tracker-cache/README.md.
-- One row per tracked item; sync.ts upserts, never appends duplicates.

CREATE TABLE IF NOT EXISTS github_issues (
  number             INTEGER PRIMARY KEY,
  title              TEXT NOT NULL,
  state              TEXT NOT NULL,        -- OPEN | CLOSED
  state_reason       TEXT,                 -- COMPLETED | NOT_PLANNED | REOPENED | null
  labels_json        TEXT NOT NULL,        -- JSON string[]
  assignees_json     TEXT NOT NULL,        -- JSON string[]
  body               TEXT,
  url                TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  closed_at          TEXT,
  closed_by_prs_json TEXT NOT NULL,        -- JSON array of {number,url} — empty if not closed-by-PR
  synced_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_prs (
  number             INTEGER PRIMARY KEY,
  title              TEXT NOT NULL,
  state              TEXT NOT NULL,        -- OPEN | CLOSED | MERGED
  is_draft           INTEGER NOT NULL,     -- 0 | 1
  base_ref           TEXT NOT NULL,
  head_ref           TEXT NOT NULL,
  mergeable          TEXT,                 -- MERGEABLE | CONFLICTING | UNKNOWN
  checks_json        TEXT NOT NULL,        -- JSON [{name, status, conclusion}]
  url                TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  merged_at          TEXT,
  closed_at          TEXT,
  synced_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS linear_issues (
  identifier         TEXT PRIMARY KEY,     -- e.g. FEL-544
  title              TEXT NOT NULL,
  state              TEXT NOT NULL,
  project            TEXT,
  assignee           TEXT,
  labels_json        TEXT NOT NULL,
  url                TEXT NOT NULL,
  created_at         TEXT,
  updated_at         TEXT NOT NULL,
  synced_at          TEXT NOT NULL
);

-- One row per source; sync.ts overwrites in place. Read this before trusting
-- the cache — a stale synced_at means the data below it may not reflect
-- reality (source unreachable, auth expired, etc).
CREATE TABLE IF NOT EXISTS sync_log (
  source             TEXT PRIMARY KEY,     -- github_issues | github_prs | linear_issues
  last_synced_at     TEXT NOT NULL,
  item_count         INTEGER NOT NULL,
  ok                 INTEGER NOT NULL,     -- 0 | 1 — 1 only if the fetch fully succeeded
  error              TEXT
);
