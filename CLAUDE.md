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

## Visual layer: the "Broadsheet" restyle (in progress)

The app is being reskinned from the old Aperture **dark** theme to **Broadsheet** — an
editorial light look (warm paper, hairline rules, three fonts, one terracotta accent). The
authoritative spec is `design/BROADSHEET_DESIGN_SPEC.md` with a runnable reference in
`design/reference/` (`broadsheet.html` + `lb-a.jsx` + `lb-data.jsx`). **This is a
visual-layer-only change — logic, data, projection math, the callout engine, routing, and
persistence are untouched.**

- **Phase 0 (done):** `y/tokens.css` now defines the Broadsheet token set (`--paper`,
  `--ink`, `--ink-2`, `--muted`, `--hair`/`--hair-strong`, `--terra`/`--amber`/`--sage`,
  the `--chart-*` palette, and `--serif`/`--sans`/`--mono`). A **legacy-remap block** at the
  bottom points the old Aperture names (`--bg`, `--surface`, `--text*`, `--hairline*`,
  `--accent`, `--font*`) at their Broadsheet equivalents, so screens not yet migrated still
  render on paper. The three fonts (Newsreader / Hanken Grotesk / JetBrains Mono) are wired
  via a Google Fonts `<link>` in `index.html`.
- **Phase 1 (done):** **Overview** is restyled pixel-for-pixel to the reference:
  hero (no card, serif-`ink` number, over/under as a small mono `terra`/`sage` figure, a
  3px pace rule), "What's happening" callouts as hairline list rows with severity dots
  (terra/amber/sage) + faded serif "→", and a themed **Spend curve** (`SpendCurve` in
  `y/ui.jsx`). The Overview's old **Recent** transaction list was removed in favour of the
  Spend curve (matching the reference); transactions are still reachable on Analysis →
  Activity. Bottom nav is editorial text (mono labels, terra underline on active, an outline
  "+" circle). `DeltaChip` is retained in `y/ui.jsx` but is no longer used by `StatusHero`.
- **Spend curve note:** the spec §4 calls for Recharts, but this repo is deliberately
  self-contained/offline-first, so `SpendCurve` is a dependency-free themed SVG (same
  approach as the existing Analysis `ProjectionChart`). Adopting the Recharts engine is an
  optional Phase-2b decision, not a requirement.
- **Phases 2+ (pending):** Add/Edit + keypad + category picker, Analysis (chart theming +
  category list/donut + activity), Settings/Years/Templates/CSV/JSON, and final shared-
  primitive + consistency sweeps. These still render via the legacy-remap tokens until
  restyled.

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

- **`y/tokens.css`** — defines the Broadsheet token set plus a legacy-remap block for the
  old Aperture names (`--bg`, `--surface`, `--text`, `--accent`, `--r-card`, `--shadow-rest`,
  etc.) still consumed by `y/app.css`. Loaded in `index.html` before `y/app.css`. See the
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
   `window.YUI`, `window.YHome`, `window.YAnalysis`, `window.YSettings`, `window.YAdd`,
   `window.YHome`, plus `window.Icon`/`window.YIcons`. Aperture components come from
   `window.ApertureDesignSystem_72a4cd`.

### The brain (port these first to any production target)
- `y/calc.jsx` (`window.YCalc`) — **all numbers come from here.** `computeStats(store, year, asOfDate?)`
  (linear projection + per-year buffer uplift + status thresholds; `asOfDate` defaults to `new Date()`)
  and `buildCallouts(store, stats)` (the ranked detector engine — 7 detectors). Pure functions, no UI deps.
  Also exports `cumulativeByDay(txns)` → `number[366]` (shared with `analysis.jsx`),
  `priorYearCumulative(store, year, asOfDate)` → number (prior year spend at same day-of-year),
  `projectionAsOf` (trend detector), `requiredDailyToHit(stats)` → number|null (daily cap to finish on
  target; null when not applicable), and the standard formatters.
  `computeStats` return includes `priorCum` (number[366] | null) and `priorSpent` (number | null)
  for the prior year — consumed by `analysis.jsx` without needing store.
  Future-year guard: `Number(year) > currentYear` → spent 0, projection 0, status "good"; `isFuture`
  is included in the returned stats object. `buildCallouts` returns a single `{ id: "future", severity:
  "good", icon: "clock" }` callout immediately after the `complete` early-return for future years.
  Detector #6 (yoy): current year only — compares spent to prior year at same doy; watch/info/good.
  Detector #7 (reqpace): current year only, when projection > target — surfaces required daily spend cap;
  severity watch (alert status) or info (watch status).
- `y/data.jsx` (`window.YData`) — the persisted store shape, the fixed 18-category list
  (`CATEGORIES`, id→icon→color), default templates, deterministic seed generator, and
  `loadStore`/`saveStore`/`resetStore`. The store includes `density` ("minimal" | "balanced" | "all");
  `loadStore` migrates older stores by defaulting missing `density` to `"balanced"`.

The README documents the exact projection formula, status thresholds, and each callout
detector. **If you change the math or detectors, update the README spec in the same change.**

### State flow (`y/app.jsx`)
`App` is the single stateful root. `store` (persisted via a `setStore` that writes the whole
object to localStorage on every mutation) is the only durable state; `route` / `viewYear` /
`analysisFocus` / `addOpen` / `editTx` / `yearOpen` / `deletedTx` / `showToast` are ephemeral
UI state. Two memoized derivations drive everything visible:
`stats = YCalc.computeStats(store, viewYear)` and `callouts = YCalc.buildCallouts(store, stats)`.

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
- `y/ui.jsx` (`window.YUI`) — shared primitives: `StatusHero` (numerals design, fixed —
  no variant prop), `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `Sheet`, `SectionH`,
  `Toast`, and `rich` (renders numbers inside text in the mono `.num` style).
  `Toast({ open, message, actionLabel, onAction, onDismiss })` — transient bottom-anchored
  banner (above nav, z-index 30), auto-dismisses after 5 s via `onDismiss`, optional action button.
  `GaugeHero`, `PaceBar`, and `ProjSpark` have been removed (dead since hero is fixed to numerals).
- Screens: `y/home.jsx` (Overview), `y/analysis.jsx` (Projection/Categories/Activity tabs;
  charts are hand-built SVG that double as the Recharts spec), `y/settings.jsx`
  (target/buffer/years/density/templates/CSV import-export/JSON backup-restore/clear),
  `y/addflow.jsx` (Quick keypad + Manual add, Edit sheet, category picker).
  `settings.jsx` — `TargetSheet` and `BufferSheet` accept a `year` prop (defaults to
  `store.currentYear`); `BufferSheet` computes its own stats internally. `YearsSheet` has
  tappable year rows that drill into a year detail view (target + buffer rows), plus an
  "Add year" button that clones the most recent year's target/buffer into `year+1`.
  Future years with no transactions can be deleted from the detail view.
  `DensitySheet` — a picker for Overview density (minimal/balanced/all); writes to `store.density`.
  **JSON backup/restore** (Session 8): "Back up (JSON)" downloads the full store as
  `yearly-backup.json`; "Restore (JSON)" reads a `.json` file, validates it has `years` +
  `transactions`, confirms, and calls `setStore(parsed)`. Hidden `#jsonfile` input mirrors
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
  immediately without waiting for old tabs to close. Current version: `yearly-v4` (bumped
  for the Broadsheet Phase 0+1 shell change: `index.html`, `y/tokens.css`, `y/app.css`,
  `y/ui.jsx`, `y/home.jsx`, `y/app.jsx`).
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
