# Revolut data pipeline

Revolut has no public API for personal accounts. Transactions are imported via a browser console
script that paginates Revolut's internal API, then processed by Python scripts and pushed to D1.
The **source of truth for the merchant/category rules is `scripts/revolut_clean.py`** — read that
file when adding merchants or changing mappings.

## Scripts folder (`scripts/`)

```
scripts/
├── .wrangler/               # Wrangler auth — do not touch
├── batches/                 # Archived JSON downloads, generated CSVs, console_script.js
├── .sync_state.json         # Tracks last sync date — do not delete
├── revolut_clean.py         # Core cleaning script: Revolut JSON → SQL or CSV
├── sync.py                  # Orchestrator: prepare / push / status commands
├── from_csv.py              # Legacy XLSX/CSV fallback (no enrichment columns)
├── prepare.bat              # Double-click → generates + copies console script
├── push.bat                 # Double-click → detects JSON, cleans, pushes to D1
└── status.bat               # Double-click → shows last sync info
```

Config in `sync.py`: `D1_DATABASE = "yearly-db"`, `REVOLUT_WALLET`, `REVOLUT_DEVICE_ID`,
`BUFFER_DAYS = 30` (days before last sync to re-pull for late-settling transactions).

## Day-to-day workflow

1. **`prepare.bat`** (`python sync.py prepare`) — generates the console script with the correct
   `STOP_BEFORE` date (last sync − 30 days), copies it to clipboard, saves to
   `batches/console_script.js`.
2. Open `app.revolut.com`, paste the script in DevTools console (F12). A `revolut_YYYY-MM-DD.json`
   downloads to `~/Downloads`.
3. **`push.bat`** (`python sync.py push`) — detects the JSON in Downloads, runs `revolut_clean.py`
   **once** (generates `batches/latest.sql` + `batches/latest.csv` + `batches/latest.report.json`
   in a single pass so FX rates are fetched once, with `--quiet` so `sync.py` owns the console
   output), prints a **push preview** (see below), prompts "Push to D1? [Y/n]", runs
   `npx wrangler d1 execute yearly-db --remote --file=latest.sql`. The generated SQL includes an
   UPSERT that writes `last_revolut_sync_ts` (ms epoch, `int(time.time() * 1000)`) into the `meta`
   table — the pipeline freshness marker the app reads via `/api/sync/check`. On success: archives
   JSON + CSV to `batches/`, updates `.sync_state.json`, deletes working files (incl. the report).

### Push preview (what `sync.py push` prints before the prompt)

Before pushing, `sync.py` does a **read-only** `wrangler d1 execute --remote` query and diffs the
batch against live D1 so you can see exactly what the upsert will do:

- **NEW** — id not in D1; will be inserted (listed with date/description/amount/category).
- **CHANGED** — id in D1 and a pipeline-authoritative field (`date`, `description`, `amount_eur`)
  differs; shown as before→after per field, with a Δ on amount. The diff deliberately ignores
  `updated_at` (always changes) and the `PRESERVE_ON_CONFLICT` columns (`category, fun, person,
  note, deleted`) — those never change in D1, so flagging them would be misleading.
- **UNCHANGED** — id in D1, no diff; counted only (no-op upsert).
- **NET IMPACT ON TOTAL** — `Σ(new amounts) + Σ(changed amount deltas)`: the precise effect on the
  household total. Rows deleted in D1 are noted (the push keeps them deleted).
- **SKIPPED** — every excluded transaction grouped by reason (income/refund, REVERTED, internal
  transfer, prior-year, FX-dropped) with date/description/amount.

The structured input for this preview is `batches/latest.report.json`, emitted by
`revolut_clean.py --report`. If the D1 read fails (auth stale / offline), the preview degrades to a
category summary of the full batch and the push still proceeds.
4. **`status.bat`** — confirms last sync date, run time, total transactions pushed, next pull start
   date.

## Revolut internal API

```
GET https://app.revolut.com/api/retail/user/current/transactions/last
  ?to={timestamp_ms}&count=50&walletId={REVOLUT_WALLET}
```

Pagination: set `to = lastDate - 1` from the final transaction each batch. Stop when batch is empty
or `lastDate < STOP_BEFORE`.

## `revolut_clean.py` — key JSON fields

| Revolut field | D1 column |
|---|---|
| `id` | `id` |
| `startedDate` (ms) → `YYYY-MM-DD` | `date` | (when the transaction was made, **not** `completedDate`/settlement; falls back to `completedDate` then `updatedDate` if absent) |
| `abs(amount) / 100`, FX-converted | `amount_eur` |
| `currency` (when non-EUR) | `original_currency` |
| `abs(amount) / 100` (when non-EUR) | `original_amount` |
| `merchant.name` or `description` | `description` |
| `initiatedBy.name` | `person` |
| `comment` | `note` |
| `card.label` | `card_label` |
| `type` | `tx_type` |
| `eCommerce` → 0/1 | `e_commerce` |
| `abs(fee) / 100`, FX-converted | `fee_eur` |
| `category` (lowercased) | `revolut_category` |
| `merchant.mcc/city/country/logo` | `merchant_mcc/city/country/logo` |
| hardcoded `"revolut"` | `source` |
| hardcoded `0` | `fun` |

