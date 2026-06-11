# Architecture

Code-internals reference for Yearly. CLAUDE.md links here; read it when changing the engine,
the store shape, the sync layer, or the state root. For UI components see [UI.md](UI.md).
The README is the authoritative spec for *intended* projection math and callout detectors.

## Module system (no bundler)

Every `y/*.jsx` file is an IIFE that **reads its dependencies off `window` and attaches its
own export to `window`**. There are no imports/exports. Two consequences:

1. **Load order is significant** and is fixed in `index.html` (primitives → screens → root).
   If you add a module, add its `<script type="text/babel">` tag there in dependency order.
   Actual order: `icons → ds → data → sync → calc → ui → fun → home → addflow → analysis →
   settings → app`.
2. Cross-module calls go through the global namespace: `window.YData`, `window.YCalc`,
   `window.YSync`, `window.YUI`, `window.YFun`, `window.YHome`, `window.YAnalysis`,
   `window.YSettings`, `window.YAdd`, plus `window.Icon`/`window.YIcons`. Aperture components
   come from `window.ApertureDesignSystem_72a4cd`.

## The brain — `y/calc.jsx` (`window.YCalc`)

**All numbers come from here.** Pure functions, no UI deps. **If you change the math or
detectors, update the README spec in the same change** — it documents the exact projection
formula, status thresholds, and each callout detector.

### Exports

- `computeStats(store, year, asOfDate?)` — damped-blend projection + per-year buffer uplift +
  status thresholds; `asOfDate` defaults to `new Date()`.
- `buildCallouts(store, stats)` — the ranked detector engine (8 detectors).
- `cumulativeByDay(txns)` → `number[366]` (shared with `analysis.jsx`).
- `priorYearCumulative(store, year, asOfDate)` → number (prior year spend at same day-of-year).
- `rateForMonth(person, ym)` → number (latest applicable rate for a person in a "YYYY-MM";
  0 before startMonth).
- `computeFun(store, asOfDate?)` → per-person fun ledger (see below).
- `projectionAsOf` (trend detector).
- `requiredDailyToHit(stats)` → number|null (daily cap to finish on mainTarget; null when N/A).
- `neededMonthlyCap(stats)` → number (`max(0, (mainTarget − spentBeforeCurrentMonth) / (12 −
  currentMonthIndex))` — used by MonthCurve target line and the "needed/mo" stat).
- `projectedMonthEnd(stats)` → number (current-month daily-rate extrapolation from today to
  month-end; equals `byMonth[m].amount` for complete/future years — shared by MonthCurve and
  StatusHero pulse line).
- plus the standard formatters.

All magic-number thresholds are named in the `T` constants object at the top of the IIFE —
see README §Callout detectors threshold table for the full rationale.

### Key implementation conventions

- **`localISO(d)`** — always format dates as "YYYY-MM-DD" using `getFullYear()/getMonth()/
  getDate()`, never `toISOString()`. `toISOString()` uses UTC midnight and shifts the date
  backward in UTC+ timezones (EET = UTC+2/+3), silently dropping Dec 31 transactions from
  completed years.
- **Lump-sum winsorization** — transactions > 2% of `mainTarget` are excluded from the blended
  trailing rate calculation (but still included in `spent`). Without this, a single €5k holiday
  inflates the year-end projection by ~4× the purchase price. Winsorized tx appear in
  `stats.lumps[]`. The `oneoff:true` tx flag forces the same exclusion via `isLump()`.
