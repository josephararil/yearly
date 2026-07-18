// calc.jsx — date helpers, projection math, formatters, callout engine.
(function () {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const eur0fmt = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2fmt = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = (n) => eur0fmt.format(Math.round(n || 0));
  const eur2 = (n) => eur2fmt.format(n || 0);
  const eurAuto = (n) => (Math.abs(n) >= 1000 ? eur0(n) : eur2(n));
  const signedEur = (n) => (n >= 0 ? "+" : "−") + eur0(Math.abs(n));
  const pct = (n) => Math.round(n * 100) + "%";
  const signedPct = (n) => (n >= 0 ? "+" : "−") + Math.round(Math.abs(n) * 100) + "%";

  // Named thresholds — one source of truth for every magic number in the detector engine.
  // See README §Callout detectors threshold table for the full rationale.
  const T = {
    WATCH_BAND_CURRENT:  1.08,  // forecast uncertainty mid-year: within +8% of ceiling = watch, beyond = alert
    WATCH_BAND_COMPLETE: 1.03,  // settled fact: tighter +3% band for finished years
    CEILING_COMFORT:     0.94,  // below 94% of ceiling = comfortable, room to raise fun
    CEILING_ALERT:       0.08,  // projection > ceiling × (1 + 8%) → alert severity
    TREND_NOTABLE:       0.012, // projection moved > 1.2% of ceiling in 4 weeks = worth a callout
    TREND_ALERT:         0.04,  // > 4% of ceiling move → alert severity
    STREAK_HOT:          1.15,  // 14d daily pace > 115% of linear pace → spending streak
    STREAK_ALERT:        1.35,  // 14d pace > 135% → alert severity
    STREAK_COOL:         0.70,  // 14d pace < 70% → under-pace (good)
    SHARE_NOTABLE:       0.26,  // top category > 26% of YTD spend = worth surfacing
    SHARE_WATCH:         0.34,  // top category > 34% → watch severity
    MOVER_MIN_EUR:       60,    // MoM category change must exceed €60 to be a "mover" (ignore tiny swings)
    MOVER_MIN_BASE:      50,    // category must have ≥ €50 in the last full month to be eligible
    BUFFER_EXPLAIN_MIN:  0.01,  // explain the buffer only when it adds > 1% of ceiling (otherwise noise)
    LUMP_PCT:            0.02,  // transactions > 2% of ceiling excluded from extrapolated rate (winsorization)
    MONTH_BAND_DEFAULT_CV: 0.35, // fallback daily coefficient-of-variation for the month cone when <2 historical months exist
    BAND_WINDOW_WEEKS:   16,    // yearly uncertainty band: sigma from the most recent N complete weeks only (recency window)
    DAYS_PER_MONTH:      30.4,  // average month length for "months remaining" arithmetic
    YOY_WATCH:           0.08,  // YTD spend > prior year same point by > 8% of ceiling → watch
  };

  function dayOfYear(d) {
    const start = Date.UTC(d.getFullYear(), 0, 0);
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000);
  }
  function daysInYear(y) {
    return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
  }
  function parseDate(s) { return new Date(s + "T00:00:00"); }
  function localISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDateShort(s) { const d = parseDate(s); return MONTHS[d.getMonth()] + " " + d.getDate(); }
  function fmtDateLong(s) { const d = parseDate(s); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }

  function yearTxns(store, year) {
    return store.transactions
      .filter((t) => t.date.slice(0, 4) === String(year))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // ym ("YYYY-MM") + k months, wrapping across year boundaries.
  function addMonths(ym, k) {
    const [y, m] = ym.split("-").map(Number);
    const total = (m - 1) + k;
    const ny = y + Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return ny + "-" + String(nm).padStart(2, "0");
  }

  // Expands each amortized parent (amortize_months >= 2) into N monthly slices dated on the 1st,
  // starting from the parent's own date's month and spilling across year boundaries. The parent
  // itself is dropped — only slices are emitted. Every other transaction passes through unchanged
  // (identity for the common case). Slices are `oneoff:true` so they're excluded from the
  // extrapolated rate everywhere `isLump` is checked, and are dated so the last slice absorbs the
  // rounding remainder (Σ slices === parent's amount_eur, cent-accurate).
  function expandAmortized(transactions) {
    const out = [];
    (transactions || []).forEach((t) => {
      const n = t.amortize_months;
      if (!(n >= 2)) { out.push(t); return; }
      const startYm = t.date.slice(0, 7);
      const totalCents = Math.round(t.amount_eur * 100);
      const baseCents = Math.floor(totalCents / n);
      let allocatedCents = 0;
      for (let k = 0; k < n; k++) {
        const cents = k === n - 1 ? totalCents - allocatedCents : baseCents;
        allocatedCents += cents;
        out.push({
          ...t,
          id: t.id + "__am" + k,
          date: addMonths(startYm, k) + "-01",
          amount_eur: cents / 100,
          oneoff: true,
          _amortized: true,
          _parent: t.id,
        });
      }
    });
    return out;
  }

  // amortizationBreakdown — pure, read-only analytics layer over amortized transactions. Expands
  // store.transactions internally (reuse expandAmortized) but returns only aggregates + RAW parent
  // metadata — slices themselves are never exposed, persisted, or rendered (same invariant as
  // computeStats' committedFuture). Every per-parent figure (elapsedMonths/spentSoFar/remainingAmt)
  // is derived by counting/summing that parent's OWN slices vs asOfStr — never a calendar
  // month-diff — so it reconciles to the cent with the engine's aggregate math.
  // Parent scoping (`parents`) is schedule-overlap with viewYear (startYm..endYm span), NOT
  // yearTxns — a long amortization (e.g. a 120-mo virtual car) can have a purchase date years
  // before viewYear yet still be "active" during it. `byYear`/`totals` look at ALL years any slice
  // touches (not just viewYear) — the point is to show the whole future allocation, not just the
  // viewed year's slice.
  function amortizationBreakdown(store, viewYear, asOfStr) {
    const transactions = store.transactions || [];
    const allParents = transactions.filter((t) => t.amortize_months >= 2);
    const amortSlices = expandAmortized(transactions).filter((s) => s._amortized);
    const byParent = {};
    amortSlices.forEach((s) => { (byParent[s._parent] = byParent[s._parent] || []).push(s); });

    const yearStr = String(viewYear);
    const lo = yearStr + "-01", hi = yearStr + "-12";

    const parentMeta = (t) => {
      const n = t.amortize_months;
      const startYm = t.date.slice(0, 7);
      const endYm = addMonths(startYm, n - 1);
      const slices = byParent[t.id] || [];
      const elapsedSlices = slices.filter((s) => s.date <= asOfStr);
      const elapsedMonths = elapsedSlices.length;
      const spentSoFar = elapsedSlices.reduce((a, s) => a + s.amount_eur, 0);
      return {
        ...t,
        monthly: t.amount_eur / n,
        startYm, endYm,
        elapsedMonths, remaining: n - elapsedMonths,
        spentSoFar, remainingAmt: t.amount_eur - spentSoFar,
        real: !t.virtual,
      };
    };

    const parents = allParents
      .filter((t) => {
        const startYm = t.date.slice(0, 7);
        const endYm = addMonths(startYm, t.amortize_months - 1);
        return startYm <= hi && endYm >= lo;
      })
      .map(parentMeta);

    const sumSplit = (list) => ({
      total: list.reduce((a, s) => a + s.amount_eur, 0),
      real: list.filter((s) => !s.virtual).reduce((a, s) => a + s.amount_eur, 0),
      virtual: list.filter((s) => s.virtual).reduce((a, s) => a + s.amount_eur, 0),
    });

    // Year-scoped slices (viewYear only) — feed ytd/month/committedThisYear/byMonth.
    const yearSlices = amortSlices.filter((s) => s.date.slice(0, 4) === yearStr);
    const ytd = sumSplit(yearSlices.filter((s) => s.date <= asOfStr));

    const ym = asOfStr.slice(0, 7);
    const month = { ...sumSplit(yearSlices.filter((s) => s.date.slice(0, 7) === ym)), ym };

    const committedThisYear = yearSlices.filter((s) => s.date > asOfStr).reduce((a, s) => a + s.amount_eur, 0);

    // rawPurchased — the un-smoothed "as purchased" spikes: raw parents whose OWN date falls in
    // viewYear, grouped by that date's month (independent of the schedule-overlap `parents` scope).
    const rawParentsInYear = allParents.filter((t) => t.date.slice(0, 4) === yearStr);

    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const monthKey = String(m + 1).padStart(2, "0");
      const monthStr = yearStr + "-" + monthKey;
      const split = sumSplit(yearSlices.filter((s) => s.date.slice(5, 7) === monthKey));
      const rawPurchased = rawParentsInYear
        .filter((t) => t.date.slice(5, 7) === monthKey)
        .reduce((a, t) => a + t.amount_eur, 0);
      return { month: m, real: split.real, virtual: split.virtual, elapsed: (monthStr + "-01") <= asOfStr, rawPurchased };
    });

    // byYear — ALL years any slice touches (ascending), not just viewYear.
    const yearsTouched = Array.from(new Set(amortSlices.map((s) => s.date.slice(0, 4)))).sort();
    const byYear = yearsTouched.map((yr) => {
      const split = sumSplit(amortSlices.filter((s) => s.date.slice(0, 4) === yr));
      return { year: Number(yr), real: split.real, virtual: split.virtual };
    });

    // totals — all not-yet-elapsed slices, across all years.
    const outstanding = sumSplit(amortSlices.filter((s) => s.date > asOfStr));

    return {
      hasAmortized: parents.length > 0,
      parents, ytd, month, committedThisYear, byMonth, byYear,
      totals: { real: outstanding.real, virtual: outstanding.virtual, outstanding: outstanding.total },
    };
  }

  // Cumulative spend by day-of-year (index 0..365). Shared with analysis.jsx.
  // Array size and Math.min(365,...) are intentionally fixed: on a leap year, Dec 31 (doy=366)
  // merges into the last chart bucket (index 365). This is a cosmetic chart approximation only.
  function cumulativeByDay(txns) {
    const a = Array(366).fill(0);
    txns.forEach((t) => { a[Math.min(365, dayOfYear(parseDate(t.date)))] += t.amount_eur; });
    for (let i = 1; i <= 365; i++) a[i] += a[i - 1];
    return a;
  }

  // Prior year's spend up to the same day-of-year as asOfDate. Returns 0 if no data.
  function priorYearCumulative(store, year, asOfDate) {
    const doy = Math.max(1, dayOfYear(asOfDate || new Date()));
    const txns = yearTxns(store, Number(year) - 1);
    return txns
      .filter((t) => dayOfYear(parseDate(t.date)) <= doy)
      .reduce((a, t) => a + t.amount_eur, 0);
  }

  // Burn-down series for the Overview "Burn Down" chart. Plots budget *remaining* falling toward
  // €0 instead of spend rising from €0. Consumes `stats.upto` — the already amortization-expanded
  // transaction list — so a big lump doesn't crash the actual line in a single day. Leap years are
  // handled dynamically via stats.daysInYear (the cum lookup still folds a leap Dec 31 into index
  // 365, the same cosmetic approximation cumulativeByDay documents).
  //   target[d]  = ceiling − d × ceiling/diy       (d = 0..diy) — ideal linear pace-down
  //   actual[d]  = ceiling − cumulativeSpend(d)     (d = 0..maxActualDay) — where we really are
  //   projEnd    = ceiling − projection             — the engine's canonical Dec-31 landing, so the
  //                dashed run-rate line lands exactly where the rest of the app says it will
  //                (includes buffer + committed-future slices, not just the raw blended rate).
  function burnDownSeries(stats) {
    const diy = stats.daysInYear;
    const ceiling = stats.ceiling;
    const cum = cumulativeByDay(stats.upto);
    const maxActualDay = stats.complete ? diy : stats.isFuture ? 0 : stats.doy;
    const target = [], actual = [];
    for (let d = 0; d <= diy; d++) target.push(ceiling - d * (ceiling / diy));
    for (let d = 0; d <= maxActualDay; d++) actual.push(ceiling - cum[Math.min(365, d)]);
    return {
      diy, doy: stats.doy, ceiling, target, actual, maxActualDay,
      actualToday: ceiling - stats.spent,
      projEnd: ceiling - stats.projection,
      complete: stats.complete, isFuture: stats.isFuture,
    };
  }

  // ---- computeStats helpers ----

  function aggregateByCategory(upto, spent) {
    const byCat = {};
    const byCatCount = {};
    upto.forEach((t) => {
      const cid = window.YData.normalizeCategory(t.category);
      byCat[cid] = (byCat[cid] || 0) + t.amount_eur;
      byCatCount[cid] = (byCatCount[cid] || 0) + 1;
    });
    const catList = Object.entries(byCat)
      .map(([id, amount]) => ({ id, amount, share: spent ? amount / spent : 0, count: byCatCount[id] || 0 }))
      .sort((a, b) => b.amount - a.amount);
    return { byCat, catList };
  }

  function aggregateByMonth(upto) {
    const byMonth = Array.from({ length: 12 }, (_, m) => ({ m, label: MONTHS[m], amount: 0 }));
    const catMonth = {};
    upto.forEach((t) => {
      const m = parseDate(t.date).getMonth();
      const cid = window.YData.normalizeCategory(t.category);
      byMonth[m].amount += t.amount_eur;
      (catMonth[cid] = catMonth[cid] || Array(12).fill(0))[m] += t.amount_eur;
    });
    return { byMonth, catMonth };
  }

  // Rate for a person in a given "YYYY-MM". Returns 0 before startMonth.
  // Picks the latest rates[] entry with from <= ym (rates must be sorted ascending).
  function rateForMonth(person, ym) {
    if (ym < person.startMonth) return 0;
    let rate = 0;
    for (const r of person.rates) {
      if (r.from <= ym) rate = r.amount;
    }
    return rate;
  }

