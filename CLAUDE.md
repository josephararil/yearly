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

## Running it

There is **no build, no package manager, no tests, no linter**. The app is a single static
HTML file that loads React + Babel from CDN and transpiles the `y/*.jsx` modules in the
browser.

- Serve the directory over HTTP and open `Yearly.html` (e.g. `python -m http.server` then
  visit `/Yearly.html`). It will **not** work over `file://` — the `type="text/babel" src=`
  scripts require HTTP.
- State persists to `localStorage` under `yearly:store:v1`; on first load a deterministic
  seed dataset is generated (`y/data.jsx → buildSeed`). To reset, clear that key or use
  Settings › Restore sample data.

### Self-contained (no external dependencies)
The app is fully self-contained — **no `_ds/` directory is needed**. The original Aperture
design system dependency has been replaced by two local files:

- **`y/tokens.css`** — defines all ~25 CSS custom properties consumed by `y/app.css`
  (`--bg`, `--surface`, `--text`, `--accent`, `--r-card`, `--shadow-rest`, etc.).
  Loaded in `Yearly.html` before `y/app.css`.
- **`y/ds.jsx`** — an IIFE that sets `window.ApertureDesignSystem_72a4cd = { Button,
  SegmentedControl, Input, Chip }`, matching exactly the props the app passes to each.
  Loaded after `y/icons.jsx` and before `y/ui.jsx` / screens.

If adding new DS component usages, update `y/ds.jsx` to match the props passed.

## Architecture

### Module system (no bundler)
Every `y/*.jsx` file is an IIFE that **reads its dependencies off `window` and attaches its
own export to `window`**. There are no imports/exports. Two consequences:

1. **Load order is significant** and is fixed in `Yearly.html` (primitives → screens →
   root). If you add a module, add its `<script type="text/babel">` tag there in dependency
   order.
2. Cross-module calls go through the global namespace: `window.YData`, `window.YCalc`,
   `window.YUI`, `window.YHome`, `window.YAnalysis`, `window.YSettings`, `window.YAdd`,
   `window.YHome`, plus `window.Icon`/`window.YIcons` and the tweak-panel helpers
   (`useTweaks`, `TweaksPanel`, `Tweak*`). Aperture components come from
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
  Future-year guard: `Number(year) > currentYear` → spent 0, projection 0, status "good".
  Detector #6 (yoy): current year only — compares spent to prior year at same doy; watch/info/good.
  Detector #7 (reqpace): current year only, when projection > target — surfaces required daily spend cap;
  severity watch (alert status) or info (watch status).
- `y/data.jsx` (`window.YData`) — the persisted store shape, the fixed 18-category list
  (`CATEGORIES`, id→icon→color), default templates, deterministic seed generator, and
  `loadStore`/`saveStore`/`resetStore`.

The README documents the exact projection formula, status thresholds, and each callout
detector. **If you change the math or detectors, update the README spec in the same change.**

### State flow (`y/app.jsx`)
`App` is the single stateful root. `store` (persisted via a `setStore` that writes the whole
object to localStorage on every mutation) and `tweaks` (`heroVariant`, `accent`, `density`)
are the durable state; `route` / `viewYear` / `analysisFocus` / `addOpen` / `editTx` /
`yearOpen` / `deletedTx` / `showToast` are ephemeral UI state. Two memoized derivations drive
everything visible: `stats = YCalc.computeStats(store, viewYear)` and
`callouts = YCalc.buildCallouts(store, stats)`.

Undo-on-delete: `delTx(id)` stashes the removed transaction in `deletedTx` and raises
`showToast`. The `Toast` primitive (from `YUI`) auto-dismisses after 5 s; the "Undo" action
re-inserts `deletedTx` into the store.

Navigation is in-memory route state (`home` | `analysis` | `settings`), not URL routing.
Tapping a callout sets `analysisFocus = { section, category? }` and switches to Analysis,
which jumps to that tab and pre-expands the focused category. `viewYear` is independent of
`store.currentYear`; selecting a past year flips the app into "completed year" mode (final
spend, no projection/buffer).

