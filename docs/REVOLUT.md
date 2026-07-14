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

## Mobile path (bookmarklet + in-app import)

A second, parallel pull path exists for when a laptop isn't available: a **bookmarklet** run on
`app.revolut.com` in a logged-in mobile browser tab, paired with the **"Import Revolut"** row in
the app's Settings screen (see [docs/UI.md](UI.md)). It produces an **identical D1 end state** to
`prepare.bat`/`push.bat` for the same input — same wallet, same fields, same field-preserving
upsert — but needs no Python, no `wrangler` CLI, and no desktop. **The Python pipeline above is
unchanged and still the primary path**; this is purely additive.

Source: `scripts/bookmarklet.js` (human-readable — it's `CONSOLE_TEMPLATE` from `sync.py:86`
adapted to render an overlay instead of triggering a file download). To install:

1. Create a new bookmark in your mobile browser (any URL placeholder works, e.g. `about:blank`).
2. Edit the bookmark's URL and paste the full `javascript:` snippet below in place of the URL.
3. Save it with a name like "Revolut → Yearly".

<details>
<summary>Ready-to-paste <code>javascript:</code> bookmarklet URL</summary>

```
javascript:(async()%3D%3E%7Bconst%20e%3D%7Baccept%3A%22application%2Fjson%2C%20text%2Fplain%2C%20*%2F*%22%2C%22accept-language%22%3A%22en-US%22%2C%22cache-control%22%3A%22no-cache%22%2Cpragma%3A%22no-cache%22%2C%22x-browser-application%22%3A%22WEB_CLIENT%22%2C%22x-client-version%22%3A%22100.0%22%2C%22x-device-id%22%3A%22AAAAAIXDDztSOzqJLJZaae2QShIgSMJa6PgaOQP86SD%2F0AfbuALYF356fkx%2BvwwOJF8D%2BL3rjdMW2EOWIAu5hdWzIK7hUCNDYPD6HEBBnBA9URP3rtLIhHoKhYymmrd9BY9dgA%3D%3D%22%2C%22x-timezone%22%3A%22Europe%2FSofia%22%7D%2Ct%3Dnew%20Date(%60%24%7B(new%20Date).getFullYear()%7D-01-01%60).getTime()%2Cn%3Ddocument.createElement(%22div%22)%3Bn.style.cssText%3D%22position%3Afixed%3Binset%3A0%3Bz-index%3A2147483647%3Bbackground%3A%23111%3Bcolor%3A%23eee%3Bdisplay%3Aflex%3Bflex-direction%3Acolumn%3Bpadding%3A12px%3Bbox-sizing%3Aborder-box%3Bfont-family%3Amonospace%3Bfont-size%3A13px%3B%22%3Bconst%20o%3Ddocument.createElement(%22div%22)%3Bo.textContent%3D%22Fetching%20transactions%E2%80%A6%22%2Co.style.cssText%3D%22margin-bottom%3A8px%3Bwhite-space%3Apre-wrap%3B%22%3Bconst%20a%3Ddocument.createElement(%22textarea%22)%3Ba.readOnly%3D!0%2Ca.style.cssText%3D%22flex%3A1%3Bwidth%3A100%25%3Bbox-sizing%3Aborder-box%3Bbackground%3A%23000%3Bcolor%3A%230f0%3Bfont-family%3Amonospace%3Bfont-size%3A12px%3Bpadding%3A8px%3Bborder%3A1px%20solid%20%23444%3B%22%3Bconst%20c%3Ddocument.createElement(%22div%22)%3Bc.style.cssText%3D%22margin-top%3A8px%3Bdisplay%3Aflex%3Bgap%3A8px%3B%22%3Bconst%20i%3Ddocument.createElement(%22button%22)%3Bi.textContent%3D%22Copy%20JSON%22%2Ci.disabled%3D!0%3Bconst%20s%3Ddocument.createElement(%22button%22)%3Bs.textContent%3D%22Close%22%2C%5Bi%2Cs%5D.forEach(e%3D%3E%7Be.style.cssText%3D%22flex%3A1%3Bpadding%3A12px%3Bfont-size%3A15px%3B%22%7D)%2Cc.appendChild(i)%2Cc.appendChild(s)%2Cn.appendChild(o)%2Cn.appendChild(a)%2Cn.appendChild(c)%2Cdocument.body.appendChild(n)%2Cs.onclick%3D()%3D%3En.remove()%2Ci.onclick%3Dasync()%3D%3E%7Bconst%20e%3Da.value%3Btry%7Bawait%20navigator.clipboard.writeText(e)%2Ci.textContent%3D%22Copied!%22%2CsetTimeout(()%3D%3E%7Bi.textContent%3D%22Copy%20JSON%22%7D%2C1500)%7Dcatch(e)%7Ba.focus()%2Ca.select()%2Co.textContent%2B%3D%22%5CnClipboard%20API%20blocked%20%E2%80%94%20text%20selected%2C%20use%20your%20browser's%20copy.%22%7D%7D%3Btry%7Bconst%20n%3D%5B%5D%3Blet%20c%3DDate.now()%3Bfor(%3B%3B)%7Bconst%20a%3D%60https%3A%2F%2Fapp.revolut.com%2Fapi%2Fretail%2Fuser%2Fcurrent%2Ftransactions%2Flast%3Fto%3D%24%7Bc%7D%26count%3D50%26walletId%3Db3badc0f-f575-43ec-8ca5-eac55929d857%60%2Ci%3Dawait%20fetch(a%2C%7Bheaders%3Ae%2Ccredentials%3A%22include%22%7D)%2Cs%3Dawait%20i.json()%3Bif(!s.length)%7Bo.textContent%3D%22No%20more%20transactions.%22%3Bbreak%7Dn.push(...s)%3Bconst%20r%3Ds%5Bs.length-1%5D.startedDate%3Bif(o.textContent%3D%60Fetched%20%24%7Bn.length%7D%20transactions...%20last%3A%20%24%7Bnew%20Date(r).toISOString().slice(0%2C10)%7D%60%2Cr%3Ct)%7Bo.textContent%2B%3D%22%5CnReached%20stop%20date.%22%3Bbreak%7Dc%3Dr-1%2Cawait%20new%20Promise(e%3D%3EsetTimeout(e%2C300))%7Dconst%20s%3DObject.values(Object.fromEntries(n.map(e%3D%3E%5Be.id%2Ce%5D)))%3Ba.value%3DJSON.stringify(s)%2Co.textContent%3D%60Done.%20%24%7Bs.length%7D%20unique%20transactions%20ready%20to%20copy.%60%2Ci.disabled%3D!1%7Dcatch(e)%7Bo.textContent%3D%60Error%3A%20%24%7Be.message%7D.%20Are%20you%20logged%20into%20app.revolut.com%3F%60%7D%7D)()%3B
```