// Linear fun extrapolation, capped by what the allowance system permits this year:
// YTD fun spend + positive carryover balances + accruals still to come through December.
function funProjectionFor(store, year, doy, funSpentYTD, asOfStr) {
  const linear = doy > 0 ? (funSpentYTD / doy) * daysInYear(year) : 0;
  const currentYM = asOfStr.slice(0, 7);
  let balances = 0, futureAccruals = 0;
  for (const p of store.people || []) {
    let accrued = 0, ym = p.startMonth;
    while (ym <= currentYM) {
      accrued += rateForMonth(p, ym);
      const [y, m] = ym.split("-").map(Number);
      ym = m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
    }
    const spentAll = (store.transactions || [])
      .filter((t) => t.fun && t.person === p.id && t.date <= asOfStr && t.date >= p.startMonth + "-01")
      .reduce((a, t) => a + t.amount_eur, 0);
    balances += accrued - spentAll + (p.balanceAdjustment || 0);
    for (let m = 1; m <= 12; m++) {
      const ymm = String(year) + "-" + String(m).padStart(2, "0");
      if (ymm > currentYM) futureAccruals += rateForMonth(p, ymm);
    }
  }
  return Math.min(linear, funSpentYTD + Math.max(0, balances) + futureAccruals);
}

function computeStats(store, year, asOfDate, staleDays = 0) {
    const real = asOfDate || new Date();
    const currentYear = Number(store.currentYear);
    const y = store.years[String(year)] || { ceiling: 25000, buffer: 0.04 };
    const ceiling = y.ceiling != null ? y.ceiling : 25000;
    const buffer = y.buffer || 0;
    const txns = yearTxns(store, year);
    const isCurrent = Number(year) === currentYear;
    const complete = !isCurrent && Number(year) < currentYear;
    // Guard: future year treated as not-yet-started
    const isFuture = Number(year) > currentYear;
    const diy = daysInYear(Number(year));

    let asOf, doy;
    if (isFuture) {
      asOf = new Date(Number(year), 0, 1);
      doy = 1;
    } else if (isCurrent) {
      asOf = real;
      doy = Math.max(1, dayOfYear(real));
    } else {
      asOf = new Date(Number(year), 11, 31);
      doy = diy;
    }
    const asOfStr = localISO(asOf);

    // Primary pipeline over ALL transactions — fun is not a separate pot, just decomposition.
    const upto = isFuture ? [] : txns.filter((t) => t.date <= asOfStr);
    const spent = isFuture ? 0 : upto.reduce((a, t) => a + t.amount_eur, 0);
    const dailyRate = isFuture ? 0 : spent / doy;  // YTD average, kept for display

    // Decomposition: fun/main split is secondary (for Fun tab + ceiling-callout advice only).
    const people = store.people || [];
    let funPlanAnnual = 0;
    for (const p of people) {
      for (let m = 1; m <= 12; m++) {
        const ym = String(year) + "-" + String(m).padStart(2, "0");
        funPlanAnnual += rateForMonth(p, ym);
      }
    }
    const mainTarget = ceiling - funPlanAnnual;
    const funSpent = isFuture ? 0 : upto.filter((t) => t.fun).reduce((a, t) => a + t.amount_eur, 0);
    const mainSpent = spent - funSpent;

    // Lump-sum winsorization: transactions above T.LUMP_PCT of ceiling, or explicitly
    // flagged oneoff:true, count in `spent` but are excluded from the RATE that gets
    // extrapolated over daysRemaining. A single large transaction counts once as money spent;
    // it does not inflate the year-end projection by multiplying over remaining days.
    // oneoff:true takes precedence — it excludes smaller one-offs the auto threshold can't catch.
    const lumpThreshold = ceiling > 0 ? ceiling * T.LUMP_PCT : Infinity;
    const isLump = (t) => !!t.oneoff || t.amount_eur > lumpThreshold;
    const recurring = upto.filter((t) => !isLump(t));

    // Trailing 60-day rate: de-weights front-loaded lump sums once they leave the window.
    // Falls back to recurring-YTD rate when fewer than 60 days have elapsed.
    // Damped-blend rate: recurringYtdRate × (doy/365) + trailing_60d_rate × (1 − doy/365).
    // Early year → trusts recent momentum (YTD history is thin).
    // Late year → locks onto YTD average (ignores last-minute spikes or quiet patches).
    let trailingDailyRate = dailyRate;
    if (!isFuture && !complete && doy >= 1) {
      const w60 = new Date(asOf); w60.setDate(w60.getDate() - 60);
      const w60str = localISO(w60);
      const windowDays = Math.min(60, doy);
      const recurringYtdRate = doy > 0 ? recurring.reduce((a, t) => a + t.amount_eur, 0) / doy : 0;
      const last60 = recurring.filter((t) => t.date > w60str).reduce((a, t) => a + t.amount_eur, 0);
      const rawTrailing = last60 / windowDays;
      const yearWeight = doy / diy;
      trailingDailyRate = recurringYtdRate * yearWeight + rawTrailing * (1 - yearWeight);
    }
    const daysRemaining = Math.max(0, diy - doy);
    const projDays = isCurrent ? daysRemaining + staleDays : daysRemaining;
    const extrapolated = trailingDailyRate * projDays;
    // Committed-future: amortization slices dated after asOf are `oneoff` (excluded from the
    // rate), so without this term they'd simply vanish from the projection instead of counting
    // as the known future cost they are. Deterministic — no buffer, since the amount is fixed.
    const committedFuture = (complete || isFuture) ? 0 : txns
      .filter((t) => t._amortized && t.date > asOfStr)
      .reduce((a, t) => a + t.amount_eur, 0);
    const projNoBuffer = (complete || isFuture) ? spent : spent + extrapolated + committedFuture;
    const projection = (complete || isFuture) ? spent : spent + extrapolated * (1 + buffer) + committedFuture;
    const bufferAmt = projection - projNoBuffer;

    const pace = (doy / diy) * ceiling;
    const delta = projection - ceiling;
    const deltaPct = ceiling > 0 ? delta / ceiling : 0;

    // Forecast uncertainty band — current incomplete year only, requires ≥4 complete weeks of
    // recurring (non-lump) data. sigmaWeek = sample std-dev of the most recent BAND_WINDOW_WEEKS
    // complete weeks' recurring totals (zero weeks counted) — NOT the full year-to-date. A flat
    // year-to-date sample lets a single atypical week (e.g. a big January stock-up) inflate the
    // band for the rest of the year even after months of dead-steady spending since; windowing to
    // the recent past lets that influence fade out once the household's behavior has moved on,
    // same recency philosophy as the trailing-60-day rate blend above. Early in the year, before
    // BAND_WINDOW_WEEKS have elapsed, the window is just "all weeks so far" — unchanged from
    // before. bandAmt = sigmaWeek × √weeksRemaining × (1+buffer). All null when insufficient data.
    // projLow is floored at spent so the optimistic bound never understates what was actually
    // logged.
    let projLow = null, projHigh = null, bandAmt = null;
    if (!isFuture && !complete) {
      const nCompleteWeeks = Math.floor((doy - 1) / 7);
      if (nCompleteWeeks >= 4) {
        const weekTotals = Array(nCompleteWeeks).fill(0);
        recurring.forEach((t) => {
          const wk = Math.floor((dayOfYear(parseDate(t.date)) - 1) / 7);
          if (wk < nCompleteWeeks) weekTotals[wk] += t.amount_eur;
        });
        const windowStart = Math.max(0, nCompleteWeeks - T.BAND_WINDOW_WEEKS);
        const windowed = weekTotals.slice(windowStart);
        const n = windowed.length;
        const mean = windowed.reduce((a, v) => a + v, 0) / n;
        const sigmaWeek = n >= 2 ? Math.sqrt(windowed.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
        const weeksRemaining = projDays / 7;
        bandAmt = sigmaWeek * Math.sqrt(weeksRemaining) * (1 + buffer);
        projLow = Math.max(spent, projection - bandAmt);
        projHigh = projection + bandAmt;
      }
    }

    // Status gated on ceiling — the one sacred number.
    // "alert" only when even the optimistic scenario (projLow) misses ceiling; otherwise
    // "watch" until the band exists and the lower bound clears. When band is null (<4 weeks),
    // fall back to the static ±8% threshold so early-year behaviour is unchanged.
    let status;
    if (isFuture) status = "good";
    else if (complete) status = projection <= ceiling ? "good" : projection <= ceiling * T.WATCH_BAND_COMPLETE ? "watch" : "alert";
    else if (bandAmt !== null) {
      status = projection <= ceiling ? "good" : (projLow > ceiling ? "alert" : "watch");
    } else {
      // Sparse data (<4 weeks): use static threshold (T.WATCH_BAND_CURRENT = 1.08)
      status = projection <= ceiling ? "good" : (projection <= ceiling * T.WATCH_BAND_CURRENT ? "watch" : "alert");
    }

    const { byCat, catList } = aggregateByCategory(upto, spent);
    const { byMonth, catMonth } = aggregateByMonth(upto);

    // Fun decomposition: projection capped by allowance system (for Fun tab + ceiling-callout advice).
    const funProjection = isFuture ? 0 : complete ? funSpent : funProjectionFor(store, year, doy, funSpent, asOfStr);

    // Prior year cumulative curve — null when no prior year data exists. Includes fun spend.
    const priorTxns = yearTxns(store, Number(year) - 1);
    const priorCum = priorTxns.length ? cumulativeByDay(priorTxns) : null;
    const priorSpent = priorCum ? priorCum[Math.min(365, doy)] : null;

    return {
      year: Number(year), ceiling, mainTarget, funPlanAnnual, buffer, isCurrent, complete, isFuture,
      asOf, asOfStr, doy, daysInYear: diy, spent, dailyRate, trailingDailyRate, daysRemaining, staleDays, projection, projNoBuffer, bufferAmt,
      pace, delta, deltaPct, status, projLow, projHigh, bandAmt, txns, upto, byCat, catList, byMonth, catMonth,
      priorCum, priorSpent,
      mainSpent, funSpent, funProjection,
    };
  }

  // projection as-of a past offset (days back) — for trend detection
  function projectionAsOf(stats, daysBack) {
    const ref = new Date(stats.asOf); ref.setDate(ref.getDate() - daysBack);
    const refStr = localISO(ref);
    const refDoy = Math.max(1, dayOfYear(ref));
    const refSpent = stats.txns.filter((t) => t.date <= refStr).reduce((a, t) => a + t.amount_eur, 0);
    const w60 = new Date(ref); w60.setDate(w60.getDate() - 60);
    const w60str = localISO(w60);
    const windowDays = Math.min(60, refDoy);
    // Lump-sum winsorization — must match computeStats so the trend comparison is apples-to-apples.
    const lumpThreshold = stats.ceiling > 0 ? stats.ceiling * T.LUMP_PCT : Infinity;
    const isLump = (t) => !!t.oneoff || t.amount_eur > lumpThreshold;
    const refRecurring = stats.txns.filter((t) => t.date <= refStr && !isLump(t));
    const recurringSum = refRecurring.reduce((a, t) => a + t.amount_eur, 0);
    const ytdRate = refDoy > 0 ? recurringSum / refDoy : 0;
    const last60 = refRecurring.filter((t) => t.date > w60str).reduce((a, t) => a + t.amount_eur, 0);
    const rawTrailing = windowDays > 0 ? last60 / windowDays : ytdRate;
    const yearWeight = refDoy / daysInYear(stats.year);
    const blendedRate = ytdRate * yearWeight + rawTrailing * (1 - yearWeight);
    const daysLeft = Math.max(0, daysInYear(stats.year) - refDoy);
    const committedFuture = stats.txns
      .filter((t) => t._amortized && t.date > refStr)
      .reduce((a, t) => a + t.amount_eur, 0);
    return refSpent + blendedRate * daysLeft * (1 + stats.buffer) + committedFuture;
  }

  // Retroactive history of the year-end projection — replays projectionAsOf() across the year so
  // the UI can chart how the estimate has evolved (e.g. €30k in spring → €27.5k now). A pure
  // derivation from transaction dates, no stored daily snapshots; a backdated or late-imported tx
  // therefore lands on its transaction date, not the day it was entered. Skips the opening
  // STABLE_DAYS, where a single early transaction makes the extrapolated rate meaningless. Returns
  // [{ doy, dateStr, projection }] oldest→newest, sampled ~stepDays apart and always ending on
  // today (the final point uses stats.projection so it matches the Hero exactly). Empty for
  // complete/future years, single-point when the year is younger than STABLE_DAYS.
  function projectionHistory(stats, stepDays = 5) {
    if (stats.isFuture || stats.complete) return [];
    const STABLE_DAYS = 14;
    const startDoy = Math.min(stats.doy, STABLE_DAYS);
    const pts = [];
    for (let doy = startDoy; doy < stats.doy; doy += stepDays) {
      const daysBack = stats.doy - doy;
      const ref = new Date(stats.asOf); ref.setDate(ref.getDate() - daysBack);
      pts.push({ doy, dateStr: localISO(ref), projection: projectionAsOf(stats, daysBack) });
    }
    pts.push({ doy: stats.doy, dateStr: stats.asOfStr, projection: stats.projection });
    return pts;
  }

  // Required daily rate to finish within ceiling. Returns null when not applicable.
  function requiredDailyToHit(stats) {
    if (!stats.isCurrent) return null;
    if (stats.projection <= stats.ceiling) return null;
    const daysLeft = stats.daysInYear - stats.doy;
    if (daysLeft <= 0) return null;
    return Math.max(0, (stats.ceiling - stats.spent) / daysLeft);
  }

  // Median of daily spend totals across every elapsed calendar day of the year (incl. €0 days).
  // Unlike dailyRate (a mean), the median is unmoved by a handful of large/lump days — it answers
  // "what does a typical day cost" rather than "what's the average including outliers."
  function medianDailySpendYTD(stats) {
    if (!stats.doy) return null;
    const byDate = {};
    stats.upto.forEach((t) => { byDate[t.date] = (byDate[t.date] || 0) + t.amount_eur; });
    const start = new Date(Number(stats.year), 0, 1);
    const vals = [];
    for (let i = 0; i < stats.doy; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      vals.push(byDate[localISO(d)] || 0);
    }
    vals.sort((a, b) => a - b);
    const n = vals.length;
    const mid = Math.floor(n / 2);
    return n % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  }

  // All-time highest/lowest calendar-month spend totals across every year in store.transactions.
  // excludeYm (typically the in-progress current month, "YYYY-MM") is left out since it's a
  // partial month, not a completed one. Returns null if there's no completed month to compare.
  function historicalMonthRange(store, excludeYm) {
    const totals = {};
    (store.transactions || []).forEach((t) => {
      const ym = t.date.slice(0, 7);
      if (ym === excludeYm) return;
      totals[ym] = (totals[ym] || 0) + t.amount_eur;
    });
    const entries = Object.entries(totals);
    if (entries.length === 0) return null;
    entries.sort((a, b) => a[1] - b[1]);
    const label = (ym) => { const [y, m] = ym.split("-").map(Number); return MONTHS[m - 1] + " " + y; };
    const [minYm, min] = entries[0];
    const [maxYm, max] = entries[entries.length - 1];
    return { min, max, minLabel: label(minYm), maxLabel: label(maxYm), n: entries.length };
  }

  // Affordable daily rate from here that still lands within the ceiling — the mirror of
  // requiredDailyToHit for the under-ceiling case. Same number, opposite framing ("room for")
  // vs "spend ≤"). Returns null when over ceiling (use requiredDailyToHit) or not applicable.
  function dailyHeadroom(stats) {
    if (!stats.isCurrent) return null;
    if (stats.projection > stats.ceiling) return null;
    const daysLeft = stats.daysInYear - stats.doy;
    if (daysLeft <= 0) return null;
    return Math.max(0, (stats.ceiling - stats.spent) / daysLeft);
  }

  // Implied portfolio draw rate — the FIRE control-panel number. Projected annual household spend
  // net of external income, expressed as a fraction of the portfolio. Returns null when no
  // portfolio is set (the feature stays dormant until configured in Settings). portfolio and
  // externalIncome are settings-blob fields; update the portfolio manually each quarter — the
  // threshold crossings matter, not precision.
  function impliedDraw(store, projection) {
    const portfolio = store.portfolio;
    if (!(portfolio > 0)) return null;
    const externalIncome = store.externalIncome || 0;
    return (projection - externalIncome) / portfolio;
  }

  // Draw-rate envelope: ≤2% conservative, ≤3.5% sustainable, ≤4% at the 4%-rule limit, above it
  // high. Maps each band to a theme status color. Returns null for a null rate.
  function drawZone(rate) {
    if (rate == null) return null;
    if (rate <= 0.02) return { label: "conservative", color: "var(--sage)" };
    if (rate <= 0.035) return { label: "sustainable", color: "var(--sage)" };
    if (rate <= 0.04) return { label: "at the 4% limit", color: "var(--amber)" };
    return { label: "above the 4% rule", color: "var(--terra)" };
  }

  // computeFun — rich per-person fun ledger for the UI (uses store.currentYear for YTD figures).
  // asOfDate defaults to new Date(). Balance is all-time (from each person's startMonth to asOf).
  function computeFun(store, asOfDate) {
    const asOf = asOfDate || new Date();
    const asOfStr = localISO(asOf);
    const currentYM = asOfStr.slice(0, 7);
    const year = Number(store.currentYear);
    const doy = Math.max(1, dayOfYear(asOf));

    const personData = (store.people || []).map((p) => {
      // Accrue monthly rate from startMonth to currentYM inclusive
      let accrued = 0;
      let ym = p.startMonth;
      while (ym <= currentYM) {
        accrued += rateForMonth(p, ym);
        const [y, m] = ym.split("-").map(Number);
        ym = m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
      }
      const allFunTxns = (store.transactions || []).filter((t) => t.fun && t.person === p.id && t.date <= asOfStr && t.date >= p.startMonth + "-01");
      const spentAllTime = allFunTxns.reduce((a, t) => a + t.amount_eur, 0);
      const balance = accrued - spentAllTime + (p.balanceAdjustment || 0);
      const monthlyRate = rateForMonth(p, currentYM);
      const usedThisMonth = allFunTxns
        .filter((t) => t.date.slice(0, 7) === currentYM)
        .reduce((a, t) => a + t.amount_eur, 0);
      return { id: p.id, name: p.name, balance, monthlyRate, usedThisMonth, spentAllTime };
    });

    // Fun figures for the current year
    const yearStr = String(year);
    const funYearTxns = (store.transactions || []).filter((t) => t.fun && t.date.slice(0, 4) === yearStr && t.date <= asOfStr);
    const funSpentYTD = funYearTxns.reduce((a, t) => a + t.amount_eur, 0);
    const realYear = asOf.getFullYear();
    const isCurrent = year === realYear;
    const complete = year < realYear;
    const isFuture = year > realYear;
    // Fun projection capped by the allowance system (accruals + carryover balances)
    const funProjection = isFuture ? 0 : complete ? funSpentYTD : funProjectionFor(store, year, doy, funSpentYTD, asOfStr);

    const { catList: funCatList } = aggregateByCategory(funYearTxns, funSpentYTD);

    return { people: personData, funSpentYTD, funProjection, funCatList };
  }

  // computeTravel — family-wide travel-budget ledger for the UI. Mirrors computeFun but with a
  // single household allowance (no per-person split, no ownership). Balance is all-time (from
  // travel.startMonth to asOf) so you can bank budget across months and years for a bigger trip.
  // Travel-tagged transactions are real household spend and count toward the ceiling exactly like
  // fun-tagged ones — the travel/main split is metadata that powers this ledger only.
  function computeTravel(store, asOfDate) {
    const asOf = asOfDate || new Date();
    const asOfStr = localISO(asOf);
    const currentYM = asOfStr.slice(0, 7);
    const year = Number(store.currentYear);
    const doy = Math.max(1, dayOfYear(asOf));
    const travel = store.travel || { rates: [], startMonth: currentYM, balanceAdjustment: 0 };

    // Accrue the monthly rate from startMonth to currentYM inclusive (rateForMonth reads the same
    // .rates/.startMonth shape as a person).
    let accrued = 0;
    let ym = travel.startMonth;
    while (ym && ym <= currentYM) {
      accrued += rateForMonth(travel, ym);
      const [y, m] = ym.split("-").map(Number);
      ym = m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
    }
    const allTravelTxns = (store.transactions || [])
      .filter((t) => t.travel && t.date <= asOfStr && t.date >= travel.startMonth + "-01");
    const spentAllTime = allTravelTxns.reduce((a, t) => a + t.amount_eur, 0);
    const balance = accrued - spentAllTime + (travel.balanceAdjustment || 0);
    const monthlyRate = rateForMonth(travel, currentYM);
    const usedThisMonth = allTravelTxns
      .filter((t) => t.date.slice(0, 7) === currentYM)
      .reduce((a, t) => a + t.amount_eur, 0);

    // Travel figures for the current year
    const yearStr = String(year);
    const travelYearTxns = (store.transactions || []).filter((t) => t.travel && t.date.slice(0, 4) === yearStr && t.date <= asOfStr);
    const travelSpentYTD = travelYearTxns.reduce((a, t) => a + t.amount_eur, 0);
    const realYear = asOf.getFullYear();
    const complete = year < realYear;
    const isFuture = year > realYear;
    // Simple linear YTD projection. Unlike fun, travel is NOT allowance-capped — the point is to
    // see whether the year's actual travel spend is tracking over or under the drip, so an honest
    // uncapped extrapolation is what's wanted.
    const travelProjection = isFuture ? 0 : complete ? travelSpentYTD : (doy > 0 ? (travelSpentYTD / doy) * daysInYear(year) : 0);

    const { catList: travelCatList } = aggregateByCategory(travelYearTxns, travelSpentYTD);

    // Per-trip aggregation — all-time (a trip can cross a year boundary), independent of the
    // year/asOf filters above. Purely additive metadata on top of the ledger math.
    const trips = (store.trips || [])
      .map((trip) => {
        const txns = (store.transactions || [])
          .filter((t) => t.travel && t.trip_id === trip.id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const total = txns.reduce((a, t) => a + t.amount_eur, 0);
        const { catList } = aggregateByCategory(txns, total);
        const sortKey = trip.startDate || localISO(new Date(trip.createdAt || 0));
        return {
          id: trip.id,
          name: trip.name,
          location: trip.location,
          startDate: trip.startDate,
          endDate: trip.endDate,
          total,
          count: txns.length,
          catList,
          txns,
          sortKey,
        };
      })
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .map(({ sortKey, ...rest }) => rest);

    return { balance, accrued, spentAllTime, monthlyRate, usedThisMonth, travelSpentYTD, travelProjection, travelCatList, startMonth: travel.startMonth, trips };
  }

  // ---- Callout engine ----
  function buildCallouts(store, stats) {
    if (stats.complete) {
      const finalSpent = stats.spent;
      const over = finalSpent > stats.ceiling;
      return [{
        id: "final", severity: over ? "watch" : "good", icon: over ? "trendingUp" : "checkCircle",
        text: `Finished ${over ? "over" : "under"} the ceiling by ${eur0(Math.abs(stats.delta))} — ${eur0(finalSpent)} against a ${eur0(stats.ceiling)} ceiling.`,
        drill: { section: "projection" }, mag: Math.abs(stats.deltaPct),
      }];
    }
    if (stats.isFuture) return [{
      id: "future", severity: "good", icon: "clock",
      text: `${stats.year} hasn't started yet — ceiling ${eur0(stats.ceiling)}.`,
      drill: { section: "projection" }, mag: 0,
    }];
    const out = [];
    const linDaily = stats.ceiling / stats.daysInYear;

    // Callouts carry a `value` (interestingness, 0–1) that drives the ranking — the home voice
    // line takes the single highest-value non-redundant callout. The taste model (from real use):
    //   Tier 1 (~0.8–1.0) actionable, forward-looking guidance — what to DO next.
    //   Tier 2 (~0.5–0.75) invisible momentum/comparison — quantifies a gut feel you can't see elsewhere.
    //   Tier 3 (~0.35–0.45) local facts — true but narrow.
    //   Tier 0 (~0.0–0.05) redundant with the Hero (ceiling restatement, buffer math) — never leads.

    // 1. projection trend (vs 4 weeks ago) — skip in January (doy ≤ 28) where the reference
    // date falls in the prior year, making refSpent=0 and proj4≈0 (false "everything moved up").
    const proj4 = stats.doy > 28 ? projectionAsOf(stats, 28) : null;
    const trendD = proj4 !== null ? stats.projection - proj4 : 0;
    if (proj4 !== null && Math.abs(trendD) > stats.ceiling * T.TREND_NOTABLE) {
      const worse = trendD > 0;
      out.push({
        id: "trend", severity: worse ? (Math.abs(trendD) > stats.ceiling * T.TREND_ALERT ? "alert" : "watch") : "good",
        icon: worse ? "trendingUp" : "trendingDown",
        text: `Year-end projection has moved ${worse ? "up" : "down"} ${eur0(Math.abs(trendD))} over the last 4 weeks, now ${eur0(stats.projection)}.`,
        drill: { section: "projection" }, value: 0.55 + Math.min(0.2, Math.abs(trendD) / stats.ceiling), mag: Math.abs(trendD) / stats.ceiling + 0.2,
      });
    }

    // 2. recent 14-day pace streak — skip before 14 days of data (ratio14 is always 0 on an empty store)
    const ref14 = new Date(stats.asOf); ref14.setDate(ref14.getDate() - 14);
    const r14 = localISO(ref14);
    const last14 = stats.upto.filter((t) => t.date > r14).reduce((a, t) => a + t.amount_eur, 0);
    const d14 = last14 / 14;
    const ratio14 = d14 / linDaily;
    if (stats.doy >= 14 && stats.upto.length > 0 && (ratio14 > T.STREAK_HOT || ratio14 < T.STREAK_COOL)) {
      const hot = ratio14 > 1;
      out.push({
        id: "streak", severity: hot ? (ratio14 > T.STREAK_ALERT ? "alert" : "watch") : "good",
        icon: "activity",
        text: `Last 14 days are running ${signedPct(ratio14 - 1)} ${hot ? "above" : "below"} linear pace — ${eur0(d14)}/day vs ${eur0(linDaily)}/day.`,
        drill: { section: "projection" }, value: 0.55 + Math.min(0.2, Math.abs(ratio14 - 1) * 0.4), mag: Math.abs(ratio14 - 1) + 0.15,
      });
    }

    // 3. category month-over-month mover (last full month vs prior)
    const curMonth = stats.asOf.getMonth();
    const lastFull = curMonth - 1, prior = curMonth - 2;
    if (lastFull >= 1) {
      let best = null;
      Object.entries(stats.catMonth).forEach(([cid, arr]) => {
        const a = arr[lastFull], b = arr[prior] || 0;
        if (a < T.MOVER_MIN_BASE) return;
        const change = a - b;
        const score = Math.abs(change);
        if (!best || score > best.score) best = { cid, a, b, change, score };
      });
      if (best && Math.abs(best.change) > T.MOVER_MIN_EUR) {
        const c = window.YData.cat(best.cid);
        const pc = best.b > 0 ? best.change / best.b : 1;
        const up = best.change > 0;
        out.push({
          id: "mover", severity: up ? (Math.abs(pc) > 0.4 ? "watch" : "info") : "good",
          icon: best.cid, accent: c.color,
          text: `${c.label}: ${eur0(best.a)} in ${MONTHS_LONG[lastFull]}, ${best.b > 0 ? signedPct(pc) + " vs " + MONTHS_LONG[prior] : "new this month"}.`,
          drill: { section: "categories", category: best.cid }, value: 0.35 + Math.min(0.1, Math.abs(pc) * 0.1), mag: Math.abs(pc) * 0.6 + 0.1,
        });
      }
    }

    // 4. top category share / drift
    if (stats.catList.length) {
      const top = stats.catList[0];
      if (top.share > T.SHARE_NOTABLE) {
        const c = window.YData.cat(top.id);
        out.push({
          id: "share", severity: top.share > T.SHARE_WATCH ? "watch" : "info", icon: top.id, accent: c.color,
          text: `${c.label} is ${pct(top.share)} of spend so far — ${eur0(top.amount)} across ${top.count} entries.`,
          drill: { section: "categories", category: top.id }, value: 0.35 + Math.min(0.1, top.share - T.SHARE_NOTABLE), mag: top.share * 0.5,
        });
      }
    }

    // 5. buffer explanation (why projection > raw pace) — Tier 0: redundant-ish, never leads.
    if (stats.bufferAmt > stats.ceiling * T.BUFFER_EXPLAIN_MIN) {
      out.push({
        id: "buffer", severity: "info", icon: "layers",
        text: `Logged spend alone projects to ${eur0(stats.projNoBuffer)}; the ${Math.round(stats.buffer * 100)}% missed-entry buffer lifts that to ${eur0(stats.projection)}.`,
        drill: { section: "projection" }, value: 0.04, mag: 0.05,
      });
    }

    // 6. year-over-year comparison (current year only, when prior year has data)
    if (stats.isCurrent) {
      const priorSpend = priorYearCumulative(store, stats.year, stats.asOf);
      if (priorSpend > 0) {
        const diff = stats.spent - priorSpend;
        const diffPct = diff / priorSpend;
        const higher = diff > 0;
        out.push({
          id: "yoy",
          severity: higher && diff > stats.ceiling * T.YOY_WATCH ? "watch" : higher ? "info" : "good",
          icon: higher ? "trendingUp" : "trendingDown",
          text: `Spending is ${eur0(Math.abs(diff))} (${signedPct(diffPct)}) ${higher ? "higher" : "lower"} than the same point in ${stats.year - 1}.`,
          drill: { section: "projection" }, value: 0.5 + Math.min(0.18, Math.abs(diff) / stats.ceiling), mag: Math.abs(diff) / stats.ceiling * 0.7 + 0.05,
        });
      }
    }

    // 7. pace guidance (Tier 1, bidirectional) — the most actionable line. Over → "spend ≤ €X/day"
    // (corrective); under → "room for €X/day" (headroom). Same maxDaily number, framed by direction.
    // The headroom case earns its rank by how binding it is (current rate close to the cap) and
    // steps aside for momentum lines when there's obvious slack — a "room for €300/day" line is as
    // redundant as the ceiling restatement when the Hero already shows you're way under.
    const daysLeftP = stats.daysInYear - stats.doy;
    if (stats.isCurrent && daysLeftP > 0) {
      const over = stats.projection > stats.ceiling;
      const maxDaily = over ? requiredDailyToHit(stats) : dailyHeadroom(stats);
      if (maxDaily !== null && maxDaily > 0) {
        if (over) {
          out.push({
            id: "pace", severity: stats.status === "alert" ? "watch" : "info", icon: "activity",
            text: `Spend ≤ ${eur0(maxDaily)}/day from here to finish within your ceiling.`,
            drill: { section: "projection" }, value: 0.9 + Math.min(0.08, Math.max(0, stats.deltaPct)), mag: stats.deltaPct * 0.5 + 0.1,
          });
        } else {
          const closeness = stats.trailingDailyRate > 0 ? Math.min(1, stats.trailingDailyRate / maxDaily) : 0;
          out.push({
            id: "pace", severity: "good", icon: "activity",
            text: `You can spend up to ${eur0(maxDaily)}/day from here and still finish within your ceiling.`,
            drill: { section: "projection" }, value: 0.3 + 0.6 * closeness, mag: 0.1,
          });
        }
      }
    }

    // 8. time-to-ceiling (Tier 1) — when over and the projection crosses the ceiling before
    // year-end, name the date and how early. Forward-looking and invisible anywhere else.
    if (stats.isCurrent && stats.projection > stats.ceiling && daysLeftP > 0 && stats.trailingDailyRate > 0) {
      const projRate = stats.trailingDailyRate * (1 + stats.buffer);
      const daysToHit = projRate > 0 ? (stats.ceiling - stats.spent) / projRate : -1;
      if (daysToHit > 0 && daysToHit < daysLeftP) {
        const hit = new Date(stats.asOf); hit.setDate(hit.getDate() + Math.round(daysToHit));
        const earlyWeeks = Math.max(1, Math.round((daysLeftP - daysToHit) / 7));
        out.push({
          id: "tohit", severity: "watch", icon: "trendingUp",
          text: `At this pace you'll reach your ${eur0(stats.ceiling)} ceiling around ${MONTHS[hit.getMonth()]} ${hit.getDate()} — about ${earlyWeeks} week${earlyWeeks === 1 ? "" : "s"} before year-end.`,
          drill: { section: "projection" }, value: 0.78, mag: 0.5,
        });
      }
    }

    // 9. biggest / lightest completed month so far (Tier 3) — variety; needs ≥3 completed months
    // and the most recent full month to be the running extreme.
    if (stats.isCurrent && curMonth >= 1) {
      const completedMonths = stats.byMonth.slice(0, curMonth).filter((m) => m.amount > 0);
      const lastM = stats.byMonth[curMonth - 1];
      if (completedMonths.length >= 3 && lastM && lastM.amount > 0) {
        const amounts = completedMonths.map((m) => m.amount);
        const maxA = Math.max(...amounts), minA = Math.min(...amounts);
        if (maxA !== minA && lastM.amount === maxA) {
          out.push({
            id: "peak", severity: "info", icon: "trendingUp",
            text: `${MONTHS_LONG[curMonth - 1]} was your biggest month so far — ${eur0(lastM.amount)}.`,
            drill: { section: "projection" }, value: 0.42, mag: 0.2,
          });
        } else if (maxA !== minA && lastM.amount === minA) {
          out.push({
            id: "peak", severity: "good", icon: "trendingDown",
            text: `${MONTHS_LONG[curMonth - 1]} was your lightest month so far — ${eur0(lastM.amount)}.`,
            drill: { section: "projection" }, value: 0.42, mag: 0.2,
          });
        }
      }
    }

    // 10. ceiling verdict (current year only) — DEMOTED. The Hero already owns the ceiling headline,
    // so this is kept in the feed (Analysis completeness) at the bottom and never becomes the voice
    // line. Skip entirely when the store has no data yet (avoids "room to raise fun €X/mo" noise).
    if (stats.isCurrent && !(stats.upto.length === 0 && stats.funSpent === 0)) {
      if (stats.projection > stats.ceiling) {
        const monthsLeft = Math.max(1, (stats.daysInYear - stats.doy) / T.DAYS_PER_MONTH);
        const overBy = stats.projection - stats.ceiling;
        const trimPer = overBy / monthsLeft;
        const maxFunTrim = stats.funPlanAnnual / 12;
        const severity = overBy > stats.ceiling * T.CEILING_ALERT ? "alert" : "watch";
        const ceilText = trimPer <= maxFunTrim
          ? `Household projects to ${eur0(stats.projection)} against your ${eur0(stats.ceiling)} ceiling — trim fun spending by ~${eur0(trimPer)}/mo to stay within it.`
          : `Household projects to ${eur0(stats.projection)} against your ${eur0(stats.ceiling)} ceiling — even cutting the entire fun budget (${eur0(maxFunTrim)}/mo) won't close it; main spending needs to drop ~${eur0(trimPer - maxFunTrim)}/mo too.`;
        out.push({ id: "ceiling", severity, icon: "trendingUp", text: ceilText, drill: { section: "fun" }, value: 0.05, mag: 1.0 });
      } else if (stats.projection < stats.ceiling * T.CEILING_COMFORT) {
        const gap = stats.ceiling - stats.projection;
        const monthsLeft = Math.max(1, (stats.daysInYear - stats.doy) / T.DAYS_PER_MONTH);
        const raisePer = gap / monthsLeft;
        out.push({ id: "ceiling", severity: "good", icon: "checkCircle",
          text: `You're tracking ${eur0(gap)} under your ${eur0(stats.ceiling)} ceiling — room to raise the fun budget by ~${eur0(raisePer)}/mo if you want.`,
          drill: { section: "fun" }, value: 0.05, mag: 0.5 });
      } else {
        // T.CEILING_COMFORT–1.00 band: tight but on course
        out.push({ id: "ceiling", severity: "info", icon: "checkCircle",
          text: `Tracking ${eur0(stats.ceiling - stats.projection)} under your ${eur0(stats.ceiling)} ceiling — tight but on course.`,
          drill: { section: "projection" }, value: 0.05, mag: 0.5 });
      }
    }

    // Calm fallback — only when nothing genuine surfaced (ceiling/buffer are redundant, don't count).
    const hasInsight = out.some((c) => c.id !== "ceiling" && c.id !== "buffer");
    if (!hasInsight) {
      out.push({
        id: "calm", severity: "good", icon: "checkCircle",
        text: `Projection steady at ${eur0(stats.projection)} against your ${eur0(stats.ceiling)} ceiling — nothing notable in the data.`,
        drill: { section: "projection" }, value: 0.5, mag: 0,
      });
    }

    const sev = { alert: 3, watch: 2, info: 1, good: 0 };
    out.sort((a, b) => (b.value - a.value) || (sev[b.severity] - sev[a.severity]) || (b.mag - a.mag));
    return out;
  }

  // Current-month projected end total (same daily-rate extrapolation as MonthCurve).
  // For complete/future years returns the recorded month total (projection = actual).
  // Lump-sum transactions (oneoff, or > LUMP_PCT of ceiling) count once in spentSoFar but are
  // excluded from the rate that gets extrapolated over the remaining days — same winsorization
  // as the yearly projection in computeStats, so a single big purchase doesn't get multiplied
  // across the rest of the month.
  function projectedMonthEnd(stats) {
    const month = stats.asOf.getMonth();
    if (stats.complete || stats.isFuture) return stats.byMonth[month].amount;
    const dayOfMonth = stats.asOf.getDate();
    const daysInMonth = new Date(stats.asOf.getFullYear(), month + 1, 0).getDate();
    const spentSoFar = stats.byMonth[month].amount;
    const lumpThreshold = stats.ceiling > 0 ? stats.ceiling * T.LUMP_PCT : Infinity;
    const isLump = (t) => !!t.oneoff || t.amount_eur > lumpThreshold;
    const monthStr = String(stats.asOf.getFullYear()) + "-" + String(month + 1).padStart(2, "0");
    const recurringSoFar = stats.upto
      .filter((t) => t.date.startsWith(monthStr) && !isLump(t))
      .reduce((a, t) => a + t.amount_eur, 0);
    const rate = dayOfMonth > 0 ? recurringSoFar / dayOfMonth : 0;
    // Committed-future: intra-month amortization slices still ahead of asOf, added deterministically.
    const committedFuture = stats.txns
      .filter((t) => t._amortized && t.date.startsWith(monthStr) && t.date > stats.asOfStr)
      .reduce((a, t) => a + t.amount_eur, 0);
    return spentSoFar + rate * (daysInMonth - dayOfMonth) + committedFuture;
  }

  // Ceiling allowance per remaining month (incl. the current one).
  // Subtracts only PRIOR months' spend so the current month is judged against a stable cap.
  function neededMonthlyCap(stats) {
    const m = stats.asOf.getMonth();
    const spentBefore = stats.byMonth.slice(0, m).reduce((a, x) => a + x.amount, 0);
    return Math.max(0, (stats.ceiling - spentBefore) / (12 - m));
  }

  // Uncertainty cone for the current month's projected total (mirrors the yearly forecast band,
  // but at month scale — every month restarts from zero data points, so it must lean on the
  // household's *historical* months early on, then hand off to this month's own data as it accrues).
  // Two independent variance sources, summed:
  //   1) within-month day-to-day noise projected over the remaining days (→ 0 as the month ends)
  //   2) cross-month "what kind of month is this" uncertainty, drawn from the spread of the
  //      household's own historical month totals (→ 0 as more of this month becomes known fact)
  // staleDays (unsynced Revolut data) widens (1) exactly like the yearly band widens with it.
  // Lump-sum transactions (oneoff, or > LUMP_PCT of ceiling) are excluded from both variance
  // sources — same winsorization as the yearly band — so a single big purchase doesn't blow the
  // cone out for the rest of the month. Returns null when there's no statistical basis at all
  // (first month of use, day 1-2, nothing to measure yet).
  function monthEndBand(stats, store) {
    if (stats.complete || stats.isFuture) return null;
    const asOf = stats.asOf;
    const year = asOf.getFullYear(), month = asOf.getMonth();
    const dayOfMonth = asOf.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    if (daysRemaining <= 0) return null;

    const monthStr = String(year) + "-" + String(month + 1).padStart(2, "0");
    const lumpThreshold = stats.ceiling > 0 ? stats.ceiling * T.LUMP_PCT : Infinity;
    const isLump = (t) => !!t.oneoff || t.amount_eur > lumpThreshold;

    // This month's day-by-day recurring totals so far (day 1..dayOfMonth).
    const dailyTotals = Array(dayOfMonth).fill(0);
    stats.upto.filter((t) => t.date.startsWith(monthStr) && !isLump(t)).forEach((t) => {
      const d = new Date(t.date + "T00:00:00").getDate();
      if (d >= 1 && d <= dayOfMonth) dailyTotals[d - 1] += t.amount_eur;
    });

    // Historical completed months, all-time, recurring spend only — the sample this month's
    // uncertainty regresses toward. (Later Jan/Feb months lean on Nov/Dec of last year, etc.)
    const totalsByYm = {};
    (store.transactions || []).forEach((t) => {
      const ym = t.date.slice(0, 7);
      if (ym < monthStr && !isLump(t)) totalsByYm[ym] = (totalsByYm[ym] || 0) + t.amount_eur;
    });
    const hist = Object.values(totalsByYm);
    const histN = hist.length;
    const histMean = histN > 0 ? hist.reduce((a, v) => a + v, 0) / histN : null;
    const histStd = histN >= 2 ? Math.sqrt(hist.reduce((a, v) => a + (v - histMean) ** 2, 0) / (histN - 1)) : 0;
    const histMin = histN > 0 ? Math.min(...hist) : null;
    const histMax = histN > 0 ? Math.max(...hist) : null;

    // In-month day-to-day sigma, once there's enough of this month to measure it (≥3 days).
    const dayMean = dailyTotals.reduce((a, v) => a + v, 0) / dayOfMonth;
    const inMonthDaySigma = dayOfMonth >= 3
      ? Math.sqrt(dailyTotals.reduce((a, v) => a + (v - dayMean) ** 2, 0) / (dayOfMonth - 1))
      : null;
    // Implied daily sigma from cross-month spread, assuming ~iid days within a month
    // (Var(sum of N iid) = N × Var(day)). Only meaningful once ≥2 historical months exist.
    const histDaySigma = histN >= 2 ? histStd / Math.sqrt(daysInMonth) : null;
    const wDay = Math.min(1, dayOfMonth / 7); // trust in-month noise more after ~a week of data

    let daySigma;
    if (inMonthDaySigma != null && histDaySigma != null) daySigma = inMonthDaySigma * wDay + histDaySigma * (1 - wDay);
    else if (inMonthDaySigma != null) daySigma = inMonthDaySigma;
    else if (histDaySigma != null) daySigma = histDaySigma;
    else if (histMean != null) daySigma = (histMean / daysInMonth) * T.MONTH_BAND_DEFAULT_CV; // only 1 historical month — rough guess
    else daySigma = null; // no signal at all (day 1-2 of the app's very first month)
    if (daySigma == null) return null;

    const projDays = daysRemaining + (stats.staleDays || 0);
    const varDaily = daySigma * daySigma * projDays;
    const residualFrac = daysRemaining / daysInMonth;
    const varMonthLevel = histN >= 2 ? (histStd * residualFrac) ** 2 : 0;

    const spentSoFar = stats.upto.filter((t) => t.date.startsWith(monthStr)).reduce((a, t) => a + t.amount_eur, 0);
    const bandAmt = Math.sqrt(varDaily + varMonthLevel) * (1 + stats.buffer);
    const mid = projectedMonthEnd(stats);
    const low = Math.max(spentSoFar, mid - bandAmt);
    const high = mid + bandAmt;
    return { low, high, bandAmt, mid, histN, histMean, histMin, histMax };
  }

  window.YCalc = {
    MONTHS, MONTHS_LONG, eur0, eur2, eurAuto, signedEur, pct, signedPct,
    dayOfYear, daysInYear, parseDate, localISO, fmtDateShort, fmtDateLong, yearTxns,
    cumulativeByDay, priorYearCumulative, burnDownSeries, aggregateByCategory, expandAmortized, amortizationBreakdown,
    rateForMonth, computeStats, computeFun, computeTravel, impliedDraw, drawZone, projectionAsOf, projectionHistory, buildCallouts,
    requiredDailyToHit, dailyHeadroom, neededMonthlyCap, projectedMonthEnd, monthEndBand,
    medianDailySpendYTD, historicalMonthRange,
  };
})();
