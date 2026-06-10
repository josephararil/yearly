# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Yearly** is a mobile-first annual budgeting PWA: it tracks joint household spend in EUR
against a single per-year target and produces ranked, plain-language **callouts** that
explain whether you're on track and why. See `README.md` — it is the authoritative product +
design spec (data model, projection math, callout detectors, screens, design tokens). Treat
the README as the source of truth for *intended* behavior; treat the code below as the
*current* implementation.

> The README frames this bundle as a **design reference / prototype** to be recreated in a
> production stack (Vite/Next + Recharts + a real component library). The files here are a
> working prototype, not the production app.

## Visual layer: the "Broadsheet" restyle (complete)

The app is fully reskinned to the editorial light Broadsheet theme (warm paper, hairline
rules, three fonts, one terracotta accent). The token set is defined in `y/tokens.css`;
the spec is `design/BROADSHEET_DESIGN_SPEC.md`. The full session-by-session restyle log
(Phases 0–3) is in `design/RESTYLE_LOG.md`.

## Running it

There is **no build, no package manager, no tests, no linter**. The app is a single static
HTML file that loads React + Babel from CDN and transpiles the `y/*.jsx` modules in the
browser.

- Serve over HTTP and open `public/index.html`. Two valid approaches:
  - **From repo root:** `python -m http.server 8766` → visit `http://localhost:8766/public/`
    (preferred for Claude Code preview — see "Claude Code preview" section in Regression test)
  - **From `public/`:** `python -m http.server --directory public 8002` → visit `http://localhost:8002/`
  It will **not** work over `file://` — the `type="text/babel" src=` scripts require HTTP.
- State persists to `localStorage` under `yearly:store:v1`; on first load `buildSeed`
  creates a blank store (no transactions, no wishlist) with default year settings, people,
  and templates. To reset to a blank store, clear that key.
- The app is also hosted on GitHub Pages — `index.html` at the repo root serves as the PWA
  entry point.

### Local dev — no backend, no reload loop

The sync layer (`y/sync.jsx`) calls `/api/sync`, `/api/transactions`, and `/api/settings`.
These endpoints only exist on the production Cloudflare Worker. Running locally means every
sync call gets a 404 from the static file server. This is handled gracefully: `syncFetch`
treats 404 as a silent no-op (returns `null`) and never reloads the page — only 200-with-HTML
(Cloudflare Access login redirect) or 401/403 trigger a reload. Auth-expiry reloads are
throttled to one per 30 s via `safeReload()` (sessionStorage key `yearly:lastReload`) so a
persistent transient error never becomes a reload loop.

**If you see the app reloading every second** in the local preview, the likely cause is a
stale service worker whose precache contains an old `sync.jsx` that had the original
`location.reload()` on any non-JSON response. Fix:

1. Open DevTools → Application → Service Workers → click "Unregister".
2. Open DevTools → Application → Cache Storage → delete all `yearly-v*` caches.
3. Hard-reload (`Ctrl+Shift+R` / `Cmd+Shift+R`).

The new SW (once installed) uses `{cache: 'no-cache'}` when precaching, so this situation
should not recur after a version bump.

**`yearly:bootstrapped` is absent on a fresh origin** (e.g. localhost vs production). On
first load, `bootstrap()` tries `/api/sync?since=0`, gets a 404, and returns without setting
the key. The app still renders fine — bootstrap just silently no-ops on every load. The
localStorage keys only get populated when the app runs against the real backend.

### Self-contained (no external dependencies)
The app is fully self-contained — **no `_ds/` directory is needed**. The original Aperture
design system dependency has been replaced by two local files:

- **`y/tokens.css`** — defines the complete Broadsheet token set. No legacy remaps remain;
  all screens use canonical names. Loaded in `index.html` before `y/app.css`. See the
  "Visual layer" section above.
- **`y/ds.jsx`** — an IIFE that sets `window.ApertureDesignSystem_72a4cd = { Button,
  SegmentedControl, Input, Chip }`, matching exactly the props the app passes to each.
  Loaded after `y/icons.jsx` and before `y/ui.jsx` / screens.

If adding new DS component usages, update `y/ds.jsx` to match the props passed.

## Architecture

### Module system (no bundler)
Every `y/*.jsx` file is an IIFE that **reads its dependencies off `window` and attaches its
own export to `window`**. There are no imports/exports. Two consequences:

1. **Load order is significant** and is fixed in `index.html` (primitives → screens →
   root). If you add a module, add its `<script type="text/babel">` tag there in dependency
   order.
2. Cross-module calls go through the global namespace: `window.YData`, `window.YCalc`,
   `window.YSync`, `window.YUI`, `window.YFun`, `window.YHome`, `window.YAnalysis`,
   `window.YSettings`, `window.YAdd`, plus `window.Icon`/`window.YIcons`. Aperture components
   come from `window.ApertureDesignSystem_72a4cd`.

