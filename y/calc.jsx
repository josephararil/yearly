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
  function fmtDateShort(s) { const d = parseDate(s); return MONTHS[d.getMonth()] + " " + d.getDate(); }
  function fmtDateLong(s) { const d = parseDate(s); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }

  function yearTxns(store, year) {
    return store.transactions
      .filter((t) => t.date.slice(0, 4) === String(year))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function computeStats(store, year) {
    const y = store.years[String(year)] || { target: 25000, buffer: 0.04 };
    const target = y.target, buffer = y.buffer || 0;
    const txns = yearTxns(store, year);
    const real = new Date();
    const isCurrent = Number(year) === Number(store.currentYear);
    const complete = !isCurrent && Number(year) < Number(store.currentYear);
    let asOf, doy;
    if (isCurrent) { asOf = real; doy = Math.max(1, dayOfYear(real)); }
    else { asOf = new Date(Number(year), 11, 31); doy = complete ? 365 : Math.max(1, dayOfYear(real)); }
    const asOfStr = asOf.toISOString().slice(0, 10);

    const upto = txns.filter((t) => t.date <= asOfStr);
    const spent = upto.reduce((a, t) => a + t.amount_eur, 0);
    const dailyRate = spent / doy;
    const projNoBuffer = complete ? spent : dailyRate * 365;
    const projection = complete ? spent : projNoBuffer * (1 + buffer);
    const bufferAmt = projection - projNoBuffer;
    const pace = (doy / 365) * target;
    const delta = projection - target;
    const deltaPct = delta / target;

    let status;
    if (complete) status = spent <= target ? "good" : spent <= target * 1.03 ? "watch" : "alert";
    else status = projection <= target ? "good" : projection <= target * 1.08 ? "watch" : "alert";

    // by category
    const byCat = {};
    upto.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount_eur; });
    const catList = Object.entries(byCat)
      .map(([id, amount]) => ({ id, amount, share: spent ? amount / spent : 0, count: upto.filter((t) => t.category === id).length }))
      .sort((a, b) => b.amount - a.amount);

    // by month + by category-month
    const byMonth = Array.from({ length: 12 }, (_, m) => ({ m, label: MONTHS[m], amount: 0 }));
    const catMonth = {};
    upto.forEach((t) => {
      const m = parseDate(t.date).getMonth();
      byMonth[m].amount += t.amount_eur;
      (catMonth[t.category] = catMonth[t.category] || Array(12).fill(0))[m] += t.amount_eur;
    });

    // cumulative weekly series for chart
    const dayCum = Array(366).fill(0);
    upto.forEach((t) => { dayCum[Math.min(365, dayOfYear(parseDate(t.date)))] += t.amount_eur; });
    for (let i = 1; i <= 365; i++) dayCum[i] += dayCum[i - 1];
    const series = [];
    for (let x = 0; x <= 365; x += 7) {
      const within = x <= doy;
      series.push({
        x,
        pace: Math.round((x / 365) * target),
        actual: within ? Math.round(dayCum[Math.min(365, x)]) : null,
        projected: x >= doy && !complete ? null : null,
      });
    }
    // ensure a point exactly at today + year end
    if (!complete) {
      series.push({ x: doy, pace: Math.round((doy / 365) * target), actual: Math.round(spent) });
      series.sort((a, b) => a.x - b.x);
    }
    // projected line from today->yearEnd
    const projSeries = complete ? [] : [
      { x: doy, projected: Math.round(spent) },
      { x: 365, projected: Math.round(projection) },
    ];

    return {
      year: Number(year), target, buffer, isCurrent, complete,
      asOf, asOfStr, doy, spent, dailyRate, projection, projNoBuffer, bufferAmt,
      pace, delta, deltaPct, status, txns, upto, byCat, catList, byMonth, catMonth,
      series, projSeries,
    };
  }

  // projection as-of a past offset (days back) — for trend detection
  function projectionAsOf(stats, daysBack) {
    const ref = new Date(stats.asOf); ref.setDate(ref.getDate() - daysBack);
    const refStr = ref.toISOString().slice(0, 10);
    const doy = Math.max(1, dayOfYear(ref));
    const spent = stats.txns.filter((t) => t.date <= refStr).reduce((a, t) => a + t.amount_eur, 0);
    return spent / doy * 365 * (1 + stats.buffer);
  }

  // ---- Callout engine ----
  function buildCallouts(store, stats) {
    if (stats.complete) {
      const over = stats.spent > stats.target;
      return [{
        id: "final", severity: over ? "watch" : "good", icon: over ? "trendingUp" : "checkCircle",
        text: `Finished ${over ? "over" : "under"} target by ${eur0(Math.abs(stats.delta))} — ${eur0(stats.spent)} against a ${eur0(stats.target)} target.`,
        drill: { section: "projection" }, mag: Math.abs(stats.deltaPct),
      }];
    }
    const out = [];
    const linDaily = stats.target / 365;

    // 1. projection trend (vs 4 weeks ago)
    const proj4 = projectionAsOf(stats, 28);
    const trendD = stats.projection - proj4;
    if (Math.abs(trendD) > stats.target * 0.012) {
      const worse = trendD > 0;
      out.push({
        id: "trend", severity: worse ? (Math.abs(trendD) > stats.target * 0.04 ? "alert" : "watch") : "good",
        icon: worse ? "trendingUp" : "trendingDown",
        text: `Year-end projection has moved ${worse ? "up" : "down"} ${eur0(Math.abs(trendD))} over the last 4 weeks, now ${eur0(stats.projection)}.`,
        drill: { section: "projection" }, mag: Math.abs(trendD) / stats.target + 0.2,
      });
    }

    // 2. recent 14-day pace streak
    const ref14 = new Date(stats.asOf); ref14.setDate(ref14.getDate() - 14);
    const r14 = ref14.toISOString().slice(0, 10);
    const last14 = stats.upto.filter((t) => t.date > r14).reduce((a, t) => a + t.amount_eur, 0);
    const d14 = last14 / 14;
    const ratio14 = d14 / linDaily;
    if (ratio14 > 1.15 || ratio14 < 0.7) {
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
    if (stats.bufferAmt > stats.target * 0.01) {
      out.push({
        id: "buffer", severity: "info", icon: "layers",
        text: `Logged spend alone projects to ${eur0(stats.projNoBuffer)}; the ${Math.round(stats.buffer * 100)}% missed-entry buffer lifts that to ${eur0(stats.projection)}.`,
        drill: { section: "projection" }, mag: 0.05,
      });
    }

    const sev = { alert: 3, watch: 2, info: 1, good: 0 };
    out.sort((a, b) => (sev[b.severity] - sev[a.severity]) || (b.mag - a.mag));

    if (!out.some((c) => sev[c.severity] >= 2)) {
      out.unshift({
        id: "calm", severity: "good", icon: "checkCircle",
        text: `Projection steady at ${eur0(stats.projection)} against your ${eur0(stats.target)} target — nothing notable in the data.`,
        drill: { section: "projection" }, mag: 0,
      });
    }
    return out;
  }

  window.YCalc = {
    MONTHS, MONTHS_LONG, eur0, eur2, eurAuto, signedEur, pct, signedPct,
    dayOfYear, parseDate, fmtDateShort, fmtDateLong, yearTxns,
    computeStats, projectionAsOf, buildCallouts,
  };
})();
