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

The app is being reskinned from the old Aperture **dark** theme to **Broadsheet** — an
editorial light look (warm paper, hairline rules, three fonts, one terracotta accent). The
authoritative spec is `design/BROADSHEET_DESIGN_SPEC.md` with a runnable reference in
`design/reference/` (`broadsheet.html` + `lb-a.jsx` + `lb-data.jsx`). **This is a
visual-layer-only change — logic, data, projection math, the callout engine, routing, and
persistence are untouched.**

- **Phase 0 (done):** `y/tokens.css` defines the Broadsheet token set (`--paper`,
  `--ink`, `--ink-2`, `--muted`, `--hair`/`--hair-strong`, `--terra`/`--amber`/`--sage`,
  the `--chart-*` palette, and `--serif`/`--sans`/`--mono`). The three fonts (Newsreader /
  Hanken Grotesk / JetBrains Mono) are wired via a Google Fonts `<link>` in `index.html`.
- **Phase 1 (done):** **Overview** is restyled pixel-for-pixel to the reference:
  hero (no card, serif-`ink` number, over/under as a small mono `terra`/`sage` figure, a
  3px pace rule), "What's happening" callouts as hairline list rows with severity dots
  (terra/amber/sage) + faded serif "→", and a themed **Spend curve** (`SpendCurve` in
  `y/ui.jsx`). The Overview's old **Recent** transaction list was removed in favour of the
  Spend curve (matching the reference); transactions are still reachable on Analysis →
  Activity. Bottom nav is editorial text (mono labels, terra underline on active, an outline
  "+" circle).
- **Phase 1.5 (done):** **Shared primitives** restyled to Broadsheet (`y/ds.jsx` +
  `.ds-*` classes in `y/app.css`; `Sheet` + `Toast` in `y/ui.jsx`; form classes `.field` /
  `.inp` / `.inp-num`). All legacy token names replaced with canonical ones in touched rules.
  Button: terra fill / paper text / sans 600 (primary), transparent / hair border / ink
  (secondary). Chips: hair border; active = ink fill + paper text inversion. SegmentedControl:
  paper-tint track, paper active item, warm shadow. Inputs: transparent, hair border, terra
  focus ring, mono labels mono 11px uppercase muted, amount fields in mono. Sheet: paper
  surface, hair border, hair-strong grabber, warm scrim, `prefers-reduced-motion` guard.
  Toast: paper surface, hair-strong border, ink text, terra action. `DeltaChip` restyled to a
  bare mono terra/sage/amber inline figure (no background chip) for future reuse.
  SW cache bumped to `yearly-v5`.
- **Phase 2a (done):** **Add/Edit flow** (`y/addflow.jsx`) restyled to Broadsheet.
  Template tiles: multicolor filled icon chips replaced with calm 10px category color dots +
  label. Category picker: filled CatIcon squares replaced with 8px color dots. NumPad keys:
  canonical tokens (`--paper`, `--hair`, `--ink`, `--mono`), no shadows. DateField:
  `colorScheme` set to `"light"`. CSS: `.tpl`, `.tpl-dot`, `.tpl-name`, `.catpick-item`,
  `.catpick-item.sel`, `.cat-dot`, `.amount-display .cur` all updated to canonical tokens
  (`--paper`, `--hair`, `--hair-strong`, `--ink`, `--ink-2`, `--muted`, `--terra`); legacy
  `.tpl-ic` and `.catpick-item .cat-ic` removed. SW cache bumped to `yearly-v6`.
- **Phase 2b (done):** **Analysis** (`y/analysis.jsx`) restyled to Broadsheet.
  **ProjectionChart**: actual line/area locked to `--chart-actual` (terra) regardless of
  status — the "no red hero line" fix; projection → `--chart-proj` dashed "6 5" 2.2px;
  target → `--chart-target` dashed "4 4"; pace → `--chart-pace` dashed "2 4"; prior-year →
  `--chart-target` dashed; axis ticks mono `--chart-axis`; grid → `--chart-grid`.
  **ChartLegend**: all swatch colors updated to `--chart-*` palette; mono muted labels.
  **StatCards** (`.stat*`): filled grey cards dropped → flat hairline-separated figures;
  labels mono 10px uppercase muted, values mono ink, no card borders or radii.
  **CategoriesTab**: `CatIcon` chip replaced with 8px `cat-dot` color dot per category;
  catbar track height 3px in category color over `--hair` background; numbers mono; MoM
  delta uses canonical `--amber`/`--sage`. **TxRow** (shared in `y/ui.jsx`): `CatIcon`
  replaced with `cat-dot` color dot; `tx-meta` now mono `--muted`. All `.panel.panel-pad`
  wrappers removed from Projection, Categories, and Activity tabs — content sits directly
  on paper separated by `section-h` hairline rules. CSS: `.catbar-*`, `.txrow`, `.tx-*`
  updated to canonical tokens; `.stat*` rewritten as flat grid with hairline separators.
  Recharts engine not adopted — dependency-free SVG chart retained (same as SpendCurve).
  SW cache bumped to `yearly-v7`.