- **doy>28 trend guard** — the trend detector (detector #1) only fires when `stats.doy > 28`.
  Before day 28, `projectionAsOf(stats, 28)` would reference the prior year, producing a
  spurious near-zero reference projection and triggering a false "year-end projection has shot
  up" alert every January.
- **`funProjection` cap** — `funProjection = min(linear, funSpentYTD + max(0, Σbalances) +
  futureAccruals)`. Without the cap, a single large fun purchase in January extrapolates
  linearly to ~€22k, inflating `combinedProjection` by ~7× what the allowance system can ever
  permit. The cap is based on what the allowance system will actually produce over the rest of
  the year.

### Vocabulary (canonical names — never use `target` for the stored ceiling)

- `ceiling` — `years[y].ceiling`, stored, user-set, sacred. Renamed from `target`.
- `funPlanAnnual` — Σ people × 12 months × rateForMonth; derived.
- `mainTarget` — `ceiling − funPlanAnnual`; derived, never stored. Non-discretionary budget.
- `spent` / `projection` in stats — main (non-fun) only. Fun tx excluded from all main math.
- `funSpent` / `funProjection` — fun YTD and capped projection (linear, but capped at what the
  allowance system can permit; see "funProjection cap" above).
- `combinedProjection` = `projection + funProjection`; `combinedDelta` / `combinedStatus` vs
  `ceiling`.

### Projection formula (damped blend)

`projection = spent + blendedRate × daysRemaining × (1 + buffer)` where `blendedRate =
YTD_rate × (doy/365) + trailing_60d_rate × (1 − doy/365)`. The buffer uplifts only the
extrapolated remainder, so on Dec 31 projection equals spent exactly; `funProjection` carries
no buffer by design. Early in the year the blend trusts recent momentum (thin YTD history);
late in the year it locks onto the full-year average, so a July holiday doesn't hijack the
December projection. For complete/future years `projection = spent`. `projectionAsOf` uses the
same blend for consistent trend comparisons.

### `computeStats` returns

`ceiling`, `mainTarget`, `funPlanAnnual`, `funSpent`, `funProjection`, `combinedProjection`,
`combinedDelta`, `combinedDeltaPct`, `combinedStatus` plus all existing fields (`spent`,
`dailyRate` YTD, `trailingDailyRate` blended, `daysRemaining`, `projection`, `delta`,
`status`, `projLow`, `projHigh`, `bandAmt`, etc. — all main-budget). `stats.txns` contains
main-only tx (fun tx excluded); `stats.upto` is likewise main-only.

**Forecast uncertainty band** (`projLow`/`projHigh`/`bandAmt`): computed from sample std-dev of
weekly recurring totals when ≥4 complete weeks are available (current incomplete year only).
`bandAmt = sigmaWeek × √weeksRemaining × (1+buffer)`; `projLow = max(spent, projection −
bandAmt)`. All three are `null` when data is insufficient (<4 weeks, or complete/future year).

**Main status gating**: when the band exists, `status` is "good" if `projection ≤ mainTarget`;
"alert" if `projLow > mainTarget` (even the optimistic bound misses); "watch" otherwise. This
prevents threshold-flapping: the number only escalates to "alert" when the lower bound of the
forecast clears the target. When `bandAmt` is null (<4 weeks), the old static ±8% threshold
(`T.WATCH_BAND_CURRENT`) applies unchanged. `combinedStatus` always uses the static thresholds
— the band applies to main only.

`priorCum` (number[366] | null) and `priorSpent` (number | null) — prior year, main tx only.
Future-year guard: spent 0, projection 0, status "good"; `isFuture` in returned stats.

### `buildCallouts` — 8 detectors

See README for the authoritative spec. Quick index:
- #1 trend (doy>28 guard, 4-week projection change) — text prefixed "Main budget: "
- #2 streak (14-day pace vs baseline) — text prefixed "Main budget: "
- #3 mover (MoM category change)
- #4 share (top category % of spend)
- #5 buffer explanation
- #6 yoy (main spent vs prior year at same doy)
- #7 reqpace (when projection > mainTarget) — text prefixed "Main budget: "
- #8 ceiling (sacred combined verdict, always first)

Ceiling callout states: `combinedProjection > ceiling` → watch/alert — text "trim fun ~€Z/mo"
when overBy/monthsLeft ≤ funPlanAnnual/12, else "even cutting entire fun budget won't close it;
main spending needs to drop ~€W/mo too"; between 0.94×–1× → `info` "tight but on course"; <
0.94× → good/info "room to raise fun budget". Always prepended first; replaces calm fallback.
Complete year: single `{id:"final"}` callout compares `spent + funSpent` vs `ceiling` (not just
main spend vs mainTarget). Future year: single `{id:"future"}` callout.

### `computeFun(store, asOfDate?)`

Exported, uses `store.currentYear` for YTD figures. Returns: `people[]` (per-person: `id`,
`name`, `balance` all-time = accrued − spent + `balanceAdjustment`, `monthlyRate`,
`usedThisMonth`, `spentAllTime`), `funSpentYTD`, `funProjection` (linear/capped, see README
§6.2), `funCatList` (category breakdown). **Balance** only counts fun txns with `t.date >=
p.startMonth + "-01"` — pre-startMonth transactions are excluded (no matching accrual). **Year
classification** (current / complete / future) is relative to `asOf.getFullYear()`, not `new
Date().getFullYear()`, so historical `asOfDate` values classify consistently.

## Store shape — `y/data.jsx` (`window.YData`)

The persisted store shape, the fixed 18-category list (`CATEGORIES`, id→icon→color), default
templates, and `loadStore`/`saveStore`/`resetStore`/`migrateStore`.

**Store shape (fun-budget model):**
- `store.people`: `[{id, name, rates:[{from:"YYYY-MM", amount}], startMonth:"YYYY-MM",
  balanceAdjustment?:number}]` — forward-only dated rate schedule per person.
  `balanceAdjustment` is an additive offset to the computed balance (set via "Correct balance"
  in Settings → Fun budget); 0 when absent. Default: Joseph €100/mo, Marti €200/mo.
- `store.wishlist`: `[{id, owner, name, price, note?, createdMonth}]` — per-person wishlist items.
- Transaction fields: optional `fun:true` and `person:"joseph"|"marti"` (only on fun tx).
  Optional `oneoff:true` — excludes the tx from the blended rate used in projection (still
  counts in `spent`). Always absent on Revolut import (defaults to 0); toggled in-app via Manual
  add / edit sheet. Optional Revolut-sourced fields: `merchant_logo` (URL string),
  `merchant_city` (string).
- `years[y].ceiling` — renamed from `years[y].target` (sacred household ceiling, never derived).

`buildSeed()` — returns a blank store: `transactions: []`, `wishlist: []`, default year ceilings
(2024 €21k / 2025 €23k / 2026 €25k), default people rates, default templates. No sample data.

`migrateStore(s)` (exported, idempotent): `years[y].target` → `ceiling`; injects `people` and
`wishlist` defaults if missing; sets `density` default; normalizes all `transactions[*].category`
to lowercase IDs (fixes Revolut title-case import: `"Groceries"` → `"groceries"`). Called by
`loadStore` and by JSON restore.

**`normalizeCategory(raw)`** (exported) — resolves any raw category string to a canonical
lowercase ID. Handles: valid ID passthrough, title-case ID (`"Groceries"` → `"groceries"`), full
label (`"House Stuff"` → `"house"`), unknown → `"general"`. Used by `cat()`, `rowToTx` in sync,
and `aggregateByCategory`/`aggregateByMonth` in calc.

**`uid()`** — `crypto.randomUUID()` (collision-safe across devices and reloads).

## Sync layer — `y/sync.jsx` (`window.YSync`)

Loaded immediately after `y/data.jsx` (depends only on `YData` + `fetch`; must be before
`app.jsx`). Implements outbox-based client↔D1 sync with optimistic UI and offline-safe queuing.
Backend API contract is in [BACKEND.md](BACKEND.md).

**localStorage keys:**
- `yearly:sync:cursor` — server `now` timestamp from the last successful pull; used as `since=`
  in `GET /api/sync`.
- `yearly:outbox:v1` — JSON array of full tx records pending push; deduped by `id` keeping
  latest version.
- `yearly:settings:dirty` — `"1"` when any non-transactions store key has changed since last
  flush.
- `yearly:bootstrapped` — `"1"` after the one-time bootstrap completes; prevents re-seeding on
  reload.
- `yearly:settings:appliedAt` — `updated_at` of the last settings blob pulled from the server;
  prevents re-applying a blob we just pushed.

**Public API:**
- `YSync.init({ getStore, applyServer })` — called once on mount. `getStore()` returns the live
  store via a ref; `applyServer(updater)` maps to the app's `setStore`.
- `YSync.enqueueTx(record)` — dedupe-adds a tx (or delete record) to the outbox and schedules a
  flush.
- `YSync.markSettingsDirty()` — marks settings for push and schedules a flush. Called
  automatically from `app.jsx`'s `setStore` wrapper whenever only non-transactions keys change.
- `YSync.flush()` — push outbox in chunks of 75, then PUT settings if dirty. Captures `(id →
  __seq)` pairs before the POST; entries updated mid-flight (same id, higher `__seq`) survive the
  post-flush filter and are re-sent next flush. Clears the dirty flag before the PUT and restores
  it on failure. Concurrent calls share one in-flight promise (reentrancy latch); the cursor is
  never advanced here — only `pull()` advances the cursor.
- `YSync.pull()` — calls `flush()` first (prevents golden-source pull from clobbering unsynced
  writes), then `GET /api/sync?since=cursor`, merges tx by id (deleted rows are removed), applies
  settings only when `updated_at > appliedAt`, updates cursor.
- `YSync.reconcile()` — compares `GET /api/sync/check` aggregate against the local store; triggers
  `pull({ force: true })` on any mismatch. Returns `{ ok, before, after, recovered }`. Offline-safe
  (no-ops when `syncFetch` returns null).
- `YSync.bootstrap()` — called once on mount. Flushes the outbox first so offline-created
  transactions reach the server before the since=0 pull decides adopt vs seed path. If server has
  data, adopts it (second-device path); if empty, seeds it (first-device path). Sets
  `yearly:bootstrapped`.
- `YSync.start()` — wires `online`, `focus`, and `visibilitychange` → visible triggers.

**Auth-expiry vs offline:** `syncFetch()` wraps every `fetch` call. If the call throws
(`TypeError`) it checks `navigator.onLine`: offline → return `null` silently; online →
`location.reload()` (Cloudflare Access expiry as a cross-origin 302 CORS block). For non-throwing
bad responses, only reloads on auth-expiry patterns: 200 with non-JSON body (Cloudflare Access
login page redirect) or HTTP 401/403. 404 and 5xx return `null` silently — they indicate backend
or local-dev issues, not auth expiry. Auth-expiry reloads are throttled to one per 30 s via
`safeReload()` (sessionStorage key `yearly:lastReload`) so a persistent transient error never
becomes a reload loop.

**Reconciliation path (`YSync.reconcile()`):** called once on every mount, after `bootstrap().then(() => pull())` resolves. It fetches `GET /api/sync/check` (server aggregate: `tx_count`, `sum_eur_cents`, `settings_updated_at`) and compares against the local store. If any field mismatches it calls `pull({ force: true })` to refetch the full dataset, then queries `/api/sync/check` a second time; if the two server snapshots differ (indicating a concurrent write), a `console.warn` is emitted. The invariant it enforces: after every app start, the client's transaction count and EUR sum must equal the server's. This is what catches the class of bug where rows land on the server with a malformed `updated_at` (e.g. seconds instead of milliseconds) and are permanently skipped by the cursor-based incremental sync. The post-pull verification compares the two server snapshots rather than re-reading the local store, avoiding a React render-timing race. Returns `{ ok, before, after, recovered }` — callers log a one-liner when `recovered: true`.

**Pull triggers:** on every mount (unconditional `bootstrap().then(() => pull()).then(() => reconcile())` in `app.jsx`),
on `visibilitychange` → visible, and before `EditSheet` opens (freshness pull via `openEdit`
wrapper in `app.jsx`). The `focus` event triggers `flush()` only (no full pull). `pull()` always
flushes first so local changes are never overwritten by a server pull. On already-bootstrapped
devices, `bootstrap()` is a no-op (returns immediately if `yearly:bootstrapped` is set); settings
are compared by `updated_at > appliedAt` so only genuinely newer server settings overwrite local
ones.

> **Why no `/api` calls appear on hard reload:** `bootstrap()` is gated by `yearly:bootstrapped`
> in localStorage — once set (after first ever sync), it returns immediately without any network
> call. The `focus` and `visibilitychange` listeners fire only when the window *gains* focus or
> the tab *becomes* visible after being hidden. A hard reload in an already-focused,
> already-visible tab triggers neither. To force a pull: switch away from the tab and back, or
> open an Edit sheet.

## State flow — `y/app.jsx`

`App` is the single stateful root. `store` (persisted via a `setStore` that writes the whole
object to localStorage on every mutation) is the only durable state; `route` / `viewYear` /
`analysisFocus` / `addOpen` / `editTx` / `yearOpen` / `deletedTx` / `showToast` are ephemeral UI
state. Three memoized derivations drive everything visible: `stats =
YCalc.computeStats(store, viewYear)`, `callouts = YCalc.buildCallouts(store, stats)`, and `fun =
YCalc.computeFun(store)` (all-time per-person fun ledger, recomputed on any store change).
`onOpenFun` sets `analysisFocus = { section:"fun" }` and routes to Analysis → Fun tab. `fun`,
`store`, `setStore`, and `addTx` are passed to `AnalysisScreen` (for `FunTab`); `fun`, `store`,
and `onOpenFun` are passed to `HomeScreen` (for `FunStrip`). `store` is also passed to `EditSheet`
so it can read `store.people` for the fun toggle owner picker.

**Sync wiring in `app.jsx`:** on mount, `YSync.init({ getStore: () => storeRef.current,
applyServer: setStore })` + `YSync.start()` + `YSync.bootstrap()`. `storeRef` is kept current via
a `useEffect`. `addTx`/`saveTx` call `YSync.enqueueTx(tx)` after `setStore`; `delTx` enqueues
`{ ...tx, deleted:true }`; `undoDelete` re-enqueues without `deleted`. Settings dirty is detected
centrally inside `setStore`: when `next.transactions === prev.transactions` (reference unchanged →
settings-only mutation) `window.YSync.markSettingsDirty()` is called. `openEdit` wraps `setEditTx`
to call `YSync.pull()` before opening the edit sheet.

`density` (minimal/balanced/all) is persisted in `store.density` and controls how many callouts
the Overview shows. It is editable in Settings → Display → Overview density.

Undo-on-delete: `delTx(id)` stashes the removed transaction in `deletedTx` and raises `showToast`.
The `Toast` primitive (from `YUI`) auto-dismisses after 5 s; the "Undo" action re-inserts
`deletedTx` into the store.

Navigation is in-memory route state (`home` | `analysis` | `settings`), not URL routing. Tapping
a callout sets `analysisFocus = { section, category? }` and switches to Analysis, which jumps to
that tab and pre-expands the focused category. `viewYear` is independent of `store.currentYear`;
selecting a past year flips the app into "completed year" mode (final spend, no
projection/buffer).
