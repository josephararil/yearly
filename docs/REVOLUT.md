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
`BUFFER_DAYS = 5` (days before last sync to re-pull for late-settling transactions).

## Day-to-day workflow

1. **`prepare.bat`** (`python sync.py prepare`) — generates the console script with the correct
   `STOP_BEFORE` date (last sync − 5 days), copies it to clipboard, saves to
   `batches/console_script.js`.
2. Open `app.revolut.com`, paste the script in DevTools console (F12). A `revolut_YYYY-MM-DD.json`
   downloads to `~/Downloads`.
3. **`push.bat`** (`python sync.py push`) — detects the JSON in Downloads, runs `revolut_clean.py`
   twice (generates `batches/latest.sql` + `batches/latest.csv`), prompts "Push to D1? [Y/n]", runs
   `npx wrangler d1 execute yearly-db --remote --file=latest.sql`. On success: archives JSON + CSV
   to `batches/`, updates `.sync_state.json`, deletes working files.
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
| `completedDate` (ms) → `YYYY-MM-DD` | `date` |
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

- `state != "COMPLETED"` → skip
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
it in 2018; affected rows get `amount_eur = original_amount` (wrong). Fix manually in the CSV or SQL
before pushing.

## `.sync_state.json`

```json
{
  "last_sync_date": "YYYY-MM-DD",   // latest completedDate seen in the last push
  "last_sync_ts": 1234567890,       // Unix timestamp of when the push ran
  "total_transactions": 650         // running total across all pushes
}
```

`prepare` uses `last_sync_date − 5 days` as `STOP_BEFORE` to catch late-settling transactions. Do
not delete this file.

## Known issues

- **TRY**: Frankfurter doesn't support Turkish lira. Fix `amount_eur` manually before pushing.
- **Cyrillic merchant names**: Revolut's XLSX export garbles them; JSON export is clean. Always use
  JSON.
- **PENDING transactions**: skipped (`state != "COMPLETED"`). Small discrepancies vs Revolut's
  dashboard are expected.
- **Wrangler auth**: OAuth token occasionally goes stale. Fix: run `npx wrangler logout && npx
  wrangler login` from `scripts/`.
- **D1 no transaction support**: SQL uses bare `INSERT OR REPLACE` statements with no `BEGIN
  TRANSACTION` wrapper.
