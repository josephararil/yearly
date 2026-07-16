# UI layers

Component reference for the screens and shared primitives. CLAUDE.md links here; read it when
touching `ui.jsx`, `fun.jsx`, or a screen module. Engine/state internals are in
[ARCHITECTURE.md](ARCHITECTURE.md). Design tokens and voice rules: `design/BROADSHEET_DESIGN_SPEC.md`.

## `y/ui.jsx` (`window.YUI`) — shared primitives

Exports: `StatusHero`, `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `Sheet`, `SectionH`,
`Toast`, and `rich` (renders numbers inside text in the mono `.num` style).

> `GaugeHero`, `PaceBar`, `ProjSpark`, and `SpendCurve` have all been removed. The hero is fixed
> to numerals; the Overview monthly chart is `MonthCurve`, defined locally in `home.jsx`.

### `StatusHero`

Three-zone stack (current year shows all three; complete year hides pulse; future year shows
Zone 1 only).

**Zone 1 — Reality block**: eyebrow label (serif mood: "Projected year-end" / "Final spend · Y" /
"Household ceiling · Y"); serif hero number (`stats.projection` or `ceiling`); sans sub-line
(over/under ceiling by €N in terra/sage mono 700, `±€X` band suffix when `bandAmt != null`);
hairline rule; `.hero-spent` row — serif 38px `totalSpent` (= `stats.spent`, all tx) left-aligned
+ mono 11px day/year right-aligned.

**Zone 2 — Multi-stage bullet bar** (HTML/CSS — mirrors the restraint of the original
`.pace-rule`; hidden for future years): a 22px `.bullet-wrap` container holds a 4px rail
(`.bullet-rail`, `--chart-grid` background) with solid `.bullet-fill-spent` to `totalSpent` and a
translucent (0.4 opacity) `.bullet-fill-proj` from spent → `stats.projection` (current year
only). A 1px solid `--muted` `.bullet-doy` marker shows where pace puts you. Absolutely-positioned
tick marks: `mainTarget` (14px tall, `--ink-2`, labeled "main €X" — explanatory reference only),
`ceiling` (20px tall, `--ink` — hard stop), `stats.projection` (14px tall, `--terra`, only when
meaningfully ≠ ceiling). Tick labels render in a separate `.bullet-labels` row below the rail
(mono 10px `--muted`) sorted left-to-right with alternating `top` (0 or 13px) to avoid horizontal
collision; leftmost/rightmost labels clamp via `left:0` / `right:0` to prevent overflow. The spent
figure is not duplicated here (it already appears in `.hero-spent`). The wrap is clickable
(`onPointerDown` → `handleTap`); `.bullet-tip` appears above the rail with paper fill + hairline
border. Tooltip x-anchors left/center/right based on `tip.x` to avoid edge overflow. Dismisses on
second tap or pointerdown outside. State: `useState({open,x})` local to `StatusHero`.

**Zone 3 — Monthly pulse** (current year only): two-row layout. Row 1 (`.pulse-r1`, `display:flex`
`justify-content:space-between`) carries the mono month label (e.g. JUNE) on the left and the sans
verdict on the right; row 2 (`.pulse-r2`, mono 11.5px) carries `€X so far` (ink) `·` `cap €Y` (ink)
`·` `projected €Z` (ink-2). Verdict: `projectedMonthEnd > cap × 1.1` → "Slow down ▲" terra; `> cap
× 0.95` → "Tight ●" amber; else "Room to spend ▼" sage. Data: `byMonth[m].amount`,
`neededMonthlyCap(stats)`, `projectedMonthEnd(stats)`.

### `TxRow`

Shows a 24px rounded merchant logo (`t.merchant_logo`) when present; falls back to a 24px `cat-ic`
category icon (colored square + SVG icon, `CatIcon`-style inline) if absent or on load error.
`tx-meta` appends `· city` when `t.merchant_city` is set. Both fields are populated by `rowToTx` in
`sync.jsx` from the Revolut D1 columns. When `t.fun` / `t.travel` is set, a small colored `TxTag`
("Fun" amber / "Travel" — the Travel category's blue) renders inline next to the title so tagged
rows are scannable at a glance; per-person/per-trip detail is left to the edit sheet.

### `Toast`

`Toast({ open, message, actionLabel, onAction, onDismiss })` — transient bottom-anchored banner
(above nav, z-index 30), auto-dismisses after 5 s via `onDismiss`, optional action button.

## `y/fun.jsx` (`window.YFun`) — fun budget UI

`FunStrip({ fun, store, onOpen })` — compact Overview strip: one hairline row per person (name,
all-time balance in sage/terra, nearest wishlist goal name+pct+thin bar). Whole strip tappable →
`onOpen()`. "no goals yet" if no wishlist items. Broadsheet tokens only, no cards.

`FunTab({ fun, store, setStore, addTx })` — the Analysis workshop:
- Per-person cards: name, monthly rate, balance (large, sage/terra coloured), this-month used with
  over/under indicator, all-time fun spent.
- Wishlist per person: item name, price, progress bar (clamped 0–100%, clamps negative balance to 0
  for display), months-to-afford ETA (`max(0, ceil((price−balance)/rate))`; "ready now" if balance
  ≥ price; "—" if rate 0). "Bought it" button logs a fun-tagged shopping tx via `addTx` and removes
  the item from `store.wishlist`. Remove (✕) deletes without buying. "Add" button opens
  `WishlistAddSheet` (name, price, owner Chip picker) pre-set to that person.
- Fun category breakdown: catbar-* rows fed from `fun.funCatList` (non-interactive). Each category
  row is followed by its individual transactions (description + amount, sans 11px / mono 11px,
  sorted newest-first), fetched by filtering `store.transactions` for `fun:true` + current year +
  matching normalised category. The catbar-row `borderBottom` is suppressed when transactions
  follow; the transaction block carries the hairline instead.

Internal: `WishlistAddSheet` (name + price + owner Chip picker), `PersonCard` (stats + wishlist).

## `y/travel.jsx` (`window.YTravel`) — travel budget UI

The family-wide analogue of `fun.jsx` (one household allowance, no per-person split, no owner).

`TravelStrip({ travel, store, onOpen })` — compact Overview indicator: an "Available" headline
(large mono balance, sage/terra), a meta line (`€X/mo · €Y used this month`), and — minimal, purely
informational — the most recent trip's name (from `travel.trips[0]`). Whole strip tappable →
`onOpen()`. When the allowance is unconfigured (rate 0, balance 0, no travel spend) it shows a quiet
"Set an allowance in Settings →" prompt.

`TravelTab({ travel, store, setStore })` — the Analysis workshop:
- One family-wide stats block: Available balance (sage/terra), this-month used with over/under
  indicator, Spent YTD with the uncapped `~€X/yr` projection.
- Trips list, driven by `travel.trips` (from `computeTravel`, already recency-sorted): each trip is a
  collapsible `TripRow` (local `openMap` state). Collapsed: trip name + `eur0(total)`, plus date
  range/location if present. Expanded: `TripBreakdown` — the trip's own catbar-* category rows (fed
  by `trip.catList`) each followed by its transactions (same treatment the old global breakdown
  used) — plus Edit and Delete actions. Delete is blocked (with a tx-count message) while the trip
  has any transactions, so no orphan travel tx are ever created; only empty trips can be removed.
  "Add trip" opens `TripCreateSheet` (Name required; Location/Start/End optional) for both create and
  edit (edit bumps `updatedAt`).

Internal: `TripCreateSheet`, `TripBreakdown`, `TripRow`, `tripDateRange(trip)`.

The former "future trip goals" wishlist (`TripAddSheet`, `nearestTrip`, `bookIt`,
`store.travelWishlist`) has been removed — travel spend is now organized by these discrete trips
instead. Trip *selection* when logging an expense lives in `y/addflow.jsx` (`TripField`, see below).

## Screens

- `y/home.jsx` (Overview — hero + `VoiceLine` + **one chart with a 4-way switcher** (`MonthCurve` /
  `ProjectionChart` / `MonthlyBarsChart` / `EstimateChart`) + FunStrip + TravelStrip)
- `y/analysis.jsx` (Projection/Activity/Fun/Travel tabs — Activity has Categories/Transactions
  sub-tabs; charts are hand-built SVG that double as the Recharts spec. **The Projection tab's own
  "This year" line and "Monthly breakdown" bar charts were moved to the Overview switcher; the tab
  now holds only "What's happening" callouts + "In numbers" stats.**)
- `y/settings.jsx` (Budget settings: combined ceiling+buffer / years / fun-budget / travel · Data
  settings: templates / Import & Export submenus (CSV · Revolut mobile import · JSON
  backup-restore) / force-resync / clear)
- `y/addflow.jsx` (unified "Log an expense" sheet: amount hero, template accelerator strip, category
  picker, Tags & options disclosure, Edit sheet)

### `home.jsx` — `VoiceLine`

The app's "voice" — one orthogonal, plain-language insight rendered directly under the `StatusHero`
(inside the same `.screen` child, with a hairline top border so it reads as part of the hero block,
not a separate section). `HomeScreen` now receives `callouts` + `onCallout` and filters to
`callouts.filter(c => !["ceiling","buffer","calm","final","future"].includes(c.id))` (the
non-redundant-with-the-Hero subset, in `buildCallouts`'s stable value-sorted order), then picks one
entry via `dayIndex % eligible.length` (`dayIndex = Math.floor(Date.now() / 86400000)`, i.e. days
since the Unix epoch) — a deterministic daily rotation through the list rather than always showing
the single highest-`value` callout. Same callout all day; advances once per day to a different entry
(round-robin, not random, so it never jumps back to a callout it just showed). Renders a severity dot
+ `YUI.rich(text)` (numbers in mono `.num`) + a `→`, tappable to drill into Analysis via `onCallout`
(same routing as `CalloutCard`). Stays silent (renders nothing) when no callout qualifies, and is
hidden on complete/future years (their single `final`/`future` callouts are filtered out). The small
inline `Fine / Tight / Slow down` chip in the "This month" header (`pulse-verdict`, month-cap vs
projected-month-end) is unchanged and independent of the voice line.

### `home.jsx` — the chart switcher

`HomeScreen` renders **one chart region with a 4-way `SegmentedControl`** (`chartView` state) in
place of the old single "This month" chart — the same principle most apps use (modify the chart in
front of you, don't scatter period-charts across screens). Views: **Month** (`MonthCurve`) · **Year**
(`ProjectionChart` + `ChartLegend` + a "this-year" `ChartExplain`) · **By month** (`MonthlyBarsChart`)
· **Estimate** (`EstimateChart`). The section `<h2>` follows the active view ("This month" / "This
year" / "Monthly breakdown" / "Estimate over time") and the `pulse-verdict` chip shows only on the
Month view. Default view is **Month** for a live year, **Year** for a completed/future one (which has
no meaningful "this month"). All four chart components live in `home.jsx` — `ProjectionChart` and
`MonthlyBarsChart` were moved here from `analysis.jsx` (load order: `home` precedes `analysis`, so
they must live at or before `home`), keeping their original `ChartExplain` storage keys (`this-year`,
`monthly-breakdown`) so saved expand/collapse state persists. `ProjectionChart` and `MonthlyBarsChart`
are otherwise unchanged from their former Analysis selves (the bar chart lost only its internal
"Monthly breakdown" section header, now supplied by the switcher).

### `home.jsx` — `MonthCurve`

Interactive monthly chart for the current month, defined locally in `home.jsx` (not exported from
`ui.jsx`), using the same SVG/pointer pattern as `ProjectionChart`. Features: day-by-day cumulative
actual spend (terra line + area fill); Pace diagonal (0 → neededMonthly, faint dashed); dashed
Projection line from today to month-end; horizontal Target line at `YCalc.neededMonthlyCap(stats)`
(`max(0, mainTarget − spentBeforeCurrentMonth) / monthsRemainingInclCurrent` — same helper used by
the "needed/mo" stat in Analysis); horizontal Month-end line at `projectedEnd` (where this month
will land); faint amber Prev-month overlay (previous month's cumulative curve, scaled
proportionally to the same x-width, same-year only — not shown for January); explanatory legend
below the chart (colored dot + label + description for each series). Toggle chips: Pace / Projection
/ Target / Month-end / Prev-month (prev month chip only shown when prior-month data exists; Month-end
only shown for incomplete months). For past/future years it shows a plain text fallback.

When `YCalc.monthEndBand(stats, store)` returns non-null and Projection is on, a semi-transparent
triangular band (vertices: today→spentSoFar, month-end→band.high, month-end→band.low, `--chart-proj`
at 10% opacity, same visual treatment as the yearly `ProjectionChart` band) is drawn beneath the
dashed Projection line — the month-scale uncertainty cone. See
[ARCHITECTURE.md](ARCHITECTURE.md#the-brain--ycalcjsx-windowycalc) for the statistical model
(`monthEndBand`). Legend gains a "Range (±€X)" entry whenever the band is present. The verbose
line-by-line legend below the chart is rendered via `YUI.ChartExplain` (see below).

### `home.jsx` — `EstimateChart` ("Estimate over time")

The new fourth view — a derivative-flavoured chart of the "holy number" (the projected year-end
total). Where the Month/Year charts only ever climb, this one plots how the *estimate itself* has
moved as spend accrued (e.g. €30k in spring → €27.5k now), so slowing down shows as a **falling**
line. Driven entirely by `YCalc.projectionHistory(stats, 5)` — a pure retroactive replay, **no stored
snapshots** (a footnote states this). Key design choice: the **y-axis is zoomed to the data range
(never anchored at 0)** — a €2–3k move on a €27k number would be invisible otherwise; the range is
framed to always include `ceiling` and `mainTarget` so both reference lines stay on-screen and
toggling them (the two `ToggleChip`s: Ceiling / Main target) never rescales the axis. A compact
caption above the SVG shows the current estimate + `▲/▼ €X vs 4 wks ago` (sage down / terra up, using
`projectionAsOf(stats,28)` — the same number as the "trend" callout). Crosshair tooltip snaps to the
nearest history point (date + estimate). `ChartExplain` key: `estimate-history`. Renders a muted
one-line fallback for complete/future years and when the year is younger than ~2 weeks
(`projectionHistory` returns < 2 points).

### `analysis.jsx` — `AnalysisScreen`

Receives `fun`, `travel`, `store`, `setStore`, `addTx` in addition to `stats`/`focus`/`onEditTx`;
renders `<YFun.FunTab>` on the "Fun" segment and `<YTravel.TravelTab>` on the "Travel" segment. Four
top-level segments: Projection, Activity, Fun, Travel. **Activity** is `ActivityMergedTab`, which owns
its own sub-tab state (`activitySubtab`, lifted into `AnalysisScreen` so focus-routing can drive it)
and renders a second `SegmentedControl` — Categories / Transactions — above whichever of `CategoriesTab`
/ `TransactionsTab` is selected; both sub-tabs are otherwise unchanged from their former standalone-tab
selves. Focus routing: `"categories"` → Activity tab, Categories sub-tab (with `focusCategory`),
`"projection"` → Projection, `"activity"` → Activity tab, Transactions sub-tab, `"fun"` → Fun,
`"travel"` → Travel. The Transactions sub-tab's "show only" filters include Fun and Travel.

**ProjectionChart** and **MonthlyBarsChart** — the "This year" line chart and "Monthly breakdown"
bar chart formerly lived here in `ProjectionTab`; they now live in `home.jsx` and render only through
the Overview chart switcher (see the `home.jsx` sections above). Their internal behavior is unchanged
(interactive crosshair/tooltip, `ToggleChip` series toggles, `maxY` scaling, `--chart-proj`
uncertainty band, `LegendItem`/`ChartLegend` swatches). `ProjectionTab` no longer renders any chart —
after the segment bar it goes straight to "What's happening" callouts and "In numbers" stats.

**`YUI.ChartExplain`** — shared collapsible component (`ui.jsx`) rendering the line-by-line "colored
dot + label + description" legend used below each Overview chart: `MonthCurve` (`month-curve`),
`ProjectionChart` (`this-year`), `MonthlyBarsChart` (`monthly-breakdown`), and `EstimateChart`
(`estimate-history`). Takes `{ storageKey, items }`; toggled via a "What's this?" button (chevron +
label) and persists its open/closed state to `localStorage['yearly:explain:' + storageKey]` (defaults
to open when unset) so each chart remembers its own collapsed/expanded state across reloads
independent of the others.

**"What's happening" section** (`ProjectionTab`) — callouts from `buildCallouts`, now the first thing
in the tab (the charts that used to precede it moved to the Overview switcher), rendered above "In
numbers". Shows all callouts (no density filtering). Receives `callouts`
and `onCallout` props threaded from `AnalysisScreen` → `App`. Clicking a callout still drills to the
appropriate tab via `onCallout`. Hidden when `callouts` is empty.

**"In numbers" section** (`ProjectionTab`) — appears below "What's happening" with a `section-h`
title, then three `.eyebrow`-labeled sub-groups (each its own `.statgrid`), reusing the same
`StatCard` tile throughout. Receives `fun` and `store` props (passed from `AnalysisScreen`). Two new
pure helpers back this section, exported from `calc.jsx`: `medianDailySpendYTD(stats)` (median of
per-day totals across every elapsed calendar day, incl. €0 days — damps lump-sum skew that a mean
can't) and `historicalMonthRange(store, excludeYm)` (all-time min/max calendar-month total across
every year in `store.transactions`; `excludeYm` is always the *real* current in-progress month via
`new Date()`, not the viewed year's month — a past-year view must still exclude today's partial
month or it wrongly shows up as the "lowest" month).

- **Historical actuals** — backward-looking, from settled tx data:
  - Spent YTD + entry count (one tile, existing).
  - Daily spend (YTD) — `dailyRate` + median sub-line (`medianDailySpendYTD`). Hidden for future years.
  - Avg spend/mo — average over completed months, sub shows the completed-month count (the
    "need ≤€X/mo" cue moved to the Targets group's Monthly target tile, see below).
  - Monthly range — `historicalMonthRange` min–max with the two month labels. Hidden for future years.
  - vs prior year same point / final (existing, conditional on `stats.priorSpent > 0`).
- **Projections & forecasts** — forward-looking:
  - Projected month-end — `YCalc.projectedMonthEnd(stats)`. Current year only.
  - Projected year-end / Final total (complete years) — `stats.projection` vs ceiling. Hidden for future years.
  - Blended rate — `trailingDailyRate` + buffer-adds sub (`+€X buffer (Y% missed-entry)`) when not
    complete, else falls back to the old "YTD avg €X/d" sub (buffer isn't meaningful post-close).
  - 90d trend — compares last-45d daily rate to prior-45d rate; `↑ Increasing` (terra), `↓
    Decreasing` (sage), or `→ Constant`. Only shown for current year with ≥ 90 days of data.
  - FIRE portfolio — `stats.projection / 0.04`; "at 4% rule" sub. Not shown for future years.
- **Targets & budgets** — dynamic constraints from the ceiling:
  - Monthly target — baseline (`ceiling / 12`) with the adjusted-cap sub-line
    (`neededMonthly = YCalc.neededMonthlyCap(stats)`), coloured sage/terra vs `avgMonthly`. Adjusted
    sub only present for the current year (matches `neededMonthly`'s existing guard).
  - On-pace by today (existing).
  - Total fun budget — `funPlanAnnual` per year with per-month sub. Not shown for future years.
  - **Real daily target** — NEW, local to `analysis.jsx` (does not touch the shared
    `requiredDailyToHit`/`dailyHeadroom` in `calc.jsx`, which still drive the Home screen's
    pace-guidance callout unchanged): `(ceiling − (spent + bufferAmt)) / daysRemaining`, floored at
    0; framed as `≤ €X/day` when `stats.projection > ceiling`, else `room €X/day`. Current year only.
  - **Daily target (this month)** — NEW: `(neededMonthly − spentThisMonth) / daysLeftInMonth`,
    floored at 0. Current year only.
  - Target fun/mo — `max(0, ceiling − stats.projection) / monthsLeft / numPeople` where
    `monthsLeft = max(1, daysRemaining / 30.4)`; sage when positive, terra when 0 (`projection ≥
    ceiling`). Current year only.

Removed: "Projected finish" and "VS Target" cards (both surfaced on the Overview hero).

**CategoriesTab** catbar rows use `CatIcon` (24px, radius 6); expanding a category shows two
sub-lists: "Recent in [category]" (last 5 by date, reversed) and "Largest in [category]" (top 5 by
`amount_eur` descending), both using `TxRow` with `onClick → onEditTx`. **TransactionsTab** — lists **all** transactions (`stats.txns`, including fun-tagged ones); fun tx
show the person's name as a tag. Filters are hidden behind a compact `sliders` icon button to the
right of the search bar; when active filters exist, a terracotta badge shows the count. Tapping the
button toggles an inline filter panel with three sections: **Category** (All + one chip per category
in `stats.catList`), **Sort** (6 options: Newest · Oldest · € High · € Low · A→Z · Z→A — default
Newest), and **Show only** — three boolean toggles: **Manual** (keeps only `t.source === "manual"`),
**Fun** (keeps only `t.fun === true`), and **Travel** (keeps only `t.travel === true`). Active
filters use `--terra` border/background; the filter button itself turns terracotta when any filter
is active.

### `addflow.jsx`

Redesigned (2026-07) around one unified form shared by `AddSheet` and `EditSheet` — there is no
Quick/Manual mode split anymore. Body order top → bottom: `TemplateStrip` (AddSheet only) →
`AmountHero` → `CategoryField` → Description → Note → `OptionsDisclosure` (Date sits inline in its
header row). `Sheet` (`ui.jsx`)
takes an optional `footer` prop rendered as a flex sibling below `.sheet-scroll` (not an overlay —
`.sheet` is `display:flex; flex-direction:column`, so the footer takes its own row and the scroll area
shrinks to fit via `flex:1; min-height:0`); both `AddSheet` and `EditSheet` pass their primary CTA row
as `footer` so it stays pinned while the form scrolls underneath.

**`AmountHero` + `NumPad`** — the single amount UI in the app (no separate manual text input). Big
serif-adjacent display (€ + `.num`, dims to a placeholder "0.00" when empty) driven by a clean 3×4
`NumPad` grid (1–9, ".", "0", "00" — no backspace row). Backspace lives **inline** in `AmountHero`, a
small `.amount-del` button to the right of the number that renders only once `amount` is non-empty (so
the resting state is clean); equal-width `.amount-side` spacers on both sides keep the number optically
centered. Backspace: tap deletes one char, long-press (500ms) clears to zero; touch handlers call
`preventDefault()` to suppress the synthetic mouse events mobile browsers fire after `touchend`,
avoiding a double-delete. The display formats the integer part with thousands separators
(`formatAmountDisplay`); the raw value stays a plain numeric string for `tx.amount`. Decimal input is
capped to 2 places and the "." key disables once a decimal point exists.

The **Date** field (`DateField`, `.inp-date` `width:auto`) shrinks to its content and shares one row
(`.datetags-row`, bottom-aligned) with the **Tags & options** trigger: `OptionsDisclosure` takes the
date block as its `dateField` prop and renders it to the left of the summary button, with the options
body expanding full-width below the row. This saves a line and fills the dead space beside the compact
date box; the old relative "Today"/"Yesterday" label was dropped. The **Note** textarea
(`textarea.inp`) rests at a single-line `min-height` (46px) and grows on demand rather than reserving a
large empty box.

**`CategoryField`** — compact Revolut-style trigger row (`.catsel-row`): the "CATEGORY" mono label on
the left, the current value as a tappable terracotta link on the right (category line icon tinted its
`c.color` + label + chevron; `.catsel-value`). No full-width bordered button. Tapping the row expands
`CategoryPicker` inline (no modal). Expanded, `CategoryPicker` is a 3-column grid of tiles
(`.catgrid`/`.catgrid-item`), each a thin category line icon tinted its `c.color` over a label — not
colored dots, not filled tiles (the icon carries the color; the tile is paper + hairline, terra
border/tint when selected). Categories are ordered **frequent-first** by all-time usage count in
`store.transactions`, ties broken by canonical `YData.CATEGORIES` order (stable and predictable — the
selected value is not floated). `CategoryPicker` is exported on `window.YAdd` and also used by
`settings.jsx`'s template editor (pass `store` so the frequency ordering has data).

> The colored icons are a deliberate product choice that softens the Broadsheet spec's "calm color
> dots / thin ink line icons, no multicolor" rule (`design/BROADSHEET_DESIGN_SPEC.md`) — line icons
> keep the color to the stroke, never a filled multicolor chip.

**`OptionsDisclosure`** — collapsed "Tags & options" row showing mono chips for any active flag (FUN ·
TRAVEL · ONE-OFF · AMORTIZE · TEMPLATE); expands to a row of icon tiles (`.opt-tiles`/`.opt-tile`, one
per flag — entertainment/travel/calendar/clock/layers icons), each toggled by tapping the tile (active
state = terra border/tint + a small check badge, no separate switch control). Captions for whichever
tiles are active stack below the row (`.opt-details`), each stating the consequence:
- **Fun budget** — reveals a Chip owner picker (Joseph/Marti) below the tile row when on. `commit()`/
  `onSave()` write `fun:true` + `person`; `EditSheet` pre-populates from `txn.fun`/`txn.person` and
  deletes both keys when toggled off.
- **Travel budget** — family-wide (no owner picker), but now requires a specific trip: when on,
  `TripField` renders below the caption (collapsed "TRIP — <name or 'Select a trip'>" row, modeled on
  `CategoryField`). Expanded body shows the 3 most-recent trips (sort key `startDate || createdAt`,
  desc) as `catpick`-style selectable rows, a "More…" row revealing the rest, and an always-visible
  inline create row (name input + Add button) calling `onCreateTrip(name)` — wired in `app.jsx` to
  `addTrip`, which appends `{id, name, location:"", startDate:null, endDate:null, createdAt,
  updatedAt}` to `store.trips` and returns the new id so the field auto-selects it. `commit()`/
  `onSave()` write `travel:true` + `trip_id`; both sheets' `valid` requires `tripId` set when
  `travelOn` (footer helper reads "Select a trip" until one is chosen); `EditSheet` pre-fills
  `tripId` from `txn.trip_id` and deletes both keys when toggled off.
- **One-off** — writes/deletes `oneoff:true`; causes `isLump()` in `calc.jsx` to exclude the tx from
  the blended rate while keeping it in `spent`. Hidden while Amortize is on (redundant — an amortized
  parent is already rate-excluded via its slices, see `expandAmortized` in
  [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Amortize** — reveals `AmortizeField` below the caption: preset `Chip`s (3/6/12/24) plus a numeric
  `<input type="number">` for the month count, and a "No real cash (virtual)" checkbox (only meaningful
  with Amortize on, so it lives here rather than as its own tile). `commit()`/`onSave()` write
  `amortize_months` (int ≥ 2) and, if checked, `virtual:true`; `EditSheet` pre-populates both from
  `txn.amortize_months`/`txn.virtual` and deletes both keys when toggled off. Both sheets' `valid`
  additionally requires `amortizeMonths >= 2` when `amortizeOn` (footer helper: "Spread over at least 2
  months"). `TxRow` (`ui.jsx`) renders a `×Nmo` badge beside the Fun/Travel tags (`VIRTUAL ×Nmo` when
  `virtual` is set).
- **Save as template** — `AddSheet` only (`OptionsDisclosure` takes `showOneOff`/`showSaveAsTemplate`
  booleans, which also control which tiles render; `EditSheet` passes `showSaveAsTemplate={false}`).
  When on, `commit()` builds `{ id, name: description.trim(), category, defaultAmount? }` (amount only
  when > 0) and calls `onSaveTemplate` before saving. Wired in `app.jsx` to `addTemplate` (appends to
  `store.templates`); since transactions are untouched, `useStore` calls `YSync.markSettingsDirty()`
  to sync the new template server-side.

**`TemplateStrip`** (AddSheet only) — horizontal-scroll strip of template tiles above the amount hero;
tapping one pre-fills description + category (+ amount, if the template has a `defaultAmount`) and
clears on any subsequent manual edit to description/category. A "See all" toggle expands the full
`.tilegrid` inline. Empty state (no templates yet) shows a one-line hint instead of a blank strip.
Quick is an accelerator on the one form, not a separate screen — there's no mode flag to preserve.

`EditSheet` mirrors `AddSheet`'s body (amount hero, category disclosure, options disclosure) pre-filled
from `txn`, minus the template strip and Save-as-template toggle; its footer holds Delete + Save
changes.

### `settings.jsx`

The screen is two sections — **Budget settings** and **Data settings** — each a panel of `Row`s.
Footer shows `APP_VERSION` constant (defined at top of IIFE — **update it with every release**,
moves with `CACHE_NAME` in `sw.js`).

**Budget settings** — four rows:
- **Household ceiling** → `CeilingBufferSheet`, a *combined* sheet for the current year that edits
  both `years[y].ceiling` (numeric input) and the missed-entry buffer (0–15% slider with a live
  `projNoBuffer → projection` preview). Saving writes `ceiling` + `buffer` together and drops any
  legacy `target`. (The projection preview is ceiling-independent, so editing the ceiling can't make
  it stale.) The row sub shows `YYYY ceiling · N% buffer`.
- **Past years** → `YearsSheet` (unchanged): tappable year rows drill into a year detail view whose
  ceiling/buffer rows still use the standalone `TargetSheet`/`BufferSheet` (both take a `year` prop).
  "Add year" clones the most recent year's ceiling/buffer into `year+1`; future years with no
  transactions can be deleted. Year list rows show `st.ceiling` + `st.projection` + `DeltaChip`.
- **Fun budget** → `FunBudgetSheet`, a *single* banner covering **all** people (not one row each).
  Value shows the aggregate `stats.funPlanAnnual` as `€X/yr`. Each person gets a monthly-allowance
  input and an independent "Correct balance…" expander (shared `BalanceCorrection` sub-component).
  Save iterates every person: forward-only `rates[]` append/update for the current YYYY-MM (never
  touches past entries, keeps `rates` sorted) and back-calculates `p.balanceAdjustment` from the
  entered target so the displayed balance matches. The `ceiling = main + fun/yr` split is shown at
  the bottom.
- **Travel budget** → `TravelConfigSheet` (unchanged internally): family-wide single allowance on
  `store.travel`; forward-only rate append/update + "Correct balance…" → `travel.balanceAdjustment`.
  Row value shows the aggregate `€X/yr` (latest monthly rate × 12); sub shows the available balance.

**Data settings** — five rows:
- **Quick templates** → `TemplatesSheet` (unchanged).
- **Import** → `ImportMenuSheet`, a submenu of three rows: **Import Revolut** (filled Revolut
  monogram icon), **Import CSV**, and **Import JSON** (triggers the hidden `#jsonfile` restore
  input). The CSV/Revolut rows route via `sub` state (`import-csv` / `import-revolut`) and close back
  to the Import menu, not out. The menu also shows a sample of the JSON backup shape.
