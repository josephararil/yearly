# Plan: Mobile Revolut ingest path (bookmarklet + in-app import)

## Context

Today the Revolut → D1 sync requires a Windows laptop: `prepare.bat` (generate console script) →
paste into DevTools on `app.revolut.com` → `push.bat` (Python clean + `wrangler` push + git commit).
This is desktop-only and tied to a company laptop the user could lose access to.

This plan adds a **second, parallel, mobile-runnable** path that produces an **identical end state in
D1**. The existing Python pipeline stays 100% unchanged — this is purely additive.

New path:
1. A **bookmarklet** run in a logged-in `app.revolut.com` tab (works on mobile). It paginates the same
   internal API as today's console script (same joint-account wallet, same device id, same headers)
   and, instead of downloading a file, presents the raw transaction JSON for copy to clipboard.
2. An **in-app "Import Revolut"** flow in the Yearly web app (already authed via Cloudflare Access on
   the phone). Paste the JSON → the app cleans it client-side (JS port of `revolut_clean.py`) → shows a
   preview → pushes to a **new field-preserving backend endpoint** → refreshes the store.

### Decisions locked with the user
- **Upsert fidelity:** preserve in the backend. New `POST /api/revolut/ingest` replicates
  `revolut_clean.py`'s `PRESERVE_ON_CONFLICT` and stamps `meta.last_revolut_sync_ts`. D1 stays source
  of truth. (The existing `POST /api/transactions` overwrites *all* columns on conflict — unusable for
  re-imports because it would clobber in-app category/fun/note edits and resurrect deletions.)
- **Bookmarklet scope:** only Joseph runs it; only the **joint** Revolut account is pulled (the same
  single `REVOLUT_WALLET = b3badc0f-f575-43ec-8ca5-eac55929d857` the Python script uses). No
  auto-detect, no per-person variants. `person` is read from `initiatedBy.name` per transaction, exactly
  as `revolut_clean.py:356` does.

### The single hard correctness requirement
For the **same input JSON**, the rows written to D1 by the new path must be **identical** to what the
Python pipeline writes: same `id`, `date`, `description`, `amount_eur`, `category`, `person`, same skip
decisions, same current-year filter, same field-preserving upsert semantics, and the same
`last_revolut_sync_ts` freshness marker.

## Changes

### Group 1 — Backend: field-preserving ingest endpoint
**File:** `src/index.js`

Add `POST /api/revolut/ingest` alongside the existing `/api/*` handlers. Body = array of cleaned tx
records (same record shape the client already uses). Behavior:
- Validate: array required; each item needs a string `id` (mirror the existing
  `POST /api/transactions` validation at `src/index.js:147`).
- Upsert each row with an `ON CONFLICT(id) DO UPDATE` that updates **only pipeline-authoritative
  columns** and **preserves user-owned columns**. This must mirror `revolut_clean.py`'s
  `PRESERVE_ON_CONFLICT = {id, category, fun, person, note, deleted}` plus the columns Python never
  writes (`oneoff`, `travel`, `trip_id`):
  - **UPDATE on conflict:** `date, description, amount_eur, source, original_amount,
    original_currency, revolut_category, merchant_mcc, merchant_city, merchant_country, merchant_logo,
    card_label, tx_type, e_commerce, fee_eur, updated_at`.
  - **PRESERVE (never in the UPDATE SET):** `category, fun, person, note, deleted, oneoff, travel,
    trip_id`.
  - On INSERT (new id) all columns including `person`, `category`, etc. are set from the incoming row.
    (Matches Python: new rows get `person=initiatedBy.name`, `category=assign_category`, `fun=0`,
    `deleted=0`; existing rows keep their in-app values.)
- `updated_at` is server-stamped `Date.now()` (ms) — reuse the existing pattern; ignore any client
  `updated_at`.
- After the batch, stamp the freshness marker in one statement, identical to `sync.py:463`:
  `INSERT INTO meta(key,value) VALUES('last_revolut_sync_ts', <Date.now()>) ON CONFLICT(key) DO UPDATE
  SET value=excluded.value;`
- Use `env.DB.batch([...])` like the existing endpoint. Return `{ now, count }`.

Reuse `txToBinds` (`src/index.js:43`) for the INSERT binds — but note it currently appends `updated_at`
last and lists all 25 columns; the new UPSERT's `DO UPDATE SET` clause is different (preserving), so
write a dedicated `INGEST_UPSERT` SQL string and reuse the same bind order/`txToBinds` output.

**Verify:** `curl` (through Access) or the in-app flow: POST a row with a new id → it inserts with the
sent `category`. Edit that row's category in-app. POST the same id again with a *different* category →
D1 keeps the in-app category but updates `amount_eur`/`date`. `GET /api/sync/check` shows
`last_revolut_sync_ts` advanced.

