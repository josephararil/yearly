# Handoff: Yearly — annual budgeting PWA

## Overview

**Yearly** is a mobile-first personal budgeting app for a couple tracking joint
household spending in EUR against a single **annual** target. Its reason to exist
is one thing a spreadsheet can't do: look at the spending data and explain, in
plain analytical language, **whether you're on track for the year and — when
you're not — why**. Everything else is in service of that.

The product has two jobs:
1. **One-glance status** — within a second of opening, the user knows spent-to-date,
   projected year-end, and whether that projection is above/at/below the annual target.
2. **Callouts** — ranked, plain-language observations that explain the *why* behind
   the projection, using specific numbers from the data.

The defining UX principle is **progressive disclosure for two very different users**:
the **Overview** screen is calm and answers only "on track? / why not? / log an
expense", while a separate **Analysis** surface holds the full depth (charts, category
diagnostics, period comparisons, activity) for the analytical user who wants to drill in.

---

## About the design files

The files in this repo (`index.html` + the `y/` module folder) are **design
references built in HTML/React-via-Babel** — a working prototype that demonstrates the
intended look, behavior, data model, and business logic. **They are not meant to be
shipped as-is.**

The task is to **recreate this design in the target codebase's environment** using its
established patterns. The brief specifies the intended production stack:

> **React PWA, localStorage persistence, mobile-first (max-width ~430px centered on
> desktop), iOS safe-area padding, EUR currency, Recharts for charts.**

If you're starting fresh, that stack is the intended target (e.g. Vite + React + a
real component library, or Next.js). The prototype loads React/Babel from CDN and
splits logic into plain `window`-scoped modules purely so it can run as a single static
HTML file — **in production, use real ES modules / components and a build step.**

**Running this prototype:** serve the repo root over HTTP (e.g. `python -m http.server`)
and open `http://localhost:8000/` — the entry point is `index.html`. It will **not** work
over `file://`. The app is **fully self-contained**: no external `_ds/` Aperture bundle is
needed. CSS tokens live in `y/tokens.css`; the DS primitives (Button, SegmentedControl,
Input, Chip) are in `y/ds.jsx`. It is an installable PWA with offline support via `sw.js`
and a masked app icon (`icons/`).

The prototype's **logic files are directly reusable**: the projection math
(`y/calc.jsx`), the callout engine (`y/calc.jsx → buildCallouts`), the category/
template definitions and seed data (`y/data.jsx`), and the icon set (`y/icons.jsx`)
are framework-agnostic and can be ported almost verbatim into a real React app.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, iconography, interactions, and
copy are all decided. Recreate the UI to match, using the codebase's component
primitives. Exact tokens are listed in the **Design Tokens** section below.

> **Charts note:** The prototype's charts are hand-built inline SVG (Recharts' UMD
> build wouldn't run in the in-browser Babel sandbox). **In production, use Recharts**
> per the brief — the SVG charts in `y/analysis.jsx` (`ProjectionChart`, `CatTrend`)
> document exactly what each chart must show (data series, axes, reference lines), so
> treat them as a chart spec, not code to copy.

---

## Visual system

Dark, confident, numerical — a serious financial instrument, not a gamified consumer
app. Built on the **Aperture design system's dark theme** (Apple-flavored: native
system font, soft layered shadows, generous radii, restrained color) with terminal
discipline applied to the numbers.

- **Surfaces:** true-black page, elevated dark-grey cards. Soft multi-layer shadows,
  never a single hard drop shadow. No left-accent-bar cards. No gradients as
  backgrounds.
- **Numbers do the talking:** every meaningful figure is set in a **monospace** font
  with tabular figures. UI text is the system sans.
- **No verdict adjectives** ("On track", "Great job"). The projected year-end figure
  vs the target *is* the verdict; color (green/amber/red) only reinforces it.
- **No monthly-budget framing anywhere.** The unit of meaning is the year.
- **Voice:** analytical, never coachy. State what the data shows with specific numbers;
  never moralize or suggest cuts.
- **No emoji.** Category identity comes from a tinted line-icon + a distinct color.

---

## Data model

Persisted to `localStorage` under key `yearly:store:v1`:

