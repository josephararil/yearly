# Backend (Cloudflare Workers + D1)

The app is hosted on Cloudflare Workers with a D1 SQLite database. Static files live in `public/`;
Worker entry point is `src/index.js`; config is `wrangler.jsonc`. Live at
**https://yearly.josepharari.com** behind Cloudflare Access (Google SSO). The client sync layer
that talks to these endpoints is documented in [ARCHITECTURE.md](ARCHITECTURE.md#sync-layer--ysyncjsx-windowysync).

## D1 schema (`migrations/`)

Four tables, applied via `npx wrangler d1 migrations apply yearly-db --remote`. Five migration
files: `0001_init.sql`, `0002_revolut_fields.sql`, `0003_oneoff_flag.sql`,
`0004_fix_updated_at_seconds.sql`, `0005_meta.sql`.

```sql
-- 0001_init.sql
transactions(id TEXT PK, date TEXT NOT NULL, description TEXT,
             amount_eur REAL NOT NULL, category TEXT NOT NULL,
             note TEXT, source TEXT,
             fun INTEGER NOT NULL DEFAULT 0, person TEXT,
             original_amount REAL, original_currency TEXT,
             deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)
-- idx_tx_updated on updated_at for efficient sync queries

-- 0002_revolut_fields.sql (added columns for Revolut-sourced data)
-- revolut_category TEXT, merchant_mcc TEXT, merchant_city TEXT,
-- merchant_country TEXT, merchant_logo TEXT, card_label TEXT,
-- tx_type TEXT, e_commerce INTEGER NOT NULL DEFAULT 0, fee_eur REAL

-- 0003_oneoff_flag.sql
-- oneoff INTEGER NOT NULL DEFAULT 0  (always 0 on Revolut import; toggled in-app)

-- 0005_meta.sql (pipeline-written key/value store)
meta(key TEXT PRIMARY KEY, value INTEGER NOT NULL)
-- Populated only by the pipeline. Current rows:
--   last_revolut_sync_ts: ms epoch of the most recent successful push.
--   Written with an UPSERT so the value is always the latest run, never the latest
--   in-app edit (edit-proof freshness signal).

settings(id INTEGER PK CHECK(id=1), blob TEXT, updated_at INTEGER)
-- single row; blob is a JSON-serialised settings object
```

`amount_eur` is stored as `REAL` (mirrors the JS field directly). `fun`, `deleted`, `e_commerce`,
and `oneoff` are `0`/`1` integers. `updated_at` is a **server-stamped ms epoch** on every write.
`"migrations_dir": "migrations"` is set in `wrangler.jsonc`'s `d1_databases[0]`.

## API endpoints (`src/index.js`)

All under `/api/*`. Server clock is authoritative; every write stamps `updated_at = Date.now()`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `{ok:true,db:true}` — DB connectivity check |
| `GET` | `/api/sync?since=<ms>` | Pull: `{now, transactions:[rows with updated_at>=since], settings:row|null}` |
| `GET` | `/api/sync/check` | Aggregate check: `{tx_count, sum_eur_cents, settings_updated_at, last_revolut_sync_ts}` — used by client reconciliation |
| `POST` | `/api/transactions` | Batch upsert array of tx records; returns `{now, count}` |
| `GET` | `/api/settings` | `{blob:{…}, updated_at}` or `{blob:null}` |
| `PUT` | `/api/settings` | Upsert settings blob; returns `{now, updated_at}` |
| `GET` | `/api/export` | Full dump: `{exported_at, transactions:[all incl. deleted], settings}` |

`GET /api/sync/check` returns a cheap one-round-trip aggregate: `tx_count` (COUNT WHERE deleted=0), `sum_eur_cents` (SUM(amount_eur)*100 rounded to INTEGER to avoid float drift), `settings_updated_at` (settings row's `updated_at` or 0), `last_revolut_sync_ts` (value from `meta` WHERE key=`'last_revolut_sync_ts'`, or `null` if the row/table doesn't exist — graceful for pre-migration deployments). Runs on every app open; intended to be fast (full table scan is acceptable at current scale).

Key implementation notes:
- `GET /api/sync` uses `>=` (not `>`) to avoid dropping a write on the same-ms boundary.
- `POST /api/transactions` coerces absent/falsy `deleted` → `0` explicitly (reliable un-delete).
- `fun` and `oneoff` booleans → `0/1` on write; client reconstructs `fun:true`/`oneoff:true`/omit
  on read.
- Body validation: array required, each item must have a string `id`; returns 400 otherwise.
- Uses `env.DB.batch([...])` for the upsert array.