### Group 2 — JS port of `revolut_clean.py`
**File (new):** `y/revolut_import.jsx` → `window.YRevolutImport`

Pure logic module (IIFE reading deps off `window`, attaching its export — the repo's module pattern; no
UI deps). Port faithfully, keeping constants byte-for-byte from `revolut_clean.py`:
- `REVOLUT_CATEGORY_MAP` (`revolut_clean.py:55`), `NAME_RULES` (`:86`, regex with `i` flag),
  `DESCRIPTION_OVERRIDES` (`:118`), `SKIP_DESCRIPTION_PATTERNS` (`:131`), `SKIP_TYPES` (`:139`),
  `SKIP_STATES` (`:233`), `SELF_TRANSFER_DESCRIPTIONS` (`:197`).
- `shouldSkip(tx)` — `revolut_clean.py:235`: skip states, `amount>=0`, `SKIP_TYPES`,
  `SKIP_DESCRIPTION_PATTERNS`.
- `assignCategory(tx)` — `revolut_clean.py:187`: self-transfer branch → NAME_RULES → REVOLUT_CATEGORY_MAP
  (revolut_cat then merchant_cat) → `"General"`.
- `overrideDescription(name, amountEur)` — `revolut_clean.py:123`.
- FX: `getEurRate(currency, dateStr)` calling Frankfurter
  `https://api.frankfurter.app/{date}?from={CUR}&to=EUR`, cached per `currency+date`. EUR → 1.0. On
  failure (incl. TRY) → return null and **drop the row** (list it as skipped), matching
  `revolut_clean.py:155`. **CORS risk:** verify Frankfurter returns `Access-Control-Allow-Origin: *`
  from the browser; if it doesn't, add a `GET /api/fx?from=&date=` proxy in `src/index.js` and call
  that instead. (Historical FX rates are immutable, so parity with Python holds regardless of when the
  lookup runs.)