```jsonc
{
  "version": 1,
  "currentYear": 2026,
  "density": "balanced",
  "years": {
    "2024": { "ceiling": 21000, "buffer": 0.04 },
    "2025": { "ceiling": 23000, "buffer": 0.04 },
    "2026": { "ceiling": 25000, "buffer": 0.04 }
  },
  "people": [ /* Person[] */ ],
  "wishlist": [ /* WishlistItem[] */ ],
  "templates": [ /* Template[] */ ],
  "transactions": [ /* Transaction[] */ ]
}
```

**Transaction** (positive `amount_eur` = expense):
```ts
{
  id: string;
  date: string;              // "YYYY-MM-DD"
  description: string;
  amount_eur: number;        // positive
  original_amount?: number;  // for imported rows in foreign currency
  original_currency?: string;
  category: CategoryId;
  note?: string;
  source: "manual" | "import";
  fun?: true;                // present + true on fun-budget tx only
  person?: "joseph" | "marti"; // required when fun === true
}
```

**Person** (fun-budget rate schedule):
```ts
{
  id: string;               // "joseph" | "marti"
  name: string;
  startMonth: string;       // "YYYY-MM" — rates accrue from here
  rates: Array<{ from: string; amount: number }>; // sorted ascending by `from`
}
```
`rates` is a **forward-only dated schedule**: each entry means "from this month onwards, the rate is €X/mo". Past entries are never modified; a new entry is appended when the user changes the amount. `rateForMonth(person, ym)` picks the latest entry with `from ≤ ym`, returning 0 before `startMonth`.

**WishlistItem** (per-person savings goal):
```ts
{
  id: string;
  owner: string;            // person.id
  name: string;
  price: number;
  note?: string;
  createdMonth: string;     // "YYYY-MM"
}
```

**Template** (Quick-log tile):
```ts
{ id: string; name: string; category: CategoryId; defaultAmount?: number; icon?: string; }
```

**Key model decisions:**
- **`ceiling` is per-year, sacred, user-set** — renamed from `target`. It is the total allowed annual outflow. Never derived. Old backups with `target` are migrated automatically by `migrateStore`.
- **Fun budget is layered on top** — fun-tagged transactions are excluded from all main budget math; only the combined verdict is measured against `ceiling`. See *Fun budget model* below.
- **`buffer` is per-year** (a fraction, e.g. `0.04` = 4%). See *Projection math*.
- Year is derived from `date.slice(0,4)`; actuals are always computed from transactions, never stored as aggregates.

---

## Projection math  (`y/calc.jsx → computeStats`)

### Vocabulary

| Name | Meaning | Stored? |
|---|---|---|
| `ceiling` | per-year household ceiling (sacred, user-set) | yes — `years[y].ceiling` |
| `funPlanAnnual` | Σ planned fun allocations for the year | derived |
| `mainTarget` | `ceiling − funPlanAnnual` (non-discretionary budget) | derived, never stored |
| `spent` / `projection` | main (non-fun) YTD / projection | derived |
| `funSpent` / `funProjection` | fun YTD / linear projection | derived |
| `combinedProjection` | `projection + funProjection` | derived |
| `combinedDelta` / `combinedStatus` | combined vs `ceiling` | derived |

### Main budget (non-fun transactions only)