### The brain (port these first to any production target)
- `y/calc.jsx` (`window.YCalc`) — **all numbers come from here.** `computeStats(store, year, asOfDate?)`
  (damped-blend projection + per-year buffer uplift + status thresholds; `asOfDate` defaults to `new Date()`)
  and `buildCallouts(store, stats)` (the ranked detector engine — 8 detectors). Pure functions, no UI deps.
  All magic-number thresholds are named in the `T` constants object at the top of the IIFE — see README §Callout detectors threshold table for the full rationale.
  Also exports `cumulativeByDay(txns)` → `number[366]` (shared with `analysis.jsx`),
  `priorYearCumulative(store, year, asOfDate)` → number (prior year spend at same day-of-year),
  `rateForMonth(person, ym)` → number (latest applicable rate for a person in a "YYYY-MM"; 0 before startMonth),
  `computeFun(store, asOfDate?)` → per-person fun ledger (see below),
  `projectionAsOf` (trend detector), `requiredDailyToHit(stats)` → number|null (daily cap to finish on
  mainTarget; null when not applicable), `neededMonthlyCap(stats)` → number (`max(0, (mainTarget −
  spentBeforeCurrentMonth) / (12 − currentMonthIndex))` — used by MonthCurve target line and the
  "needed/mo" stat), `projectedMonthEnd(stats)` → number (current-month daily-rate extrapolation
  from today to month-end; equals `byMonth[m].amount` for complete/future years — shared by
  MonthCurve and StatusHero pulse line), and the standard formatters.
  **Key implementation conventions:**
  - **`localISO(d)`** — always format dates as "YYYY-MM-DD" using `getFullYear()/getMonth()/getDate()`,
    never `toISOString()`. `toISOString()` uses UTC midnight and shifts the date backward in UTC+ timezones
    (EET = UTC+2/+3), silently dropping Dec 31 transactions from completed years.
  - **Lump-sum winsorization** — transactions > 2% of `mainTarget` are excluded from the blended trailing
    rate calculation (but still included in `spent`). Without this, a single €5k holiday inflates the
    year-end projection by ~4× the purchase price. Winsorized tx appear in `stats.lumps[]`.
  - **doy>28 trend guard** — the trend detector (detector #1) only fires when `stats.doy > 28`. Before
    day 28, `projectionAsOf(stats, 28)` would reference the prior year, producing a spurious near-zero
    reference projection and triggering a false "year-end projection has shot up" alert every January.
  - **`funProjection` cap** — `funProjection = min(linear, funSpentYTD + max(0, Σbalances) + futureAccruals)`.
    Without the cap, a single large fun purchase in January extrapolates linearly to ~€22k, inflating
    `combinedProjection` by ~7× what the allowance system can ever permit. The cap is based on what
    the allowance system will actually produce over the rest of the year.
  **Vocabulary** (canonical names — never use `target` for the stored ceiling):
  - `ceiling` — `years[y].ceiling`, stored, user-set, sacred. Renamed from `target`.
  - `funPlanAnnual` — Σ people × 12 months × rateForMonth; derived.
  - `mainTarget` — `ceiling − funPlanAnnual`; derived, never stored. Non-discretionary budget.
  - `spent` / `projection` in stats — main (non-fun) only. Fun tx excluded from all main math.
  - `funSpent` / `funProjection` — fun YTD and capped projection (linear, but capped at what the allowance system can permit; see "funProjection cap" above).
  - `combinedProjection` = `projection + funProjection`; `combinedDelta` / `combinedStatus` vs `ceiling`.
  **Projection formula (damped blend):** `projection = spent + blendedRate × daysRemaining × (1 + buffer)` where
  `blendedRate = YTD_rate × (doy/365) + trailing_60d_rate × (1 − doy/365)`. The buffer uplifts only
  the extrapolated remainder, so on Dec 31 projection equals spent exactly; `funProjection` carries no
  buffer by design. Early in the year the blend trusts recent momentum (thin YTD history); late in the
  year it locks onto the full-year average, so a July holiday doesn't hijack the December projection.
  For complete/future years `projection = spent`. `projectionAsOf` uses the same blend for consistent
  trend comparisons.
  `computeStats` returns: `ceiling`, `mainTarget`, `funPlanAnnual`, `funSpent`, `funProjection`,
  `combinedProjection`, `combinedDelta`, `combinedDeltaPct`, `combinedStatus` plus all existing fields
  (`spent`, `dailyRate` YTD, `trailingDailyRate` blended, `daysRemaining`, `projection`, `delta`,
  `status`, `projLow`, `projHigh`, `bandAmt`, etc. — all main-budget). `stats.txns` contains main-only tx (fun tx excluded); `stats.upto`
  is likewise main-only.
  **Forecast uncertainty band** (`projLow`/`projHigh`/`bandAmt`): computed from sample std-dev of weekly
  recurring totals when ≥4 complete weeks are available (current incomplete year only). `bandAmt =
  sigmaWeek × √weeksRemaining × (1+buffer)`; `projLow = max(spent, projection − bandAmt)`. All three are
  `null` when data is insufficient (<4 weeks, or complete/future year).
  **Main status gating**: when the band exists, `status` is "good" if `projection ≤ mainTarget`; "alert"
  if `projLow > mainTarget` (even the optimistic bound misses); "watch" otherwise. This prevents
  threshold-flapping: the number only escalates to "alert" when the lower bound of the forecast clears
  the target. When `bandAmt` is null (<4 weeks), the old static ±8% threshold (`T.WATCH_BAND_CURRENT`)
  applies unchanged. `combinedStatus` always uses the static thresholds — the band applies to main only.
  `priorCum` (number[366] | null) and `priorSpent` (number | null) — prior year, main tx only.
  Future-year guard: spent 0, projection 0, status "good"; `isFuture` in returned stats.
  `buildCallouts` — 8 detectors; see README for the authoritative spec. Quick index:
  #1 trend (doy>28 guard, 4-week projection change) — text prefixed "Main budget: ",
  #2 streak (14-day pace vs baseline) — text prefixed "Main budget: ",
  #3 mover (MoM category change), #4 share (top category % of spend), #5 buffer explanation,
  #6 yoy (main spent vs prior year at same doy),
  #7 reqpace (when projection > mainTarget) — text prefixed "Main budget: ",
  #8 ceiling (sacred combined verdict, always first).
  Ceiling callout states: `combinedProjection > ceiling` → watch/alert — text "trim fun ~€Z/mo"
  when overBy/monthsLeft ≤ funPlanAnnual/12, else "even cutting entire fun budget won't close it;
  main spending needs to drop ~€W/mo too"; between 0.94×–1× → `info` "tight but on course";
  < 0.94× → good/info "room to raise fun budget". Always prepended first; replaces calm fallback.
  Complete year: single `{id:"final"}` callout compares `spent + funSpent` vs `ceiling` (not
  just main spend vs mainTarget). Future year: single `{id:"future"}` callout.
  `computeFun(store, asOfDate?)` — exported, uses `store.currentYear` for YTD figures. Returns:
  `people[]` (per-person: `id`, `name`, `balance` all-time = accrued − spent + `balanceAdjustment`, `monthlyRate`, `usedThisMonth`,
  `spentAllTime`), `funSpentYTD`, `funProjection` (linear/capped, see §6.2), `funCatList` (category breakdown).
  **Balance** only counts fun txns with `t.date >= p.startMonth + "-01"` — pre-startMonth transactions are excluded (no matching accrual). **Year classification** (current / complete / future) is relative to `asOf.getFullYear()`, not `new Date().getFullYear()`, so historical `asOfDate` values classify consistently.
- `y/data.jsx` (`window.YData`) — the persisted store shape, the fixed 18-category list
  (`CATEGORIES`, id→icon→color), default templates, and
  `loadStore`/`saveStore`/`resetStore`/`migrateStore`.
  **Store shape (fun-budget model):**
  - `store.people`: `[{id, name, rates:[{from:"YYYY-MM", amount}], startMonth:"YYYY-MM", balanceAdjustment?:number}]` — forward-only
    dated rate schedule per person. `balanceAdjustment` is an additive offset to the computed balance (set via "Correct balance" in Settings → Fun budget); 0 when absent. Default: Joseph €100/mo, Marti €200/mo.
  - `store.wishlist`: `[{id, owner, name, price, note?, createdMonth}]` — per-person wishlist items.
  - Transaction fields: optional `fun:true` and `person:"joseph"|"marti"` (only on fun tx).
    Optional `oneoff:true` — excludes the tx from the blended rate used in projection (still counts in `spent`). Always absent on Revolut import (defaults to 0); toggled in-app via Manual add / edit sheet.
    Optional Revolut-sourced fields: `merchant_logo` (URL string), `merchant_city` (string).
  - `years[y].ceiling` — renamed from `years[y].target` (sacred household ceiling, never derived).
  `buildSeed()` — returns a blank store: `transactions: []`, `wishlist: []`, default year ceilings
  (2024 €21k / 2025 €23k / 2026 €25k), default people rates, default templates. No sample data.
  `migrateStore(s)` (exported, idempotent): `years[y].target` → `ceiling`; injects `people` and
  `wishlist` defaults if missing; sets `density` default; normalizes all `transactions[*].category`
  to lowercase IDs (fixes Revolut title-case import: `"Groceries"` → `"groceries"`). Called by
  `loadStore` and by JSON restore.
  **`normalizeCategory(raw)`** (exported) — resolves any raw category string to a canonical lowercase
  ID. Handles: valid ID passthrough, title-case ID (`"Groceries"` → `"groceries"`), full label
  (`"House Stuff"` → `"house"`), unknown → `"general"`. Used by `cat()`, `rowToTx` in sync, and
  `aggregateByCategory`/`aggregateByMonth` in calc.
  **`uid()`** — `crypto.randomUUID()` (collision-safe across devices and reloads).

The README documents the exact projection formula, status thresholds, and each callout
detector. **If you change the math or detectors, update the README spec in the same change.**

### Sync layer (`y/sync.jsx`, `window.YSync`)
Loaded immediately after `y/data.jsx` (depends only on `YData` + `fetch`; must be before `app.jsx`).
Implements outbox-based client↔D1 sync with optimistic UI and offline-safe queuing.

**localStorage keys:**
- `yearly:sync:cursor` — server `now` timestamp from the last successful pull; used as `since=` in `GET /api/sync`.
- `yearly:outbox:v1` — JSON array of full tx records pending push; deduped by `id` keeping latest version.
- `yearly:settings:dirty` — `"1"` when any non-transactions store key has changed since last flush.
- `yearly:bootstrapped` — `"1"` after the one-time bootstrap completes; prevents re-seeding on reload.
- `yearly:settings:appliedAt` — `updated_at` of the last settings blob pulled from the server; prevents re-applying a blob we just pushed.

**Public API:**
- `YSync.init({ getStore, applyServer })` — called once on mount. `getStore()` returns the live store via a ref; `applyServer(updater)` maps to the app's `setStore`.
- `YSync.enqueueTx(record)` — dedupe-adds a tx (or delete record) to the outbox and schedules a flush.
- `YSync.markSettingsDirty()` — marks settings for push and schedules a flush. Called automatically from `app.jsx`'s `setStore` wrapper whenever only non-transactions keys change.
- `YSync.flush()` — push outbox in chunks of 75, then PUT settings if dirty. Captures `(id → __seq)` pairs before the POST; entries updated mid-flight (same id, higher `__seq`) survive the post-flush filter and are re-sent next flush. Clears the dirty flag before the PUT and restores it on failure. Concurrent calls share one in-flight promise (reentrancy latch); the cursor is never advanced here — only `pull()` advances the cursor.
- `YSync.pull()` — calls `flush()` first (prevents golden-source pull from clobbering unsynced writes), then `GET /api/sync?since=cursor`, merges tx by id (deleted rows are removed), applies settings only when `updated_at > appliedAt`, updates cursor.
- `YSync.bootstrap()` — called once on mount. Flushes the outbox first so offline-created transactions reach the server before the since=0 pull decides adopt vs seed path. If server has data, adopts it (second-device path); if empty, seeds it (first-device path). Sets `yearly:bootstrapped`.
- `YSync.start()` — wires `online`, `focus`, and `visibilitychange` → visible triggers.

**Auth-expiry vs offline:** `syncFetch()` wraps every `fetch` call. If the call throws (`TypeError`) it checks `navigator.onLine`: offline → return `null` silently; online → `location.reload()` (Cloudflare Access expiry as a cross-origin 302 CORS block). For non-throwing bad responses, only reloads on auth-expiry patterns: 200 with non-JSON body (Cloudflare Access login page redirect) or HTTP 401/403. 404 and 5xx return `null` silently — they indicate backend or local-dev issues, not auth expiry.

**Pull triggers:** on every mount (unconditional `bootstrap().then(() => pull())` in `app.jsx`), on `visibilitychange` → visible, and before `EditSheet` opens (freshness pull via `openEdit` wrapper in `app.jsx`). The `focus` event triggers `flush()` only (no full pull). `pull()` always flushes first so local changes are never overwritten by a server pull. On already-bootstrapped devices, `bootstrap()` is a no-op (returns immediately if `yearly:bootstrapped` is set); settings are compared by `updated_at > appliedAt` so only genuinely newer server settings overwrite local ones.

> **Why no `/api` calls appear on hard reload:** `bootstrap()` is gated by `yearly:bootstrapped` in
> localStorage — once set (after first ever sync), it returns immediately without any network call.
> The `focus` and `visibilitychange` listeners fire only when the window *gains* focus or the tab
> *becomes* visible after being hidden. A hard reload in an already-focused, already-visible tab
> triggers neither. To force a pull: switch away from the tab and back, or open an Edit sheet.

### State flow (`y/app.jsx`)
`App` is the single stateful root. `store` (persisted via a `setStore` that writes the whole
object to localStorage on every mutation) is the only durable state; `route` / `viewYear` /
`analysisFocus` / `addOpen` / `editTx` / `yearOpen` / `deletedTx` / `showToast` are ephemeral
UI state. Three memoized derivations drive everything visible:
`stats = YCalc.computeStats(store, viewYear)`, `callouts = YCalc.buildCallouts(store, stats)`,
and `fun = YCalc.computeFun(store)` (all-time per-person fun ledger, recomputed on any store
change). `onOpenFun` sets `analysisFocus = { section:"fun" }` and routes to Analysis → Fun tab.
`fun`, `store`, `setStore`, and `addTx` are passed to `AnalysisScreen` (for `FunTab`); `fun`,
`store`, and `onOpenFun` are passed to `HomeScreen` (for `FunStrip`). `store` is also passed to
`EditSheet` so it can read `store.people` for the fun toggle owner picker.

**Sync wiring in `app.jsx`:** on mount, `YSync.init({ getStore: () => storeRef.current, applyServer: setStore })` + `YSync.start()` + `YSync.bootstrap()`. `storeRef` is kept current via a `useEffect`. `addTx`/`saveTx` call `YSync.enqueueTx(tx)` after `setStore`; `delTx` enqueues `{ ...tx, deleted:true }`; `undoDelete` re-enqueues without `deleted`. Settings dirty is detected centrally inside `setStore`: when `next.transactions === prev.transactions` (reference unchanged → settings-only mutation) `window.YSync.markSettingsDirty()` is called. `openEdit` wraps `setEditTx` to call `YSync.pull()` before opening the edit sheet.

`density` (minimal/balanced/all) is persisted in `store.density` and controls how many callouts
the Overview shows. It is editable in Settings → Display → Overview density.

Undo-on-delete: `delTx(id)` stashes the removed transaction in `deletedTx` and raises
`showToast`. The `Toast` primitive (from `YUI`) auto-dismisses after 5 s; the "Undo" action
re-inserts `deletedTx` into the store.

Navigation is in-memory route state (`home` | `analysis` | `settings`), not URL routing.
Tapping a callout sets `analysisFocus = { section, category? }` and switches to Analysis,
which jumps to that tab and pre-expands the focused category. `viewYear` is independent of
`store.currentYear`; selecting a past year flips the app into "completed year" mode (final
spend, no projection/buffer).

### UI layers
- `y/ui.jsx` (`window.YUI`) — shared primitives: `StatusHero` (combined-vs-ceiling numerals
  hero — see below), `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `Sheet`, `SectionH`,
  `Toast`, and `rich` (renders numbers inside text in the mono `.num` style).
  **`StatusHero`** — three-zone stack (current year shows all three; complete year hides pulse;
  future year shows Zone 1 only).
  **Zone 1 — Reality block**: eyebrow label (serif mood: "Projected year-end" / "Final combined
  spend · Y" / "Household ceiling · Y"); serif hero number (`combinedProjection` or `ceiling`);
  sans sub-line (over/under ceiling by €N in terra/sage mono 700, `±€X` band suffix when
  `bandAmt != null`); hairline rule; `.hero-spent` row — serif 38px `totalSpent` (or "Final spend"
  for complete years) left-aligned + mono 11px day/year right-aligned.
  **Zone 2 — Multi-stage bullet bar** (HTML/CSS — mirrors the restraint of the original
  `.pace-rule`; hidden for future years): a 22px `.bullet-wrap` container holds a 4px rail
  (`.bullet-rail`, `--chart-grid` background) with solid `.bullet-fill-spent` to `totalSpent`
  and a translucent (0.4 opacity) `.bullet-fill-proj` from spent → `combinedProjection` (current
  year only). A 1px solid `--muted` `.bullet-doy` marker shows where pace puts you. Absolutely-
  positioned tick marks: `mainTarget` (14px tall, `--ink-2`), `ceiling` (20px tall, `--ink` —
  hard stop), `combinedProjection` (14px tall, `--terra`, only when meaningfully ≠ ceiling).
  Tick labels render in a separate `.bullet-labels` row below the rail (mono 10px `--muted`,
  e.g. "main €21k") sorted left-to-right with alternating `top` (0 or 13px) to avoid horizontal
  collision; leftmost/rightmost labels clamp via `left:0` / `right:0` to prevent overflow. The
  spent figure is not duplicated here (it already appears in `.hero-spent`). The wrap is
  clickable (`onPointerDown` → `handleTap`); `.bullet-tip` appears above the rail with paper
  fill + hairline border and shows "Remaining €X / Buffer to main €Y" (under ceiling) or
  "Over ceiling €X / Proj vs main +€Y" (over). Tooltip x-anchors left/center/right based on
  `tip.x` to avoid edge overflow. Dismisses on second tap or pointerdown outside.
  State: `useState({open,x})` local to `StatusHero`.
  **Zone 3 — Monthly pulse** (current year only): two-row layout. Row 1 (`.pulse-r1`,
  `display:flex` `justify-content:space-between`) carries the mono month label (e.g. JUNE) on
  the left and the sans verdict on the right; row 2 (`.pulse-r2`, mono 11.5px) carries
  `€X so far` (ink) `·` `cap €Y` (ink) `·` `projected €Z` (ink-2). Verdict:
  `projectedMonthEnd > cap × 1.1` → "Slow down ▲" terra; `> cap × 0.95` → "Tight ●" amber;
  else "Room to spend ▼" sage. Data: `byMonth[m].amount`, `neededMonthlyCap(stats)`,
  `projectedMonthEnd(stats)`.
  **`TxRow`** — shows a 24px rounded merchant logo (`t.merchant_logo`) when present; falls back
  to a 24px `cat-ic` category icon (colored square + SVG icon, `CatIcon`-style inline) if
  absent or on load error. `tx-meta` appends `· city` when `t.merchant_city` is set. Both
  fields are populated by `rowToTx` in `sync.jsx` from the Revolut D1 columns.
  **`SpendCurve`** has been removed (replaced by `MonthCurve` in `y/home.jsx`). The Overview now shows an interactive monthly chart (`MonthCurve`) for the current month. Features: day-by-day cumulative actual spend (terra line + area fill); Pace diagonal (0 → neededMonthly, faint dashed); dashed Projection line from today to month-end; horizontal Target line at `YCalc.neededMonthlyCap(stats)` (`max(0, mainTarget − spentBeforeCurrentMonth) / monthsRemainingInclCurrent` — same helper used by the "needed/mo" stat in Analysis); horizontal Month-end line at `projectedEnd` (where this month will land); faint amber Prev-month overlay (previous month's cumulative curve, scaled proportionally to the same x-width, same-year only — not shown for January); explanatory legend below the chart (colored dot + label + description for each series). Toggle chips: Pace / Projection / Target / Month-end / Prev-month (prev month chip only shown when prior-month data exists; Month-end only shown for incomplete months). For past/future years it shows a plain text fallback. `MonthCurve` is defined locally in `y/home.jsx` (not exported from `y/ui.jsx`), using the same SVG/pointer pattern as `ProjectionChart`.
  `Toast({ open, message, actionLabel, onAction, onDismiss })` — transient bottom-anchored
  banner (above nav, z-index 30), auto-dismisses after 5 s via `onDismiss`, optional action button.
  `GaugeHero`, `PaceBar`, and `ProjSpark` have been removed (dead since hero is fixed to numerals).
- `y/fun.jsx` (`window.YFun`) — fun budget UI module. Exports:
  `FunStrip({ fun, store, onOpen })` — compact Overview strip: one hairline row per person
  (name, all-time balance in sage/terra, nearest wishlist goal name+pct+thin bar). Whole strip
  tappable → `onOpen()`. "no goals yet" if no wishlist items. Broadsheet tokens only, no cards.
  `FunTab({ fun, store, setStore, addTx })` — the Analysis workshop:
  - Per-person cards: name, monthly rate, balance (large, sage/terra coloured), this-month used
    with over/under indicator, all-time fun spent.
  - Wishlist per person: item name, price, progress bar (clamped 0–100%, clamps negative balance
    to 0 for display), months-to-afford ETA (`max(0, ceil((price−balance)/rate))`; "ready now"
    if balance ≥ price; "—" if rate 0). "Bought it" button logs a fun-tagged shopping tx via
    `addTx` and removes the item from `store.wishlist`. Remove (✕) deletes without buying.
    "Add" button opens `WishlistAddSheet` (name, price, owner Chip picker) pre-set to that person.
  - Fun category breakdown: catbar-* rows fed from `fun.funCatList` (non-interactive). Each
    category row is followed by its individual transactions (description + amount, sans 11px / mono
    11px, sorted newest-first), fetched by filtering `store.transactions` for `fun:true` + current
    year + matching normalised category. The catbar-row `borderBottom` is suppressed when transactions
    follow; the transaction block carries the hairline instead.
  Internal: `WishlistAddSheet` (name + price + owner Chip picker), `PersonCard` (stats + wishlist).
- Screens: `y/home.jsx` (Overview — hero + FunStrip + `MonthCurve` monthly chart; no callouts),
  `y/analysis.jsx` (Projection/Categories/Activity/Fun tabs; charts are hand-built SVG that
  double as the Recharts spec), `y/settings.jsx`
  (ceiling/buffer/years/fun-budget/density/templates/CSV import-export/JSON backup-restore/clear),
  `y/addflow.jsx` (Quick keypad + Manual add, Edit sheet, category picker, fun toggle).
  `analysis.jsx` — `AnalysisScreen` receives `fun`, `store`, `setStore`, `addTx` in addition to
  `stats`/`focus`/`onEditTx`; renders `<YFun.FunTab>` on the "Fun" segment; focus effect handles
  `focus.section === "fun"` → `setTab("Fun")`. **ProjectionChart** — H=252, interactive: pointer/touch
  events (pointer move + down, leave, up, cancel) show a vertical crosshair with a floating tooltip
  (€ value + month/day label); on the projected portion the tooltip dot switches to `--chart-proj`.
  `ToggleChip` component (defined above `ProjectionChart` in the IIFE) renders small toggle buttons
  that show/hide individual series — Pace, Projection (incomplete year only), Ceiling, and prior-year
  (when `priorCum` is present). `maxY` scales to `max(mainTarget, ceiling, projection, priorMax, projHigh) × 1.1`.
  When `stats.projLow != null` and Projection is on, a semi-transparent triangular band (vertices:
  today→projHigh year-end→projLow year-end, `--chart-proj` at 10% opacity) is drawn beneath the dashed
  line; `ChartLegend` shows a "Range" rect swatch for it.
  **MonthlyBarsChart** — interactive bar chart below the line chart in `ProjectionTab`. One bar per
  calendar month (terra, full opacity for complete months; 55% opacity for the current partial month;
  absent for future months). Three toggleable reference lines via `ToggleChip`s (reused from
  `ProjectionChart`): monthly average (`--chart-pace` dashed, label at left), peak month (`--amber` dotted, only when
  > avg × 1.1, label at right), and — for incomplete current years — the `neededMonthlyCap`-based required monthly average (`YCalc.neededMonthlyCap(stats)` —
  `max(0, mainTarget − spentBeforeCurrentMonth) / (12 − curMonth)`, `--chart-proj` dashed, drawn from the current-month slot forward, label at right). Each reference line carries an inline text label showing its value (e.g. "avg €1.9k", "peak €2.3k", "needed €1.7k"). Pointer/touch events show a
  vertical crosshair, a dot anchored to the hovered bar (or the needed/mo line for future months), and
  a floating tooltip with the month name and amount; future-month tooltips add an "est. needed/mo"
  sub-label. Hovered bar gets full opacity + stroke highlight; hovered month label bolds. Hidden for
  future years. `LegendItem` helper renders bar and line swatches; defined in the same IIFE above
  `MonthlyBarsChart`.
  **"What's happening" section** (`ProjectionTab`) — callouts from `buildCallouts` rendered between `MonthlyBarsChart` and "In numbers". Shows all callouts (no density filtering). Receives `callouts` and `onCallout` props threaded from `AnalysisScreen` → `App`. Clicking a callout still drills to the appropriate tab via `onCallout`. Hidden when `callouts` is empty.
  **"In numbers" section** (`ProjectionTab`) — appears below "What's happening" with a `section-h` title.
  Receives `fun` and `store` props (passed from `AnalysisScreen`). Stat cards present:
  - Spent YTD, On-pace by today, Blended rate, Buffer adds (existing).
  - **Avg spend/mo** (average over completed months) + sub-line "need ≤€X/mo" coloured sage/terra;
    `neededMonthly = max(0, ceiling − spent) / monthsRemaining`. Hidden for future years / no data.
  - **90d trend** — compares last-45d daily rate to prior-45d rate; `↑ Increasing` (terra),
    `↓ Decreasing` (sage), or `→ Constant`. Only shown for current year with ≥ 90 days of data.
  - **Total fun budget** — `funPlanAnnual` per year with per-month sub.
  - **Target fun/mo** — `max(0, ceiling − combinedProjection) / monthsLeft / numPeople` where `monthsLeft = max(1, daysRemaining / 30.4)`; sage when positive, terra when 0 (combinedProjection ≥ ceiling). Current year only.
  - **FIRE portfolio** — `combinedProjection / 0.04`; "at 4% rule" sub. Not shown for future years.
  - vs prior year same point, To finish on target (existing, conditional).
  Removed: "Projected finish" and "VS Target" cards (both surfaced on the Overview hero).
  **CategoriesTab** catbar rows use `CatIcon` (24px, radius 6); expanding a category shows two
  sub-lists: "Recent in [category]" (last 5 by date, reversed) and "Largest in [category]" (top 5
  by `amount_eur` descending), both using `TxRow` with `onClick → onEditTx`. **ActivityTab** —
  category filter chips now show **all** categories with spend (`stats.catList`, not capped at 8);
  a "Sort" label + 6 pill buttons (Newest · Oldest · € High · € Low · A→Z · Z→A) appear below
  the category chips; active sort uses `--terra` border/background; default sort is Newest.
  `addflow.jsx` — both `AddSheet` and `EditSheet` (Manual mode only; not Quick keypad) expose a
  **Fun budget toggle** (pill switch, off by default). When on, a Chip owner picker (Joseph/Marti)
  appears. `commit()`/`save()` write `fun:true` + `person` when the toggle is on; EditSheet
  pre-populates toggle state from `txn.fun`/`txn.person`. `EditSheet` accepts a `store` prop for
  reading `store.people`. Both Manual AddSheet and EditSheet also expose a **One-off toggle** (same
  pill switch style, below the Fun toggle). When on, `oneoff:true` is written to the transaction; off
  omits the key (matching the `fun` pattern). EditSheet pre-populates from `txn.oneoff`. Caption:
  "Excluded from the spending-trend forecast — still counts in totals. Large amounts are excluded
  automatically." The oneoff flag causes `isLump()` in calc.jsx to exclude the tx from the blended
  rate while keeping it in `spent`.
  `settings.jsx` — footer shows `APP_VERSION` constant (`'v41'` currently, defined at top of
  IIFE — update it with every release). `TargetSheet` (now labelled "Household ceiling") and `BufferSheet` accept a `year`
  prop (defaults to `store.currentYear`); `TargetSheet` reads/writes `years[y].ceiling`. `BufferSheet`
  computes its own stats internally (unchanged). `YearsSheet` has tappable year rows that drill into a
  year detail view (ceiling + buffer rows), plus an "Add year" button that clones the most recent year's
  ceiling/buffer into `year+1`. Future years with no transactions can be deleted from the detail view.
  Year list rows show `st.ceiling` + `st.combinedProjection` + `DeltaChip(combinedDelta, combinedStatus)`.
  **"Fun budget" section** — one `Row` per person opens `FunConfigSheet`, which sets the person's monthly
  rate for the current YYYY-MM (forward-only: appends/updates a `rates[]` entry, never modifies past
  entries, keeps `rates` sorted) and optionally corrects the balance: "Correct balance…" toggle reveals
  a "Set balance to €X" input that back-calculates and stores `p.balanceAdjustment` so the displayed
  balance equals the entered value, with future accruals and spending applied on top.
  The derived split is shown inline: `ceiling = main + fun/yr`.
  `DensitySheet` — a picker for Overview density (minimal/balanced/all); writes to `store.density`.
  **JSON backup/restore**: "Restore (JSON)" calls `YData.migrateStore(parsed)` before `setStore` so
  old backups (with `target`, no `people`/`wishlist`) migrate cleanly. Hidden `#jsonfile` input mirrors
  the CSV `#csvfile` pattern. **"Sync now"** row in the Data section calls `YSync.pull()` on demand
  (shows "Syncing…" while in flight). "Restore sample data" has been removed.
  Focus routing: `AnalysisScreen` focus useEffect handles `"categories"` → Categories, `"projection"` →
  Projection, `"activity"` → Activity, `"fun"` → Fun.
- `y/icons.jsx` — inline-SVG Lucide-style icon set via `<Icon name=… />`.
- `y/tokens.css` — CSS custom property definitions (all ~25 tokens `app.css` consumes).
- `y/ds.jsx` (`window.ApertureDesignSystem_72a4cd`) — local `Button`, `SegmentedControl`,
  `Input`, `Chip` primitives styled with the tokens.
- `y/app.css` — **the styling source of truth** (layout, the mobile device column, the
  visual system), built on Aperture dark tokens. The `.ds-btn`, `.ds-seg`, `.ds-input`,
  `.ds-chip` classes at the bottom style the DS primitives from `y/ds.jsx`.
  **Font baseline:** `body { font-family: var(--sans); }` + `button, input, select, textarea
  { font-family: inherit; }` ensure the sans font flows everywhere; `.sheet-head h3` and
  `.tx-desc` also carry an explicit `font-family: var(--sans)`. Without these, browsers use
  their UA serif default (Times New Roman) on headings and button descendants.
- `y/tweaks-panel.jsx` — **deleted** (Session 8). Was already unloaded from `index.html`
  in Session 7; confirmed zero references remained before removal.

## Backend (Cloudflare Workers + D1)

The app is hosted on Cloudflare Workers with a D1 SQLite database. Static files live in
`public/`; Worker entry point is `src/index.js`; config is `wrangler.jsonc`. Live at
**https://yearly.josepharari.com** behind Cloudflare Access (Google SSO).

### D1 schema (`migrations/`)

Two tables, applied via `npx wrangler d1 migrations apply yearly-db --remote`:

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

-- Phase 17 migration (applied via Cloudflare dashboard)
-- oneoff INTEGER NOT NULL DEFAULT 0  (always 0 on Revolut import; toggled in-app)

settings(id INTEGER PK CHECK(id=1), blob TEXT, updated_at INTEGER)
-- single row; blob is a JSON-serialised settings object
```

`amount_eur` is stored as `REAL` (mirrors the JS field directly). `fun`, `deleted`,
`e_commerce`, and `oneoff` are `0`/`1` integers. `updated_at` is a **server-stamped ms epoch** on every write.
`"migrations_dir": "migrations"` is set in `wrangler.jsonc`'s `d1_databases[0]`.

### API endpoints (`src/index.js`)

All under `/api/*`. Server clock is authoritative; every write stamps `updated_at = Date.now()`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | `{ok:true,db:true}` — DB connectivity check |
| `GET` | `/api/sync?since=<ms>` | Pull: `{now, transactions:[rows with updated_at>=since], settings:row|null}` |
| `POST` | `/api/transactions` | Batch upsert array of tx records; returns `{now, count}` |
| `GET` | `/api/settings` | `{blob:{…}, updated_at}` or `{blob:null}` |
| `PUT` | `/api/settings` | Upsert settings blob; returns `{now, updated_at}` |
| `GET` | `/api/export` | Full dump: `{exported_at, transactions:[all incl. deleted], settings}` |

Key implementation notes:
- `GET /api/sync` uses `>=` (not `>`) to avoid dropping a write on the same-ms boundary.
- `POST /api/transactions` coerces absent/falsy `deleted` → `0` explicitly (reliable un-delete).
- `fun` and `oneoff` booleans → `0/1` on write; client reconstructs `fun:true`/`oneoff:true`/omit on read.
- Body validation: array required, each item must have a string `id`; returns 400 otherwise.
- Uses `env.DB.batch([...])` for the upsert array.

## Revolut Data Pipeline

Revolut has no public API for personal accounts. Transactions are imported via a browser console script that paginates Revolut's internal API, then processed by Python scripts and pushed to D1.

### Scripts folder (`scripts/`)

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

Config in `sync.py`: `D1_DATABASE = "yearly-db"`, `REVOLUT_WALLET`, `REVOLUT_DEVICE_ID`, `BUFFER_DAYS = 5` (days before last sync to re-pull for late-settling transactions).

### Day-to-day workflow

1. **`prepare.bat`** (`python sync.py prepare`) — generates the console script with the correct `STOP_BEFORE` date (last sync − 5 days), copies it to clipboard, saves to `batches/console_script.js`.
2. Open `app.revolut.com`, paste the script in DevTools console (F12). A `revolut_YYYY-MM-DD.json` downloads to `~/Downloads`.
3. **`push.bat`** (`python sync.py push`) — detects the JSON in Downloads, runs `revolut_clean.py` twice (generates `batches/latest.sql` + `batches/latest.csv`), prompts "Push to D1? [Y/n]", runs `npx wrangler d1 execute yearly-db --remote --file=latest.sql`. On success: archives JSON + CSV to `batches/`, updates `.sync_state.json`, deletes working files.
4. **`status.bat`** — confirms last sync date, run time, total transactions pushed, next pull start date.

### Revolut internal API

```
GET https://app.revolut.com/api/retail/user/current/transactions/last
  ?to={timestamp_ms}&count=50&walletId={REVOLUT_WALLET}
```

Pagination: set `to = lastDate - 1` from the final transaction each batch. Stop when batch is empty or `lastDate < STOP_BEFORE`.

### `revolut_clean.py` — key JSON fields

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

`fun` is always 0 on import — toggled manually in the app UI. There is no `merchant_name` column; `description` always receives `merchant.name` when available.

### Skip logic

- `state != "COMPLETED"` → skip
- `amount >= 0` → skip (income / refunds)
- `type` in `{TOPUP, EXCHANGE}` → skip
- Description matches any of: `^transfer from joseph`, `^transfer from martina`, `^transfer to joseph`, `^transfer to martina`, `pocket withdrawal` → skip (internal transfers)
- After all rows are built: filter out any row whose `date` is not in the current calendar year (prior-year rows are logged but excluded)

### Category assignment (priority order)

1. **Self-transfers** (`tx_type=TRANSFER`, `amount<0`, description is `"to joseph harari laniado"` or `"to джоузеф харари ланиадо"`): use Revolut's own manually-set category (these are old cash-tracking IBAN transfers where the category was set at the time).
2. **Other outbound transfers** (`tx_type=TRANSFER`, `amount<0`): check NAME_RULES, default `"Cash"` if no match.
3. **NAME_RULES** — regex against lowercased `merchant.name` (or `description`); highest priority, overrides Revolut's own category (e.g. Decathlon tagged as "shopping" by Revolut but "Gym" by rules).
4. **REVOLUT_CATEGORY_MAP** — maps Revolut's `category` / `merchant.category` string to an app category. `"general"` maps to `None` (falls through to next step).
5. **Default** → `"General"`.

The **source of truth for NAME_RULES and REVOLUT_CATEGORY_MAP is `scripts/revolut_clean.py`** — read that file when adding merchants or changing mappings. Entries flagged as `"General"` after import are printed as a warning and should be reviewed before pushing.

### FX conversion

Uses `https://api.frankfurter.app/{YYYY-MM-DD}?from={CURRENCY}&to=EUR`. Results are cached in-memory per currency+date for the run. **TRY (Turkish lira) is unsupported** — Frankfurter dropped it in 2018; affected rows get `amount_eur = original_amount` (wrong). Fix manually in the CSV or SQL before pushing.

### `.sync_state.json`

```json
{
  "last_sync_date": "YYYY-MM-DD",   // latest completedDate seen in the last push
  "last_sync_ts": 1234567890,       // Unix timestamp of when the push ran
  "total_transactions": 650         // running total across all pushes
}
```

`prepare` uses `last_sync_date − 5 days` as `STOP_BEFORE` to catch late-settling transactions. Do not delete this file.

### Known issues

- **TRY**: Frankfurter doesn't support Turkish lira. Fix `amount_eur` manually before pushing.
- **Cyrillic merchant names**: Revolut's XLSX export garbles them; JSON export is clean. Always use JSON.
- **PENDING transactions**: skipped (`state != "COMPLETED"`). Small discrepancies vs Revolut's dashboard are expected.
- **Wrangler auth**: OAuth token occasionally goes stale. Fix: run `npx wrangler logout && npx wrangler login` from `scripts/`.
- **D1 no transaction support**: SQL uses bare `INSERT OR REPLACE` statements with no `BEGIN TRANSACTION` wrapper.

## PWA (offline + install)

The app is a fully installable PWA:

- **`sw.js`** (repo root) — **network-first** service worker. On every fetch it tries the
  network; on success it writes the response to cache and returns it. On network failure it
  serves from cache. This means users always get fresh content when online and the app still
  runs when offline. Precaches the full app shell on install (all `y/*.jsx`, `y/*.css`,
  `manifest.json`, `index.html`, and the three pinned CDN URLs for React/ReactDOM/Babel).
  **Cache-versioning rule:** bump `CACHE_NAME` in `sw.js` whenever the shell changes (new
  file added to the precache list, CDN URL pinned to a new version, etc.). The old cache is
  deleted on `activate`. `skipWaiting()` + `clients.claim()` ensure the new SW takes over
  immediately without waiting for old tabs to close.
  **Install hardening:** the install handler uses individual `fetch({cache:'no-cache'}).catch()` calls instead
  of `cache.addAll` so a single URL failure does not abort the entire SW install, and `no-cache` ensures the install always fetches fresh files (bypassing browser HTTP cache). Same `!response.redirected` guard
  applied in the install handler as in the fetch handler. Current version: `yearly-v41`.
  **Logo caching:** merchant logo requests (`storage.googleapis.com/revolut-prod-apps_merchant-logo/…`)
  are intercepted with a **cache-first** strategy using a dedicated `yearly-logos-v1` cache.
  Once a logo is fetched it is never re-fetched. The logo cache is intentionally NOT deleted on
  app version bumps (logos are stable per URL). All other requests remain network-first.
- **`manifest.json`** — includes `id`, `scope`, `start_url`, and an `icons` array with
  192×192, 512×512, and a maskable 512×512 variant (all SVG). SVG icons work in Chrome 91+
  and modern WebKit/Firefox; for production Android/iOS you would swap in PNGs.
- **`icons/icon.svg`** — flat accent-blue (#0071e3) tile with white "Y." wordmark and iOS-
  style rounded corners (rx 115). Used for both 192 and 512 manifest entries.
- **`icons/icon-maskable.svg`** — same design, full bleed (no rx), content within the inner
  80% safe zone so the OS mask never clips the wordmark. Used for the `"purpose": "maskable"`
  manifest entry.
- **`index.html`** registers the SW at the end of `<body>` with feature detection
  (`if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')`).
  Also adds `<link rel="apple-touch-icon" href="icons/icon.svg">` for iOS home-screen icons.

> After any `sw.js` change: hard-refresh and confirm the new SW activated in
> DevTools → Application → Service Workers before investigating anything else (§7 CLAUDE.md).

## Conventions

- **Broadsheet light theme** (mid-migration; some screens still light-remapped from the old
  Aperture dark tokens — see "Visual layer" above). Figures render in the monospace `.num`
  (JetBrains Mono) style; the hero display number is serif; UI/body text is the sans. No
  emoji, no verdict adjectives, no monthly-budget framing — the year is the unit. (Full token
  table and voice rules in the README + `design/BROADSHEET_DESIGN_SPEC.md`.)
- Amounts are positive EUR, stored rounded to cents; year is derived from `date.slice(0,4)`;
  actuals are always computed from transactions, never stored as aggregates.
- Match the surrounding inline-style + className idiom already in each file; there is no CSS
  framework or class generator beyond `app.css` and the Aperture tokens.

## Regression test

Verify: /calc.test.html — ALL rows PASS.

**`calc.test.html`** (repo root) — a standalone HTML page that loads `y/data.jsx` +
`y/calc.jsx` as plain `<script>` tags (no Babel needed; neither file has JSX). Serves as
a smoke-test for the engine. Not precached by `sw.js` (dev artifact only). Run it after any
change to `y/calc.jsx` or `y/data.jsx`.

**Important:** the standard dev server (`python -m http.server --directory public`) serves
from `public/` — `calc.test.html` lives at the repo root, not inside `public/`, so it is
**not reachable** on that server. To run the tests, start a second server from the repo root:
```
python -m http.server 8003
# then open http://localhost:8003/calc.test.html
```
All rows should show PASS.

**Node.js shortcut (faster, no browser needed):** `calc.jsx` and `data.jsx` contain no JSX and run in Node.js as-is with a two-line shim. Write a temp script and run it:
```js
// _tmp_test.js (delete after use)
global.window = global;
global.crypto = { randomUUID: () => Math.random().toString(36).slice(2) };
const fs = require('fs');
eval(fs.readFileSync('./public/y/data.jsx', 'utf8'));
eval(fs.readFileSync('./public/y/calc.jsx', 'utf8'));
// paste assertions here, or a quick sanity check:
const s = YCalc.computeStats(YData.buildSeed(), 2026, new Date('2026-06-07T12:00:00Z'));
console.log(s.mainTarget === 21400 ? 'PASS' : 'FAIL');
```
```
node _tmp_test.js
```
Use this whenever a browser isn't available (e.g. CLI-only Claude Code sessions where `preview_start` / `preview_eval` / `preview_screenshot` don't exist — those are IDE/desktop-only tools).

**Claude Code preview — how to deploy locally for testing:**

The app lives inside `public/`, but the Python server must be started from the **repo root**
(not `--directory public`). This is the setup that reliably works:

**`.claude/launch.json` (already configured):**
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "yearly",
      "runtimeExecutable": "cmd",
      "runtimeArgs": ["/c", "python", "-m", "http.server", "8766"],
      "port": 8766,
      "autoPort": true
    }
  ]
}
```

**Why `cmd /c` wrapper?** On Windows, `python -m http.server` must be launched via `cmd /c`
for `preview_start` to detect it properly. Direct `python` as `runtimeExecutable` does not
always work reliably.

**Why serve from repo root (not `--directory public`)?** This is the critical insight:
- If you serve from `public/` (the old config), the server's root IS the app — the browser
  auto-navigates to `http://localhost:PORT/` which tries to load `index.html` directly. If
  anything goes wrong (wrong port, 404, redirect), the browser lands on
  `chrome-error://chromewebdata/`. **From that error page, `window.location` assignments are
  silently ignored** — the preview browser is permanently stuck and the only escape is
  `preview_stop` → `preview_start` (fresh, `reused: false`). This costs many tokens.
- If you serve from the **repo root**, the server's root is the directory listing. The browser
  auto-navigates to `http://localhost:PORT/` and gets a valid directory listing page (not an
  error). From a valid page, you CAN redirect the browser to `/public/` via eval.

**Step-by-step sequence:**
```
1. preview_start("yearly")
   → returns serverId and actual port (e.g. 54321)

2. preview_eval: window.location.href
   → should return "http://localhost:54321/" (not chrome-error — if it IS chrome-error,
     do preview_stop + preview_start again before proceeding)

3. preview_eval: window.location.href = 'http://localhost:54321/public/';
   → browser navigates to the app

4. preview_console_logs (level: all) — React DevTools info + Babel transformer warn are normal.
   Any ERROR lines mean something broke; fix before taking screenshots.

5. preview_screenshot to verify the app renders.
```

**Port conflicts:** Ports 8000, 8002, 8003, 8765 are often already in use by the user's own
servers. Port 8766 tends to be free, and `autoPort: true` will find the next available port
if it isn't. The actual assigned port is always returned in the `preview_start` result — use
that port in the `/public/` URL in step 3, not the configured port.

**After every code change:** the app uses a service worker (PWA). Changes are NOT reflected
on a simple reload. You must bump `CACHE_NAME` in `public/sw.js` (e.g. `yearly-v20` →
`yearly-v21`) AND do a hard-refresh. In the preview browser, run:
```js
// preview_eval:
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  location.reload();
})()
```
If `navigator.serviceWorker` is unavailable in the eval context (it sometimes is), just bump
the cache version constant and reload — the new SW activates on the next page load.

**chrome-error recovery:** if `preview_eval: window.location.href` returns
`"chrome-error://chromewebdata/"`, do NOT attempt further evals or navigation — they all
silently no-op. Run `preview_stop` → `preview_start` to get a fresh browser, then repeat
the sequence above from step 1.
