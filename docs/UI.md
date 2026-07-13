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

- `y/home.jsx` (Overview — hero + `VoiceLine` + FunStrip + TravelStrip + `MonthCurve` monthly chart)
- `y/analysis.jsx` (Projection/Categories/Activity/Fun/Travel tabs; charts are hand-built SVG that
  double as the Recharts spec)
- `y/settings.jsx` (ceiling/buffer/years/fun-budget/density/templates/CSV import-export/JSON
  backup-restore/clear)
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

### `analysis.jsx` — `AnalysisScreen`

Receives `fun`, `travel`, `store`, `setStore`, `addTx` in addition to `stats`/`focus`/`onEditTx`;
renders `<YFun.FunTab>` on the "Fun" segment and `<YTravel.TravelTab>` on the "Travel" segment.
Focus routing: `"categories"` → Categories, `"projection"` → Projection, `"activity"` → Activity,
`"fun"` → Fun, `"travel"` → Travel. The Activity tab's "show only" filters include Fun and Travel.

**ProjectionChart** — H=252, interactive: pointer/touch events (pointer move + down, leave, up,
cancel) show a vertical crosshair with a floating tooltip (€ value + month/day label); on the
projected portion the tooltip dot switches to `--chart-proj`. `ToggleChip` component (defined above
`ProjectionChart` in the IIFE) renders small toggle buttons that show/hide individual series — Pace,
Projection (incomplete year only), Ceiling, and prior-year (when `priorCum` is present). `maxY`
scales to `max(mainTarget, ceiling, projection, priorMax, projHigh) × 1.1`. When `stats.projLow !=
null` and Projection is on, a semi-transparent triangular band (vertices: today→projHigh year-end→
projLow year-end, `--chart-proj` at 10% opacity) is drawn beneath the dashed line; `ChartLegend`
shows a "Range" rect swatch for it.

**MonthlyBarsChart** — interactive bar chart below the line chart in `ProjectionTab`. One bar per
calendar month (terra, full opacity for complete months; 55% opacity for the current partial month;
absent for future months). Three toggleable reference lines via `ToggleChip`s (reused from
`ProjectionChart`): monthly average (`--chart-pace` dashed, label at left), peak month (`--amber`
dotted, only when > avg × 1.1, label at right), and — for incomplete current years — the
`neededMonthlyCap`-based required monthly average (`max(0, mainTarget − spentBeforeCurrentMonth) /
(12 − curMonth)`, `--chart-proj` dashed, drawn from the current-month slot forward, label at right).
Each reference line carries an inline text label showing its value (e.g. "avg €1.9k", "peak €2.3k",
"needed €1.7k"). Pointer/touch events show a vertical crosshair, a dot anchored to the hovered bar
(or the needed/mo line for future months), and a floating tooltip with the month name and amount;
future-month tooltips add an "est. needed/mo" sub-label. Hovered bar gets full opacity + stroke
highlight; hovered month label bolds. Hidden for future years. `LegendItem` helper renders bar and
line swatches; defined in the same IIFE above `MonthlyBarsChart`. The verbose line-by-line legend
below it uses `YUI.ChartExplain` (see below), as does the "This year" chart's legend in
`ProjectionTab`.

**`YUI.ChartExplain`** — shared collapsible component (`ui.jsx`) rendering the line-by-line "colored
dot + label + description" legend used below `MonthCurve`, `ProjectionChart` ("This year"), and
`MonthlyBarsChart` ("Monthly breakdown"). Takes `{ storageKey, items }`; toggled via a "What's
this?" button (chevron + label) and persists its open/closed state to
`localStorage['yearly:explain:' + storageKey]` (defaults to open when unset) so each of the three
charts remembers its own collapsed/expanded state across reloads independent of the other two.

**"What's happening" section** (`ProjectionTab`) — callouts from `buildCallouts` rendered between
`MonthlyBarsChart` and "In numbers". Shows all callouts (no density filtering). Receives `callouts`
and `onCallout` props threaded from `AnalysisScreen` → `App`. Clicking a callout still drills to the
appropriate tab via `onCallout`. Hidden when `callouts` is empty.

**"In numbers" section** (`ProjectionTab`) — appears below "What's happening" with a `section-h`
title. Receives `fun` and `store` props (passed from `AnalysisScreen`). Stat cards present:
- Spent YTD, On-pace by today, Blended rate, Buffer adds (existing).
- **Avg spend/mo** (average over completed months) + sub-line "need ≤€X/mo" coloured sage/terra;
  `neededMonthly = max(0, ceiling − spent) / monthsRemaining`. Hidden for future years / no data.
- **90d trend** — compares last-45d daily rate to prior-45d rate; `↑ Increasing` (terra), `↓
  Decreasing` (sage), or `→ Constant`. Only shown for current year with ≥ 90 days of data.
- **Total fun budget** — `funPlanAnnual` per year with per-month sub.
- **Target fun/mo** — `max(0, ceiling − stats.projection) / monthsLeft / numPeople` where
  `monthsLeft = max(1, daysRemaining / 30.4)`; sage when positive, terra when 0 (`projection ≥
  ceiling`). Current year only.
