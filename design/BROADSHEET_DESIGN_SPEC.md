# Yearly — "Broadsheet" Visual Restyle Spec

A complete, codebase-agnostic specification for restyling the **Yearly** budgeting
PWA into the **Broadsheet** aesthetic. Hand this file — together with the runnable
reference in `reference/` — to Claude Code working inside your actual repository.

> **This is a reskin, not a rebuild.** Do **not** change app logic, the projection
> math, the callout engine, the data model, routing, persistence, or any feature you
> added since the original. You are replacing the *visual layer only*: design tokens,
> typography, the styling of existing components, and the layout language. If a change
> would alter behavior or data, it is out of scope.

---

## 0. What "Broadsheet" is

Editorial calm, like a beautifully set financial almanac. Content sits **directly on
warm paper** separated by **hairline rules** — not trapped in grey cards. An elegant
**serif** carries the numbers that matter; **monospace** carries every other figure and
label; a clean **grotesk** handles UI and body. One confident **terracotta** accent,
used sparingly. Whitespace is the design.

**The projected number is set in ink, not red.** It informs without alarming. Over/under
is carried by a tiny terracotta figure beside it, and by small severity dots on the
callouts. Red never floods the screen.

**Ground truth:** open `reference/broadsheet.html` (it runs as-is — plain `<script>`
tags, no build step). The component source is `reference/lb-a.jsx` (the Overview screen)
and `reference/lb-data.jsx` (the themeable Recharts chart). Match it pixel-for-pixel.

---

## 1. Design tokens (exact)

All values are in `reference/tokens.css` as CSS variables. Express them in whatever your
repo already uses (Tailwind `theme.extend`, CSS `:root`, a JS theme object) — **Phase 0
below decides which**. Do not invent values outside this set.

### Surfaces
| Token | Value | Use |
|---|---|---|
| `paper` | `#F4F1E8` | page background (warm paper — **never** pure white) |
| `ink` | `#221F19` | primary text + display numbers (near-black — **never** `#000`) |
| `ink-2` | `#5B5547` | secondary text (hero subline, body emphasis) |
| `muted` | `#8D846F` | tertiary: eyebrows, meta, axis labels |
| `hair` | `rgba(34,28,18,0.13)` | hairline rules, dividers, light borders |
| `hair-strong` | `rgba(34,28,18,0.28)` | the 1.5px rule under section headers |

### Accent + state (sparingly)
| Token | Value | Use |
|---|---|---|
| `terra` | `#BE4A30` | the one accent: active nav, links, key inline numbers, alert/mover dots |
| `amber` | `#C0852B` | "watch" severity dot |
| `sage` | `#5E7C54` | "good" / under-target severity dot |

### Chart palette
| Token | Value |
|---|---|
| `chart-actual` | `#BE4A30` (cumulative actual line + area stroke) |
| `chart-proj` | `#B98E6A` (dashed projection line) |
| `chart-target` | `#8D846F` (dashed target reference) |
| `chart-pace` | `#B6AD95` (faint linear-pace diagonal) |
| `chart-grid` | `rgba(34,28,18,0.10)` |
| `chart-axis` | `#9A9176` (tick labels, mono) |
| area gradient | actual color, top stop opacity `0.22` → bottom `0` |

---

## 2. Typography — the heart of the look

Three families, no more. Add them via Google Fonts or self-host:

```
Newsreader      — opsz 6..72, weights 300, 400, 500 (+ optional italic 300/400)
Hanken Grotesk  — weights 400, 500, 600, 700
JetBrains Mono  — weights 400, 500, 700
```

**Role assignment is strict:**

| Family | Role | Examples |
|---|---|---|
| **Newsreader** (serif) | Display numbers + section headers | the €24,760 hero, "What's happening", "Spend curve", the wordmark "Yearly" |
| **JetBrains Mono** (mono) | **Every** figure, label, eyebrow, axis tick, meta | "€10,420 spent", "day 158 / 365", "PROJECTED YEAR-END", "3 NOTES", "2026 ▾", inline numbers inside sentences |
| **Hanken Grotesk** (sans) | UI + body prose | callout sentences, button labels, form fields, the non-numeric words |

