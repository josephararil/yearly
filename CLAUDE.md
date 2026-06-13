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
| [docs/REVOLUT.md](docs/REVOLUT.md) | Revolut import pipeline (`scripts/`), category rules, FX, known issues |
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

1. **Service worker caches the whole app.** Code changes are NOT reflected on a simple reload. On
   every shell change, bump `CACHE_NAME` in `public/sw.js` AND hard-refresh. When something doesn't
   appear in preview, **assume stale cache first** — rule it out before debugging logic. Full SW +
   preview workflow: [docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md).
2. **`APP_VERSION` (`settings.jsx` footer) and `CACHE_NAME` (`sw.js`) move together** — currently
   `v47` / `yearly-v47`. Bump both on every release.
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

## Module system (no bundler)

Every `y/*.jsx` file is an IIFE that **reads its dependencies off `window` and attaches its own
export to `window`** — no imports/exports.

1. **Load order is significant** and fixed in `index.html`: `icons → ds → data → sync → calc → ui →
   fun → home → addflow → analysis → settings → app`. Adding a module means adding its `<script
   type="text/babel">` tag there in dependency order.
2. Cross-module calls go through globals: `window.YData`, `window.YCalc`, `window.YSync`,
   `window.YUI`, `window.YFun`, `window.YHome`, `window.YAnalysis`, `window.YSettings`,
   `window.YAdd`, plus `window.Icon`/`window.YIcons`. Aperture primitives come from
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

**Projection (damped blend):** `projection = spent + blendedRate × daysRemaining × (1 + buffer)`,
`blendedRate = YTD_rate × (doy/365) + trailing_60d_rate × (1 − doy/365)`. Buffer uplifts only the
extrapolated remainder (so on Dec 31 projection = spent). Complete/future years: `projection =
spent`.

**Conventions that are easy to break** (see ARCHITECTURE.md for the why): `localISO` not
`toISOString`; lump-sum winsorization (tx > 2% of `ceiling`, or `oneoff:true`, excluded from the
blended rate but kept in `spent`); the `doy>28` trend-detector guard; the `funProjection` cap (Fun tab only).

`buildCallouts` runs 8 detectors (README is authoritative; quick index in ARCHITECTURE.md); the
ceiling verdict (#8) is always prepended first.

## State root — `y/app.jsx`

`App` is the single stateful root. `store` (persisted to localStorage on every mutation) is the only
durable state; everything else is ephemeral UI state. Three memoized derivations drive the UI:
`stats = YCalc.computeStats(store, viewYear)`, `callouts = YCalc.buildCallouts(store, stats)`, `fun =
YCalc.computeFun(store)`. Navigation is in-memory route state (`home` | `analysis` | `settings`), not
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