</details>

Usage:

1. Open `app.revolut.com` in the mobile browser, logged in.
2. Tap the "Revolut → Yearly" bookmark. An overlay appears over the page, paginates the same
   internal API as `prepare.bat` (see below), and shows a live fetch count.
3. When it says "Done. N unique transactions ready to copy", tap **Copy JSON** — the clipboard
   write runs on this tap (a fresh user gesture), which is what makes it work on mobile even though
   the fetch itself was asynchronous. If the clipboard API is blocked, the JSON is left selected in
   the textarea so it can be copied manually.
4. Tap **Close**, switch to the deployed Yearly app, open **Settings → Import Revolut**, paste, and
   follow the preview/import flow (see [docs/UI.md](UI.md)).

Notes:
- Pulls the **joint account only** (`REVOLUT_WALLET = b3badc0f-f575-43ec-8ca5-eac55929d857`, same
  as the Python path) — no auto-detection, no per-person variants. `person` still comes from
  `initiatedBy.name` per transaction, identical to `revolut_clean.py:356`.
- The pull window is **stateless**: always from Jan 1 of the current year (full YTD), since there's
  no local `.sync_state.json` on a phone. Over-fetching is harmless — the app's cleaner filters to
  the current year and the ingest endpoint's upsert is idempotent and field-preserving. (A 90-day
  window would fetch faster if the full-year pull feels slow, at the cost of not re-checking
  older pending/late-settling transactions — edit `STOP_BEFORE` in `scripts/bookmarklet.js` and
  regenerate the minified URL if you want that trade-off.)
- Only Joseph runs this bookmarklet, against the joint account — same scope as today's desktop
  pipeline.

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