### UI layers
- `y/ui.jsx` (`window.YUI`) — shared primitives: `StatusHero` (+ gauge/bar/spark variants),
  `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `PaceBar`, `Sheet`, `SectionH`, `Toast`,
  and `rich` (renders numbers inside text in the mono `.num` style).
  `Toast({ open, message, actionLabel, onAction, onDismiss })` — transient bottom-anchored
  banner (above nav, z-index 30), auto-dismisses after 5 s via `onDismiss`, optional action button.
- Screens: `y/home.jsx` (Overview), `y/analysis.jsx` (Projection/Categories/Activity tabs;
  charts are hand-built SVG that double as the Recharts spec), `y/settings.jsx`
  (target/buffer/years/templates/CSV import-export/clear), `y/addflow.jsx` (Quick keypad +
  Manual add, Edit sheet, category picker).
  `settings.jsx` — `TargetSheet` and `BufferSheet` accept a `year` prop (defaults to
  `store.currentYear`); `BufferSheet` computes its own stats internally. `YearsSheet` has
  tappable year rows that drill into a year detail view (target + buffer rows), plus an
  "Add year" button that clones the most recent year's target/buffer into `year+1`.
  Future years with no transactions can be deleted from the detail view.
- `y/icons.jsx` — inline-SVG Lucide-style icon set via `<Icon name=… />`.
- `y/tokens.css` — CSS custom property definitions (all ~25 tokens `app.css` consumes).
- `y/ds.jsx` (`window.ApertureDesignSystem_72a4cd`) — local `Button`, `SegmentedControl`,
  `Input`, `Chip` primitives styled with the tokens.
- `y/app.css` — **the styling source of truth** (layout, the mobile device column, the
  visual system), built on Aperture dark tokens. The `.ds-btn`, `.ds-seg`, `.ds-input`,
  `.ds-chip` classes at the bottom style the DS primitives from `y/ds.jsx`.
- `y/tweaks-panel.jsx` — prototype-only design-tweak scaffold; **not part of the product.**
  The `/*EDITMODE-BEGIN*/…/*EDITMODE-END*/` block in `y/app.jsx` is its hook — leave the
  markers intact.

## PWA (offline + install)

The app is a fully installable PWA:

- **`sw.js`** (repo root) — **network-first** service worker. On every fetch it tries the
  network; on success it writes the response to cache and returns it. On network failure it
  serves from cache. This means users always get fresh content when online and the app still
  runs when offline. Precaches the full app shell on install (all `y/*.jsx`, `y/*.css`,
  `manifest.json`, `Yearly.html`, and the three pinned CDN URLs for React/ReactDOM/Babel).
  **Cache-versioning rule:** bump `CACHE_NAME` in `sw.js` whenever the shell changes (new
  file added to the precache list, CDN URL pinned to a new version, etc.). The old cache is
  deleted on `activate`. `skipWaiting()` + `clients.claim()` ensure the new SW takes over
  immediately without waiting for old tabs to close.
- **`manifest.json`** — includes `id`, `scope`, `start_url`, and an `icons` array with
  192×192, 512×512, and a maskable 512×512 variant (all SVG). SVG icons work in Chrome 91+
  and modern WebKit/Firefox; for production Android/iOS you would swap in PNGs.
- **`icons/icon.svg`** — flat accent-blue (#0071e3) tile with white "Y." wordmark and iOS-
  style rounded corners (rx 115). Used for both 192 and 512 manifest entries.
- **`icons/icon-maskable.svg`** — same design, full bleed (no rx), content within the inner
  80% safe zone so the OS mask never clips the wordmark. Used for the `"purpose": "maskable"`
  manifest entry.
- **`Yearly.html`** registers the SW at the end of `<body>` with feature detection
  (`if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')`).
  Also adds `<link rel="apple-touch-icon" href="icons/icon.svg">` for iOS home-screen icons.

> After any `sw.js` change: hard-refresh and confirm the new SW activated in
> DevTools → Application → Service Workers before investigating anything else (§7 CLAUDE.md).

## Conventions

- **Dark theme only.** Every figure renders in the monospace `.num` style; UI text is the
  system sans. No emoji, no verdict adjectives, no monthly-budget framing — the year is the
  unit. (Full token table and voice rules in the README.)
- Amounts are positive EUR, stored rounded to cents; year is derived from `date.slice(0,4)`;
  actuals are always computed from transactions, never stored as aggregates.
- Match the surrounding inline-style + className idiom already in each file; there is no CSS
  framework or class generator beyond `app.css` and the Aperture tokens.
