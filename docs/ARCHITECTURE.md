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

- `computeStats(store, year, asOfDate?, staleDays = 0)` — damped-blend projection + per-year
  buffer uplift + status thresholds; `asOfDate` defaults to `new Date()`. `staleDays` (4th param,
  default 0) extends the projection horizon backward to cover days elapsed since the Revolut
  pipeline last ran: `projDays = daysRemaining + staleDays`. Only applied when `isCurrent`;
  ignored for complete/future years. When `staleDays === 0` output is byte-identical to the
  pre-stale baseline.
- `buildCallouts(store, stats)` — the value-ranked detector engine (10 detectors).
- `expandAmortized(transactions)` → `Transaction[]` — expands each tx with `amortize_months >= 2`
  into N monthly slices (dated on the 1st, spilling across year boundaries, last slice absorbs the
  rounding remainder) and drops the parent; every other tx passes through unchanged (identity for
  the common case). Slices are `_amortized:true`, `_parent:<parentId>`, and `oneoff:true`. Callers
  feed it a copy of the store (see "Expanded vs raw store" below) — it never mutates its input.
- `amortizationBreakdown(store, viewYear, asOfStr)` — pure, read-only analytics layer over
  amortized transactions, powering the Analysis "Amortization" block and "Amortized" ledger (see
  UI.md). Expands `store.transactions` internally (calls `expandAmortized` itself) but returns only
  **aggregates + RAW parent metadata** — never the slices themselves, preserving the same
  raw-vs-expanded invariant as `computeStats`'s `committedFuture`. Per-parent figures
  (`elapsedMonths`, `spentSoFar`, `remainingAmt`) are derived by counting/summing that parent's own
  slices against `asOfStr`, never a calendar month-diff, so they reconcile to the cent with the
  aggregate math. `parents` is scoped by **schedule overlap**, not `yearTxns`: a parent is included
  iff its slice span (`startYm..endYm`) overlaps `viewYear` at all, so a long amortization (e.g. a
  120-month virtual car) purchased years before `viewYear` still surfaces as "active" during it —
  filtering by the parent's own purchase-year would silently drop it. `byYear`/`totals` look across
  **all** years any slice touches (not just `viewYear`), to show the whole future allocation.
  Returns `{ hasAmortized, parents[], ytd, month, committedThisYear, byMonth[12], byYear[], totals
  }`; `hasAmortized:false` when no parent overlaps `viewYear`, and callers render nothing.
- `cumulativeByDay(txns)` → `number[366]` (shared with `analysis.jsx`).
- `priorYearCumulative(store, year, asOfDate)` → number (prior year spend at same day-of-year).
- `rateForMonth(person, ym)` → number (latest applicable rate for a person in a "YYYY-MM";
  0 before startMonth).
- `computeFun(store, asOfDate?)` → per-person fun ledger (see below).
- `computeTravel(store, asOfDate?)` → family-wide travel ledger (see below).
- `projectionAsOf(stats, daysBack)` → number — the year-end projection as it *would have been* on a
  past date, replaying the exact blended-rate math (§projection) over only the transactions dated on
  or before that date. Powers the trend detector.
- `projectionHistory(stats, stepDays=5)` → `[{doy, dateStr, projection}]` — a full retroactive
  series of `projectionAsOf` from ~Jan (`STABLE_DAYS=14`, before which a single early tx makes the
  rate meaningless) through today, sampled every `stepDays`; the final point uses `stats.projection`
  so it matches the Hero exactly. A **pure derivation** — no stored daily snapshots, so a backdated
  or late-imported tx lands on its transaction date. Consumed by the Overview `EstimateChart`
  ("Estimate over time" view). Empty for complete/future years.
- `requiredDailyToHit(stats)` → number|null (daily cap to finish on mainTarget; null when N/A).
- `neededMonthlyCap(stats)` → number (`max(0, (mainTarget − spentBeforeCurrentMonth) / (12 −
  currentMonthIndex))` — used by MonthCurve target line and the "needed/mo" stat).
- `medianDailySpendYTD(stats)` → number|null (median of per-day totals across every elapsed
  calendar day this year, incl. €0 days — a mean-resistant read on "typical day" spend). Used by the
  Analysis "In numbers" Historical actuals group.
