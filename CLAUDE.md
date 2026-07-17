# CLAUDE.md

Guidance for Claude Code working in this repository. This file is the **hub** — it holds what's
needed for everyday changes and links to deeper references in `docs/` for the rest. Pull a `docs/`
file only when the task touches that area.

## What this repo is

**Yearly** is a mobile-first annual budgeting PWA: it tracks joint household spend in EUR against a
single per-year ceiling and produces ranked, plain-language **callouts** explaining whether you're
on track and why.

- **`README.md` is the authoritative product + math spec** (data model, projection formula, status
  thresholds, callout detectors, screens, design tokens). Treat it as the source of truth for
  *intended* behavior; treat the code as the *current* implementation. **If you change the math or
  detectors, update the README in the same change.**
- The README frames this bundle as a design reference / prototype to be recreated in a production
  stack (Vite/Next + Recharts + a real component library). The files here are a working prototype.
- The app is fully reskinned to the editorial light **Broadsheet** theme (warm paper, hairline
  rules, three fonts, one terracotta accent). Tokens in `y/tokens.css`; spec in
  `design/BROADSHEET_DESIGN_SPEC.md`; restyle log in `design/RESTYLE_LOG.md`.

## Reference map — where the detail lives

| Doc | When to read it |
|-----|-----------------|
| `README.md` | Intended projection math, status thresholds, callout detector specs (source of truth) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Engine (`calc.jsx`), store shape (`data.jsx`), sync layer (`sync.jsx`), state root (`app.jsx`) |
| [docs/UI.md](docs/UI.md) | Components & screens: `ui.jsx`, `fun.jsx`, `home.jsx`, `analysis.jsx`, `settings.jsx`, `addflow.jsx` |
| [docs/BACKEND.md](docs/BACKEND.md) | Cloudflare Workers + D1 schema, migrations, `/api/*` endpoints |
| [docs/REVOLUT.md](docs/REVOLUT.md) | Revolut import pipeline (`scripts/`), category rules, FX, known issues, mobile bookmarklet path |
| [docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md) | Running locally, service worker, regression test, Claude Code preview sequence |

## How to run it

There is **no build, no package manager, no tests, no linter**. A single static HTML file loads
React + Babel from CDN and transpiles the `y/*.jsx` modules in the browser. Serve over HTTP (it will
**not** work over `file://`):
- From repo root: `python -m http.server 8766` → `http://localhost:8766/public/` (preferred for
  Claude Code preview)
- From `public/`: `python -m http.server --directory public 8002` → `http://localhost:8002/`

State persists to `localStorage` under `yearly:store:v1`; clear that key to reset to a blank store.
Full local-dev notes (the no-backend 404 handling, reload-loop fix) are in
[docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md).

## Everyday gotchas (read before any change)