> **The rule that makes it cohere:** numbers are never set in the sans. The hero number
> is serif; **all other figures are mono.** Wrap every inline number in a small `Num`
> helper (a `<span>` with `font-family: var(--mono); font-weight: 500`). Emphasis numbers
> (the over/under, a "+60%") use mono weight 700 in `terra`.

### Type scale (from the reference)
| Element | Font / weight / size / tracking |
|---|---|
| Wordmark "Yearly" | serif 500 · 21px · −0.01em |
| Year pill "2026 ▾" | mono · 12.5px · letter-spacing 0.12em · `muted` |
| Eyebrow "PROJECTED YEAR-END" | mono · 11.5px · 0.2em · uppercase · `muted` |
| **Hero number** | serif **300** · **76px** · line-height 0.98 · −0.03em · `ink` |
| Hero subline | sans · 15px · `ink-2`; the "€760" → mono 700 `terra` |
| Pace labels | mono · 11px · `muted` |
| Section header | serif 500 · 23px · `ink`, with a 1.5px `ink` bottom rule, 8px pad |
| Section count "3 NOTES" | mono · 11px · 0.1em · `muted` |
| Callout body | sans · 15px · line-height 1.5 · `#3B352A`; numbers mono 500 |
| Chart title | serif 500 · 17px |
| Nav active "Overview" | mono 700 · 12.5px · `ink` + 2×22px `terra` underline |
| Nav inactive | mono · 12.5px · `muted` |

Screen horizontal padding: **26px**. `text-wrap: pretty` on paragraphs, `balance` on headers.

---

## 3. Component recipes

Restyle your **existing** components to these recipes. Names below are descriptive; map
them to whatever your components are actually called.

### 3.1 Screen shell
- Background `paper`, full mobile column (keep your existing max-width ~430–440px,
  centered, iOS safe-area padding). No device bezel inside the app — that's only in the
  reference harness.
- Top bar: wordmark "Yearly" (serif 500) left; year pill (mono, `muted`, with a "▾") right.
  No filled bar, no shadow — just content on paper. (Settings entry: keep your existing
  gear, styled as a mono/`muted` glyph.)

### 3.2 Status hero — **no card, no box**
```
[eyebrow: PROJECTED YEAR-END]        (mono, muted, 0.2em)
€24,760                              (serif 300, 76px, INK — not red)
Over your €24,000 target by €760.    (sans 15px ink-2; "€760" mono 700 terra)
[pace rule]                          (see below)
€10,420 spent            day 158 / 365   (mono 11px muted, space-between)
```
**Pace rule:** a 3px full-width track in `hair` (rounded). A `terra` fill from 0 to
`spent/target` width. A 1.5×11px `ink` vertical marker at the `dayOfYear/365` position
(the "on-pace today" point).

> If the year is **under** target, the emphasis number and any "under" wording use
> `sage`, not `terra`. Keep the hero number itself `ink` in all states.

### 3.3 Callouts — hairline list items, **never filled cards**
Each callout is a row:
```
●  Pace runs €110/day; holding €99/day from here finishes you on target.   →
```
- Layout: `display:flex; gap:13px; padding:16px 0; border-bottom:1px solid hair`.
- **Severity dot:** 7px circle, `margin-top:7px`, color = `amber` (watch) / `terra`
  (alert/mover) / `sage` (good/info). This is the only severity signal — no tags needed
  on calm notes; keep an optional tiny uppercase mono tag ("WATCH") only for watch/alert
  if your engine flags them.
- Text: sans 15px `#3B352A`, line-height 1.5; inline numbers in mono (key ones in `terra`).
- Trailing affordance: a serif "→" in a faded ink (`#BDB39A`), top-aligned. Whole row is
  the tap target → drills into Analysis (keep your existing drill logic).