- **Export** → `ExportMenuSheet`, a submenu with **Export CSV** and **Export JSON** (call
  `exportCSV`/`backupJSON` then close).
- **Force resync from server** (icon `refresh`) → `YSync.pull({ force: true })` with a before/after
  transaction-count alert.
- **Clear all data** (danger `Row`) → `ClearSheet`.

The Overview-density picker (`DensitySheet`, `store.density`) has been **removed** from the UI
(the density field may still exist in older stores; it's simply no longer editable here).

**JSON backup/restore**: Import JSON calls `YData.migrateStore(parsed)` before `setStore` so old
backups (with `target`, no `people`/`wishlist`) migrate cleanly. Hidden `#jsonfile` input (mounted at
the `SettingsScreen` top level so the Import submenu can trigger it) mirrors the CSV `#csvfile`
pattern.

**"Import Revolut"** row (inside the Import submenu) opens `RevolutImportSheet` — the mobile
in-app counterpart to the desktop `sync.py push` pipeline (see [docs/REVOLUT.md](REVOLUT.md) and the
`POST /api/revolut/ingest` endpoint in [docs/BACKEND.md](BACKEND.md#api-endpoints-srcindexjs)). Flow:
paste the raw Revolut
JSON array (from the bookmarklet or console script) into a textarea → "Preview" `JSON.parse`s it and
runs it through `window.YRevolutImport.buildRows` (the JS port of `revolut_clean.py`), then
`diffRevolutRows` (local helper in `settings.jsx`) diffs the cleaned rows against `store.transactions`
by `id`, mirroring `sync.py`'s preview: **new** (id not in store), **changed** (existing id where
`date`/`description`/`amount_eur` differ — the same `COMPARE` tuple as the Python preview), plus a
grouped **skipped** list (by reason) and a net-€ total (Σ new + Σ changed deltas). "Import" POSTs the
cleaned rows to `POST /api/revolut/ingest` (the field-preserving endpoint — in-app category/fun/note
edits and deletions survive), then calls `YSync.pull({ force: true })` to refresh the local store from
the merged D1 truth, and shows an imported/changed/net-€ summary. Errors (invalid JSON, empty array,
nothing left after filters, network/endpoint failure) render inline and keep the pasted text so the
user can retry — nothing is cleared on failure.

## Supporting files

- `y/icons.jsx` — inline-SVG Lucide-style icon set via `<Icon name=… />`.
- `y/tokens.css` — CSS custom property definitions (all ~25 tokens `app.css` consumes).
- `y/ds.jsx` (`window.ApertureDesignSystem_72a4cd`) — local `Button`, `SegmentedControl`, `Input`,
  `Chip` primitives styled with the tokens. **If adding new DS component usages, update `y/ds.jsx`
  to match the props passed.**
- `y/app.css` — **the styling source of truth** (layout, the mobile device column, the visual
  system), built on Aperture dark tokens. The `.ds-btn`, `.ds-seg`, `.ds-input`, `.ds-chip` classes
  at the bottom style the DS primitives from `y/ds.jsx`. **Font baseline:** `body { font-family:
  var(--sans); }` + `button, input, select, textarea { font-family: inherit; }` ensure the sans font
  flows everywhere; `.sheet-head h3` and `.tx-desc` also carry an explicit `font-family: var(--sans)`.
  Without these, browsers use their UA serif default (Times New Roman) on headings and button
  descendants.
