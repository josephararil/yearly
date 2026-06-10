# Broadsheet restyle log

This file is the verbatim session-by-session restyle log moved from `CLAUDE.md` to keep
the main file concise. See `design/BROADSHEET_DESIGN_SPEC.md` for the authoritative spec.

---

The app was reskinned from the old Aperture **dark** theme to **Broadsheet** — an
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