- **Phase 2c (done):** **Settings** (`y/settings.jsx`) restyled to Broadsheet.
  **Setting rows** (`.setrow*`): filled grey `.setrow-ic` tile removed — icon floats bare
  in `--ink-2`; titles sans `--ink`; sub-labels and values mono `--muted`; dividers `--hair`.
  **Year list** (`.year-row`): dividers `--hair`; "CURRENT" badge mono `--terra`; target /
  projection figures mono `--ink-2`; delta display switched from background `delta-chip` to
  bare `DeltaChip` component (mono, colored, no chip). **Range slider** (`.rng`): track is a
  terra-filled linear gradient driven by `--rng-fill` CSS variable (set inline from `v/15`);
  thumb is `--paper` with `1.5px --hair-strong` border, no heavy shadow. **Import preview**:
  `.chk` border `--hair-strong`, checked fill `--terra`; `.dupflag` mono `--amber`. **Category
  select pill** (`.selpill`): `--paper-tint` background, `--hair` border, `--sans` font, `--ink`
  text. **Templates**: `CatIcon` replaced with 8px `cat-dot` color dot. **DensitySheet**: active
  check `--terra`. All inline legacy token names (`--text`, `--text-2`, `--text-3`, `--accent`,
  `--font`, `--font-mono`, `--surface-sunk`, `--hairline`, `--hairline-strong`, `--watch`)
  replaced with canonical equivalents. SW cache bumped to `yearly-v8`.
- **Phase 3 (done):** **Consistency sweep.** All remaining legacy token usages replaced with
  canonical names throughout `y/app.css` and `y/app.jsx`: `.device` `--bg`→`--paper`;
  `.panel` `--surface`→`--paper`, `--hairline`→`--hair`; `.gauge-label`, `.muted`, `.empty`
  `--text-3`→`--muted`; `.callout-text` hardcoded `#3b352a`→`--ink`; `.callout-arrow`
  hardcoded `#bdb39a`→`--muted`; inline `--accent`→`--terra`, `--text-3`→`--muted` in
  `app.jsx`. The **legacy-remap block** removed from `y/tokens.css` — file now contains only
  canonical Broadsheet names. SW cache bumped to `yearly-v9`.
- **Spend curve note:** the spec §4 calls for Recharts, but this repo is deliberately
  self-contained/offline-first, so `SpendCurve` and `ProjectionChart` are dependency-free
  themed SVGs. Adopting the Recharts engine is an optional future decision.

## Running it

There is **no build, no package manager, no tests, no linter**. The app is a single static
HTML file that loads React + Babel from CDN and transpiles the `y/*.jsx` modules in the
browser.

- Serve the directory over HTTP and open `index.html` (e.g. `python -m http.server` then
  visit `http://localhost:8000/`). It will **not** work over `file://` — the `type="text/babel" src=`
  scripts require HTTP.
- State persists to `localStorage` under `yearly:store:v1`; on first load a deterministic
  seed dataset is generated (`y/data.jsx → buildSeed`). To reset, clear that key or use
  Settings › Restore sample data.
- The app is also hosted on GitHub Pages — `index.html` at the repo root serves as the PWA
  entry point.

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
   `window.YUI`, `window.YFun`, `window.YHome`, `window.YAnalysis`, `window.YSettings`,
   `window.YAdd`, plus `window.Icon`/`window.YIcons`. Aperture components come from
   `window.ApertureDesignSystem_72a4cd`.