- Section header above: serif 500 23px "What's happening" + a **1.5px ink bottom rule**,
  with "N NOTES" (mono, muted) right-aligned on the same baseline.

### 3.4 Recent / transaction rows — hairline list
- Per row: optional small category **color dot** (not an icon chip), merchant name in
  sans 500 `ink`, date · category in mono `muted` below, amount in mono `ink` right-aligned.
- `border-bottom: 1px solid hair`; last row none. No card around the list (or at most a
  flat paper area separated by rules). Tap → your existing edit sheet.

### 3.5 Bottom nav — editorial, not a FAB blob
Three zones (`grid 1fr 1fr 1fr`, `border-top: 1px solid hair`, no fill):
- **Overview** (active): mono 700 `ink` + a 2×22px `terra` underline beneath, centered.
- **Center "+":** a 44px circle with a **1.5px terra outline** (transparent fill), the
  "+" in serif 300 24px `terra`. Calm, not a glowing filled button. (Keep it opening your
  existing Add sheet.)
- **Analysis** (inactive): mono 12.5px `muted`.

### 3.6 Buttons / chips / inputs (for Add, Settings, Import)
- **Primary button:** `terra` fill, `paper`-white text, fully pill, sans 600. Hover: −1px lift.
- **Secondary button:** transparent, 1px `hair` border, `ink` text, pill.
- **Chips (filters):** pill, 1px `hair`; active = `ink` fill + `paper` text (one tasteful inversion).
- **Inputs:** transparent/paper fill, 1px `hair` border, 12–13px radius, `ink` text;
  focus border → `terra`. Labels mono 11px uppercase `muted`. Amount fields use mono.
- **Bottom sheets:** paper surface, 28px top radius, a `hair` grabber, slide up over a
  scrim of `rgba(34,28,18,0.35)` + slight blur. (Keep your existing sheet mechanics; if
  you animate open, toggle the class via a timeout/transitionend, and guard motion with
  `prefers-reduced-motion`.)

### 3.7 Forms with iconography
Category selection uses **calm color dots** + label, not colored icon **chips**. Keep
your category color values but render them as a small dot, not a filled rounded square.
(If you decide you miss icons, use thin line icons in `ink` at ~70% opacity — never
filled multicolor tiles.)

---

## 4. Chart spec (Recharts — keep it)

Recharts works once `prop-types` is loaded before the Recharts UMD (see the reference's
`<head>`). If you're on a bundler, `import { ... } from "recharts"` — no shim needed.
`reference/lb-data.jsx` is the exact, themeable implementation. The Overview "Spend curve"
and the Analysis projection chart share it.

**Cumulative spend-vs-pace chart:**
- `ComposedChart`, X = day-of-year (or month index) 0→year-end, Y = € `[0, max(target, projection)×1.08]`.
- **Actual:** `<Area type="monotone">`, stroke `chart-actual` 2.6px, fill = a vertical
  `linearGradient` of the actual color (top stop opacity `0.22` → bottom `0`). Up to today.
- **Projection:** `<Line type="monotone">`, stroke `chart-proj`, **dashed** `6 5`, 2.2px,
  from today → projected year-end. `connectNulls:false` so it starts where actual ends.
- **Target:** `<ReferenceLine y={target}>`, stroke `chart-target`, dashed `4 4`, label
  "target €24k" (mono, `chart-target`, top-right).
- **Pace:** faint `<Line type="linear" dataKey="pace">`, stroke `chart-pace`, dashed `2 4`,
  1px, opacity 0.6 (the linear ideal).
- **Axes:** `tickLine:false`, X axis line in `chart-grid`, Y axis line hidden; tick labels
  mono 10px `chart-axis`; horizontal `CartesianGrid` only, `chart-grid`; Y ticks `[0, 12k, 24k]`
  formatted `€Nk`.
