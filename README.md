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

The files in this bundle (`Yearly.html` + the `y/` module folder) are **design
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
  "years": {
    "2024": { "target": 21000, "buffer": 0.04 },
    "2025": { "target": 23000, "buffer": 0.04 },
    "2026": { "target": 25000, "buffer": 0.04 }
  },
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
}
```

**Template** (Quick-log tile):
```ts
{ id: string; name: string; category: CategoryId; defaultAmount?: number; icon?: string; }
```

**Key model decisions:**
- **Targets are per-year, not a global setting** — they change over time (inflation,
  life changes). The Years view shows target vs actual for each tracked year so a
  10-year export is a real history.
- **`buffer` is per-year** (a fraction, e.g. `0.04` = 4%). See *Projection math*.
- Year is derived from `date.slice(0,4)`; actuals are always computed from
  transactions, never stored as aggregates.

---

## Projection math  (`y/calc.jsx → computeStats`)

Linear pace model (intentionally simple for v1 — Christmas isn't linear, accepted):

```
doy            = day-of-year of "as of" date          // today for current year, 365 for past years
target         = years[year].target
buffer         = years[year].buffer                   // fraction
spent          = sum(amount_eur) for txns in year, date <= asOf
dailyRate      = spent / doy
projNoBuffer   = dailyRate * 365                       // raw linear projection
projection     = projNoBuffer * (1 + buffer)           // missed-entry buffer applied
bufferAmt      = projection - projNoBuffer
pace           = (doy / 365) * target                  // "what you should have spent by today"
delta          = projection - target
deltaPct       = delta / target
```

For a **completed (past) year**: `projection = spent` (no extrapolation, no buffer).

**Status thresholds** (drive green/amber/red everywhere):
- Current year: `good` if `projection ≤ target`; `watch` if `≤ target × 1.08`; else `alert`.
- Completed year: `good` if `spent ≤ target`; `watch` if `≤ target × 1.03`; else `alert`.

**Missed-entry buffer** is a **flat % uplift on the projection**, adjustable 0–15% via a
slider in Settings, and made visible: the Analysis projection panel shows a "Buffer
adds +€X" stat, and a callout explicitly explains "logged spend alone projects to €X;
the N% buffer lifts that to €Y."

---

## Callout engine  (`y/calc.jsx → buildCallouts`)  — the heart of the app

Pure function `(store, stats) → Callout[]`, ranked. Each callout:
```ts
{ id, severity: "alert"|"watch"|"info"|"good", icon, accent?, text, drill: { section, category? }, mag }
```
`text` is a number-led analytical sentence; numbers within it are rendered in mono.
Tapping a callout navigates to Analysis and focuses the relevant section/category.

**Detectors** (current year):
1. **Projection trend** — recompute projection as of 28 days ago (using only txns up to
   then); if it moved > 1.2% of target, emit "Year-end projection has moved up/down €X
   over the last 4 weeks, now €Y." (`alert` if worsened > 4% of target, else `watch`/`good`).
2. **14-day pace streak** — last-14-day daily rate vs linear daily (`target/365`); if
   > 1.15× or < 0.7×, emit "Last 14 days are running +N% above/below linear pace — €X/day
   vs €Y/day." (`alert` if > 1.35×).
3. **Category month-over-month mover** — biggest change between last *full* month and the
   month before (only categories with > €50 that month, change > €60): "Restaurants: €340
   in May, +60% vs April."
4. **Top category share / drift** — if the largest category is > 26% of spend: "Groceries
   is 27% of spend so far — €X across N entries." (`watch` if > 34%).
5. **Buffer explanation** (info) — see *Projection math*.

**Ranking:** by severity (`alert > watch > info > good`), then by `mag`.
**Calm state:** if nothing reaches `watch`/`alert`, prepend a single neutral line
("Projection steady at €X … nothing notable in the data") — never show filler callouts.
**Completed years:** a single review callout ("Finished under/over target by €X …").

**Overview density** (a Tweak): `minimal` = top ≤2 hot callouts (or 1 calm), `balanced`
= top 4, `all` = everything.

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
- **Status hero** (a card). Default treatment = **numerals**:
  - Eyebrow "PROJECTED YEAR-END" (or "FINAL SPEND · 2025" for past years).
  - Giant mono numeral = projection (or final spend), colored by status
    (green/amber/red). ~46–62px, weight 600, letter-spacing −0.04em.
  - Sub-row: "vs €25,000 target" + a **delta chip** ("↗ +€1,308 over" / "↘ −€660 under"),
    chip tinted by status.
  - Foot: "€10,950 spent · day 158 of 365" (mono numbers).
  - Hero treatment is a Tweak: `numerals` / `gauge` (semicircle arc % of target) /
    `bar` (pace bar with on-pace marker) / `projection` (sparkline). See `StatusHero` in
    `y/ui.jsx`.
- **"What's happening"** — the callouts list (sliced by density). Each callout is a card:
  a rounded severity-tinted icon badge, an optional small tag ("Worth a look" / "Watch"),
  the analytical sentence (numbers in mono), and a chevron. Whole card is tappable → drills
  into Analysis.
- **"Recent"** — a card listing the last 5 transactions; tap any row to edit. "All activity"
  link → Analysis › Activity.

### 2. Analysis  (`y/analysis.jsx`) — the deep surface
A sticky **segmented control**: `Projection` · `Categories` · `Activity`.

- **Projection tab:** a "Spend vs pace" card with the projection chart + legend, an
  explanatory line about the linear model, then a 2-col **stat grid**: Spent YTD,
  On-pace-by-today, Daily rate (vs linear), Buffer adds, Projected finish (status-colored),
  vs target (status-colored).
  - **Chart spec (use Recharts):** X = day-of-year 0–365 with month ticks; Y = €, domain
    `[0, max(target, projection) × 1.1]`. Series: **actual** cumulative line (status color,
    with a soft area fill) up to today; **projected** dashed line (amber) from today→year-end;
    **linear pace** dotted reference line from 0→target; a dashed horizontal **target**
    reference line labeled "target €25k"; a dot at today and at the projected endpoint.
- **Categories tab:** "Where it's going" — every category that has spend, sorted by amount,
  as an interactive bar row: icon, name, amount (mono), a colored share bar, and a sub-line
  ("27% of spend · 84 entries · +22% MoM"). **Tap to expand** → a per-month **bar trend**
  mini-chart (last full month highlighted) + the 5 most recent transactions in that category.
  No per-category targets. This is *diagnostic depth on demand*, not a passive list.
- **Activity tab:** a search input (filter by description) + horizontally scrolling category
  filter chips + the full transaction list (reverse-chronological), each row tappable to edit.
  Footer "N of M entries."

### 3. Add an expense  (`y/addflow.jsx`) — bottom sheet, frictionless
Header "Log an expense" + a `Quick | Manual` segmented control.
- **Quick (default):** a 4-column grid of **template tiles** (icon badge in the category
  color + name). Tap a tile → an entry step in the same sheet: template chip, a big mono
  amount display, a **custom numeric keypad** (1–9, ., 0, ⌫ — for fast thumb entry), a date
  field (defaults to today), an optional note, and a primary "Add €X" button. Prefills
  category/name (and amount if the template has a default).
- **Manual:** description, amount, a 3-column **category picker** (all 18, icon+label, selected
  highlights in accent), date (defaults today), optional note, "Add expense".

### 4. Edit / delete  (`y/addflow.jsx → EditSheet`)
Tapping any transaction (Recent, Activity, category drill) opens a sheet identical to Manual,
prefilled, with a "Delete" (secondary) + "Save changes" (primary) row.

### 5. Settings  (`y/settings.jsx`) — behind the gear
Grouped rows:
- **This year:** Annual target (€, opens numeric sheet) · Missed-entry buffer (opens a
  slider sheet 0–15% with live "projection €X → €Y" preview) · Past years (opens **Years**
  list: each tracked year with target, projected/final, and an over/under delta chip).
- **Data:** Quick templates (manager sheet: reorder ▲▼, edit, delete, add — name/category/
  default amount) · Import CSV · Export all data (downloads CSV) · Restore sample data.
- **Danger zone:** Clear all data (type `DELETE` to confirm; clears transactions, keeps
  targets/templates).

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
  callout, green/amber by final vs target).
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
  `setStore` that persists.
- `tweaks` — `{ heroVariant, accent, density }`, persisted separately.
- `route`, `viewYear`, `analysisFocus`, `addOpen`, `editTx`, `yearOpen` — ephemeral UI state.

Derived (memoized): `stats = computeStats(store, viewYear)` and
`callouts = buildCallouts(store, stats)`. **All numbers shown anywhere derive from these
two pure functions** — re-implement them faithfully and the UI follows.

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

## Files in this bundle

| File | Contents |
|---|---|
| `Yearly.html` | App shell — loads React/Babel + Aperture DS bundle/tokens, then the `y/` modules, mounts the app. PWA meta + manifest link. |
| `manifest.json` | PWA manifest (standalone, portrait, black theme). |
| `y/app.css` | All app styling, built on Aperture dark tokens. **The source of truth for layout, spacing, and the visual system.** |
| `y/data.jsx` | Categories (18, icon+color), default templates (8), seeded sample data generator (deterministic), localStorage load/save/reset. |
| `y/calc.jsx` | **Projection math + callout engine** + formatters + date helpers. Port verbatim. |
| `y/icons.jsx` | Inline SVG icon set. |
| `y/ui.jsx` | Shared primitives: `StatusHero` (+ gauge/bar/spark variants), `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `PaceBar`, `Sheet`, `SectionH`, mono-number rich-text helper. |
| `y/home.jsx` | Overview screen + callout density slicing. |
| `y/addflow.jsx` | Add sheet (Quick keypad + Manual), Edit sheet, category picker, numpad. |
| `y/analysis.jsx` | Analysis screen: projection chart (chart spec), category diagnostics, activity. |
| `y/settings.jsx` | Settings + Years + Templates manager + CSV import/export + clear. |
| `y/app.jsx` | Root: nav, routing, year switch, store + tweaks wiring, mount. |
| `y/tweaks-panel.jsx` | Prototype-only tweak panel scaffold (not part of the product). |

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
6. Build **Settings** (target, buffer, years, templates, import/export, clear).
7. Wire localStorage persistence and the year switcher last.