### The brain (port these first to any production target)
- `y/calc.jsx` (`window.YCalc`) — **all numbers come from here.** `computeStats(store, year, asOfDate?)`
  (linear projection + per-year buffer uplift + status thresholds; `asOfDate` defaults to `new Date()`)
  and `buildCallouts(store, stats)` (the ranked detector engine — 8 detectors). Pure functions, no UI deps.
  Also exports `cumulativeByDay(txns)` → `number[366]` (shared with `analysis.jsx`),
  `priorYearCumulative(store, year, asOfDate)` → number (prior year spend at same day-of-year),
  `rateForMonth(person, ym)` → number (latest applicable rate for a person in a "YYYY-MM"; 0 before startMonth),
  `computeFun(store, asOfDate?)` → per-person fun ledger (see below),
  `projectionAsOf` (trend detector), `requiredDailyToHit(stats)` → number|null (daily cap to finish on
  mainTarget; null when not applicable), and the standard formatters.
  **Vocabulary** (canonical names — never use `target` for the stored ceiling):
  - `ceiling` — `years[y].ceiling`, stored, user-set, sacred. Renamed from `target`.
  - `funPlanAnnual` — Σ people × 12 months × rateForMonth; derived.
  - `mainTarget` — `ceiling − funPlanAnnual`; derived, never stored. Non-discretionary budget.
  - `spent` / `projection` in stats — main (non-fun) only. Fun tx excluded from all main math.
  - `funSpent` / `funProjection` — fun YTD and linear projection (approximate, lumpy).
  - `combinedProjection` = `projection + funProjection`; `combinedDelta` / `combinedStatus` vs `ceiling`.
  `computeStats` returns: `ceiling`, `mainTarget`, `funPlanAnnual`, `funSpent`, `funProjection`,
  `combinedProjection`, `combinedDelta`, `combinedDeltaPct`, `combinedStatus` plus all existing fields
  (`spent`, `projection`, `delta`, `status`, etc. — all main-budget). `stats.txns` contains main-only
  tx (fun tx excluded); `stats.upto` is likewise main-only.
  `priorCum` (number[366] | null) and `priorSpent` (number | null) — prior year, main tx only.
  Future-year guard: spent 0, projection 0, status "good"; `isFuture` in returned stats.
  `buildCallouts` returns a single `{id:"future"}` callout for future years; `{id:"final"}` for
  complete years. For current year, detectors #1–7 describe the main budget; detector #8 (ceiling)
  is the sacred combined verdict, always prepended at the top:
  - over ceiling → watch/alert "trim fun ~€Y/mo"; drill {section:"fun"}.
  - comfortably under (< ceiling×0.94) → good/info "room to raise fun ~€Y/mo"; drill {section:"fun"}.
  When the ceiling callout is present it replaces the "calm" fallback.
  Detector #6 (yoy): current year only — compares main spent to prior year at same doy; watch/info/good.
  Detector #7 (reqpace): current year only, when projection > mainTarget — surfaces required daily spend cap.
  `computeFun(store, asOfDate?)` — exported, uses `store.currentYear` for YTD figures. Returns:
  `people[]` (per-person: `id`, `name`, `balance` all-time = accrued − spent, `monthlyRate`, `usedThisMonth`,
  `spentAllTime`), `funSpentYTD`, `funProjection` (linear, approximate), `funCatList` (category breakdown).
- `y/data.jsx` (`window.YData`) — the persisted store shape, the fixed 18-category list
  (`CATEGORIES`, id→icon→color), default templates, deterministic seed generator, and
  `loadStore`/`saveStore`/`resetStore`/`migrateStore`.
  **Store shape additions (fun-budget model):**
  - `store.people`: `[{id, name, rates:[{from:"YYYY-MM", amount}], startMonth:"YYYY-MM"}]` — forward-only
    dated rate schedule per person. Sorted ascending by `from`. Default: Joseph €100/mo, Marti €200/mo.
  - `store.wishlist`: `[{id, owner, name, price, note?, createdMonth}]` — per-person wishlist items.
  - Transaction fields: optional `fun:true` and `person:"joseph"|"marti"` (only on fun tx).
  - `years[y].ceiling` — renamed from `years[y].target` (sacred household ceiling, never derived).
  `migrateStore(s)` (exported, idempotent): `years[y].target` → `ceiling`; injects `people` and
  `wishlist` defaults if missing; sets `density` default. Called by `loadStore` and by JSON restore.
  The seed (`buildSeed`) tags ~8 shopping/entertainment/restaurant tx in 2026 with `fun:true` +
  alternating person, includes `people`, `wishlist` (2 sample items), and uses `ceiling` (not `target`).

The README documents the exact projection formula, status thresholds, and each callout
detector. **If you change the math or detectors, update the README spec in the same change.**