- **FIRE portfolio** — `stats.projection / 0.04`; "at 4% rule" sub. Not shown for future years.
- vs prior year same point, To finish on target (existing, conditional).

Removed: "Projected finish" and "VS Target" cards (both surfaced on the Overview hero).

**CategoriesTab** catbar rows use `CatIcon` (24px, radius 6); expanding a category shows two
sub-lists: "Recent in [category]" (last 5 by date, reversed) and "Largest in [category]" (top 5 by
`amount_eur` descending), both using `TxRow` with `onClick → onEditTx`. **ActivityTab** — lists **all** transactions (`stats.txns`, including fun-tagged ones); fun tx
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
`AmountHero` → `CategoryField` → Description → Note → Date → `OptionsDisclosure`. `Sheet` (`ui.jsx`)
takes an optional `footer` prop rendered as a flex sibling below `.sheet-scroll` (not an overlay —
`.sheet` is `display:flex; flex-direction:column`, so the footer takes its own row and the scroll area
shrinks to fit via `flex:1; min-height:0`); both `AddSheet` and `EditSheet` pass their primary CTA row
as `footer` so it stays pinned while the form scrolls underneath.

**`AmountHero` + `NumPad`** — the single amount UI in the app (no separate manual text input). Big
serif-adjacent display (€ + `.num`, dims to a placeholder "0.00" when empty) driven by a 3-col `NumPad`
grid (1–9, ".", "0", "00", plus a full-width backspace row). Backspace: tap deletes one char,
long-press (500ms) clears to zero; touch handlers call `preventDefault()` to suppress the synthetic
mouse events mobile browsers fire after `touchend`, avoiding a double-delete. The display formats the
integer part with thousands separators (`formatAmountDisplay`); the raw value stays a plain numeric
string for `tx.amount`. Decimal input is capped to 2 places and the "." key disables once a decimal
point exists.

**`CategoryField`** — collapsed "CATEGORY — ● label" summary row that expands inline to
`CategoryPicker`, a wrap-flow of auto-width chips (not a fixed grid). `CategoryPicker` sorts the
selected category plus the 3 most-recently-used categories (scanned from `store.transactions`, newest
first) to the front, canonical order for the rest; it's exported on `window.YAdd` and also used by
`settings.jsx`'s template editor (which must pass `store` for the recency ordering to do anything).

**`OptionsDisclosure`** — collapsed "Tags & options" row showing mono chips for any active flag (FUN ·
TRAVEL · ONE-OFF · TEMPLATE); expands to a row of icon tiles (`.opt-tiles`/`.opt-tile`, one per flag —
entertainment/travel/calendar/layers icons), each toggled by tapping the tile (active state = terra
border/tint + a small check badge, no separate switch control). Captions for whichever tiles are
active stack below the row (`.opt-details`), each stating the consequence:
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
  the blended rate while keeping it in `spent`.
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

Footer shows `APP_VERSION` constant (`'v62'` currently, defined at top of IIFE — **update it with
every release**). `TargetSheet` (now labelled "Household ceiling") and `BufferSheet` accept a `year`
prop (defaults to `store.currentYear`); `TargetSheet` reads/writes `years[y].ceiling`. `BufferSheet`
computes its own stats internally (unchanged). `YearsSheet` has tappable year rows that drill into a
year detail view (ceiling + buffer rows), plus an "Add year" button that clones the most recent
year's ceiling/buffer into `year+1`. Future years with no transactions can be deleted from the
detail view. Year list rows show `st.ceiling` + `st.projection` + `DeltaChip(st.delta, st.status)`.

**"Fun budget" section** — one `Row` per person opens `FunConfigSheet`, which sets the person's
monthly rate for the current YYYY-MM (forward-only: appends/updates a `rates[]` entry, never
modifies past entries, keeps `rates` sorted) and optionally corrects the balance: "Correct
balance…" toggle reveals a "Set balance to €X" input that back-calculates and stores
`p.balanceAdjustment` so the displayed balance equals the entered value, with future accruals and
spending applied on top. The derived split is shown inline: `ceiling = main + fun/yr`.

**"Travel budget" section** — one `Row` (icon `travel`) showing the current `€X/mo` allowance and
the available balance, opening `TravelConfigSheet`. It works exactly like `FunConfigSheet` but on
`store.travel` (family-wide, single allowance): forward-only rate append/update for the current
YYYY-MM, plus the same "Correct balance…" → `travel.balanceAdjustment` back-calculation.

`DensitySheet` — a picker for Overview density (minimal/balanced/all); writes to `store.density`.

**JSON backup/restore**: "Restore (JSON)" calls `YData.migrateStore(parsed)` before `setStore` so
old backups (with `target`, no `people`/`wishlist`) migrate cleanly. Hidden `#jsonfile` input mirrors
the CSV `#csvfile` pattern. **"Sync now"** row in the Data section calls `YSync.pull()` on demand
(shows "Syncing…" while in flight). "Restore sample data" has been removed.

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