Linear pace model (intentionally simple for v1 — Christmas isn't linear, accepted):

```
doy            = day-of-year of "as of" date          // today for current year, 365 for past years
ceiling        = years[year].ceiling
funPlanAnnual  = Σ over people of Σ over months 1..12 of rateForMonth(person, "YYYY-MM")
mainTarget     = ceiling − funPlanAnnual               // derived, never stored
buffer         = years[year].buffer                   // fraction
spent          = sum(amount_eur) for NON-FUN txns in year, date <= asOf
lumpThreshold  = mainTarget × 0.02                    // tx above this are winsorized out of rates
recurring      = NON-FUN txns with amount_eur ≤ lumpThreshold (still counted in spent)
recurringRate  = sum(recurring.amount_eur) / doy      // YTD rate, lump-insensitive
trailing60Rate = sum(recurring where date > asOf-60d) / 60
blendedRate    = recurringRate × (doy/365) + trailing60Rate × (1 − doy/365)
projNoBuffer   = spent + blendedRate × daysRemaining   // raw extrapolation, no buffer
projection     = spent + blendedRate × daysRemaining × (1 + buffer)
bufferAmt      = projection - projNoBuffer
pace           = (doy / 365) * mainTarget              // on-pace benchmark
delta          = projection - mainTarget
deltaPct       = delta / mainTarget
```

**Date convention:** all "as of" date strings use `localISO(d)` — `d.getFullYear()/getMonth()/getDate()`.
Never `toISOString()`, which shifts dates backward in UTC+ timezones (EET = UTC+2/+3), silently
dropping Dec 31 transactions from completed years.

**Lump-sum winsorization:** transactions larger than 2% of `mainTarget` are excluded from the
blended rate calculation (but included in `spent`). This prevents a single holiday purchase
from inflating the year-end projection by ~4× the purchase price.

The buffer uplifts only the extrapolated remainder, so on Dec 31 (`daysRemaining = 0`) projection equals `spent` exactly; `funProjection` carries no buffer by design. All day counts use the actual year length; leap years (366 days) are supported.

For a **completed (past) year**: `projection = spent` (no extrapolation, no buffer).

**Main budget status thresholds** (drive green/amber/red on the main budget):
- Current year: `good` if `projection ≤ mainTarget`; `watch` if `≤ mainTarget × 1.08`; else `alert`.
- Completed year: `good` if `spent ≤ mainTarget`; `watch` if `≤ mainTarget × 1.03`; else `alert`.

**Missed-entry buffer** is a **flat % uplift on the projection**, adjustable 0–15% via a
slider in Settings, and made visible: the Analysis projection panel shows a "Buffer
adds +€X" stat, and a callout explicitly explains "logged spend alone projects to €X;
the N% buffer lifts that to €Y."

### Fun figures and combined verdict

```
funSpent       = sum(amount_eur) for FUN txns in year, date <= asOf
funLinear      = funSpent / doy * 365
funCap         = funSpent + max(0, Σ person balances as of asOf) + futureAccruals
               // futureAccruals = Σ rateForMonth(p, m) for each person p, each remaining month m
funProjection  = min(funLinear, funCap)  // current year: capped at what the allowance system permits
               = funSpent               // completed year
               = 0                     // future year
combinedProjection = projection + funProjection
combinedDelta  = combinedProjection − ceiling
combinedStatus = good if combinedProjection ≤ ceiling
                 watch if ≤ ceiling × 1.08
                 alert otherwise        (completed year uses × 1.03)
```

> **Why cap funProjection?** Fun spend is often lumpy (one big purchase rather than a steady
> monthly drip). Without the cap, a single €2k purchase in January extrapolates linearly to
> ~€22k, inflating `combinedProjection` by far more than the allowance system could ever
> produce. The cap `funSpent + max(0, Σbalances) + futureAccruals` reflects the maximum
> plausible fun spend given current balances and remaining accruals.

**Combined verdict is the sacred number** — the hero always leads with `combinedProjection`
vs `ceiling`. The main budget figures are a decomposition, not the primary verdict.

---

## Callout engine  (`y/calc.jsx → buildCallouts`)  — the heart of the app

Pure function `(store, stats) → Callout[]`, ranked. Each callout:
```ts
{ id, severity: "alert"|"watch"|"info"|"good", icon, accent?, text, drill: { section, category? }, mag }
```
`text` is a number-led analytical sentence; numbers within it are rendered in mono.
Tapping a callout navigates to Analysis and focuses the relevant section/category.

**Detectors** (current year, main budget — detectors 1–7; combined verdict — detector 8):

1. **Projection trend** — only fires when `doy > 28` (suppressed in January: before day 28,
   the 28-day-ago reference falls in the prior year with zero current-year spend, producing a
   spurious "projection shot up" alert). Recompute projection as of 28 days ago (using only
   main txns up to then); if it moved > 1.2% of mainTarget, emit "Year-end projection has
   moved up/down €X over the last 4 weeks, now €Y." (`alert` if worsened > 4% of mainTarget,
   else `watch`/`good`).
2. **14-day pace streak** — last-14-day daily rate vs linear daily (`mainTarget/365`); if
   > 1.15× or < 0.7×, emit "Last 14 days are running +N% above/below linear pace — €X/day
   vs €Y/day." (`alert` if > 1.35×).
3. **Category month-over-month mover** — biggest change between last *full* month and the
   month before (only categories with > €50 that month, change > €60): "Restaurants: €340
   in May, +60% vs April."
4. **Top category share / drift** — if the largest category is > 26% of main spend: "Groceries
   is 27% of spend so far — €X across N entries." (`watch` if > 34%).
