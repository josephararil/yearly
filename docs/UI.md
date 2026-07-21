# UI layers

Component reference for the screens and shared primitives. CLAUDE.md links here; read it when
touching `ui.jsx`, `fun.jsx`, or a screen module. Engine/state internals are in
[ARCHITECTURE.md](ARCHITECTURE.md). Design tokens and voice rules: `design/BROADSHEET_DESIGN_SPEC.md`.

## `y/ui.jsx` (`window.YUI`) — shared primitives

Exports: `StatusHero`, `CalloutCard`, `TxRow`, `CatIcon`, `DeltaChip`, `Sheet`, `SectionH`,
`Toast`, `TxTag`, and `rich` (renders numbers inside text in the mono `.num` style).

`TxTag({ label, color })` — small pill badge (mono 9px uppercase, tinted background/border from
`color`); used inline by `TxRow` for the Fun/Travel/`×Nmo`/`VIRTUAL` badges and reused directly by
`analysis.jsx`'s Amortized ledger rows (see below).

> The hero is fixed to numerals; the Overview monthly chart is `MonthCurve`, defined locally in
> `home.jsx`.

### `StatusHero`

Three-zone stack (current year shows all three; complete year hides pulse; future year shows
Zone 1 only).

**Zone 1 — Reality block**: eyebrow label (serif mood: "Projected year-end" / "Final spend · Y" /
"Household ceiling · Y"); serif hero number (`stats.projection` or `ceiling`); sans sub-line
(over/under ceiling by €N in terra/sage mono 700, `±€X` band suffix when `bandAmt != null`);
optional `.hero-draw` line ("implies a 3.2% draw · sustainable", mono 12.5px, colored by
`YCalc.drawZone`) — rendered only when `YCalc.impliedDraw(store, stats.projection)` is non-null
(i.e. a portfolio is configured); `StatusHero` takes `store` as a second prop for this;
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

`FunStrip({ fun, store, onOpen })` — compact strip: one hairline row per person (name, all-time
balance in sage/terra, nearest wishlist goal name+pct+thin bar). Defined/exported but currently
unused; the full fun UI lives on the Analysis → Fun tab (`FunTab`).

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

`TravelStrip({ travel, store, onOpen })` — compact indicator: an "Available" headline (large mono
balance, sage/terra), a meta line (`€X/mo · €Y used this month`), and the most recent trip's name.
Defined/exported but currently unused; the full travel UI lives on the Analysis → Travel tab
(`TravelTab`). A one-line "Total travel budget" figure appears in the Overview `InNumbers` "More
context".

`TravelTab({ travel, store, setStore })` — the Analysis workshop:
- One family-wide stats block: Available balance (sage/terra), this-month used with over/under
  indicator, Spent YTD with the uncapped `~€X/yr` projection.
- Trips list, driven by `travel.trips` (from `computeTravel`, already recency-sorted): each trip is a
  collapsible `TripRow` (local `openMap` state). Collapsed: trip name + `eur0(total)`, plus date
  range/location if present. Expanded: `TripBreakdown` — the trip's own catbar-* category rows (fed
  by `trip.catList`) each followed by its transactions — plus Edit and Delete actions. Delete is
  blocked (with a tx-count message) while the trip
  has any transactions, so no orphan travel tx are ever created; only empty trips can be removed.
  "Add trip" opens `TripCreateSheet` (Name required; Location/Start/End optional) for both create and
  edit (edit bumps `updatedAt`).

Internal: `TripCreateSheet`, `TripBreakdown`, `TripRow`, `tripDateRange(trip)`.

Trip *selection* when logging an expense lives in `y/addflow.jsx` (`TripField`, see below).

## `y/plan.jsx` (`window.YPlan`) — the Plan tab