- `buildRows(transactions)` — `revolut_clean.py:292`: dedupe by id; date from
  `startedDate || completedDate || updatedDate` via **local-ISO-from-ms** → `YYYY-MM-DD` (UTC, matching
  Python's `datetime.fromtimestamp(ts/1000, tz=utc)`); `amount_eur = round(abs(amount)/100 * rate, 2)`;
  map all enrichment fields (`revolut_clean.py:346-371`); `person = initiatedBy.name`; sort by date;
  **filter to current calendar year** (`:377`); return `{rows, skipped, parsed}`.
- **Rounding parity gotcha:** Python `round()` is round-half-to-even (banker's); JS `Math.round` is
  round-half-up. Implement round-half-to-even for `amount_eur` and `fee_eur` so foreign-currency rows
  match Python exactly. EUR rows (rate 1.0, already 2dp) are unaffected.
- Do **not** set `updated_at` (server stamps it).

**File (new):** `revolut_import.test.html` — a parity harness modeled on `calc.test.html`. Loads a
committed fixture (an archived `scripts/batches/revolut_*.json`) and an expected-rows JSON generated by
running the Python `revolut_clean.py` on that same fixture, then asserts row-for-row equality on
`id, date, description, amount_eur, category, person` and identical skip sets. All rows PASS.

**File:** `index.html` — add `<script type="text/babel" src="y/revolut_import.jsx">` in dependency
order (after `calc`, before `settings`, since Settings will consume it).

**Verify:** open `revolut_import.test.html` → all rows PASS.

### Group 3 — In-app Import UI
**File:** `y/settings.jsx` (add an "Import Revolut" entry that opens a paste modal), reusing the
existing settings-row/modal idiom and Broadsheet tokens.

Flow:
1. Textarea paste of the raw Revolut JSON array (what the bookmarklet copies — identical to today's
   downloaded file contents).
2. On "Preview": `JSON.parse` → `YRevolutImport.buildRows(...)`. Build a diff against the current store
   (`YData`/`store`, which reflects D1 after reconcile), mirroring `sync.py`'s preview
   (`sync.py:280`): **NEW** (id not in store), **CHANGED** (existing id where `date`/`description`/
   `amount_eur` differ — the same `COMPARE` tuple as `sync.py:338`), **SKIPPED** (grouped by reason),
   and **NET IMPACT** on total. Show it before committing.
3. On "Import": POST the cleaned rows to `POST /api/revolut/ingest`, then trigger the existing
   `YSync` pull/reconcile so the merged truth (with preserved user fields) refreshes the local store.
   Show a result summary (imported / changed / skipped, net €).
4. Handle errors: invalid JSON, empty after filters, network/endpoint failure (keep the pasted text so
   the user can retry).

**Files:** `public/sw.js` (bump `CACHE_NAME` v65 → v66) and `y/settings.jsx` footer
(`APP_VERSION` v65 → v66) — shell change per CLAUDE.md gotcha #2.

**Verify:** in the browser preview, paste a real archived batch → preview shows plausible new/changed/
skipped → Import → rows appear in the app and in `GET /api/sync/check`.

### Group 4 — Bookmarklet + docs
**File (new):** `scripts/bookmarklet.js` (source, human-readable) plus a short generated
`javascript:`-URL form (in the doc). The bookmarklet is the `CONSOLE_TEMPLATE` from `sync.py:86`
adapted:
- Same `BASE`, `WALLET` (`b3badc0f-…`), `device_id`, headers, pagination (`to = lastDate - 1`, 300ms
  delay, dedupe by id).
- `STOP_BEFORE` is **stateless**: pull from Jan 1 of the current year (full YTD). The client-side
  current-year filter + idempotent preserving upsert make over-fetching harmless. (Optionally a
  90-day window for speed — note the trade-off.)
- Output: instead of `a.download`, render the JSON into a **full-screen textarea overlay** on the
  Revolut page with a **Copy** button (button click = fresh user gesture, so `navigator.clipboard
  .writeText` is allowed even though the fetch is async). This is the mobile-reliable capture method;
  clipboard-on-fetch-resolve alone would fail the user-gesture requirement.

**Docs:** update `docs/REVOLUT.md` (new "Mobile path" section: install bookmarklet, run, paste into
app), `docs/BACKEND.md` (new endpoint), `docs/UI.md` (new import UI), and `CLAUDE.md` only if a hub-level
pointer is warranted.

**Verify:** install the bookmarklet on desktop Chrome first → run on `app.revolut.com` → JSON matches a
fresh `prepare`/manual pull. Then repeat on the phone.

## Critical files
- `src/index.js` — new `POST /api/revolut/ingest` (+ optional `GET /api/fx` proxy)
- `y/revolut_import.jsx` — **new**, JS port of the cleaner (`window.YRevolutImport`)
- `revolut_import.test.html` — **new**, parity test vs Python output
- `index.html` — new `<script>` tag for `revolut_import.jsx`
- `y/settings.jsx` — new Import Revolut modal + `APP_VERSION` bump
- `public/sw.js` — `CACHE_NAME` bump
- `scripts/bookmarklet.js` — **new**, bookmarklet source
- `docs/REVOLUT.md`, `docs/BACKEND.md`, `docs/UI.md` — doc updates

## Existing utilities to reuse
- `txToBinds` / `json()` helpers — `src/index.js:43`, `src/index.js:3`
- Existing `POST /api/transactions` upsert as the structural template — `src/index.js:143`
- `sync.py` preview diff logic (`COMPARE` tuple, new/changed/skipped grouping) — `sync.py:280-395`
- The freshness-marker UPSERT statement — `sync.py:463`
- Cleaner constants/logic to port verbatim — `revolut_clean.py:55-427`
- `YSync` pull/reconcile for post-import refresh — `y/sync.jsx` (`window.YSync`)
- Module-on-window IIFE pattern + `calc.test.html` as the test-harness template

## Out of scope
- Any change to `sync.py`, `revolut_clean.py`, `prepare.bat`, `push.bat`, `status.bat` (must stay
  identical — the Python path keeps working exactly as today).
- Full daily automation / GitHub Action / open-banking aggregator (a separate, larger effort).
- Auto-detecting wallets or supporting Martina running the bookmarklet (only Joseph, joint account).
- Changing `POST /api/transactions` behavior (it stays destructive-on-conflict for the client's own
  sync; the new path uses the new preserving endpoint).
- Winsorization / projection math (lives in `calc.jsx`, unaffected by import).

## Verification (end-to-end, before PR)
1. **Parity test:** `revolut_import.test.html` — every row PASS (JS clean == Python clean on the same
   fixture for `id/date/description/amount_eur/category/person` + identical skip set).
2. **Preservation:** import a batch → edit a row's `category`/`fun` in-app → re-import the *same* batch
   → confirm the in-app edits survive and only `amount_eur`/`date`/`description` update. Confirm a
   deleted row stays deleted (not resurrected).
3. **Freshness:** after import, `GET /api/sync/check` shows `last_revolut_sync_ts` advanced and the
   app's staleness indicator resets.
4. **Cross-mechanism identity:** pull the same joint-account window via both the bookmarklet+import and
   the Python `push` (against a throwaway/local check) → resulting rows identical.
5. **Browser preview:** the import modal renders, preview diff is correct, errors handled; no console
   errors; hard-refresh after the SW bump.
6. **Mobile:** bookmarklet runs on the phone, copies JSON, paste-import succeeds end to end.