5. **Buffer explanation** (info) — see *Projection math*.
6. **Year-over-year** (current year, when prior year has main data) — "Spending is €X (+N%)
   higher/lower than the same point in [year−1]." (`watch` if higher by > 8% of mainTarget).
7. **Required daily pace** (current year, when projection > mainTarget) — "Spend ≤ €X/day
   from here to finish on main budget target." (`watch` if status is alert, else `info`).
8. **Ceiling verdict** (current year, **always top**, replaces calm fallback) —
   - `combinedProjection > ceiling`: "Household projects to €X against your €Y ceiling —
     trim fun spending by ~€Z/mo to stay within it." (`alert` if over by > 8% of ceiling,
     else `watch`). Drill → Fun tab.
   - `combinedProjection < ceiling × 0.94`: "You're tracking €X under your €Y ceiling —
     room to raise the fun budget by ~€Z/mo if you want." (`good`). Drill → Fun tab.
   - Between 0.94× and 1×: "Tracking €X under your €Y ceiling — tight but on course." (`info`).
     Drill → Fun tab. Replaces the calm fallback.

**Ranking:** by severity (`alert > watch > info > good`), then by `mag`. Detector #8 is
always prepended first when present.
**Calm state:** if nothing reaches `watch`/`alert` *and* no ceiling callout, prepend a
single neutral line ("Projection steady at €X … nothing notable in the data").
**Completed years:** a single review callout comparing `spent + funSpent` vs `ceiling` ("Finished over/under the ceiling by €X — €Y against a €Z ceiling."). The combined figure (not just main spend) is the verdict for complete years.
**Future years:** a single "hasn't started yet" callout.

**Overview density** (a Tweak): `minimal` = top ≤2 hot callouts (or 1 calm), `balanced`
= top 4, `all` = everything.

---

## Fun budget model  (`y/calc.jsx → computeFun`, `y/fun.jsx`)

### Concept

Each person has a **monthly fun allowance** — a "no questions asked" discretionary
budget. Fun transactions are tagged `fun:true` + `person` at log time and are **excluded
from all main budget math**. The fun budget layers on top of the main budget; together
they measure against the household `ceiling`.

### All-time running balance

```
balance(person, asOf) =
  Σ(rateForMonth(person, m) for each month m from person.startMonth to asOf month, inclusive)
  − Σ(amount_eur for all fun txns of that person, date ≤ asOf)
```

Balance **can be negative** ("buy now, earn it back"). The UI shows negative balances
explicitly ("owe back") and never clamps the number to zero. Progress bars (wishlist
goal completion) do clamp to 0–100%.

`computeFun(store, asOfDate?)` returns:
- `people[]` — per-person: `{ id, name, balance, monthlyRate, usedThisMonth, spentAllTime }`
- `funSpentYTD` — fun spend in `store.currentYear` up to asOf
- `funProjection` — linear projection of fun spend (approximate)
- `funCatList` — fun-only category breakdown for `currentYear`

The per-person balance is an **all-time, as-of-now concept** — it does not change
when the user switches `viewYear`. The combined verdict for a non-current viewYear
uses that year's actuals vs that year's `ceiling` (no projection for past years; zero
for future years).

### Dated rate schedule

`person.rates` is a forward-only sorted array of `{ from: "YYYY-MM", amount }`. Editing
the monthly rate appends (or updates) a new entry for the current `YYYY-MM`; past entries
are never modified. `rateForMonth(person, ym)` returns the latest `from ≤ ym`, or 0
before `startMonth`.

This means `funPlanAnnual` sums per-month rates across all 12 months — a mid-year rate
change is immediately reflected in `mainTarget` from that month forward.

### Wishlist

Each person has a wishlist of savings goals `{ id, owner, name, price, createdMonth }`.
Progress = `max(0, balance) / price` clamped 0–100%. Months-to-afford =
`max(0, ceil((price − balance) / monthlyRate))`; "ready now" if balance ≥ price.
**"Bought it"** logs a fun-tagged shopping transaction for `item.price` and removes the
item — removal is the v1 archive mechanism.

---

## Screens / Views

The app is a fixed mobile column (`max-width: 440px`, full viewport height, centered on
desktop with a rounded device frame + shadow at ≥480px). Three regions: a sticky
**top bar**, a scrolling **body**, a **bottom nav**. Sheets and the tweaks panel are
absolutely positioned within the column.

