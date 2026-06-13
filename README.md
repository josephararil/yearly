# Yearly

**Yearly** is a mobile-first budgeting PWA for a couple tracking joint household spending in EUR
against a single **annual ceiling**. Its reason to exist is the one thing a spreadsheet can't do:
look at the spending and explain, in plain analytical language, **whether you're on track for the
year and — when you're not — why.**

It is a real, deployed app (Cloudflare Workers + D1, live at
[yearly.josepharari.com](https://yearly.josepharari.com) behind Google SSO) that two people use
daily, with a Revolut import pipeline feeding it. It also happens to have no build step — a single
static HTML file loads React from a CDN and transpiles the modules in the browser. That keeps the
whole thing hackable from any text editor.

> **This README is the authoritative spec for *intended* behavior** — the data model, the
> projection math, the status thresholds, and the callout detectors. Treat the code as the *current
> implementation* of this spec. If you change the math or the detectors, update this file in the
> same change. Code-internals, the backend, the sync layer, and the Revolut pipeline have their own
> deep-dive docs (see [Repo layout](#repo-layout) and the `docs/` table at the end).

---

## Contents

- [What it does](#what-it-does)
- [The mental model](#the-mental-model)
- [How the numbers work](#how-the-numbers-work) — projection, buffer, uncertainty band, status
- [The fun budget](#the-fun-budget)
- [The callout engine](#the-callout-engine) — the 8 detectors + threshold table
- [Categories](#categories)
- [Screens](#screens)
- [Design system — Broadsheet](#design-system--broadsheet)
- [Architecture at a glance](#architecture-at-a-glance)
- [Data model](#data-model)
- [Repo layout](#repo-layout) — what every file is
- [Running it](#running-it)

---

## What it does

The product has two jobs:

1. **One-glance status.** Within a second of opening, you see spent-to-date, projected year-end,
   and whether that projection lands above / at / below the annual ceiling.
2. **Callouts.** Ranked, plain-language observations that explain the *why* behind the projection,
   using specific numbers from your own data ("Restaurants: €340 in May, +60% vs April").

The defining UX principle is **progressive disclosure for two different moods**. The **Overview**
screen is calm and answers only *on track? / why not? / log an expense*. A separate **Analysis**
surface holds the full depth — charts, category diagnostics, period comparisons, the activity log —
for when you want to drill in.

The voice is analytical, never coachy: it states what the data shows with specific numbers and
never moralizes. The **year is the primary unit** — the verdict is always annual — though the app
does surface a "this month" diagnostic view as supporting context.

---

## The mental model

Everything turns on a few terms. Get these straight and the rest follows.

| Term | What it is | Stored? |
|---|---|---|
| **`ceiling`** | The single per-year household spending cap. User-set, **sacred**, never derived. (Historically called `target` — don't rename it back.) | Yes — `years[y].ceiling` |
| **`funPlanAnnual`** | Sum of every person's monthly fun allowance across all 12 months of the year. | Derived |
| **`mainTarget`** | `ceiling − funPlanAnnual`. **Explanatory decomposition only — never a target.** Shows how much of the ceiling isn't pre-allocated to fun allowances. | Derived, never stored |
| **`spent` / `projection`** | Year-to-date and projected year-end spend, **total household (main + fun)**. Measured against `ceiling`. | Derived |
| **`mainSpent` / `funSpent`** | Decomposition of `spent` into non-fun and fun portions — used in the Fun tab and the ceiling-callout "trim fun" advice only. | Derived |
| **`funProjection`** | Allowance-capped fun projection — used in the Fun tab and the ceiling-callout "trim fun" calculation only. | Derived |

**`projection` vs `ceiling` is the sacred verdict.** The hero on the Overview always leads with it.
The main/fun split is a decomposition that explains the verdict, not a secondary target.

For the default 2026 setup — a €25,000 ceiling with Joseph at €100/mo and Marti at €200/mo of fun —
`funPlanAnnual = (100 + 200) × 12 = €3,600` and `mainTarget = €21,400` (explanatory only).

---

## How the numbers work

All math lives in one pure, UI-free module: [`public/y/calc.jsx`](public/y/calc.jsx) (`window.YCalc`).
Every figure shown anywhere in the app comes from three functions there: `computeStats`,
`buildCallouts`, and `computeFun`. Re-implement those faithfully and the UI follows.

### Projection (damped blend)

The projection extrapolates your recent pace to year-end, then lifts the *remaining* part by a
safety buffer:

```
projection = spent + blendedRate × daysRemaining × (1 + buffer)
blendedRate = ytdRate × (doy / daysInYear) + trailing60dRate × (1 − doy / daysInYear)
```

- **`ytdRate`** = recurring spend so far ÷ day-of-year. **`trailing60dRate`** = recurring spend in
  the last 60 days ÷ 60 (window capped at `doy`).
- The blend is **damped**: early in the year (thin history) it trusts recent 60-day momentum; late
  in the year it locks onto the full-year average. So a July holiday doesn't hijack the December
  projection.
- The **buffer** uplifts only the extrapolated remainder, so on Dec 31 (`daysRemaining = 0`) the
  projection equals `spent` exactly. It's a per-year fraction (default 4%, adjustable 0–15% via a
  Settings slider) that accounts for expenses you forgot to log.
- **Completed and future years**: `projection = spent` (no extrapolation, no buffer).
- All dates use a local `localISO(d)` formatter, **never `toISOString()`** — UTC midnight shifts
  dates backward in UTC+ timezones (EET) and silently drops Dec 31 transactions.

### Lump-sum winsorization

A single €5k holiday would otherwise inflate the year-end projection by ~4× its price. So
transactions larger than **2% of `ceiling`** — or any transaction explicitly flagged
`oneoff:true` — are **excluded from the blended rate** while **still counting in `spent`**. They're
real money, they just shouldn't set your daily pace.

### Forecast uncertainty band

Once **≥4 complete weeks** of recurring data exist (current incomplete year only), the projection
gets an honest ± range from your week-to-week volatility:

```
sigmaWeek      = sample std-dev of weekly recurring totals (n−1 divisor, empty weeks count as 0)
bandAmt        = sigmaWeek × √(weeksRemaining) × (1 + buffer)
projLow        = max(spent, projection − bandAmt)      // floored: never below money already spent
projHigh       = projection + bandAmt
```

`projLow / projHigh / bandAmt` are `null` when fewer than 4 weeks have elapsed, or for
complete/future years.

### Status (green / amber / red)

Status escalates conservatively so the number doesn't flap day to day. All thresholds are vs the
**ceiling**:

- **With a band** (≥4 weeks): `good` if `projection ≤ ceiling`; `alert` only if even the
  optimistic edge misses (`projLow > ceiling`); `watch` in between.
- **Without a band** (<4 weeks): `good` if `projection ≤ ceiling`; `watch` if `≤ ceiling ×
  1.08`; else `alert`. (Completed years use a tighter `× 1.03`.)

---

## The fun budget

Each person has a **monthly fun allowance** — a "no questions asked" discretionary budget that
accrues every month. Fun-tagged transactions are **real household spend and count toward the
ceiling** exactly like any other transaction. The fun/main split is metadata: it powers the Fun
tab's per-person balance tracker and the ceiling callout's "trim fun by ~€X/mo" advice, but it
does not create a separate pot or secondary target.

### Running balance

```
balance(person) = Σ accrued allowance (from startMonth to now)
                − Σ that person's fun spend
                + balanceAdjustment            // optional manual correction
```

The balance is **all-time and as-of-now** — it doesn't change when you view a past year. It **can
go negative** ("buy now, earn it back"); the UI shows negatives explicitly and never clamps them
(progress bars do clamp to 0–100%).

### Dated rate schedule

`person.rates` is a **forward-only** sorted list of `{ from: "YYYY-MM", amount }`. Changing the
allowance appends a new entry for the current month; past entries are never rewritten.
`rateForMonth(person, ym)` returns the latest entry with `from ≤ ym`, or 0 before `startMonth`. A
mid-year change is reflected in `mainTarget` from that month forward.

### Projected fun spend (capped)

Fun spend is lumpy — one big purchase, not a steady drip. A naive linear projection of a €2k
January splurge would read ~€22k. So `funProjection` is **capped** at what the allowance system can
actually produce:

```
funProjection = min( linearProjection,  funSpent + max(0, Σ balances) + futureAccruals )
```

`funProjection` carries no buffer. For completed years it's just `funSpent`; for future years, 0.

### Wishlist

Each person keeps savings goals `{ name, price, … }`. Progress = `max(0, balance) / price`;
months-to-afford = `max(0, ceil((price − balance) / rate))` ("ready now" if the balance already
covers it). **"Bought it"** logs a fun-tagged transaction for the price and removes the goal.

---

## The callout engine

`buildCallouts(store, stats)` is a pure `(store, stats) → Callout[]` function — the heart of the
app. Each callout is a number-led analytical sentence with a severity (`alert > watch > info >
good`), an icon, and a `drill` target. Tapping one jumps to the relevant Analysis tab. Results are
ranked by severity, then by a magnitude score.

There are **8 detectors** for the current year. The **ceiling verdict (#8) is always prepended
first.**

| # | Detector | Fires when | Says (example) |
|---|---|---|---|
| 1 | **Projection trend** | `doy > 28` and the projection moved > 1.2% of `ceiling` over 4 weeks | "Year-end projection has moved up €420 over the last 4 weeks, now €21,800." |
| 2 | **14-day pace streak** | last-14-day daily rate is > 1.15× or < 0.70× the linear daily pace | "Last 14 days are running +28% above linear pace — €78/day vs €61/day." |
| 3 | **Category mover** | a category changed > €60 month-over-month (and had ≥ €50 the prior month) | "Restaurants: €340 in May, +60% vs April." |
| 4 | **Top-category share** | the largest category is > 26% of YTD spend | "Groceries is 27% of spend so far — €3,120 across 84 entries." |
| 5 | **Buffer explanation** | the buffer adds > 1% of `ceiling` | "Logged spend alone projects to €20,900; the 4% missed-entry buffer lifts that to €21,700." |
| 6 | **Year-over-year** | prior year has total spend at the same point | "Spending is €640 (+9%) higher than the same point in 2025." |
| 7 | **Required pace** | `projection > ceiling` | "Spend ≤ €58/day from here to finish within your ceiling." |
| 8 | **Ceiling verdict** | always (current year) | see below — *always first* |

**The ceiling verdict (#8)** is the sacred line, and has three states:

- **Over** (`projection > ceiling`): "Household projects to €X against your €Y ceiling — trim
  fun spending by ~€Z/mo to stay within it." If trimming fun alone can't close the gap, it instead
  says "…even cutting the entire fun budget (€Z/mo) won't close it; main spending needs to drop
  ~€W/mo too." (`alert` if over by > 8% of ceiling, else `watch`.)
- **Comfortable** (`projection < ceiling × 0.94`): "You're tracking €X under your €Y ceiling — room to raise the
  fun budget by ~€Z/mo if you want." (`good`)
- **Tight but on course** (between 0.94× and 1×): "Tracking €X under your €Y ceiling — tight but on
  course." (`info`)

**Special cases:** a **completed year** gets a single review callout comparing `spent + funSpent` vs
the ceiling ("Finished under the ceiling by €X — €Y against a €Z ceiling."). A **future year** gets a
single "hasn't started yet" line. If nothing reaches `watch`/`alert`, a calm fallback line is shown.

**Overview density** (Settings → Display) controls how many callouts the Overview lists: `minimal`
shows the top ≤2, `balanced` the top 4, `all` everything. The Analysis "What's happening" section
always shows all of them.

### Threshold table

Every magic number lives in a single `T` constants object at the top of `calc.jsx`:

| Constant | Value | Meaning |
|---|---|---|
| `WATCH_BAND_CURRENT` | `1.08` | Within +8% of target/ceiling = watch; beyond = alert (current year) |
| `WATCH_BAND_COMPLETE` | `1.03` | Tighter +3% band for finished years |
| `CEILING_COMFORT` | `0.94` | Below 94% of ceiling = comfortable, room to raise fun |
| `CEILING_ALERT` | `0.08` | Over ceiling by > 8% → ceiling verdict is `alert` |
| `TREND_NOTABLE` | `0.012` | 4-week projection move > 1.2% of `ceiling` is worth a callout |
| `TREND_ALERT` | `0.04` | > 4% move → `alert` |
| `STREAK_HOT` | `1.15` | 14-day pace > 115% of linear → spending streak |
| `STREAK_ALERT` | `1.35` | 14-day pace > 135% → `alert` |
| `STREAK_COOL` | `0.70` | 14-day pace < 70% → under-pace (`good`) |
| `SHARE_NOTABLE` | `0.26` | Top category > 26% of spend is worth surfacing |
| `SHARE_WATCH` | `0.34` | Top category > 34% → `watch` |
| `MOVER_MIN_EUR` | `60` | MoM category change must exceed €60 to count |
| `MOVER_MIN_BASE` | `50` | Category needs ≥ €50 in the prior full month to be eligible |
| `BUFFER_EXPLAIN_MIN` | `0.01` | Explain the buffer only when it adds > 1% of `ceiling` |
| `LUMP_PCT` | `0.02` | Transactions > 2% of `ceiling` are winsorized out of the rate |
| `DAYS_PER_MONTH` | `30.4` | Average month length for "months remaining" arithmetic |
| `YOY_WATCH` | `0.08` | YTD total spend > prior year same point by > 8% of `ceiling` → `watch` |

---

## Categories

A fixed list of **18 categories** (`CATEGORIES` in [`public/y/data.jsx`](public/y/data.jsx)), each
with an inline-SVG line icon and a distinct identity color. Category identity comes from icon +
color — there are no emoji anywhere.

| Category | Color | | Category | Color |
|---|---|---|---|---|
| Groceries | `#32d74b` | | Entertainment | `#bf5af2` |
| Restaurants | `#ff9f0a` | | Sophie Kindergarten | `#5e5ce6` |
| Shopping | `#ff6ac1` | | Services | `#d0a24c` |
| Gym | `#9be15d` | | Gift | `#e0489a` |
| Health | `#ff6961` | | Pets | `#cd8b4f` |
| Utilities | `#ffd60a` | | Donation | `#30d0c0` |
| House Stuff | `#40c8e0` | | Cash | `#99a06b` |
| Transport | `#0a84ff` | | General | `#8e8e93` |
| Taxes | `#98989d` | | Travel | `#5ac8fa` |

---

## Screens

The app is a fixed mobile column (~440px, centered with a rounded device frame on desktop). A
sticky top bar carries the **`Yearly.`** wordmark, a year pill, and a gear → Settings. A bottom nav
has **Overview**, a raised **`+`** button (opens the Add sheet from anywhere), and **Analysis**.

### Overview — the calm surface ([`home.jsx`](public/y/home.jsx))

Top to bottom:
- **Status hero** (`StatusHero`) — a three-zone block: the combined projection vs ceiling (the big
  serif number + over/under sub-line); a multi-stage bullet bar showing spent → projection against
  `mainTarget` and `ceiling` ticks; and a monthly "pulse" line (this month's spend vs its cap).
- **Fun strip** — one hairline row per person: name, all-time balance (sage/terra), nearest wishlist
  goal with a progress bar. Tappable → Analysis Fun tab.
- **This month** — `MonthCurve`, an interactive day-by-day cumulative chart for the current month
  with toggleable Pace / Projection / Target / Month-end / Prev-month series and an explanatory
  legend.

### Analysis — the deep surface ([`analysis.jsx`](public/y/analysis.jsx))

A segmented control: **Projection · Categories · Activity · Fun**.

- **Projection** — a full-year interactive line chart (actual cumulative + dashed projection + pace
  + ceiling + prior-year, with the uncertainty band drawn as a translucent triangle), a per-month
  bar chart with average/peak/needed reference lines, the full callouts list ("What's happening"),
  and an "In numbers" stat grid (Spent YTD, blended rate, buffer adds, avg spend/mo, 90-day trend,
  total fun budget, target fun/mo, a "FIRE portfolio" curiosity at the 4% rule, and more).
- **Categories** — every category with spend, ranked, as an expandable bar row (share %, entry
  count, MoM change). Expanding shows the most recent and largest transactions in that category.
- **Activity** — search by description, filter chips for every category, a 6-way sort, and the full
  transaction list (fun tx included, tagged with the person's name), each row tappable to edit.
- **Fun** — per-person cards (balance, monthly rate, this-month usage, all-time spent), a fun-only
  category breakdown, and each person's wishlist with progress bars, ETAs, and a "Bought it" action.

### Add / Edit ([`addflow.jsx`](public/y/addflow.jsx))

A bottom sheet with a **Quick | Manual** toggle. **Quick** is a grid of template tiles → a custom
numeric keypad for fast thumb entry. **Manual** is description + amount + an 18-category picker +
date + note. Both expose a **Fun budget toggle** (reveals a Joseph/Marti owner picker) and a
**One-off toggle** (writes `oneoff:true`, excluding the tx from the trend forecast). Editing a
transaction opens the same form with Delete + Save.

### Settings ([`settings.jsx`](public/y/settings.jsx))

Grouped rows: **This year** (household ceiling, missed-entry buffer slider, past-years detail) ·
**Fun budget** (per-person rate config, forward-only) · **Display** (Overview density) · **Data**
(template manager, CSV import with duplicate detection, CSV export, JSON backup/restore, "Sync now")
· **Danger zone** (clear all data, type-to-confirm). Footer shows the app version.

---

## Design system — Broadsheet

The app wears an editorial **Broadsheet** theme: warm paper, hairline rules, three typefaces, and a
single terracotta accent. The spec is [`design/BROADSHEET_DESIGN_SPEC.md`](design/BROADSHEET_DESIGN_SPEC.md);
tokens live in [`public/y/tokens.css`](public/y/tokens.css).

**Palette** — paper `#F4F1E8`, ink `#221F19` (never pure black), muted `#8D846F`, hairline rules at
~13% ink. One accent, **terracotta `#BE4A30`** (links, active nav, key numbers); state colors **sage
`#5E7C54`** (good) and **amber `#C0852B`** (watch). Charts use muted terracotta/sand variants.

**Typography** — three families: **Newsreader** (serif) for the display hero number and section
headers; **Hanken Grotesk** (sans) for UI and body prose; **JetBrains Mono** for *every figure*,
label, eyebrow, and axis tick (tabular numerals). The rule: numbers are always mono, the one big
hero number is serif, everything else is sans.

**Voice** — analytical, never coachy. No emoji, no verdict adjectives ("Great job!"), no
celebratory color. The projected figure against the ceiling *is* the verdict; color only reinforces
it.

---

## Architecture at a glance

The whole client is one static HTML file plus a folder of modules — **no bundler, no package
manager, no build step, no test runner.** [`public/index.html`](public/index.html) loads React +
Babel from a CDN and transpiles each `y/*.jsx` module in the browser.

- **Module system.** Every `y/*.jsx` file is an IIFE that reads its dependencies off `window` and
  attaches its own export back to `window` (`window.YCalc`, `window.YData`, …). There are no
  imports/exports, so **load order is significant** and fixed in `index.html`.
- **The brain.** [`calc.jsx`](public/y/calc.jsx) (math + callouts) and [`data.jsx`](public/y/data.jsx)
  (store shape, categories, persistence) are pure and framework-agnostic.
- **State.** [`app.jsx`](public/y/app.jsx) is the single stateful root. The persisted `store` is the
  only durable state; everything visible derives from `computeStats` / `buildCallouts` / `computeFun`.
- **Backend.** A Cloudflare Worker ([`src/index.js`](src/index.js)) serves the static files and a
  small `/api/*` surface backed by a D1 (SQLite) database. The client
  ([`sync.jsx`](public/y/sync.jsx)) does outbox-based, offline-safe sync with the server, plus a
  reconciliation check on every launch.
- **Data in.** Transactions are imported from Revolut via a browser console script + Python cleaning
  pipeline in [`scripts/`](scripts/), then pushed to D1.

Deeper references live in `docs/` — see the table at the end.

---

## Data model

Persisted to `localStorage` under `yearly:store:v1` (and mirrored to D1 via sync):

```jsonc
{
  "version": 1,
  "currentYear": 2026,
  "density": "balanced",                       // "minimal" | "balanced" | "all"
  "years": {
    "2024": { "ceiling": 21000, "buffer": 0.04 },
    "2025": { "ceiling": 23000, "buffer": 0.04 },
    "2026": { "ceiling": 25000, "buffer": 0.04 }
  },
  "people":   [ /* Person[] */ ],
  "wishlist": [ /* WishlistItem[] */ ],
  "templates":[ /* Template[] */ ],
  "transactions": [ /* Transaction[] */ ]
}
```

**Transaction** (positive `amount_eur` = an expense):
```ts
{
  id: string;
  date: string;                 // "YYYY-MM-DD" (year is derived from date.slice(0,4))
  description: string;
  amount_eur: number;           // positive, rounded to cents
  category: CategoryId;
  source: "manual" | "import" | "revolut";
  original_amount?: number;     // for imported rows in a foreign currency
  original_currency?: string;
  note?: string;
  fun?: true;                   // present on fun-budget tx only
  person?: "joseph" | "marti";  // required when fun === true
  oneoff?: true;                // excluded from the trend rate (still counts in spent)
  merchant_logo?: string;       // Revolut-sourced
  merchant_city?: string;       // Revolut-sourced
}
```

**Person** — `{ id, name, startMonth, rates: [{ from, amount }], balanceAdjustment? }`. `rates` is the
forward-only dated allowance schedule. Defaults: Joseph €100/mo, Marti €200/mo, both from `2026-01`.

**WishlistItem** — `{ id, owner, name, price, note?, createdMonth }`.
**Template** — `{ id, name, category, defaultAmount?, icon? }` (the Quick-log tiles).

Actuals are **always computed from transactions**, never stored as aggregates. Old backups (with
`target` instead of `ceiling`, or missing `people`/`wishlist`) are upgraded by `migrateStore` on load
and on JSON restore.

---

## Repo layout

```
.
├── public/                     Everything the browser loads (served by the Worker)
│   ├── index.html              App shell: loads React/Babel from CDN, then y/*.jsx in order, mounts
│   ├── sw.js                   Network-first service worker; CACHE_NAME bumped on every release
│   ├── manifest.json           PWA manifest (name, icons, standalone, scope)
│   ├── icons/
│   │   ├── icon.svg            App icon (192/512)
│   │   └── icon-maskable.svg   Maskable variant for Android adaptive icons
│   └── y/                      The app modules (each an IIFE attaching to window; load order matters)
│       ├── icons.jsx           Inline-SVG Lucide-style icon set → window.Icon / window.YIcons
│       ├── ds.jsx              Local Button/SegmentedControl/Input/Chip → ApertureDesignSystem_72a4cd
│       ├── data.jsx            Store shape, 18 categories, templates, load/save/migrate → YData
│       ├── sync.jsx            Outbox-based client↔D1 sync + launch reconciliation → YSync
│       ├── calc.jsx            THE BRAIN: projection math, fun math, callout engine → YCalc
│       ├── ui.jsx              Shared primitives (StatusHero, TxRow, CalloutCard, Toast…) → YUI
│       ├── fun.jsx             Fun-budget UI (FunStrip + FunTab) → YFun
│       ├── home.jsx            Overview screen (hero + fun strip + MonthCurve) → YHome
│       ├── addflow.jsx         Add/Edit sheets, Quick keypad, category picker → YAdd
│       ├── analysis.jsx        Analysis screen (Projection/Categories/Activity/Fun) → YAnalysis
│       ├── settings.jsx        Settings, years, fun config, import/export, version footer → YSettings
│       ├── app.jsx             Stateful root: routing, year switch, store + sync wiring
│       ├── tokens.css          Broadsheet design tokens (colors, fonts, spacing, shadows)
│       └── app.css             All app styling, built on the tokens — the visual source of truth
│
├── src/
│   └── index.js                Cloudflare Worker: serves public/ + the /api/* sync endpoints, talks to D1
│
├── migrations/                 D1 schema, applied with `wrangler d1 migrations apply`
│   ├── 0001_init.sql           transactions + settings tables
│   ├── 0002_revolut_fields.sql Revolut enrichment columns (merchant city/logo/mcc, fees, card label…)
│   ├── 0003_oneoff_flag.sql    oneoff INTEGER column
│   └── 0004_fix_updated_at_seconds.sql  Retro-fix legacy rows stamped in seconds → milliseconds
│
├── scripts/                    Revolut import pipeline (Python + Windows .bat helpers)
│   ├── revolut_clean.py        Core: Revolut JSON → cleaned SQL/CSV (FX, category rules, skip logic)
│   ├── sync.py                 Orchestrator: prepare / push / status
│   ├── from_csv.py             Legacy XLSX/CSV importer (no enrichment columns)
│   ├── prepare.bat / push.bat / status.bat   Double-click wrappers around sync.py
│   ├── .sync_state.json        Last-sync cursor — do not delete
│   └── batches/                Archived JSON downloads, generated CSV/SQL, the console script
│
├── design/
│   ├── BROADSHEET_DESIGN_SPEC.md   The Broadsheet theme spec (colors, type, spacing)
│   ├── RESTYLE_LOG.md              Session-by-session restyle history
│   └── reference/                  Static design references (broadsheet.html, legacy lb-*.jsx, tokens.css)
│
├── docs/                       Deep-dive technical docs (pulled when a task touches that area)
│   ├── ARCHITECTURE.md         calc/data/sync/app internals + full vocabulary
│   ├── UI.md                   Component & screen specifications
│   ├── BACKEND.md              Worker + D1 schema + /api endpoint contract
│   ├── REVOLUT.md              Import pipeline detail, category rules, FX, known issues
│   └── PWA-AND-DEV.md          Service worker, local dev, regression test, preview workflow
│
├── .claude/                    Claude Code config (launch.json preview server, settings.local.json)
├── calc.test.html              Standalone regression test for calc.jsx — open over HTTP, all rows PASS
├── CLAUDE.md                   Guide for Claude Code sessions (hub → docs/)
├── README.md                   This file — the product + math spec
├── wrangler.jsonc              Cloudflare Workers config (D1 binding, assets, migrations dir)
└── package.json                npm metadata; scripts: `dev` (wrangler dev), `deploy` (wrangler deploy)
```

---

## Running it

The client needs only an HTTP server (it will **not** work over `file://`, because the
`type="text/babel"` script tags fetch the modules):

```bash
# from the repo root
python -m http.server 8766
# → open http://localhost:8766/public/
```

State persists to `localStorage` under `yearly:store:v1`; clear that key to reset to a blank store.
Running locally with no backend is fine — the sync layer treats the resulting `/api` 404s as silent
no-ops.

To run the **full stack** (Worker + D1) locally, or to deploy:

```bash
npm install          # installs wrangler
npm run dev          # wrangler dev — serves public/ + the Worker + a local D1
npm run deploy       # wrangler deploy
```

After any change to `calc.jsx` or `data.jsx`, run the regression test (`calc.test.html`) — all rows
must PASS. Because the app is a PWA, code changes won't appear on a plain reload until you bump
`CACHE_NAME` in `public/sw.js` and hard-refresh. Both of these, plus the local-dev and preview
details, are in [`docs/PWA-AND-DEV.md`](docs/PWA-AND-DEV.md).

| Want the detail on… | Read |
|---|---|
| The engine, store, sync, and state internals | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Components and screen specs | [docs/UI.md](docs/UI.md) |
| The Worker, D1 schema, and `/api` endpoints | [docs/BACKEND.md](docs/BACKEND.md) |
| The Revolut import pipeline | [docs/REVOLUT.md](docs/REVOLUT.md) |
| Service worker, local dev, testing, preview | [docs/PWA-AND-DEV.md](docs/PWA-AND-DEV.md) |
| Day-to-day guidance for Claude Code | [CLAUDE.md](CLAUDE.md) |