- `historicalMonthRange(store, excludeYm)` → `{min, max, minLabel, maxLabel, n} | null` (all-time
  highest/lowest calendar-month spend total across every year in `store.transactions`; `excludeYm`
  ("YYYY-MM") leaves out one partial month, normally the real current month via `new Date()` so an
  in-progress month never masquerades as the lowest month on record). Used by the same group.
- `projectedMonthEnd(stats)` → number (current-month daily-rate extrapolation from today to
  month-end; equals `byMonth[m].amount` for complete/future years — shared by MonthCurve and
  StatusHero pulse line). Applies the same lump-sum winsorization as `computeStats`: an
  `oneoff:true` (or > `LUMP_PCT` of ceiling) transaction counts once toward the month's spend but
  is excluded from the rate extrapolated over the remaining days, so a single large purchase adds
  itself once instead of being multiplied out to month-end.
- `monthEndBand(stats, store)` → `{low, high, bandAmt, mid, histN, histMean, histMin, histMax} |
  null` — the monthly uncertainty cone (see below). `null` on complete/future years, on the last
  day of the month, or when there is no statistical basis at all (first month of use, day 1-2,
  zero historical months).
- plus the standard formatters.

All magic-number thresholds are named in the `T` constants object at the top of the IIFE —
see README §Callout detectors threshold table for the full rationale.

### Key implementation conventions

- **`localISO(d)`** — always format dates as "YYYY-MM-DD" using `getFullYear()/getMonth()/
  getDate()`, never `toISOString()`. `toISOString()` uses UTC midnight and shifts the date
  backward in UTC+ timezones (EET = UTC+2/+3), silently dropping Dec 31 transactions from
  completed years.
- **Lump-sum winsorization** — transactions > 2% of `ceiling` are excluded from the blended
  trailing rate calculation (but still included in `spent`). Without this, a single €5k holiday
  inflates the year-end projection by ~4× the purchase price. Winsorized tx appear in
  `stats.lumps[]`. The `oneoff:true` tx flag forces the same exclusion via `isLump()`.