### Top bar (54px, frosted)
- Left: **`Yearly.`** wordmark (the period is in the accent color). In Settings, this
  becomes a `‹ Done` button.
- Right: a **year pill** (`2026 ⌄`, shows "past" badge when viewing a non-current year)
  → opens the year menu sheet; and a circular **gear** icon → Settings. In Settings the
  right side shows the title "Settings".

### Bottom nav
Three zones: **Overview** (home icon) · a raised circular **`+` FAB** (accent fill, −22px
margin-top so it floats above the bar) · **Analysis** (layers icon). The FAB opens the
Add sheet from anywhere. Settings is reached via the gear, not the nav. Active tab uses
`--text`; inactive uses `--text-3`. Safe-area bottom padding applied.

### 1. Overview  (`y/home.jsx`) — the calm surface
Top → bottom:
- **Status hero** (`StatusHero` in `y/ui.jsx`) — Broadsheet numerals:
  - Headline = `combinedProjection` (current year), combined spent for complete years,
    `ceiling` for future years.
  - Sub-line: combined vs ceiling (over/under by €N), coloured by `combinedStatus`.
  - Pace rule fills to `combinedProjection / ceiling`; day-of-year marker.
  - Decomposition line beneath: `main €A / €mainTarget` (coloured by main status)
    and `fun €B` (ink-2), so all three states are readable at a glance.
- **"What's happening"** — the callouts list (sliced by density). Each callout is a hairline
  row: a severity dot (terra/amber/sage), the analytical sentence, a faded "→". Whole row
  tappable → drills into Analysis.
- **Fun strip** (`FunStrip` from `y/fun.jsx`) — compact hairline section labelled "Fun budget":
  one row per person showing name, all-time balance (sage if ≥0, terra if negative with
  "owe back" hint), and nearest wishlist goal name + progress bar. Whole strip tappable →
  Analysis Fun tab.
- **Spend curve** — a dependency-free SVG cumulative spend curve for the current year
  (main spend only).

### 2. Analysis  (`y/analysis.jsx`) — the deep surface
A sticky **segmented control**: `Projection` · `Categories` · `Activity` · `Fun`.

- **Projection tab:** a "Spend vs pace" card with the projection chart + legend, an
  explanatory line about the linear model, then a 2-col **stat grid**: Spent YTD,
  On-pace-by-today, Daily rate (vs linear), Buffer adds, Projected finish (status-colored),
  vs mainTarget (status-colored).
  - **Chart spec (use Recharts):** X = day-of-year 0–365 with month ticks; Y = €, domain
    `[0, max(mainTarget, projection) × 1.1]`. Series: **actual** cumulative line (status color,
    with a soft area fill) up to today; **projected** dashed line (amber) from today→year-end;
    **linear pace** dotted reference line from 0→mainTarget; a dashed horizontal **mainTarget**
    reference line labeled "main €21.4k"; a dot at today and at the projected endpoint.
- **Categories tab:** "Where it's going" — every category that has spend, sorted by amount,
  as an interactive bar row: icon, name, amount (mono), a colored share bar, and a sub-line
  ("27% of spend · 84 entries · +22% MoM"). **Tap to expand** → a per-month **bar trend**
  mini-chart (last full month highlighted) + the 5 most recent transactions in that category.
  No per-category targets. This is *diagnostic depth on demand*, not a passive list.
- **Activity tab:** a search input (filter by description) + horizontally scrolling category
  filter chips + the full transaction list (reverse-chronological, **main txns only** — fun
  tx are excluded), each row tappable to edit. Footer "N of M entries."
- **Fun tab** (`FunTab` from `y/fun.jsx`): per-person cards (balance, monthly rate, this-month
  usage, all-time spent), fun-only category breakdown, and the full wishlist with progress
  bars, months-to-afford ETA, "Bought it" button, and an "Add item" sheet. Reached by tapping
  the Overview fun strip or any callout that drills `{ section: "fun" }`.

### 3. Add an expense  (`y/addflow.jsx`) — bottom sheet, frictionless
Header "Log an expense" + a `Quick | Manual` segmented control.
- **Quick (default):** a 4-column grid of **template tiles** (category color dot + name). Tap
  a tile → an entry step in the same sheet: template chip, a big mono amount display, a
  **custom numeric keypad** (1–9, ., 0, ⌫ — for fast thumb entry), a date field (defaults to
  today), an optional note, and a primary "Add €X" button. Prefills category/name (and amount
  if the template has a default).
