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

  function dayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
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

  // Cumulative spend by day-of-year (index 0..365). Shared with analysis.jsx.
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

  // ---- computeStats helpers ----

  function aggregateByCategory(upto, spent) {
    const byCat = {};
    upto.forEach((t) => {
      const cid = window.YData.normalizeCategory(t.category);
      byCat[cid] = (byCat[cid] || 0) + t.amount_eur;
    });
    const catList = Object.entries(byCat)
      .map(([id, amount]) => ({ id, amount, share: spent ? amount / spent : 0, count: upto.filter((t) => window.YData.normalizeCategory(t.category) === id).length }))
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
  const linear = doy > 0 ? (funSpentYTD / doy) * 365 : 0;
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
      .filter((t) => t.fun && t.person === p.id && t.date <= asOfStr)
      .reduce((a, t) => a + t.amount_eur, 0);
    balances += accrued - spentAll + (p.balanceAdjustment || 0);
    for (let m = 1; m <= 12; m++) {
      const ymm = String(year) + "-" + String(m).padStart(2, "0");
      if (ymm > currentYM) futureAccruals += rateForMonth(p, ymm);
    }
  }
  return Math.min(linear, funSpentYTD + Math.max(0, balances) + futureAccruals);
}

function computeStats(store, year, asOfDate) {
    const real = asOfDate || new Date();
    const currentYear = Number(store.currentYear);
    const y = store.years[String(year)] || { ceiling: 25000, buffer: 0.04 };
    const ceiling = y.ceiling != null ? y.ceiling : (y.target || 25000);
    const buffer = y.buffer || 0;
    const txns = yearTxns(store, year);
    const isCurrent = Number(year) === currentYear;
    const complete = !isCurrent && Number(year) < currentYear;
    // Guard: future year treated as not-yet-started
    const isFuture = Number(year) > currentYear;

    let asOf, doy;
    if (isFuture) {
      asOf = new Date(Number(year), 0, 1);
      doy = 1;
    } else if (isCurrent) {
      asOf = real;
      doy = Math.max(1, dayOfYear(real));
    } else {
      asOf = new Date(Number(year), 11, 31);
      doy = 365;
    }
    const asOfStr = localISO(asOf);

    // Split main (non-fun) vs fun transactions for this year
    const mainTxns = txns.filter((t) => !t.fun);
    const upto = isFuture ? [] : mainTxns.filter((t) => t.date <= asOfStr);
    const spent = isFuture ? 0 : upto.reduce((a, t) => a + t.amount_eur, 0);
    const dailyRate = isFuture ? 0 : spent / doy;  // YTD average, kept for display

    // Derived main target: ceiling minus the planned annual fun allocation.
    // Computed before the trailing rate so lumpThreshold can reference mainTarget.
    const people = store.people || [];
    let funPlanAnnual = 0;
    for (const p of people) {
      for (let m = 1; m <= 12; m++) {
        const ym = String(year) + "-" + String(m).padStart(2, "0");
        funPlanAnnual += rateForMonth(p, ym);
      }
    }
    const mainTarget = ceiling - funPlanAnnual;

    // Lump-sum winsorization: transactions above 2% of mainTarget count in `spent` but are
    // excluded from the RATE that gets extrapolated over daysRemaining. A single large
    // transaction counts once as money spent; it does not inflate the year-end projection
    // by 4× its own size by being multiplied over the remaining days.
    const lumpThreshold = mainTarget > 0 ? mainTarget * 0.02 : Infinity;
    const recurring = upto.filter((t) => t.amount_eur <= lumpThreshold);

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
      const yearWeight = doy / 365;
      trailingDailyRate = recurringYtdRate * yearWeight + rawTrailing * (1 - yearWeight);
    }
    const daysRemaining = Math.max(0, 365 - doy);
    const projNoBuffer = (complete || isFuture) ? spent : spent + trailingDailyRate * daysRemaining;
    const projection = (complete || isFuture) ? spent : projNoBuffer * (1 + buffer);
    const bufferAmt = projection - projNoBuffer;

    const pace = (doy / 365) * mainTarget;
    const delta = projection - mainTarget;
    const deltaPct = mainTarget > 0 ? delta / mainTarget : 0;

    let status;
    if (isFuture) status = "good";
    else if (complete) status = projection <= mainTarget ? "good" : projection <= mainTarget * 1.03 ? "watch" : "alert";
    else status = projection <= mainTarget ? "good" : projection <= mainTarget * 1.08 ? "watch" : "alert";

    const { byCat, catList } = aggregateByCategory(upto, spent);
    const { byMonth, catMonth } = aggregateByMonth(upto);

    // Fun figures for the combined (ceiling-level) verdict
    const funUpto = isFuture ? [] : txns.filter((t) => t.fun && t.date <= asOfStr);
    const funSpent = funUpto.reduce((a, t) => a + t.amount_eur, 0);
    // Fun projection capped by the allowance system (accruals + carryover balances)
    const funProjection = isFuture ? 0 : complete ? funSpent : funProjectionFor(store, year, doy, funSpent, asOfStr);
    const combinedProjection = projection + funProjection;
    const combinedDelta = combinedProjection - ceiling;
    const combinedDeltaPct = ceiling > 0 ? combinedDelta / ceiling : 0;
    let combinedStatus;
    if (isFuture) combinedStatus = "good";
    else if (complete) combinedStatus = combinedProjection <= ceiling ? "good" : combinedProjection <= ceiling * 1.03 ? "watch" : "alert";
    else combinedStatus = combinedProjection <= ceiling ? "good" : combinedProjection <= ceiling * 1.08 ? "watch" : "alert";

    // Prior year cumulative curve — null when no prior year data exists.
    const priorTxns = yearTxns(store, Number(year) - 1).filter((t) => !t.fun);
    const priorCum = priorTxns.length ? cumulativeByDay(priorTxns) : null;
    const priorSpent = priorCum ? priorCum[Math.min(365, doy)] : null;

    return {
      year: Number(year), ceiling, mainTarget, funPlanAnnual, buffer, isCurrent, complete, isFuture,
      asOf, asOfStr, doy, spent, dailyRate, trailingDailyRate, daysRemaining, projection, projNoBuffer, bufferAmt,
      pace, delta, deltaPct, status, txns: mainTxns, upto, byCat, catList, byMonth, catMonth,
      priorCum, priorSpent,
      funSpent, funProjection, combinedProjection, combinedDelta, combinedDeltaPct, combinedStatus,
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
    const lumpThreshold = stats.mainTarget > 0 ? stats.mainTarget * 0.02 : Infinity;
    const refRecurring = stats.txns.filter((t) => t.date <= refStr && t.amount_eur <= lumpThreshold);
    const recurringSum = refRecurring.reduce((a, t) => a + t.amount_eur, 0);
    const ytdRate = refDoy > 0 ? recurringSum / refDoy : 0;
    const last60 = refRecurring.filter((t) => t.date > w60str).reduce((a, t) => a + t.amount_eur, 0);
    const rawTrailing = windowDays > 0 ? last60 / windowDays : ytdRate;
    const yearWeight = refDoy / 365;
    const blendedRate = ytdRate * yearWeight + rawTrailing * (1 - yearWeight);
    return (refSpent + blendedRate * Math.max(0, 365 - refDoy)) * (1 + stats.buffer);
  }

  // Required daily rate to stay on mainTarget. Returns null when not applicable.
  function requiredDailyToHit(stats) {
    if (!stats.isCurrent) return null;
    if (stats.projection <= stats.mainTarget) return null;
    const daysLeft = 365 - stats.doy;
    if (daysLeft <= 0) return null;
    return Math.max(0, (stats.mainTarget - stats.spent) / daysLeft);
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
      const allFunTxns = (store.transactions || []).filter((t) => t.fun && t.person === p.id && t.date <= asOfStr);
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
    const realYear = new Date().getFullYear();
    const isCurrent = year === realYear;
    const complete = year < realYear;
    const isFuture = year > realYear;
    // Fun projection capped by the allowance system (accruals + carryover balances)
    const funProjection = isFuture ? 0 : complete ? funSpentYTD : funProjectionFor(store, year, doy, funSpentYTD, asOfStr);

    const { catList: funCatList } = aggregateByCategory(funYearTxns, funSpentYTD);

    return { people: personData, funSpentYTD, funProjection, funCatList };
  }

  // ---- Callout engine ----
  function buildCallouts(store, stats) {
    if (stats.complete) {
      const finalSpent = stats.spent + stats.funSpent;
      const over = finalSpent > stats.ceiling;
      return [{
        id: "final", severity: over ? "watch" : "good", icon: over ? "trendingUp" : "checkCircle",
        text: `Finished ${over ? "over" : "under"} the ceiling by ${eur0(Math.abs(stats.combinedDelta))} — ${eur0(finalSpent)} against a ${eur0(stats.ceiling)} ceiling.`,
        drill: { section: "projection" }, mag: Math.abs(stats.combinedDeltaPct),
      }];
    }
    if (stats.isFuture) return [{
      id: "future", severity: "good", icon: "clock",
      text: `${stats.year} hasn't started yet — main budget ${eur0(stats.mainTarget)}.`,
      drill: { section: "projection" }, mag: 0,
    }];
    const out = [];
    const linDaily = stats.mainTarget / 365;

    // 1. projection trend (vs 4 weeks ago) — skip in January (doy ≤ 28) where the reference
    // date falls in the prior year, making refSpent=0 and proj4≈0 (false "everything moved up").
    const proj4 = stats.doy > 28 ? projectionAsOf(stats, 28) : null;
    const trendD = proj4 !== null ? stats.projection - proj4 : 0;
    if (proj4 !== null && Math.abs(trendD) > stats.mainTarget * 0.012) {
      const worse = trendD > 0;
      out.push({
        id: "trend", severity: worse ? (Math.abs(trendD) > stats.mainTarget * 0.04 ? "alert" : "watch") : "good",
        icon: worse ? "trendingUp" : "trendingDown",
        text: `Year-end projection has moved ${worse ? "up" : "down"} ${eur0(Math.abs(trendD))} over the last 4 weeks, now ${eur0(stats.projection)}.`,
        drill: { section: "projection" }, mag: Math.abs(trendD) / stats.mainTarget + 0.2,
      });
    }

    // 2. recent 14-day pace streak — skip before 14 days of data (ratio14 is always 0 on an empty store)
    const ref14 = new Date(stats.asOf); ref14.setDate(ref14.getDate() - 14);
    const r14 = localISO(ref14);
    const last14 = stats.upto.filter((t) => t.date > r14).reduce((a, t) => a + t.amount_eur, 0);
    const d14 = last14 / 14;
    const ratio14 = d14 / linDaily;
    if (stats.doy >= 14 && stats.upto.length > 0 && (ratio14 > 1.15 || ratio14 < 0.7)) {
      const hot = ratio14 > 1;
      out.push({
        id: "streak", severity: hot ? (ratio14 > 1.35 ? "alert" : "watch") : "good",
        icon: "activity",
        text: `Last 14 days are running ${signedPct(ratio14 - 1)} ${hot ? "above" : "below"} linear pace — ${eur0(d14)}/day vs ${eur0(linDaily)}/day.`,
        drill: { section: "projection" }, mag: Math.abs(ratio14 - 1) + 0.15,
      });
    }

    // 3. category month-over-month mover (last full month vs prior)
    const curMonth = stats.asOf.getMonth();
    const lastFull = curMonth - 1, prior = curMonth - 2;
    if (lastFull >= 1) {
      let best = null;
      Object.entries(stats.catMonth).forEach(([cid, arr]) => {
        const a = arr[lastFull], b = arr[prior] || 0;
        if (a < 50) return;
        const change = a - b;
        const score = Math.abs(change);
        if (!best || score > best.score) best = { cid, a, b, change, score };
      });
      if (best && Math.abs(best.change) > 60) {
        const c = window.YData.cat(best.cid);
        const pc = best.b > 0 ? best.change / best.b : 1;
        const up = best.change > 0;
        out.push({
          id: "mover", severity: up ? (Math.abs(pc) > 0.4 ? "watch" : "info") : "good",
          icon: best.cid, accent: c.color,
          text: `${c.label}: ${eur0(best.a)} in ${MONTHS_LONG[lastFull]}, ${best.b > 0 ? signedPct(pc) + " vs " + MONTHS_LONG[prior] : "new this month"}.`,
          drill: { section: "categories", category: best.cid }, mag: Math.abs(pc) * 0.6 + 0.1,
        });
      }
    }

    // 4. top category share / drift
    if (stats.catList.length) {
      const top = stats.catList[0];
      if (top.share > 0.26) {
        const c = window.YData.cat(top.id);
        out.push({
          id: "share", severity: top.share > 0.34 ? "watch" : "info", icon: top.id, accent: c.color,
          text: `${c.label} is ${pct(top.share)} of spend so far — ${eur0(top.amount)} across ${top.count} entries.`,
          drill: { section: "categories", category: top.id }, mag: top.share * 0.5,
        });
      }
    }

    // 5. buffer explanation (why projection > raw pace)
    if (stats.bufferAmt > stats.mainTarget * 0.01) {
      out.push({
        id: "buffer", severity: "info", icon: "layers",
        text: `Logged spend alone projects to ${eur0(stats.projNoBuffer)}; the ${Math.round(stats.buffer * 100)}% missed-entry buffer lifts that to ${eur0(stats.projection)}.`,
        drill: { section: "projection" }, mag: 0.05,
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
          severity: higher && diff > stats.mainTarget * 0.08 ? "watch" : higher ? "info" : "good",
          icon: higher ? "trendingUp" : "trendingDown",
          text: `Spending is ${eur0(Math.abs(diff))} (${signedPct(diffPct)}) ${higher ? "higher" : "lower"} than the same point in ${stats.year - 1}.`,
          drill: { section: "projection" }, mag: Math.abs(diff) / stats.mainTarget * 0.7 + 0.05,
        });
      }
    }

    // 7. required daily pace (current year, projection over mainTarget)
    const reqDaily = requiredDailyToHit(stats);
    if (reqDaily !== null) {
      out.push({
        id: "reqpace",
        severity: stats.status === "alert" ? "watch" : "info",
        icon: "activity",
        text: `Spend ≤ ${eur0(reqDaily)}/day from here to finish on main budget target.`,
        drill: { section: "projection" },
        mag: stats.deltaPct * 0.5 + 0.1,
      });
    }

    const sev = { alert: 3, watch: 2, info: 1, good: 0 };
    out.sort((a, b) => (sev[b.severity] - sev[a.severity]) || (b.mag - a.mag));

    // 8. ceiling detector (current year only) — sacred combined verdict, always top
    // Skip entirely when the store has no data yet (avoids "room to raise fun €X/mo" noise on first load).
    let ceilingCallout = null;
    if (stats.isCurrent && !(stats.upto.length === 0 && stats.funSpent === 0)) {
      if (stats.combinedProjection > stats.ceiling) {
        const monthsLeft = Math.max(1, (365 - stats.doy) / 30.4);
        const overBy = stats.combinedProjection - stats.ceiling;
        const trimPer = overBy / monthsLeft;
        const severity = overBy > stats.ceiling * 0.08 ? "alert" : "watch";
        ceilingCallout = {
          id: "ceiling", severity, icon: "trendingUp",
          text: `Household projects to ${eur0(stats.combinedProjection)} against your ${eur0(stats.ceiling)} ceiling — trim fun spending by ~${eur0(trimPer)}/mo to stay within it.`,
          drill: { section: "fun" }, mag: 1.0,
        };
      } else if (stats.combinedProjection < stats.ceiling * 0.94) {
        const gap = stats.ceiling - stats.combinedProjection;
        const monthsLeft = Math.max(1, (365 - stats.doy) / 30.4);
        const raisePer = gap / monthsLeft;
        ceilingCallout = {
          id: "ceiling", severity: "good", icon: "checkCircle",
          text: `You're tracking ${eur0(gap)} under your ${eur0(stats.ceiling)} ceiling — room to raise the fun budget by ~${eur0(raisePer)}/mo if you want.`,
          drill: { section: "fun" }, mag: 0.5,
        };
      } else {
        // 0.94–1.00 band: tight but on course
        ceilingCallout = {
          id: "ceiling", severity: "info", icon: "checkCircle",
          text: `Tracking ${eur0(stats.ceiling - stats.combinedProjection)} under your ${eur0(stats.ceiling)} ceiling — tight but on course.`,
          drill: { section: "projection" }, mag: 0.5,
        };
      }
    }

    if (ceilingCallout) {
      out.unshift(ceilingCallout);
    } else if (!out.some((c) => sev[c.severity] >= 2)) {
      out.unshift({
        id: "calm", severity: "good", icon: "checkCircle",
        text: `Projection steady at ${eur0(stats.projection)} against your ${eur0(stats.mainTarget)} main budget — nothing notable in the data.`,
        drill: { section: "projection" }, mag: 0,
      });
    }
    return out;
  }

  // Main-budget allowance per remaining month (incl. the current one).
  // Subtracts only PRIOR months' spend so the current month is judged against a stable cap.
  function neededMonthlyCap(stats) {
    const m = stats.asOf.getMonth();
    const spentBefore = stats.byMonth.slice(0, m).reduce((a, x) => a + x.amount, 0);
    return Math.max(0, (stats.mainTarget - spentBefore) / (12 - m));
  }

  window.YCalc = {
    MONTHS, MONTHS_LONG, eur0, eur2, eurAuto, signedEur, pct, signedPct,
    dayOfYear, parseDate, localISO, fmtDateShort, fmtDateLong, yearTxns,
    cumulativeByDay, priorYearCumulative, aggregateByCategory,
    rateForMonth, computeStats, computeFun, projectionAsOf, buildCallouts,
    requiredDailyToHit, neededMonthlyCap,
  };
})();