`fun` is always 0 on import — toggled manually in the app UI. There is no `merchant_name` column;
`description` always receives `merchant.name` when available.

## Skip logic

- `state` in `{REVERTED, DECLINED, FAILED}` → skip. **PENDING is kept** so a transaction is
  captured at started-time and later finalised when it completes and is re-pulled (see the
  upsert + `BUFFER_DAYS` notes below). `date` is always `startedDate` (when the spend happened),
  so it does **not** shift when a pending row later completes.
- `amount >= 0` → skip (income / refunds)
- `type` in `{TOPUP, EXCHANGE}` → skip
- Description matches any of: `^transfer from joseph`, `^transfer from martina`, `^transfer to
  joseph`, `^transfer to martina`, `pocket withdrawal` → skip (internal transfers)
- After all rows are built: filter out any row whose `date` is not in the current calendar year
  (prior-year rows are logged but excluded)

## Category assignment (priority order)

1. **Self-transfers** (`tx_type=TRANSFER`, `amount<0`, description is `"to joseph harari laniado"`
   or `"to джоузеф харари ланиадо"`): use Revolut's own manually-set category (these are old
   cash-tracking IBAN transfers where the category was set at the time).
2. **Other outbound transfers** (`tx_type=TRANSFER`, `amount<0`): check NAME_RULES, default `"Cash"`
   if no match.
3. **NAME_RULES** — regex against lowercased `merchant.name` (or `description`); highest priority,
   overrides Revolut's own category (e.g. Decathlon tagged as "shopping" by Revolut but "Gym" by
   rules).
4. **REVOLUT_CATEGORY_MAP** — maps Revolut's `category` / `merchant.category` string to an app
   category. `"general"` maps to `None` (falls through to next step).
5. **Default** → `"General"`.

Entries flagged as `"General"` after import are printed as a warning and should be reviewed before
pushing.

## FX conversion

Uses `https://api.frankfurter.app/{YYYY-MM-DD}?from={CURRENCY}&to=EUR`. Results are cached
in-memory per currency+date for the run. **TRY (Turkish lira) is unsupported** — Frankfurter dropped
it in 2018. If a lookup fails (TRY or otherwise), the row is **dropped** and listed at the end of the
clean step — add it manually in the app rather than letting `amount_eur` go in wrong.

## `.sync_state.json`

```json
{
  "last_sync_date": "YYYY-MM-DD",   // latest startedDate seen in the last push
  "last_sync_ts": 1234567890,       // Unix timestamp of when the push ran
  "total_transactions": 650         // running total across all pushes
}
```

`prepare` uses `last_sync_date − BUFFER_DAYS` (30) as `STOP_BEFORE` to catch late-settling
transactions. Pagination is keyed on `startedDate`, so the window must be wide enough to re-reach a
transaction that was PENDING when first captured and completed later. Do not delete this file.

## Known issues

- **TRY**: Frankfurter doesn't support Turkish lira. The row is dropped — add manually in the app.
- **Cyrillic merchant names**: Revolut's XLSX export garbles them; JSON export is clean. Always use
  JSON.
- **PENDING transactions**: included (captured at started-time, finalised on completion via the
  preserving upsert + 30-day re-pull window). A pending row carries `startedDate` as its `date` and
  an estimated `amount_eur` until it completes.
- **Wrangler auth**: OAuth token occasionally goes stale. Fix: run `npx wrangler logout && npx
  wrangler login` from `scripts/`.
- **D1 no transaction support**: SQL uses bare `INSERT OR REPLACE` statements with no `BEGIN
  TRANSACTION` wrapper.
- **Field-preserving upsert** (resolved): the pipeline writes `INSERT … ON CONFLICT(id) DO UPDATE`
  (`write_sql`), not `INSERT OR REPLACE`. On re-push it preserves the user-owned columns in
  `PRESERVE_ON_CONFLICT` (`category, fun, person, note, deleted`, plus `oneoff` which the pipeline
  never writes) and updates only pipeline-authoritative fields (`date, amount_eur, description`,
  bank/enrichment columns, `updated_at`). This is what makes `BUFFER_DAYS=30` safe — re-pulling an
  already-imported row no longer reverts in-app edits, resurrects deletions, or wipes `oneoff`.
  Trade-off: a manual override of `amount_eur`/`date` on a Revolut row *is* overwritten back to the
  bank value on re-pull (required so PENDING rows can finalise).

## `updated_at` units — must be milliseconds

The Revolut pipeline writes `updated_at = int(time.time() * 1000)` (milliseconds). The worker
(`src/index.js`) stamps writes with `Date.now()` (ms) and the client cursor lives in ms. If a row
is ever inserted with a seconds value (~10 digits), the `WHERE updated_at >= ?` filter in
`/api/sync` will exclude it from incremental sync **forever** (cursor in ms is ~1000× larger). Any
new direct-to-D1 write path must use milliseconds. Migration `0004_fix_updated_at_seconds.sql`
retroactively fixed the legacy seconds rows.