- **Manual:** description, amount, a 3-column **category picker** (all 18, color dot+label,
  selected highlights in accent), date (defaults today), optional note, "Add expense".
- Both flows expose a **Fun budget toggle** (off by default). When on, an owner picker
  (Joseph / Marti chips) appears. The saved transaction has `fun:true` + `person` set.

### 4. Edit / delete  (`y/addflow.jsx → EditSheet`)
Tapping any transaction (Activity, category drill) opens a sheet prefilled from the
transaction, with a "Delete" (secondary) + "Save changes" (primary) row. Includes the
same **Fun budget toggle** as AddSheet; pre-populates from `txn.fun`/`txn.person`.

### 4. Edit / delete  (`y/addflow.jsx → EditSheet`)
Tapping any transaction (Activity, category drill) opens a sheet prefilled from the
transaction, with a "Delete" (secondary) + "Save changes" (primary) row. Includes the
same **Fun budget toggle** as AddSheet.

### 5. Settings  (`y/settings.jsx`) — behind the gear
Grouped rows:
- **This year:** Household ceiling (€, opens numeric sheet labelled "Your total annual
  outflow ceiling — the sacred number everything is measured against") · Missed-entry buffer
  (opens a slider sheet 0–15% with live "projection €X → €Y" preview) · Past years (opens
  **Years** list: each year shows `ceiling`, combined projection/final, and a delta chip;
  tapping a year drills into a year detail view with ceiling + buffer rows).
- **Fun budget:** one row per person, showing their current monthly rate, opens
  `FunConfigSheet` to set the rate for the current month onwards (forward-only, past entries
  preserved). Shows the derived split: `ceiling = main/yr + fun/yr`.
- **Display:** Overview density (minimal/balanced/all — controls how many callouts are shown).
- **Data:** Quick templates (manager sheet: reorder ▲▼, edit, delete, add — name/category/
  default amount) · Import CSV · Export all data (downloads CSV) · Back up JSON · Restore
  JSON (runs `migrateStore` so old backups with `target`/no `people` migrate cleanly) ·
  Restore sample data.
- **Danger zone:** Clear all data (type `DELETE` to confirm; clears transactions, keeps
  ceiling/templates).

### 6. Import CSV  (`y/settings.jsx → ImportSheet`)
File picker **or** paste, with a "Try sample" button. Expected columns:
`date, description, amount_eur, original_amount, original_currency, category`.
Parses → **preview** list where each row has a category override (`<select>`) and a
skip checkbox. **Duplicate detection** on `description + date + amount_eur`; dups are
flagged "DUP" and auto-skipped. Summary line: "N rows · K to import · M duplicates skipped".
Confirm imports non-skipped rows with `source: "import"`.

---

## Interactions & behavior

- **Navigation** is in-memory route state (`home` | `analysis` | `settings`); no URL
  routing in the prototype (add real routing in production). Scroll resets to top on route
  change.
- **Callout → drill:** sets an Analysis "focus" `{ section, category? }`; Analysis switches
  to that tab and pre-expands the focused category.
- **Year switching** uses a separate `viewYear` (not `currentYear`); viewing a past year
  flips the whole app into "completed year" mode (final spend, no projection/buffer, review
  callout, green/amber by final vs mainTarget).
- **Bottom sheets:** slide up (`translateY(100%)→0`, 0.34s, Aperture ease) over a
  blurred scrim; close on scrim tap or Escape; mount/unmount with a 340ms exit.
  > Implementation note: the prototype toggles the open class via `setTimeout`, not
  > `requestAnimationFrame`, because the preview pauses rAF when backgrounded. In a real
  > app, use your sheet/modal primitive.
- **Hover/press** (desktop): cards lift −2 to −5px with shadow growth; buttons lift −2px;
  active settles back. All motion wrapped in `prefers-reduced-motion`.
- **Forms:** amount must parse to > 0 to enable Save. Amounts stored rounded to cents.
- **Persistence:** every mutation writes the whole store to localStorage.

---

## State management

App-level state (see `y/app.jsx`):
- `store` — the full persisted object (see Data model). All mutations go through a
  `setStore` that persists to `localStorage` on every write.
- `route`, `viewYear`, `analysisFocus`, `addOpen`, `editTx`, `yearOpen`, `deletedTx`,
  `showToast` — ephemeral UI state.

Derived (memoized):
- `stats = computeStats(store, viewYear)` — main budget figures for the viewed year.
- `callouts = buildCallouts(store, stats)` — ranked callout list including the ceiling verdict.
- `fun = computeFun(store)` — all-time per-person fun ledger (always as-of now, independent
  of `viewYear`).

**All numbers shown anywhere derive from these three pure functions** — re-implement them
faithfully and the UI follows.

---

## Design tokens

Pulled from the Aperture dark theme + app-specific state/category palettes. (CSS variable
names below are the Aperture token names used throughout `y/app.css`.)

### Color — theme (dark)
| Token | Value | Use |
|---|---|---|
| page background | `#000000` (with a faint radial `#141417→#08080a` behind the device) | app bg |
| `--surface` | `#1c1c1e` | cards |
| `--surface-2` | `#242427` | sheets / raised |
| `--surface-sunk` | `#161618` | wells, segmented track, bar tracks |
| `--text` | `#f5f5f7` | primary text (never pure white) |
| `--text-2` | `#c7c7cc` | secondary |
| `--text-3` | `#8e8e93` | tertiary / meta / axis labels |
| `--hairline` | `rgba(255,255,255,0.10)` | borders, gridlines |
| `--hairline-strong` | `rgba(255,255,255,0.18)` | hover borders, grabber |

### Color — accent & state
| Token | Value | Use |
|---|---|---|
| `--accent` | `#0071e3` (Apple blue; alternates: `#3b82f6`, `#5e5ce6`, `#e8e8ea`) | links, focus, primary button, FAB, selected |
| good (green) | `#30d158` | under/at target |
| watch (amber) | `#ff9f0a` | slightly over |
| alert (red) | `#ff453a` | well over |
| state tint bg | `color-mix(state 16%, transparent)` | chip / icon-badge fills |

### Color — category palette (icon + tint, 18 fixed)
`#22` (≈13%) alpha of the hue for the badge background; full hue for the icon/bar.
Groceries `#32d74b` · Restaurants `#ff9f0a` · Shopping `#ff6ac1` · Gym `#9be15d` ·
Health `#ff6961` · Utilities `#ffd60a` · House Stuff `#40c8e0` · Transport `#0a84ff` ·
Taxes `#98989d` · Travel `#5ac8fa` · Entertainment `#bf5af2` · Sophie Kindergarten
`#5e5ce6` · Services `#d0a24c` · Gift `#e0489a` · Pets `#cd8b4f` · Donation `#30d0c0` ·
Cash `#99a06b` · General `#8e8e93`. (Full map in `y/data.jsx → CATEGORIES`.)

### Typography
- **UI font:** native system stack — `-apple-system, BlinkMacSystemFont, "SF Pro Display",
  "SF Pro Text", "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif`. Zero web-font load.
- **Numbers font (mono):** `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas,
  monospace`, with `font-feature-settings: "tnum" 1`. Applied via a `.num` class to every figure.
- Weights: 600 display/headings, 500 meta/buttons/labels, 400 body.
- Scale (px): hero numeral 46–62 · screen section labels 13 (uppercase, tracked) · card title 18 ·
  body 15–16 · meta 12.5 · eyebrow 11–12 (uppercase, letter-spacing 0.1em).
- Tracking tightens as size grows (−0.04em hero → −0.02em headings → −0.01em body).

### Spacing — 4px base
`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Screen padding 18px. Card padding 18px. Use
flex/grid with `gap`, never margin-stacked siblings.

### Radii
small controls/inputs `8–13px` · callout & template tiles `18px` · icon badges `10–13px` ·
standard card `24px` · sheets `28px` (top corners) · device frame `40px` · chips & buttons
fully pill (`980px`).

### Elevation (dark)
- rest: `0 1px 2px rgba(0,0,0,.5), 0 6px 18px rgba(0,0,0,.45)`
- hover: `0 2px 8px rgba(0,0,0,.55), 0 22px 50px rgba(0,0,0,.6)`
- modal/sheet: `0 40px 120px rgba(0,0,0,.7), 0 8px 24px rgba(0,0,0,.5)`

### Motion
Default ease `cubic-bezier(.22,.61,.36,1)`; durations 150–340ms; everything guarded by
`prefers-reduced-motion`.

---

## Assets

- **Icons:** all inline SVG, drawn in a Lucide-compatible rounded-line style (24×24,
  `stroke-width: 2`, round caps/joins), defined in `y/icons.jsx` (`YIcons` map + `<Icon>`
  component). Covers 18 category icons + UI chrome (plus, gear, chevrons, search, trash,
  pencil, calendar, check, arrows, trending up/down, upload/download, alert, info, activity,
  layers, home, clock). **In production, use [Lucide](https://lucide.dev) (lucide-react)** —
  the names map closely; the design-system guidance recommends Lucide.
- **Fonts:** none to ship — native system stack (real SF Pro on Apple hardware).
- **No images, no emoji, no icon fonts.**

---

## Files in this repo

| File | Contents |
|---|---|
| `index.html` | App shell — loads React/Babel from CDN, then the `y/` modules in dependency order, mounts the app. PWA meta + manifest link + SW registration. |
| `manifest.json` | PWA manifest (standalone, portrait, black theme, icons). |
| `sw.js` | Network-first service worker — serves cached app shell when offline. Bump `CACHE_NAME` on shell changes. |
| `icons/` | App icon SVG assets (192, 512, maskable) for PWA install. |
| `y/tokens.css` | All ~25 CSS custom properties the app consumes (`--bg`, `--surface`, `--text`, `--accent`, etc.). Loaded before `y/app.css`. |
| `y/ds.jsx` | Local `Button`, `SegmentedControl`, `Input`, `Chip` primitives exposed as `window.ApertureDesignSystem_72a4cd`. No external DS bundle needed. |
| `y/app.css` | All app styling, built on the token variables. **The source of truth for layout, spacing, and the visual system.** |
| `y/data.jsx` | Categories (18, icon+color), default templates (8), seeded sample data generator (deterministic), localStorage load/save/reset/migrate. Exports `migrateStore` (idempotent) for both `loadStore` and JSON restore. |
| `y/calc.jsx` | **Projection math + callout engine** + `computeFun` + `rateForMonth` + formatters + date helpers. Port verbatim. |
| `y/icons.jsx` | Inline SVG icon set. |
| `y/ui.jsx` | Shared primitives: `StatusHero` (combined-vs-ceiling hero), `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `Sheet`, `SectionH`, `Toast`, mono-number rich-text helper. |
| `y/fun.jsx` | Fun budget UI: `FunStrip` (Overview compact strip) + `FunTab` (Analysis workshop: per-person cards, wishlist, category breakdown). |
| `y/home.jsx` | Overview screen: hero + callouts (density-sliced) + FunStrip + spend curve. |
| `y/addflow.jsx` | Add sheet (Quick keypad + Manual + fun toggle), Edit sheet, category picker, numpad. |
| `y/analysis.jsx` | Analysis screen: Projection / Categories / Activity / Fun tabs. Projection + Spend curve are dependency-free SVG; Fun tab renders `FunTab`. |
| `y/settings.jsx` | Settings + Years + Fun budget config + Templates manager + CSV import/export/backup/restore + density + clear. |
| `y/app.jsx` | Root: nav, routing, year switch, store wiring, `computeFun` memo, `onOpenFun`, undo-on-delete toast, mount. |
| `calc.test.html` | Dev-only regression test for `y/calc.jsx` — open over HTTP to run assertions. Not precached by the SW. |

> The prototype also references the **Aperture design system** under `_ds/` (dark theme
> tokens + a few React components: Button, SegmentedControl, Input, Chip). These are the
> visual foundation; in the target codebase, map them to your own component library while
> keeping the tokens above.

---

## Recommended build order in the target codebase

1. Port `y/data.jsx` (model + categories + seed) and `y/calc.jsx` (math + callouts) as
   plain TS modules — they have no UI dependency and are the product's brain.
2. Set up tokens (colors/type/spacing above) in your styling system; dark theme only.
3. Build the shell (mobile column, top bar, bottom nav + FAB) and the **Overview** screen
   (status hero + callouts + recent).
4. Build the **Add** flow (Quick keypad + Manual) — the most-used surface; optimize for speed.
5. Build **Analysis** (Recharts projection chart first, then category diagnostics, then activity).
6. Build **Settings** (ceiling, buffer, years, fun budget config, templates, import/export, clear).
7. Wire localStorage persistence and the year switcher last.