- **Disable mount animation** (`isAnimationActive={false}`) — it reads as static/instant,
  which suits the editorial tone and avoids reveal flashes.
- **Category mix (Analysis):** a `PieChart` donut (innerRadius ~0.32R, outerRadius ~0.48R,
  `paddingAngle:2`, no stroke) using your category colors, paired with a mono legend
  (dot + name + %). See `CatDonut` in `lb-data.jsx`.

---

## 5. DOs and DON'Ts

**DO**
- Centralize tokens first; every component reads from them (Phase 0).
- Set the hero number in serif `ink`; let a tiny mono `terra`/`sage` figure carry over/under.
- Wrap **every** inline number in the mono `Num` helper.
- Separate content with **hairline rules and whitespace**, not cards.
- Use exactly three fonts, in their assigned roles.
- Keep all existing logic, routes, data, and features untouched.
- Guard any motion with `prefers-reduced-motion`.

**DON'T**
- ❌ No grey/filled callout cards — callouts are hairline list rows.
- ❌ No alarming red hero number; red (`terra`) is for small deltas, dots, the accent only.
- ❌ No multicolor filled category icon chips — calm color dots (or thin ink line icons).
- ❌ No heavy drop shadows, no left-accent-bar cards, no rounded-corner-with-colored-border boxes.
- ❌ No pure black, no pure white, no gradients as page/section backgrounds.
- ❌ No emoji.
- ❌ No new fonts beyond the three; never set figures in the sans.
- ❌ Don't refactor logic "while you're in there." Visual layer only.

---

## 6. Suggested execution plan (Opus → Sonnet fan-out)

Your fan-out instinct is right, but a restyle drifts badly if parallel sessions each
reinvent the look. Anchor everything to a shared token layer + one finished reference
screen, then parallelize.

**Phase 0 — Foundations (Opus, single session).**
1. Detect the repo's styling system (Tailwind? CSS modules? styled-components? plain CSS?).
2. Express the §1 tokens natively in it; wire the three fonts.
3. Produce a short **component map**: which existing components render the hero, callouts,
   tx rows, nav, buttons, inputs, sheets, charts, each screen. (Cheap, and it's the
   routing table for the fan-out.)

**Phase 1 — The reference screen (Opus, single session).**
- Restyle **Overview only**, to match `reference/broadsheet.html` pixel-for-pixel.
- This screen becomes the canonical precedent every later session imitates. Verify side
  by side with the reference before moving on.

**Phase 2 — Parallel fan-out (Sonnet, one screen/group per session).** Each session gets:
this spec + `reference/` + the finished Overview as the in-repo precedent. Split:
- (a) **Add / Edit** sheets + the numeric keypad + category picker (dots, not chips).
- (b) **Analysis** — chart theming (§4) + category list/donut + activity list.
- (c) **Settings** + Years + Templates manager + CSV import preview.
- (d) **Shared primitives** — buttons, chips, inputs, the `Num` helper, the Sheet, nav.
  *(Do (d) early or fold into Phase 1 so the others inherit it.)*

**Phase 3 — Consistency sweep (Opus).** Grep for stragglers: any remaining dark bg, grey
filled card, sans-set number, multicolor icon chip, `#000`/`#fff`, drop shadow. Tighten
spacing to 26px screen padding and the type scale.

**Verification each phase:** open the screen next to the reference; run the §5 DON'T list
as a checklist; confirm no behavior/data changed (the app still loads your real
transactions and the callouts still compute).

---

## 7. Files in this package
| Path | What |
|---|---|
| `BROADSHEET_DESIGN_SPEC.md` | This document — the rules. |
| `reference/broadsheet.html` | Runnable Overview reference (open in a browser; no build). |
| `reference/lb-a.jsx` | Source of the Overview screen (plain `React.createElement`). |
| `reference/lb-data.jsx` | The themeable Recharts chart + donut + mock data. |
| `reference/tokens.css` | The tokens as copy-pasteable CSS variables. |
