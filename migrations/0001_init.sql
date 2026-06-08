CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT PRIMARY KEY,
  date              TEXT NOT NULL,
  description       TEXT,
  amount_eur        REAL NOT NULL,
  category          TEXT NOT NULL,
  note              TEXT,
  source            TEXT,
  fun               INTEGER NOT NULL DEFAULT 0,
  person            TEXT,
  original_amount   REAL,
  original_currency TEXT,
  deleted           INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_updated ON transactions(updated_at);

CREATE TABLE IF NOT EXISTS settings (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  blob       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
