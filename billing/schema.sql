CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  device_hash  TEXT NOT NULL,
  idfv_hash    TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'trial',
  expires_at   INTEGER NOT NULL DEFAULT 0,
  apple_token  TEXT UNIQUE,
  orig_txn     TEXT NOT NULL DEFAULT '',
  family_of    TEXT,
  created      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_device ON accounts (device_hash);
CREATE INDEX IF NOT EXISTS accounts_idfv ON accounts (idfv_hash);

CREATE TABLE IF NOT EXISTS ledger (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  pool     TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('grant','topup','debit','refund','adjust')),
  credits  INTEGER NOT NULL,
  ref      TEXT NOT NULL UNIQUE,
  job_id   TEXT,
  created  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_pool ON ledger (pool);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  account    TEXT NOT NULL,
  pool       TEXT NOT NULL,
  minutes    INTEGER NOT NULL,
  resolution TEXT NOT NULL,
  credits    INTEGER NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('running','done','error')),
  video_url  TEXT,
  settled    INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_pool ON jobs (pool, status);

/* `final` marks a call (and the video it yields) as deliverable: the finished film, or a trim of one. */
CREATE TABLE IF NOT EXISTS job_calls (
  request_id TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL,
  app        TEXT NOT NULL,
  final      INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS job_calls_job ON job_calls (job_id);

CREATE TABLE IF NOT EXISTS job_assets (
  job_id  TEXT NOT NULL,
  url     TEXT NOT NULL,
  app     TEXT NOT NULL,
  final   INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  PRIMARY KEY (job_id, url)
);
CREATE INDEX IF NOT EXISTS job_assets_job ON job_assets (job_id);