- **doy>28 trend guard** — the trend detector (detector #1) only fires when `stats.doy > 28`.
  Before day 28, `projectionAsOf(stats, 28)` would reference the prior year, producing a
  spurious near-zero reference projection and triggering a false "year-end projection has shot
  up" alert every January.
- **`funProjection` cap** — `funProjection = min(linear, funSpentYTD + max(0, Σbalances) +
  futureAccruals)`. Used only for the Fun tab and the ceiling-callout "trim fun" advice. The cap
  is based on what the allowance system will actually produce over the rest of the year.

### Vocabulary (canonical names — never use `target` for the stored ceiling)

- `ceiling` — `years[y].ceiling`, stored, user-set, sacred. Renamed from `target`.
- `funPlanAnnual` — Σ people × 12 months × rateForMonth; derived.
- `mainTarget` — `ceiling − funPlanAnnual`; derived, never stored. **Explanatory decomposition only — never a target.**
- `spent` / `projection` in stats — **total household spend (main + fun)**. Measured vs `ceiling`.
- `mainSpent` / `funSpent` — decomposition of `spent` into non-fun / fun portions.
- `funProjection` — allowance-capped fun projection; used only in the Fun tab and ceiling-callout "trim fun" advice.

### Projection formula (damped blend)

`projDays = daysRemaining + staleDays` (staleDays=0 when no stale signal).
`projection = spent + blendedRate × projDays × (1 + buffer) + committedFuture` where `blendedRate =
YTD_rate × (doy/365) + trailing_60d_rate × (1 − doy/365)`. The buffer uplifts only the
extrapolated remainder, so on Dec 31 with no stale days and no committed future, projection equals
spent exactly; `funProjection` carries no buffer by design. Early in the year the blend trusts recent
momentum (thin YTD history); late in the year it locks onto the full-year average, so a July holiday
doesn't hijack the December projection. For complete/future years `projection = spent`.
`projectionAsOf` uses the same blend (+ `committedFuture` relative to its reference date) for
consistent trend comparisons. Band widening: `weeksRemaining = projDays / 7`, so a non-zero
`staleDays` widens `bandAmt` and lowers `projLow`, making the `alert` verdict harder to trip while
data is stale (correct — the forecast is less certain).

**`committedFuture`** = sum of `amount_eur` for slices with `t._amortized && t.date > asOfStr` (zero
for complete/future years). Amortized slices are `oneoff`, so the blended rate never extrapolates
them; without this term a slice dated after `asOf` would simply disappear from the projection
instead of counting as the known future cost it is. Deterministic, no buffer applied — the amount is
fixed, not extrapolated. Mirrored in `projectedMonthEnd`/`monthEndBand` for intra-month future
slices (`t.date.startsWith(monthStr) && t.date > asOfStr`).

### `computeStats` returns

Primary fields: `ceiling`, `mainTarget`, `funPlanAnnual`, `spent`, `projection`, `delta`,
`deltaPct`, `status`, `pace`, `projLow`, `projHigh`, `bandAmt`, `dailyRate`, `trailingDailyRate`,
`daysRemaining`, `projNoBuffer`, `bufferAmt`, `upto`, `txns`, `byCat`, `catList`, `byMonth`,
`catMonth`, `priorCum`, `priorSpent`, `isCurrent`, `complete`, `isFuture`, `asOf`, `asOfStr`,
`doy`, `daysInYear`, `year`, `buffer`.
Staleness fields: `staleDays` (number, ≥0 — whole elapsed days since last pipeline run; 0 when
unknown), `lastSyncTs` (number|null — ms epoch from `/api/sync/check`.`last_revolut_sync_ts`; null
when unavailable). Both are passed through to the UI/banner.
Decomposition fields: `mainSpent`, `funSpent`, `funProjection`.

`stats.txns` / `stats.upto` contain **all** transactions for the year (main + fun).

**Forecast uncertainty band** (`projLow`/`projHigh`/`bandAmt`): computed from the sample std-dev of
the most recent `T.BAND_WINDOW_WEEKS` (16) complete weeks of recurring totals — **not** the full
year-to-date — once ≥4 complete weeks are available (current incomplete year only). Before 16 weeks
have elapsed the window is just "all weeks so far," so early-year behavior is unchanged; once more
than 16 weeks of history exist, older weeks roll out of the sample. This recency window exists
because a flat year-to-date sample lets a single atypical week (e.g. a big January stock-up)
inflate the band for the rest of the year even after months of dead-steady spending since —
windowing lets that influence fade out on the same trailing-window philosophy as the
`trailingDailyRate` blend above. `bandAmt = sigmaWeek × √weeksRemaining × (1+buffer)`; `projLow =
max(spent, projection − bandAmt)`. All three are `null` when data is insufficient (<4 weeks, or
complete/future year).

**Monthly uncertainty cone** (`monthEndBand`, consumed by `MonthCurve` in `home.jsx`): every month
restarts from zero data points, so unlike the yearly band it can't gate on a minimum-weeks
threshold — it must lean on the household's own **historical months** early on, then hand off to
the current month's own data as it accrues. Two independent variance sources are summed:
1. within-month day-to-day noise, projected over the remaining days of the month
   (`daySigma² × projDays`, `projDays = daysRemaining + staleDays` — same staleness widening as the
   yearly band);
2. cross-month "what kind of month is this" uncertainty, drawn from the sample std-dev of the
   household's own historical month totals (all-time, recurring-only), decayed by
   `(daysRemaining/daysInMonth)²` so it fades to 0 as the month fills in with actual data.

`daySigma` blends this month's own in-month day-to-day std-dev (once ≥3 days are logged) with an
implied daily std-dev backed out of the historical month-to-month spread (`histStd/√daysInMonth`,
assuming ~iid days), weighted toward in-month data once ≥7 days have elapsed. With fewer than 2
historical months, a flat coefficient-of-variation fallback (`T.MONTH_BAND_DEFAULT_CV × histMean /
daysInMonth`) stands in for the missing spread estimate. Lump-sum transactions are excluded from
every variance input via the same `isLump()` winsorization as the yearly band, so one big purchase
doesn't blow the cone out for the rest of the month. `bandAmt = √(varDaily + varMonthLevel) ×
(1+buffer)`; `low = max(spentSoFar, mid − bandAmt)`, `high = mid + bandAmt`, `mid =
projectedMonthEnd(stats)`. Net effect: wide on day 1 (nothing known yet, full historical spread
applies), wider the longer `staleDays` runs, and converging to `null` (no band drawn) on the last
day of the month.

**Status gating** (all vs `ceiling`): when the band exists, `status` is "good" if `projection ≤
ceiling`; "alert" if `projLow > ceiling` (even the optimistic bound misses); "watch" otherwise.
Prevents threshold-flapping: escalates to "alert" only when the forecast lower bound clears the
ceiling. When `bandAmt` is null (<4 weeks), the static ±8% threshold (`T.WATCH_BAND_CURRENT`)
applies unchanged.

`priorCum` (number[366] | null) and `priorSpent` (number | null) — prior year total spend.
Future-year guard: spent 0, projection 0, status "good"; `isFuture` in returned stats.

### `buildCallouts` — 10 detectors, value-ranked

See README for the authoritative spec. Each callout carries a **`value`** (0–1, interestingness);
the list is sorted by `value` desc (severity then `mag` break ties) — **not** severity-first as
before. The taste tiers: T1 actionable (~0.8–1.0), T2 invisible momentum/comparison (~0.5–0.75),
T3 local facts (~0.35–0.45), T0 redundant-with-Hero (~0.0–0.05). Quick index:
- #1 trend (doy>28 guard, 4-week change in total `projection`; threshold = 1.2% of `ceiling`) — T2
- #2 streak (14-day pace vs ceiling-linear baseline) — T2
- #3 mover (MoM category change — includes fun spend in categories) — T3
- #4 share (top category % of total spend) — T3
- #5 buffer explanation (threshold = 1% of `ceiling`) — T0
- #6 yoy (total spent vs prior year at same doy; threshold = 8% of `ceiling`) — T2
- #7 **pace** (bidirectional; replaces old `reqpace`) — `maxDaily = (ceiling − spent)/daysLeft`;
  over → "Spend ≤ €X/day", under → "room for €X/day". Over: T1. Under: value scales with
  bindingness (`trailingDailyRate / maxDaily`), so obvious slack demotes it below momentum.
- #8 **tohit** (new) — when over and the projected curve crosses `ceiling` before year-end, names
  the date + weeks early. Uses `trailingDailyRate × (1 + buffer)`. T1.
- #9 **peak** (new) — biggest/lightest completed month (≥3 completed months, last full month is the
  running extreme). T3.
- #10 ceiling (verdict vs `stats.projection`) — **demoted** to `value 0.05`, no longer pinned first.

Two helpers back the pace logic: `requiredDailyToHit(stats)` (over case) and the mirror
`dailyHeadroom(stats)` (under case) — same `(ceiling − spent)/daysLeft`, opposite gate. These drive
only the Home pace-guidance callout; the Analysis "In numbers" screen computes its own
buffer-adjusted "Real daily target" locally in `analysis.jsx` rather than reusing these two, so that
tile's numbers subtract `bufferAmt` from `spent` before dividing — a deliberately different (more
conservative) framing from the Home callout's.

Ceiling callout states: `projection > ceiling` → watch/alert — text "trim fun ~€Z/mo" when
overBy/monthsLeft ≤ funPlanAnnual/12, else "even cutting entire fun budget won't close it; main
spending needs to drop ~€W/mo too"; between 0.94×–1× → `info` "tight but on course"; < 0.94× →
good "room to raise fun budget". Now pushed like any other callout (not prepended). Calm fallback
fires only when nothing genuine surfaced (ceiling/buffer don't count).
Complete year: single `{id:"final"}` callout compares `stats.spent` (total) vs `ceiling`.
Future year: single `{id:"future"}` callout.

### `computeFun(store, asOfDate?)`

Exported, uses `store.currentYear` for YTD figures. Returns: `people[]` (per-person: `id`,
`name`, `balance` all-time = accrued − spent + `balanceAdjustment`, `monthlyRate`,
`usedThisMonth`, `spentAllTime`), `funSpentYTD`, `funProjection` (linear/capped, see README
§6.2), `funCatList` (category breakdown). **Balance** only counts fun txns with `t.date >=
p.startMonth + "-01"` — pre-startMonth transactions are excluded (no matching accrual). **Year
classification** (current / complete / future) is relative to `asOf.getFullYear()`, not `new
Date().getFullYear()`, so historical `asOfDate` values classify consistently.

### `computeTravel(store, asOfDate?)`

Exported, family-wide analogue of `computeFun` — the travel budget is one household allowance, not
a per-person split. Reads `store.travel` (`{rates:[{from,amount}], startMonth, balanceAdjustment}`;
same shape a `person` uses, so `rateForMonth(travel, ym)` works unchanged). Returns: `balance`
(all-time = accrued − travel-tagged spend + `balanceAdjustment`), `accrued`, `spentAllTime`,
`monthlyRate`, `usedThisMonth`, `travelSpentYTD`, `travelProjection` (**uncapped** linear YTD
extrapolation — unlike `funProjection`, travel has no allowance cap), `travelCatList`, `startMonth`.
Balance only counts travel txns with `t.date >= travel.startMonth + "-01"`. Travel-tagged spend
still counts in `computeStats`'s `spent`/`projection` vs the ceiling; travel does **not** feed
`funPlanAnnual`/`mainTarget` or any callout — it is a pure psychological overlay.

Also returns `trips`: an array built from `store.trips`, one entry per trip —
`{id, name, location, startDate, endDate, total, count, catList, txns}` — aggregating **all-time**
travel-tagged transactions matching `t.trip_id === trip.id` (no year filter; a trip can span a year
boundary). `total`/`count`/`catList` are the trip's own sum/tx-count/category breakdown (via
`aggregateByCategory`); `txns` is the matching transactions, newest-first. Trips with zero matching
transactions still appear (`total:0`, empty `catList`/`txns`) so a freshly created trip shows
immediately. Sorted by recency, newest first: sort key = `trip.startDate || localISO(new
Date(trip.createdAt || 0))`, string-compared descending. This is purely additive per-trip metadata
on top of the family-wide ledger above — it does not affect `balance`/`accrued`/`travelProjection`
or any other existing field.

## Store shape — `y/data.jsx` (`window.YData`)

The persisted store shape, the fixed 18-category list (`CATEGORIES`, id→icon→color), default
templates, and `loadStore`/`saveStore`/`resetStore`/`migrateStore`.

**Store shape (fun-budget model):**
- `store.people`: `[{id, name, rates:[{from:"YYYY-MM", amount}], startMonth:"YYYY-MM",
  balanceAdjustment?:number}]` — forward-only dated rate schedule per person.
  `balanceAdjustment` is an additive offset to the computed balance (set via "Correct balance"
  in Settings → Fun budget); 0 when absent. Default: Joseph €100/mo, Marti €200/mo.
- `store.wishlist`: `[{id, owner, name, price, note?, createdMonth}]` — per-person wishlist items.
- `store.travel`: `{rates:[{from:"YYYY-MM", amount}], startMonth:"YYYY-MM", balanceAdjustment?}` —
  the single family-wide travel allowance (same shape as one `person`). Configured in Settings →
  Travel budget. `store.trips`: `[{id, name, location, startDate, endDate, createdAt, updatedAt}]` —
  discrete, user-named trips; `name` required, the rest optional/nullable; `createdAt`/`updatedAt`
  are ms epoch. Settings-blob synced like `wishlist`/`people` (no dedicated D1 table). Every
  `t.travel` transaction carries a `trip_id` referencing one of these (nullable D1 column). Legacy
  travel tx predating trips are migrated onto a fixed `trip_legacy` ("Past travel") trip by
  `migrateStore`. (Replaces the removed `store.travelWishlist` future-trip-goals list.)
- Transaction fields: optional `fun:true` and `person:"joseph"|"marti"` (only on fun tx); optional
  `travel:true` (family-wide travel tag, independent of the `Travel` category and of `fun`).
  Optional `oneoff:true` — excludes the tx from the blended rate used in projection (still
  counts in `spent`). Always absent on Revolut import (defaults to 0); toggled in-app via Manual
  add / edit sheet. Optional `amortize_months` (int ≥ 2) and `virtual:true` — see
  `expandAmortized` above; also absent on Revolut import, user-owned like `oneoff`. Optional
  Revolut-sourced fields: `merchant_logo` (URL string), `merchant_city` (string).
- `years[y].ceiling` — renamed from `years[y].target` (sacred household ceiling, never derived).

`buildSeed()` — returns a blank store: `transactions: []`, `wishlist: []`, `trips: []`,
`travel` (€0/mo default), default year ceilings (2024 €21k / 2025 €23k / 2026 €25k), default people
rates, default templates. No sample data.

`migrateStore(s)` (exported, idempotent): `years[y].target` → `ceiling`; injects `people`,
`wishlist`, `travel`, and `trips` defaults if missing; deterministically assigns any pre-existing
`t.travel && !t.trip_id` transactions to a fixed `trip_legacy` trip (fixed `createdAt`/`updatedAt`
of `0` so the object is byte-identical across devices — settings-blob merges never conflict); sets
`density` default; normalizes all `transactions[*].category`
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
  `pull({ force: true })` on any mismatch. Also captures `last_revolut_sync_ts` from the check
  response and stores it internally. Returns `{ ok, before, after, recovered }`. Offline-safe
  (no-ops when `syncFetch` returns null).
- `YSync.getLastSyncTs()` — returns the `last_revolut_sync_ts` (ms epoch) captured during the most
  recent `reconcile()` call, or `null` if reconcile hasn't run or the field was absent (old
  deployment / local dev without the `meta` table).
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
state. A memoized `calcStore = { ...store, transactions: YCalc.expandAmortized(store.transactions) }`
(depends on `[store]` only — expansion is view-independent, so it's stable across `viewYear`
changes) feeds **only** `computeStats`/`buildCallouts`; `computeFun`/`computeTravel` stay on the raw
`store`. Four memoized derivations drive everything visible: `stats =
YCalc.computeStats(calcStore, viewYear)`, `callouts = YCalc.buildCallouts(calcStore, stats)`, `fun =
YCalc.computeFun(store)` (all-time per-person fun ledger), and `travel = YCalc.computeTravel(store)`
(family-wide travel ledger) — all recomputed on any store change.

**Expanded vs raw store.** `stats.txns`/`stats.upto` are therefore amortization *slices*, correct
for every aggregate/chart consumer (home `MonthCurve`/`MonthBreakdown`/`projectionHistory`, all
callout detectors — none need edits, they just iterate `amount_eur`/`date`/flags). `computeFun` and
`computeTravel` deliberately read the raw `store` instead, so their per-row lists (`fun.jsx`,
`travel.jsx`) never show slices — the trade-off is that a fun/travel-tagged amortized purchase is
smoothed in the ceiling view but lands whole in its buy month in the Fun/Travel envelopes (accepted
v1 boundary, not "fixed"). `analysis.jsx`'s `TransactionsTab` and `CategoriesTab` drill lists also
source raw transactions (`YCalc.yearTxns(store, stats.year)`, filtered to `date <= stats.asOfStr`)
rather than the expanded `stats.txns`/`stats.upto`, so a category's bar amount can be smoothed while
its drill list still shows the full parent — the `×Nmo` badge on `TxRow` explains the discrepancy.
**Invariant:** slices exist only inside `calcStore` for aggregate math; they are never persisted,
never enqueued to the sync outbox, and never rendered or counted as individual rows — any UI that
lists/counts individual transactions reads raw `store.transactions`. Add/edit/delete already operate
on the raw store.

`onOpenFun`/`onOpenTravel` set
`analysisFocus = { section:"fun"|"travel" }` and route to the matching Analysis tab. `fun`, `travel`,
`store`, `setStore`, and `addTx` are passed to `AnalysisScreen` (for `FunTab`/`TravelTab`); `fun`,
`travel`, `store`, `onOpenFun`, and `onOpenTravel` are passed to `HomeScreen` (for the strips).
`store` is also passed to `EditSheet` so it can read `store.people` for the fun toggle owner picker.

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