### State flow (`y/app.jsx`)
`App` is the single stateful root. `store` (persisted via a `setStore` that writes the whole
object to localStorage on every mutation) is the only durable state; `route` / `viewYear` /
`analysisFocus` / `addOpen` / `editTx` / `yearOpen` / `deletedTx` / `showToast` are ephemeral
UI state. Three memoized derivations drive everything visible:
`stats = YCalc.computeStats(store, viewYear)`, `callouts = YCalc.buildCallouts(store, stats)`,
and `fun = YCalc.computeFun(store)` (all-time per-person fun ledger, recomputed on any store
change). `onOpenFun` sets `analysisFocus = { section:"fun" }` and routes to Analysis (Fun tab
arrives in Session 3; until then it lands on Analysis with a placeholder). `fun`, `store`, and
`onOpenFun` are passed into `HomeScreen` for the FunStrip.

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
  **`StatusHero`** leads with the sacred combined household number: headline =
  `combinedProjection` (current/complete) or `ceiling` (future); sub-line = over/under
  ceiling by €N (coloured by `combinedStatus`); pace rule fills to `combinedProjection/ceiling`
  with a day-of-year marker; a decomposition line shows `main €A / €mainTarget` (coloured by
  `stats.status`) and `fun €B` (ink-2). For complete years all projections equal spent.
  `Toast({ open, message, actionLabel, onAction, onDismiss })` — transient bottom-anchored
  banner (above nav, z-index 30), auto-dismisses after 5 s via `onDismiss`, optional action button.
  `GaugeHero`, `PaceBar`, and `ProjSpark` have been removed (dead since hero is fixed to numerals).
- `y/fun.jsx` (`window.YFun`) — fun budget UI module. Currently exports:
  `FunStrip({ fun, store, onOpen })` — compact Overview strip: one hairline row per person
  (name, all-time balance in sage/terra, nearest wishlist goal name+pct+thin bar). Whole strip
  tappable → `onOpen()`. "no goals yet" if no wishlist items. Broadsheet tokens only, no cards.
  `FunTab` — placeholder (full workshop added in Session 3).
- Screens: `y/home.jsx` (Overview — hero + callouts + FunStrip + spend curve),
  `y/analysis.jsx` (Projection/Categories/Activity tabs; charts are hand-built SVG that
  double as the Recharts spec), `y/settings.jsx`
  (target/buffer/years/density/templates/CSV import-export/JSON backup-restore/clear),
  `y/addflow.jsx` (Quick keypad + Manual add, Edit sheet, category picker).
  `settings.jsx` — `TargetSheet` (now labelled "Household ceiling") and `BufferSheet` accept a `year`
  prop (defaults to `store.currentYear`); `TargetSheet` reads/writes `years[y].ceiling`. `BufferSheet`
  computes its own stats internally (unchanged). `YearsSheet` has tappable year rows that drill into a
  year detail view (ceiling + buffer rows), plus an "Add year" button that clones the most recent year's
  ceiling/buffer into `year+1`. Future years with no transactions can be deleted from the detail view.
  Year list rows show `st.ceiling` + `st.combinedProjection` + `DeltaChip(combinedDelta, combinedStatus)`.
  `DensitySheet` — a picker for Overview density (minimal/balanced/all); writes to `store.density`.
  **JSON backup/restore**: "Restore (JSON)" calls `YData.migrateStore(parsed)` before `setStore` so
  old backups (with `target`, no `people`/`wishlist`) migrate cleanly. Hidden `#jsonfile` input mirrors
  the CSV `#csvfile` pattern.
  **"All activity" routing fix** (Session 8): `AnalysisScreen` focus useEffect now handles
  `focus.section === "activity"` → `setTab("Activity")`.
- `y/icons.jsx` — inline-SVG Lucide-style icon set via `<Icon name=… />`.
- `y/tokens.css` — CSS custom property definitions (all ~25 tokens `app.css` consumes).
- `y/ds.jsx` (`window.ApertureDesignSystem_72a4cd`) — local `Button`, `SegmentedControl`,
  `Input`, `Chip` primitives styled with the tokens.
- `y/app.css` — **the styling source of truth** (layout, the mobile device column, the
  visual system), built on Aperture dark tokens. The `.ds-btn`, `.ds-seg`, `.ds-input`,
  `.ds-chip` classes at the bottom style the DS primitives from `y/ds.jsx`.
- `y/tweaks-panel.jsx` — **deleted** (Session 8). Was already unloaded from `index.html`
  in Session 7; confirmed zero references remained before removal.

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
  immediately without waiting for old tabs to close. Current version: `yearly-v10` (fun
  budget Session 2: `y/fun.jsx` added to precache, `y/ui.jsx` StatusHero reworked,
  `y/home.jsx` FunStrip wired, `y/app.jsx` `computeFun` memo + `onOpenFun`).
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

**`calc.test.html`** (repo root) — a standalone HTML page that loads `y/data.jsx` +
`y/calc.jsx` as plain `<script>` tags (no Babel needed; neither file has JSX). Serves as
a smoke-test for the engine: open over HTTP (`http://localhost:8000/calc.test.html`) and all
rows should show PASS. Not precached by `sw.js` (dev artifact only). Run it after any
change to `y/calc.jsx` or `y/data.jsx`.