`PlanTab({ store, setStore, stats })`, rendered on Analysis's fourth (last) top pill (`Activity |
Fun | Travel | Plan`). A contained decision notebook — named lifestyle scenarios (packages of
annual-cost "levers") resolving to a deficit and an implied portfolio draw rate, plus the recorded
reasoning behind them. `store.plan` is settings-blob synced (like `trips`) — see
[ARCHITECTURE.md](ARCHITECTURE.md#plan--computescenariocomputescenarioschecktriggers) for the data
shape and the three `YCalc` functions it's built on. **Builder-first layout** (Phase 4): a shared
comparison axis plus an always-visible builder, so the payoff — levers, big numbers, verdict — is on
screen with zero clicks. Regions, top to bottom:

1. **Header strip** — three inline figures: Portfolio and Income (`InlineEditNum`, tap-to-edit,
   commit on blur/Enter), and a read-only **This year implies** draw rate derived from the live
   `stats` prop — the tab's only contact point with live data.
2. **Comparison strip** (`ComparisonStrip`) — one shared 0–5% axis (~72px), faint band tints at
   0–2.0/2.0–3.5/3.5–4.5/4.5–5.0 (terracotta wash only on the last), hairline rules + tick labels at
   2.0/3.5/4.5. Every scenario from `YCalc.computeScenarios` plots as an 8px dot with its name in
   10.5px mono, alternating above/below the axis by sorted-draw index to reduce label collisions;
   draws > 5% clamp to the right edge with a "+" suffix. The **selected** scenario's dot is 12px,
   filled terracotta, full name (no truncation) — and plots the **live sandbox value**, not the
   saved one, so it slides in real time as the builder is edited. While the sandbox is dirty, a
   small hollow ring marks the scenario's last-saved position. Tapping any dot (or its label)
   selects that scenario into the builder below.
3. **The builder** (`ScenarioBuilder`) — always visible, no expansion step, showing the selected
   scenario (default: first pinned, else first row). All lever/override edits are **local sandbox
   state** (`{ leverRefs, baselineOverride, incomeOverride }`, seeded from the saved scenario) —
   they never touch the store until Save.
   - Header row: `InlineEditText` name (applies immediately, not sandboxed) + `PINNED` tag + a
     `<select>` mirroring the axis selection; Pin/Duplicate/`ConfirmDelete` on the row below.
   - **Lever rows**: the whole row (min-height 44px, checkbox + label + mono amount) toggles
     `enabled` on click; disabled rows sit at 45% opacity rather than disappearing. An
     `NullableNumInput` override (84px) appears only on enabled rows. A lever with an optional
     `scale: {min, max, step}` (added via `LeverEditForm`'s three scale fields — additive; the seed
     migration backfills it onto "Extra travel & fun" for existing stores) renders a `<input
     type="range" className="rng">` under the row when enabled, driving `amountOverride` live.
     `AddLeverPicker` (levers not yet in the sandbox) sits at the bottom of the list.
   - **Baseline/income**: one muted mono line — "baseline €X (live ceiling) · income €Y" — each
     figure an inline tap-to-edit `InlineTapNum` (no labeled form boxes).
   - **Result block**: Spend / Deficit (18px mono) and Draw (29px mono, terracotta in band "d") in
     one row, computed via `YCalc.computeScenario(plan, { ...scenario, ...sandbox }, currentCeiling)`
     — no new engine function; the sandbox is merged into a transient scenario object and the
     existing pure function is reused. Underneath, a full-width verdict line (background wash +
     text color keyed by band) in Broadsheet voice: band a "survives any recorded market history",
     b "headroom €X", c "crosses 3.5% below €X", d "not sustainable without income".
   - **Sandbox semantics**: when the sandbox differs from the saved scenario, a quiet dirty row
     appears — "edited · Save · Save as new · Revert". Save writes the sandbox through
     (`updatedAt: Date.now()`); Save as new duplicates the scenario with the sandbox applied plus a
     single "Saved from builder" log entry and selects the copy; Revert reseeds the sandbox from the
     saved scenario. Switching scenarios (axis tap, the header `<select>`, Duplicate) while dirty
     defers via `pendingTarget` state and shows the same three actions plus Cancel; whichever action
     runs, the switch to the target completes afterward (Revert not-writing anything, sandbox
     reseeds naturally once `selectedId` changes).
   - **Notes & log** (`NotesAndLog`) — one collapsed disclosure (`opts-summary`/`opts-body`, closed
     by default) holding the scenario notes (a plain textarea, commits `onBlur`, not sandboxed) and
     the existing `DecisionLog` (dated entries newest-first, add-entry input mints
     `{id, date: localISO(now), text}` and prepends).
4. **"Add scenario"** — a small linklike under the builder; creates a scenario named "New scenario"
   (renamed inline via the builder heading) and selects it in, going through the same dirty-switch
   guard as any other selection change.
5. **Lever library** (`LeverLibrary`) — collapsed by default, header "Levers · N". Expanded: each
   lever (`LeverRow`) shows label, amount, a muted tag row (reversibility · horizon · beneficiary ·
   durability), and notes, with inline Edit (`LeverEditForm`) and delete. Editing a lever's amount
   here updates every scenario that references it without an `amountOverride`, automatically —
   the comparison strip and builder recompute from `plan.levers` on every render. **Delete is
   blocked** (quiet muted explanation, no control) while any scenario's `leverRefs` references the
   lever — same pattern as trip-delete-blocked-while-has-transactions.
6. **Triggers** (`TriggersBlock`) — collapsed by default, header "Triggers · N". Each row
   (`TriggerRow`): label, portfolio floor, action text, inline Edit/`ConfirmDelete`, and a status —
   quiet muted "—" when `plan.portfolio >= floor`, terracotta "breached" otherwise (from
   `YCalc.checkTriggers`). Purely a checklist; no notifications, no callout integration.

`ConfirmDelete` (module-local) is the shared two-step delete control used throughout the tab.

## Screens

- `y/home.jsx` (Overview — hero (`StatusHero`, bar hidden) + the merged metrics block
  (`YAnalysis.InNumbers`) + **one chart with a 5-way switcher** (`MonthCurve` / `ProjectionChart` /
  `MonthlyBarsChart` / `EstimateChart` / `BurnDownChart`).)
- `y/analysis.jsx` (Activity/Fun/Travel/Plan tabs — Activity has Categories/Transactions/Amortized
  sub-tabs; charts are hand-built SVG that double as the Recharts spec. Its "In numbers" block
  renders on the Overview via the exported `YAnalysis.InNumbers`, with a single rotating insight
  card (`InsightCard`) inside `InNumbers` surfacing the "what's happening" summary.)
- `y/settings.jsx` (Budget settings: combined ceiling+buffer / years / fun-budget / travel / portfolio · Data
  settings: templates / Import & Export submenus (CSV · Revolut mobile import · JSON
  backup-restore) / force-resync / clear)
- `y/addflow.jsx` (unified "Log an expense" sheet: amount hero, template accelerator strip, category
  picker, Tags & options disclosure, Edit sheet)

### `analysis.jsx` — `InsightCard` (the rotating "voice" line)

The app's "voice" — one orthogonal, plain-language insight, defined in `analysis.jsx` and rendered
**inside the merged `InNumbers` block on the Overview** (between the primary metric trio and the
90-day trend). It filters `callouts` to
`!["ceiling","buffer","calm","final","future"].includes(c.id)` (the non-redundant-with-the-hero
subset, in `buildCallouts`'s stable value-sorted order), then picks one entry via
`dayIndex % eligible.length` (`dayIndex = Math.floor(Date.now() / 86400000)`) — a deterministic daily
rotation. Renders a severity dot + `YUI.rich(text)` + a `→`, tappable via `onCallout`. Drills that
target `section:"projection"` stay on the Overview; other sections open the matching Analysis tab.
Silent when no callout qualifies. The inline `Fine / Tight / Slow down` chip in the "This month"
header (`pulse-verdict`) is independent of `InsightCard`.

### `home.jsx` — the chart switcher

`HomeScreen` renders **one chart region with a 5-way `SegmentedControl`** (`chartView` state) —
the same principle most apps use (modify the chart in front of you, don't scatter period-charts
across screens). Views: **Month** (`MonthCurve`) · **Year**
(`ProjectionChart` + `ChartLegend` + a "this-year" `ChartExplain`) · **By month** (`MonthlyBarsChart`)
· **Estimate** (`EstimateChart`) · **Burndown** (`BurnDownChart`). The section `<h2>` follows the
active view ("This month" / "This year" / "Monthly breakdown" / "Estimate over time" / "Burn down")
and the `pulse-verdict` chip shows only on the Month view. Default view is **Month** for a live year,
**Year** for a completed/future one (which has no meaningful "this month"). The switcher lives in a
`.chart-nav` wrapper (scoped CSS in `app.css`): full-width & evenly distributed when it fits,
horizontally scrollable with full-size labels when it doesn't — so all five tabs stay readable on a
narrow phone without compressing/clipping any label. All five chart components live in `home.jsx`
(load order: `home` precedes `analysis`, so `ProjectionChart` and `MonthlyBarsChart` must live at or
before `home`), using `ChartExplain` storage keys `this-year` and `monthly-breakdown` so saved
expand/collapse state persists. The bar chart's "Monthly breakdown" section header is supplied by
the switcher.

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

The fourth view — a derivative-flavoured chart of the "holy number" (the projected year-end
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

### `home.jsx` — `BurnDownChart` ("Burn down")

The fifth view — budget **remaining** falling toward €0 instead of spend rising from €0. Driven by
`YCalc.burnDownSeries(stats)` (see [ARCHITECTURE.md](ARCHITECTURE.md#the-brain--ycalcjsx-windowycalc)),
which consumes `stats.upto` (the already amortization-expanded list, so a lump-sum day can't crash
the line). Three series over a day-of-year x-axis (0 → `daysInYear`, leap-safe): **Actual** (solid
terracotta `--chart-actual`, cumulative remaining to today) with a `--chart-actual` gradient
undershade down to the €0 baseline (same fade as the Month/Year area fills); **Target** (faint dashed
`--chart-pace`, the ideal linear pace-down from ceiling to €0); **Projection** (dashed `--chart-proj`
run-rate extension from today's tip to `ceiling − stats.projection` on Dec 31 — anchored to the
engine's canonical year-end figure, *not* a naive rate line, so it never disagrees with the rest of
the app). Two `ToggleChip`s: Target / Projection (Projection hidden for completed years). The y-axis
frames `[min(0, projEnd, actualToday) − pad, ceiling + pad]`; the €0 gridline is drawn stronger, and
when the projection lands below €0 a faint `--terra` **"over ceiling" wedge** fills the sub-zero
stretch of the dashed line so the dip reads as intentional red territory rather than a broken line.
Compact caption above the SVG: remaining now + `▲ €X cushion` (sage) / `▼ €X behind pace` (terra) vs
today's pace point. Crosshair tooltip shows date · Day N, `Remaining €X`, and the signed cushion
(delta = actual − target, sage when positive / terra when negative). `ChartExplain` key: `burn-down`.
Muted fallback for future years (nothing logged yet).

### `analysis.jsx` — `AnalysisScreen`

Receives `fun`, `travel`, `store`, `setStore`, `addTx` in addition to `stats`/`focus`/`onEditTx`;
renders `<YFun.FunTab>` on the "Fun" segment and `<YTravel.TravelTab>` on the "Travel" segment.
**Four** top-level segments: **Activity, Fun, Travel, Plan** (the merged metrics block lives on the
Overview — see `InNumbers` below). Default tab is **Activity**.
**Activity** is `ActivityMergedTab`, which owns its own sub-tab state (`activitySubtab`, lifted into
`AnalysisScreen` so focus-routing can drive it) and renders a second `SegmentedControl` — Categories /
Transactions / Amortized. Focus routing: `"categories"` → Activity/Categories (with `focusCategory`),
`"activity"` → Activity/Transactions, `"fun"` → Fun, `"travel"` → Travel; `App.onCallout` routes
`"projection"` drills to the Overview rather than here. The Transactions sub-tab's "show only"
filters include Fun and Travel.

**ProjectionChart** and **MonthlyBarsChart** — the "This year" line chart and "Monthly breakdown"
bar chart live in `home.jsx` and render only through the Overview chart switcher (see the
`home.jsx` sections above), with interactive crosshair/tooltip, `ToggleChip` series toggles, `maxY`
scaling, `--chart-proj` uncertainty band, and `LegendItem`/`ChartLegend` swatches.

**`YUI.ChartExplain`** — shared collapsible component (`ui.jsx`) rendering the line-by-line "colored
dot + label + description" legend used below each Overview chart: `MonthCurve` (`month-curve`),
`ProjectionChart` (`this-year`), `MonthlyBarsChart` (`monthly-breakdown`), and `EstimateChart`
(`estimate-history`). Takes `{ storageKey, items }`; toggled via a "What's this?" button (chevron +
label) and persists its open/closed state to `localStorage['yearly:explain:' + storageKey]` (defaults
to open when unset) so each chart remembers its own collapsed/expanded state across reloads
independent of the others.

**`InNumbers`** — the merged metrics block, defined in `analysis.jsx`, **exported as
`YAnalysis.InNumbers` and rendered on the Overview** (`home.jsx`, directly under the hero, above the
chart switcher). It is a single `.innum` flex column establishing a **visual hierarchy** rather than
a uniform grid (dashboard classes in `app.css`, marked "Analysis · In numbers dashboard"). Props:
`stats`, `store`, `travel`, `callouts`, `onCallout`. No box/card chrome — grouping is proximity +
hairlines. No `section-h` title and no full callouts list. Two pure helpers back it, exported from `calc.jsx`: `medianDailySpendYTD(stats)` (median of
per-day totals across every elapsed calendar day, incl. €0 days) and
`historicalMonthRange(store, excludeYm)` (all-time min/max calendar-month total; `excludeYm` is the
*real* current in-progress month via `new Date()`).

Top-to-bottom the block is:

1. **`ProjectionBar`** — the **prominent 12px bullet bar** (`.projbar`, not the thin home
   `.bullet-*`). The over/under headline itself lives in the Overview `StatusHero` above; this is
   just the bar: a solid fill to `spent`, a faded (opacity .3) projection remainder to `projection`,
   a hard black ceiling tick (`.projbar-ceil`), a day-of-year pace marker (`.projbar-doy`), and
   `spent`/`ceiling`/`proj` labels. Fill is terra when `projection > ceiling` else sage, so "over" is
   obvious the instant the fill crosses the ceiling tick. Renders nothing for future years.
2. **Primary metric trio** (`.metricrow` — 2–3 equal columns, hairline top/bottom, mono figures):
   Spent YTD (+ entry count), Daily spend (`dailyRate`, median sub, hidden future), Blended rate
   (`trailingDailyRate` + `+€X buffer · Y%` sub, or "YTD avg" once complete).
3. **`InsightCard`** — the rotating one-per-day insight (see its own section above), between the trio
   and the trend.
4. **90-day trend** (`.trend-head` + `Trend90Chart`) — current-year with ≥90 days of data; label +
   coloured verdict, then the sparkline rendered **flush to the container edges**.
5. **Current velocity** (`.innum-group`, current year only) — one card: serif primary =
   `stats.pace`, then `.velo-line`
   rows for Adjusted monthly cap (`neededMonthlyCap`, sage/terra vs `avgMonthly`), Daily room/target
   (`(ceiling − (spent + bufferAmt)) / daysRemaining`, floored 0 — local to `analysis.jsx`), Daily
   target this month (`(neededMonthly − spentThisMonth) / daysLeftInMonth`, floored 0), and Target
   fun / person.
6. **Collapsible "More context"** (`.innum-toggle` button + `.innum-more`, **default collapsed**) —
   the toggle (chevron + label + a hairline rule filling the row) shows/hides everything below it.
   Rendered only when there is content (`hasMore`). Expanded it holds:
   - a `.factlist` of secondary facts, each conditional: Projected month-end (`projectedMonthEnd`,
     current year), Average per month, Monthly range (`historicalMonthRange`, excludes `t.virtual`),
     Monthly baseline (`ceiling/12`, only when *not* current), **Total fun budget** (`funPlanAnnual`),
     **Total travel budget** (`travel.monthlyRate × 12`, mirrors the fun row; hidden future),
     vs prior year (`stats.priorSpent > 0`, watch/good coloured);
   - the **FIRE portfolio target** `.fire` widget (hidden future) — 4% (`projection/0.04`), 3.5%
     (`projection/0.035`), 3.5% with income (`max(0, projection − externalIncome)/0.035`);
   - the **Amortization** section (below).

`StatCard` is used by `AmortizedTab` but not `InNumbers`.

**"Amortization" block** — nested inside the collapsible "More context", rendered only when
`YCalc.amortizationBreakdown(store, stats.year, stats.asOfStr).hasAmortized` is true and the year
isn't future (`am` is computed once per render, local `const am = ...`). The figures are a compact
`.factlist` (Amortized YTD with a "% of spend" cap-meta, Real (cash), Virtual (no-cash, `--sage`),
plus This month and Committed rest-of-year for the current year).

Below the cards, `AmortizationChart` — a local `SegmentedControl` (`Composition` / `By month` / `By
year`, default Composition) swapping between three small inline-SVG charts, all sharing the
`MonthlyBarsChart` pointer-hover idiom (crosshair line + a `--paper`/`--hair-strong` tooltip box
via a shared `AmTooltip` helper so it never clips at the edges). Color encoding is consistent across
all three: non-amortized/neutral = `--muted`, real = `--chart-actual` (terracotta), virtual =
`--sage`; not-yet-elapsed months/years are faded (lower opacity). `AmTooltip` has two modes: a
compact single-value box (`AmComposition`'s per-segment hover) and, when `hover.real` is present
(`AmByMonth`/`AmByYear`), a taller box breaking out **Real** / **Virtual** / **Total** (bold,
`--ink`) each colored to match, plus the period label on top.
- **`AmComposition`** — one horizontal stacked bar of YTD spend: non-amortized (`stats.spent −
  am.ytd.total`) · real · virtual. Hovering a segment highlights it and shows its label + €.
- **`AmByMonth`** — 12 bars (`am.byMonth[m].real + .virtual` stacked, elapsed solid / future
  faded); x-axis shows month numbers (`1`..`12`). A default-off `AmToggleChip` ("As purchased
  (raw)", mirrors `home.jsx`'s `ToggleChip` pill idiom) reveals a faint dashed overlay tracing
  `am.byMonth[m].rawPurchased` — the un-smoothed spend as it actually posted that month. The y-axis
  max excludes `rawPurchased` while the toggle is off, so the (often much larger, e.g. a lump-sum
  purchase) raw spike doesn't squash the monthly bars; toggling on re-includes it in the axis scale
  and draws the overlay.
- **`AmByYear`** — one stacked bar per `am.byYear` entry (all years any amortized slice touches,
  not just `stats.year`); the current year is bold/full-opacity, future years faded. This is the
  per-year future-allocation view (e.g. a multi-year amortization spilling well past the viewed
  year).

**CategoriesTab** catbar rows use `CatIcon` (24px, radius 6); expanding a category shows two
sub-lists: "Recent in [category]" (last 5 by date, reversed) and "Largest in [category]" (top 5 by
`amount_eur` descending), both using `TxRow` with `onClick → onEditTx`. Both sub-lists source raw
`YCalc.yearTxns(store, stats.year)` (filtered to `date <= stats.asOfStr`), **not** the expanded
`stats.upto` — an amortized parent's drill entry shows the full amount, not a monthly slice.
**TransactionsTab** — lists **all** raw transactions for the year (same `yearTxns(store,
stats.year)` source, not `stats.txns`), including fun-tagged ones; fun tx show the person's name as
a tag. Filters are hidden behind a compact `sliders` icon button to the
right of the search bar; when active filters exist, a terracotta badge shows the count. Tapping the
button toggles an inline filter panel with three sections: **Category** (All + one chip per category
in `stats.catList`), **Sort** (6 options: Newest · Oldest · € High · € Low · A→Z · Z→A — default
Newest), and **Show only** — three boolean toggles: **Manual** (keeps only `t.source === "manual"`),
**Fun** (keeps only `t.fun === true`), and **Travel** (keeps only `t.travel === true`). Active
filters use `--terra` border/background; the filter button itself turns terracotta when any filter
is active.

**`AmortizedTab`** — the third Activity sub-tab (`ActivityMergedTab`'s `SegmentedControl` is
**Categories / Transactions / Amortized**), a read-only ledger of RAW amortized parents (never
slices — same invariant as everywhere else) sourced from
`YCalc.amortizationBreakdown(store, stats.year, stats.asOfStr).parents`, which is already scoped by
schedule-overlap so a long amortization purchased in a prior year still appears. Empty state ("No
amortized transactions this year.") when `!am.hasAmortized`. A compact summary `.statgrid` up top:
outstanding **real** and outstanding **virtual** (`am.totals`) and a count of active amortizations.
Below it, two `.eyebrow`-labeled sections — **Real (cash)** and **Virtual (no-cash)**
(`AmortSection`, each with its own €-subtotal, hidden entirely when empty) — each listing one
`AmortParentRow` per parent:
- `CatIcon` + description + `eurAuto(amount_eur)` total + a `TxTag` (`×Nmo`, prefixed `VIRTUAL` for
  no-cash parents).
- A schedule progress bar (`.catbar-track`/`.catbar-fill`, width = `elapsedMonths / amortize_months`
  ×100%, fill `--chart-actual` for real / `--sage` for virtual).
- A mono muted sub line: `€X/mo · startYm→endYm` and `€Y remaining · Z mo left`, stacked as two
  full-width lines (inline `flexDirection: column` override on the shared `.catbar-sub` class, which
  is otherwise a single flex row shared with the Categories/Fun/Travel tabs — kept unchanged there).
- The whole row is a button — tapping it looks the parent back up in `store.transactions` by `id`
  and calls `onEditTx`, reusing the existing edit sheet (the parent is a real, editable store tx).

### `addflow.jsx`

One unified form shared by `AddSheet` and `EditSheet` — there is no Quick/Manual mode split. Body
order top → bottom: `TemplateStrip` (AddSheet only) →
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
date box. The **Note** textarea
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
- **Travel budget** — family-wide (no owner picker), and requires a specific trip: when on,
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

**Budget settings** — five rows:
- **Household ceiling** → `CeilingBufferSheet`, a *combined* sheet for the current year that edits
  both `years[y].ceiling` (numeric input) and the missed-entry buffer (0–15% slider with a live
  `projNoBuffer → projection` preview). Saving writes `ceiling` + `buffer` together and drops any
  legacy `target`. (The projection preview is ceiling-independent, so editing the ceiling can't make
  it stale.) The row sub shows `YYYY ceiling · N% buffer`.
- **Past years** → `YearsSheet`: tappable year rows drill into a year detail view whose
  ceiling/buffer rows use the standalone `TargetSheet`/`BufferSheet` (both take a `year` prop).
  "Add year" clones the most recent year's ceiling/buffer into `year+1`; future years with no
  transactions can be deleted. Year list rows show `st.ceiling` + `st.projection` + `DeltaChip`.
- **Fun budget** → `FunBudgetSheet`, a *single* banner covering **all** people (not one row each).
  Value shows the aggregate `stats.funPlanAnnual` as `€X/yr`. Each person gets a monthly-allowance
  input and an independent "Correct balance…" expander (shared `BalanceCorrection` sub-component).
  Save iterates every person: forward-only `rates[]` append/update for the current YYYY-MM (never
  touches past entries, keeps `rates` sorted) and back-calculates `p.balanceAdjustment` from the
  entered target so the displayed balance matches. The `ceiling = main + fun/yr` split is shown at
  the bottom.
- **Travel budget** → `TravelConfigSheet`: family-wide single allowance on
  `store.travel`; forward-only rate append/update + "Correct balance…" → `travel.balanceAdjustment`.
  Row value shows the aggregate `€X/yr` (latest monthly rate × 12); sub shows the available balance.
- **Portfolio & draw rate** → `PortfolioSheet`: two numeric fields (`store.portfolio`,
  `store.externalIncome`) with a live draw-rate preview (`YCalc.drawZone`-colored). Save writes
  `undefined` when a field is blank/zero (so the settings blob stays clean and the feature goes
  dormant). Row value shows the current implied draw as `X.X%` (omitted when no portfolio is set).

**Data settings** — five rows:
- **Quick templates** → `TemplatesSheet`.
- **Import** → `ImportMenuSheet`, a submenu of three rows: **Import Revolut** (filled Revolut
  monogram icon), **Import CSV**, and **Import JSON** (triggers the hidden `#jsonfile` restore
  input). The CSV/Revolut rows route via `sub` state (`import-csv` / `import-revolut`) and close back
  to the Import menu, not out. The menu also shows a sample of the JSON backup shape.
- **Export** → `ExportMenuSheet`, a submenu with **Export CSV** and **Export JSON** (call
  `exportCSV`/`backupJSON` then close).
- **Force resync from server** (icon `refresh`) → `YSync.pull({ force: true })` with a before/after
  transaction-count alert.
- **Clear all data** (danger `Row`) → `ClearSheet`.

There is no Overview-density picker in the UI; `store.density` may still exist in older stores but
is not editable here.

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