1. **Service worker caches the whole app.** Code changes are NOT reflected on a simple reload — even
   a scripted `location.reload()` or an SW-unregister+clear-caches call can still serve stale bytes
   via the browser's own HTTP cache. On every shell change, bump `CACHE_NAME` in `public/sw.js` AND
   hard-refresh (`Ctrl+Shift+R`, or `computer{action:"key", text:"ctrl+shift+r"}` in the Browser pane
   tool). When something doesn't appear in preview, **hard-refresh first** — rule it out before
   debugging logic. Also: if port 8766 is already serving (another session's dev server), navigate
   straight to `http://localhost:8766/public/` instead of letting `preview_start`'s `autoPort` spin up
   a second server on a random port nobody is looking at. Full SW + preview workflow, including the
   port-conflict and hard-refresh procedures: [docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md#claude-code-preview--how-to-deploy-locally-for-testing).
2. **`APP_VERSION` (`settings.jsx` footer) and `CACHE_NAME` (`sw.js`) move together** — currently
   `v73` / `yearly-v73`. Bump both on every release.
3. **`localISO(d)`, never `toISOString()`** for dates in `calc.jsx` — `toISOString()` is UTC and
   silently drops Dec 31 transactions in UTC+ timezones (EET).
3b. **`updated_at` is milliseconds everywhere** — `Date.now()` in the worker, `Date.now()` for the
   client cursor, **`int(time.time() * 1000)`** in the Revolut pipeline. A seconds value (10 digits)
   silently disappears from incremental sync because the cursor (ms, 13 digits) is ~1000× larger
   than `WHERE updated_at >= ?` will ever match. Any new direct-to-D1 write path must mint ms.
   `YSync.reconcile()` (called on every app start after bootstrap+pull) is what catches regressions
   of this shape: it compares `GET /api/sync/check` aggregates to the local store and force-pulls on
   any mismatch.
4. **Don't rename `ceiling` back to `target`.** `ceiling` is the stored, sacred household number;
   `mainTarget` = `ceiling − funPlanAnnual` is derived. See vocabulary below.
5. **After changing `calc.jsx` or `data.jsx`, run the regression test** (`calc.test.html`, all rows
   PASS) — see [docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md) for the browser and Node shortcuts.
5b. **Don't `wrangler d1 migrations apply` against remote** — its tracking table is out of sync and
   will try to replay 0002+ and fail. Apply new migrations via the **Cloudflare D1 dashboard
   Console**, then commit the `.sql` file. Detail: [docs/BACKEND.md](docs/BACKEND.md).

## Module system (no bundler)

Every `y/*.jsx` file is an IIFE that **reads its dependencies off `window` and attaches its own
export to `window`** — no imports/exports.

1. **Load order is significant** and fixed in `index.html`: `icons → ds → data → sync → calc → ui →
   fun → travel → home → addflow → analysis → settings → app`. Adding a module means adding its
   `<script type="text/babel">` tag there in dependency order.
2. Cross-module calls go through globals: `window.YData`, `window.YCalc`, `window.YSync`,
   `window.YUI`, `window.YFun`, `window.YTravel`, `window.YHome`, `window.YAnalysis`,
   `window.YSettings`, `window.YAdd`, plus `window.Icon`/`window.YIcons`. Aperture primitives come from
   `window.ApertureDesignSystem_72a4cd` (defined locally in `y/ds.jsx`).

The app is self-contained — no `_ds/` directory needed. Details in
[docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md#self-contained-no-external-dependencies).

## The engine — `y/calc.jsx` (`window.YCalc`)

**All numbers come from here.** Pure functions, no UI deps. Full export list, formulas, and the
detector index are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-brain--ycalcjsx-windowycalc).
The essentials every session needs:

**Vocabulary (canonical — never use `target` for the stored ceiling):**
- `ceiling` — `years[y].ceiling`, stored, user-set, sacred.
- `funPlanAnnual` — Σ people × 12 × `rateForMonth`; derived.
- `mainTarget` — `ceiling − funPlanAnnual`; derived, never stored. **Explanatory decomposition only — never a target.**
- `spent` / `projection` (in stats) — **total household spend (main + fun)**; measured vs `ceiling`.
- `mainSpent` / `funSpent` — decomposition fields for the Fun tab and ceiling-callout advice only.
- `funProjection` — capped fun projection (allowance-limited); used in the Fun tab and the "trim fun" callout advice.
- **Travel budget** — a second, family-wide overlay that mirrors fun but with a single household
  allowance (`store.travel = { rates[], startMonth, balanceAdjustment }`, no per-person split) and
  its own transaction tag `t.travel`. `computeTravel(store)` returns the all-time `balance`
  (green/deficit), YTD spend, uncapped linear projection, the family-wide category breakdown, and a
  per-trip `trips[]` aggregation. It is a **pure psychological overlay**: travel-tagged spend still
  counts in `spent`/`projection` vs the ceiling, but travel does **not** feed
  `funPlanAnnual`/`mainTarget` or any callout. Travel-tagged spend is organized into discrete,
  user-named **trips** (`store.trips[]`: `{id, name, location, startDate, endDate, createdAt,
  updatedAt}`, settings-blob synced, no separate D1 table) — every `t.travel` transaction carries a
  `trip_id` (nullable D1 column) referencing one. Legacy pre-trips travel tx are migrated onto a
  fixed `trip_legacy` ("Past travel") trip. UI lives in `y/travel.jsx` (`window.YTravel`: home
  `TravelStrip`, Analysis `TravelTab` — a collapsible list of trips with per-trip category
  breakdown/tx and trip create/rename; delete is blocked while a trip has transactions) plus the
  Add/Edit expense flow's trip picker (`y/addflow.jsx` `TripField`, required whenever Travel is
  toggled on). The old `store.travelWishlist` future-trip-goals feature has been removed.
- `staleDays` — whole days since the Revolut pipeline last ran; `0` when unknown. Extends the
  projection horizon: `projDays = daysRemaining + staleDays`. Passed as 4th arg to `computeStats`
  (default 0); only applied when `isCurrent`. Also widens the uncertainty band (`weeksRemaining =
  projDays / 7`), making `alert` harder to trip while data is stale.

**Projection (damped blend):** `projDays = daysRemaining + staleDays`, `projection = spent +
blendedRate × projDays × (1 + buffer) + committedFuture`, `blendedRate = YTD_rate × (doy/365) +
trailing_60d_rate × (1 − doy/365)`. Buffer uplifts only the extrapolated remainder (so on Dec 31
with no stale days or committed future, projection = spent). Complete/future years: `projection = spent`.

**Amortization:** a tx can carry `amortize_months` (int ≥ 2) to spread `amount_eur` evenly over N
months from its own month (optional `virtual:true` = no-cash entry, e.g. depreciation, that still
counts vs the ceiling). `YCalc.expandAmortized(transactions)` explodes each such parent into N
`oneoff` monthly slices (dated the 1st, spilling across years, last slice absorbs the cent
remainder) and drops the parent. `committedFuture` = not-yet-elapsed slices, added deterministically
(no buffer). **`app.jsx` feeds an expanded `calcStore` to `computeStats`/`buildCallouts` only;
`computeFun`/`computeTravel` stay on raw `store`.** Invariant: **slices exist only for aggregate
math — never persisted, synced, or rendered.** Any UI that lists individual tx reads raw
`store.transactions` (analysis lists use `yearTxns(store, …)`). `YCalc.amortizationBreakdown(store,
viewYear, asOfStr)` exposes read-only real/virtual aggregates + raw parent metadata for the
Analysis "Amortization" block and "Amortized" ledger, honoring the same invariant. Detail in
ARCHITECTURE.md.

**Conventions that are easy to break** (see ARCHITECTURE.md for the why): `localISO` not
`toISOString`; lump-sum winsorization (tx > 2% of `ceiling`, or `oneoff:true`, excluded from the
blended rate but kept in `spent`); the `doy>28` trend-detector guard; the `funProjection` cap (Fun tab only).

`buildCallouts` runs 8 detectors (README is authoritative; quick index in ARCHITECTURE.md); the
ceiling verdict (#8) is always prepended first.

## State root — `y/app.jsx`

`App` is the single stateful root. `store` (persisted to localStorage on every mutation) is the only
durable state; everything else is ephemeral UI state. A memoized `calcStore = { ...store,
transactions: YCalc.expandAmortized(store.transactions) }` (amortization expansion; see the engine
section) feeds the ceiling math. Memoized derivations drive the UI:
`stats = YCalc.computeStats(calcStore, viewYear, undefined, viewYear===currentYear ? staleDays : 0)`,
`callouts = YCalc.buildCallouts(calcStore, stats)`, `fun = YCalc.computeFun(store)`,
`travel = YCalc.computeTravel(store)` — note `fun`/`travel` stay on **raw** `store`. `staleDays` is
derived from `lastSyncTs` (state, set after `reconcile()` via `YSync.getLastSyncTs()`). Navigation is in-memory route state (`home` | `analysis` | `settings`), not
URL routing. `viewYear` is independent of `store.currentYear`; a past year flips the app into
completed-year mode. Sync wiring, callout→Analysis focus routing, and undo-on-delete are detailed in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#state-flow--yappjsx).

## Conventions

- **Broadsheet light theme.** Figures render in the monospace `.num` (JetBrains Mono); the hero
  display number is serif; UI/body text is sans. No emoji, no verdict adjectives, no monthly-budget
  framing — the year is the unit. (Token table + voice rules: README + `design/BROADSHEET_DESIGN_SPEC.md`.)
- Amounts are positive EUR, stored rounded to cents; year is derived from `date.slice(0,4)`; actuals
  are always computed from transactions, never stored as aggregates.
- Match the surrounding inline-style + className idiom in each file; there is no CSS framework beyond
  `app.css` and the tokens.

## Documentation upkeep

After any feature change or multi-file edit, update the relevant doc **in the same session**: the
math/store/sync/state → `docs/ARCHITECTURE.md` (and README if behavior changed); components/screens
→ `docs/UI.md`; backend → `docs/BACKEND.md`; import pipeline → `docs/REVOLUT.md`; SW/dev →
`docs/PWA-AND-DEV.md`. Keep this hub short — push detail down into the `docs/` files rather than
growing CLAUDE.md.
