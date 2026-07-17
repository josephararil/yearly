# Backend (Cloudflare Workers + D1)

The app is hosted on Cloudflare Workers with a D1 SQLite database. Static files live in `public/`;
Worker entry point is `src/index.js`; config is `wrangler.jsonc`. Live at
**https://yearly.josepharari.com** behind Cloudflare Access (Google SSO). The client sync layer
that talks to these endpoints is documented in [ARCHITECTURE.md](ARCHITECTURE.md#sync-layer--ysyncjsx-windowysync).

## D1 schema (`migrations/`)

Four tables, applied via `npx wrangler d1 migrations apply yearly-db --remote`. Eight migration
files: `0001_init.sql`, `0002_revolut_fields.sql`, `0003_oneoff_flag.sql`,
`0004_fix_updated_at_seconds.sql`, `0005_meta.sql`, `0006_travel_flag.sql`, `0007_trip_id.sql`,
`0008_amortize.sql`.

> **⚠️ Wrangler migration tracking on remote is out of sync.** The remote `d1_migrations` table
> doesn't record 0002–0004 as applied, so `wrangler d1 migrations apply --remote` will try to replay
> them and fail with "duplicate column name." Until that tracking table is reconciled, apply each
> **new** migration by pasting its SQL into the **Cloudflare D1 dashboard → Console**, then still
> commit the `.sql` file to `migrations/` as the schema record. (0005 was applied this way.)

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

-- 0006_travel_flag.sql
-- travel INTEGER NOT NULL DEFAULT 0  (family-wide travel-budget tag; 0 on Revolut import; toggled in-app)

-- 0007_trip_id.sql
-- trip_id TEXT  (nullable; references store.trips[].id from the settings blob — no new table;
--                present iff travel is set, per YCalc/YData trip plumbing)

-- 0008_amortize.sql
-- amortize_months INTEGER  (nullable; int >= 2, spreads amount_eur over N months — see
--                            YCalc.expandAmortized)
-- virtual INTEGER NOT NULL DEFAULT 0  (no-cash entry flag; only meaningful with amortize_months)

-- 0005_meta.sql (pipeline-written key/value store)
meta(key TEXT PRIMARY KEY, value INTEGER NOT NULL)
-- Populated only by the pipeline. Current rows:
--   last_revolut_sync_ts: ms epoch of the most recent successful push.
--   Written with an UPSERT so the value is always the latest run, never the latest
--   in-app edit (edit-proof freshness signal).

settings(id INTEGER PK CHECK(id=1), blob TEXT, updated_at INTEGER)
-- single row; blob is a JSON-serialised **settings-only** object
-- (people, years, templates, wishlist, travel, trips, density, …).
-- NEVER transactions (they have their own table) and never travelWishlist (removed feature).
-- A clean blob is ~1.5 KB. A legacy client once wrote the full store here (incl. all transactions),
-- bloating the row to ~180 KB; PUT /api/settings now strips both keys server-side to prevent recurrence.
```

`amount_eur` is stored as `REAL` (mirrors the JS field directly). `fun`, `deleted`, `e_commerce`,
`oneoff`, `travel`, and `virtual` are `0`/`1` integers. `trip_id` is a nullable `TEXT` (no FK — trips
live in the settings blob, not a table). `amortize_months` is a nullable `INTEGER` (int ≥ 2, or
`NULL` when the tx isn't amortized). `updated_at` is a **server-stamped ms epoch** on every write.
`"migrations_dir": "migrations"` is set in `wrangler.jsonc`'s `d1_databases[0]`.

## API endpoints (`src/index.js`)

All under `/api/*`. Server clock is authoritative; every write stamps `updated_at = Date.now()`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `{ok:true,db:true}` — DB connectivity check |
| `GET` | `/api/sync?since=<ms>` | Pull: `{now, transactions:[rows with updated_at>=since], settings:row|null}` |
| `GET` | `/api/sync/check` | Aggregate check: `{tx_count, sum_eur_cents, settings_updated_at, last_revolut_sync_ts}` — used by client reconciliation |
| `POST` | `/api/transactions` | Batch upsert array of tx records; returns `{now, count}` |
| `POST` | `/api/revolut/ingest` | Field-preserving batch upsert for the mobile Revolut import pipeline; returns `{now, count}` |
| `GET` | `/api/settings` | `{blob:{…}, updated_at}` or `{blob:null}` |
| `PUT` | `/api/settings` | Upsert settings blob (strips `transactions`/`travelWishlist` server-side); returns `{now, updated_at}` |
| `GET` | `/api/export` | Full dump: `{exported_at, transactions:[all incl. deleted], settings}` |

`GET /api/sync/check` returns a cheap one-round-trip aggregate: `tx_count` (COUNT WHERE deleted=0), `sum_eur_cents` (SUM(amount_eur)*100 rounded to INTEGER to avoid float drift), `settings_updated_at` (settings row's `updated_at` or 0), `last_revolut_sync_ts` (value from `meta` WHERE key=`'last_revolut_sync_ts'`, or `null` if the row/table doesn't exist — graceful for pre-migration deployments). Runs on every app open; intended to be fast (full table scan is acceptable at current scale).

Key implementation notes:
- `GET /api/sync` uses `>=` (not `>`) to avoid dropping a write on the same-ms boundary.
- `POST /api/transactions` coerces absent/falsy `deleted` → `0` explicitly (reliable un-delete).
- `fun`, `oneoff`, and `travel` booleans → `0/1` on write; client reconstructs
  `fun:true`/`oneoff:true`/`travel:true`/omit on read.
- Body validation: array required, each item must have a string `id`; returns 400 otherwise.
- Uses `env.DB.batch([...])` for the upsert array.
- `POST /api/revolut/ingest` is a **separate, preserving** upsert for the mobile Revolut import path
  (see [REVOLUT.md](REVOLUT.md)). Unlike `POST /api/transactions` (which overwrites every column on
  conflict), its `ON CONFLICT DO UPDATE SET` only touches pipeline-authoritative columns (`date`,
  `description`, `amount_eur`, `source`, `original_amount`, `original_currency`, `revolut_category`,
  `merchant_mcc`, `merchant_city`, `merchant_country`, `merchant_logo`, `card_label`, `tx_type`,
  `e_commerce`, `fee_eur`, `updated_at`) and never touches user-owned columns (`category`, `fun`,
  `person`, `note`, `deleted`, `oneoff`, `travel`, `trip_id`, `amortize_months`, `virtual`) —
  mirroring `revolut_clean.py`'s `PRESERVE_ON_CONFLICT`. New ids still get every column set from the
  incoming row (a fresh import cannot arrive pre-amortized). Same body
  validation and `txToBinds` reuse as `POST /api/transactions`; the batch also stamps
  `meta.last_revolut_sync_ts = Date.now()` (ms) in the same `env.DB.batch([...])` call.

> **⚠️ Never `DELETE FROM transactions` directly in the D1 console for cleanup.** The client's pull
> only ever adds/updates rows present in the `/api/sync` response — it never removes a row it already
> has locally unless the incoming row carries `deleted=1` (a tombstone). A raw SQL `DELETE` leaves no
> tombstone, so any client that already synced that row keeps it forever (confirmed: a hard-deleted
> test row from a Revolut-import test stayed visible in the tab that had loaded it, survived a hard
> refresh and "Force resync from server," and only disappeared in a fresh tab that had never seen it).
> To remove a test/bad row so it propagates everywhere, run `UPDATE transactions SET deleted=1,
> updated_at=<now_ms> WHERE id='...'` instead — or use the app's own delete action, which does this
> for you.
