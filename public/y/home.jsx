// home.jsx — calm overview: status hero + fun strip + monthly spend curve.
(function () {
  const { YUI, YFun, YTravel, YCalc } = window;
  const { StatusHero, SectionH, rich, ChartExplain } = YUI;
  const { FunStrip } = YFun;
  const { TravelStrip } = YTravel;
  const { MONTHS, eur0 } = YCalc;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const SegmentedControl = DS.SegmentedControl;

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const eurK = (v) => (Math.abs(v) >= 1000 ? "€" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k" : "€" + Math.round(v));

  function ToggleChip({ label, active, color, onClick }) {
    return (
      <button onClick={onClick} style={{
        height: 26, padding: "0 10px", borderRadius: 99, flexShrink: 0,
        fontFamily: "var(--mono)", fontSize: 11, fontWeight: 500,
        cursor: "pointer", whiteSpace: "nowrap",
        border: "1px solid " + (active ? color : "var(--hair)"),
        background: active ? "color-mix(in srgb, " + color + " 12%, transparent)" : "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
      }}>{label}</button>
    );
  }

  function MonthCurve({ stats, store }) {
    const W = 340, H = 280, padL = 40, padR = 14, padT = 14, padB = 24;
    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const [showPace, setShowPace] = React.useState(true);
    const [showProj, setShowProj] = React.useState(true);
    const [showTarget, setShowTarget] = React.useState(true);
    const [showMonthEnd, setShowMonthEnd] = React.useState(true);
    const [showPrev, setShowPrev] = React.useState(false);

    if (stats.complete) {
      return (
        <p className="muted" style={{ textAlign: "center", padding: "24px 0", fontSize: 12, fontFamily: "var(--mono)" }}>
          Year {stats.year} is complete — switch to This year or Monthly breakdown for the full picture.
        </p>
      );
    }
    if (stats.isFuture) {
      return (
        <p className="muted" style={{ textAlign: "center", padding: "24px 0", fontSize: 12, fontFamily: "var(--mono)" }}>
          Nothing logged yet for {stats.year}.
        </p>
      );
    }

    const asOf = stats.asOf;
    const year = asOf.getFullYear();
    const month = asOf.getMonth();
    const dayOfMonth = asOf.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const isPartialMonth = dayOfMonth < daysInMonth;

    const monthStr = String(year) + "-" + String(month + 1).padStart(2, "0");
    const monthTxns = stats.upto.filter((t) => t.date.startsWith(monthStr));

    // Day-by-day cumulative for this month
    const dayCum = Array(daysInMonth + 1).fill(0);
    monthTxns.forEach((t) => {
      const d = new Date(t.date + "T00:00:00").getDate();
      if (d >= 1 && d <= daysInMonth) dayCum[d] += t.amount_eur;
    });
    for (let d = 1; d <= daysInMonth; d++) dayCum[d] += dayCum[d - 1];

    const spentSoFar = dayCum[dayOfMonth];
    const neededMonthly = YCalc.neededMonthlyCap(stats);
    const projectedEnd = YCalc.projectedMonthEnd(stats);
    const band = isPartialMonth ? YCalc.monthEndBand(stats, store) : null;

    // Previous month cumulative (same year only; skipped for January)
    let hasPrevData = false, prevDaysInMonth = 30, prevDayCum = null;
    if (month > 0) {
      const pm = month - 1;
      const pmStr = String(year) + "-" + String(pm + 1).padStart(2, "0");
      prevDaysInMonth = new Date(year, pm + 1, 0).getDate();
      const pmTxns = stats.upto.filter((t) => t.date.startsWith(pmStr));
      if (pmTxns.length > 0) {
        const pdc = Array(prevDaysInMonth + 1).fill(0);
        pmTxns.forEach((t) => {
          const d = new Date(t.date + "T00:00:00").getDate();
          if (d >= 1 && d <= prevDaysInMonth) pdc[d] += t.amount_eur;
        });
        for (let d = 1; d <= prevDaysInMonth; d++) pdc[d] += pdc[d - 1];
        prevDayCum = pdc;
        hasPrevData = true;
      }
    }
    const prevTotal = hasPrevData ? prevDayCum[prevDaysInMonth] : 0;

    const maxY = Math.max(neededMonthly, projectedEnd, spentSoFar, prevTotal, band ? band.high : 0, 1) * 1.12;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const sx = (d) => x0 + ((d - 1) / Math.max(1, daysInMonth - 1)) * (x1 - x0);
    // Prev month scaled proportionally to the same x-range regardless of day count diff
    const sxPrev = (d) => x0 + ((d - 1) / Math.max(1, prevDaysInMonth - 1)) * (x1 - x0);
    const sy = (v) => y1 - (v / maxY) * (y1 - y0);

    // Actual line points
    const actPts = [];
    for (let d = 1; d <= dayOfMonth; d++) actPts.push([sx(d), sy(dayCum[d])]);
    const actLine = actPts.map((p) => p.join(",")).join(" ");
    const areaPts = actPts.length > 0
      ? `${x0},${y1} ${actLine} ${actPts[actPts.length - 1][0]},${y1}`
      : "";

    // Previous month line points
    const prevPts = hasPrevData
      ? Array.from({ length: prevDaysInMonth }, (_, i) => [sxPrev(i + 1), sy(prevDayCum[i + 1])])
      : [];
    const prevLine = prevPts.map((p) => p.join(",")).join(" ");

    // Nice round Y-axis gridlines
    const roughStep = maxY / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1))));
    const mult = roughStep / mag;
    const step = mult <= 1 ? mag : mult <= 2 ? 2 * mag : mult <= 5 ? 5 * mag : 10 * mag;
    const yTicks = [];
    for (let v = 0; v <= maxY * 1.001; v += step) yTicks.push(Math.round(v));

    // X-axis: ~6 evenly spaced day labels
    const xStep = Math.ceil(daysInMonth / 6);
    const xLabels = [];
    for (let d = 1; d <= daysInMonth; d += xStep) xLabels.push(d);
    if (xLabels[xLabels.length - 1] !== daysInMonth) xLabels.push(daysInMonth);

    const uid = "mc" + year + month;

    // Label collision avoidance: if target and month-end lines are close, flip est label to left
    const estLabelLeft = showMonthEnd && isPartialMonth && Math.abs(sy(projectedEnd) - sy(neededMonthly)) < 18;

    const handlePointer = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      const frac = (rawX - x0) / (x1 - x0);
      const day = Math.max(1, Math.min(daysInMonth, Math.round(frac * (daysInMonth - 1) + 1)));
      let val, isProj = false;
      if (day <= dayOfMonth) {
        val = dayCum[day];
      } else if (showProj) {
        // Interpolate along the same line drawn on the chart (dayOfMonth,spentSoFar) →
        // (daysInMonth,projectedEnd) — projectedEnd already excludes oneoff/lump tx from the
        // extrapolated rate, so the hover value must match it rather than re-deriving a raw rate.
        val = spentSoFar + (projectedEnd - spentSoFar) * (day - dayOfMonth) / Math.max(1, daysInMonth - dayOfMonth);
        isProj = true;
      } else {
        val = dayCum[dayOfMonth];
      }
      setHover({ day, x: sx(day), y: sy(val), val, label: MONTHS_SHORT[month] + " " + day, isProj });
    };
    const handleEnd = () => setHover(null);

    const prevMonthName = month > 0 ? MONTHS_SHORT[month - 1] : "";

    const legendItems = [
      { color: "var(--chart-actual)", label: `Actual (${eurK(spentSoFar)})`, desc: "cumulative spend this month, day by day" },
      { color: "var(--chart-pace)", label: "Pace", desc: "ideal linear trajectory to reach the monthly target" },
      { color: "var(--chart-target)", label: `Target (${eurK(neededMonthly)})`, desc: "allowance per month to finish the year within your ceiling, given prior months' spend" },
      { color: "var(--chart-proj)", label: "Projection", desc: "extrapolated trend from your current daily rate" },
      ...(isPartialMonth ? [{ color: "var(--chart-proj)", label: `Month-end (${eurK(projectedEnd)})`, desc: "estimated total for this month if today's rate continues" }] : []),
      ...(band ? [{ color: "var(--chart-proj)", label: `Range (±${eurK(band.bandAmt)})`, desc: "forecast uncertainty — day-to-day noise plus the spread across your own past months, narrowing to zero by month-end" }] : []),
      ...(hasPrevData ? [{ color: "var(--amber)", label: `${prevMonthName} (${eurK(prevTotal)})`, desc: "last month's spending curve for comparison (scaled to same width)" }] : []),
    ];

    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <ToggleChip label="Pace" active={showPace} color="var(--chart-pace)" onClick={() => setShowPace((s) => !s)} />
          <ToggleChip label="Projection" active={showProj} color="var(--chart-proj)" onClick={() => setShowProj((s) => !s)} />
          <ToggleChip label="Target" active={showTarget} color="var(--chart-target)" onClick={() => setShowTarget((s) => !s)} />
          {isPartialMonth && <ToggleChip label="Month-end" active={showMonthEnd} color="var(--chart-proj)" onClick={() => setShowMonthEnd((s) => !s)} />}
          {hasPrevData && <ToggleChip label={prevMonthName} active={showPrev} color="var(--amber)" onClick={() => setShowPrev((s) => !s)} />}
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", overflow: "visible", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-actual)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-actual)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y-axis grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(v)} x2={x1} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={x0 - 6} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{eurK(v)}</text>
            </g>
          ))}

          {/* X-axis day labels */}
          {xLabels.map((d) => (
            <text key={d} x={sx(d)} y={H - 8} textAnchor="middle" fontSize="9"
              fill={d === dayOfMonth ? "var(--ink)" : "var(--chart-axis)"}
              fontFamily="var(--mono)">{d}</text>
          ))}

          {/* Prev month overlay — behind everything else */}
          {showPrev && prevPts.length > 1 && (
            <polyline points={prevLine} fill="none" stroke="var(--amber)"
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.38" />
          )}

          {/* Target line — monthly cap needed to finish under ceiling */}
          {showTarget && (
            <>
              <line x1={x0} y1={sy(neededMonthly)} x2={x1} y2={sy(neededMonthly)}
                stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="4 4" />
              <text x={x1} y={sy(neededMonthly) - 4} textAnchor="end" fontSize="9"
                fill="var(--chart-target)" fontFamily="var(--mono)">target {eurK(neededMonthly)}</text>
            </>
          )}

          {/* Projected month-end — horizontal line at where projection lands */}
          {showMonthEnd && isPartialMonth && (
            <>
              <line x1={x0} y1={sy(projectedEnd)} x2={x1} y2={sy(projectedEnd)}
                stroke="var(--chart-proj)" strokeWidth="1" strokeDasharray="2 5" opacity="0.5" />
              <text
                x={estLabelLeft ? x0 : x1}
                y={estLabelLeft ? sy(projectedEnd) - 4 : sy(projectedEnd) + 10}
                textAnchor={estLabelLeft ? "start" : "end"}
                fontSize="9" fill="var(--chart-proj)" fontFamily="var(--mono)">est. {eurK(projectedEnd)}</text>
            </>
          )}

          {/* Pace line */}
          {showPace && (
            <line x1={sx(1)} y1={sy(0)} x2={sx(daysInMonth)} y2={sy(neededMonthly)}
              stroke="var(--chart-pace)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
          )}

          {/* Actual area fill */}
          {areaPts && <polygon points={areaPts} fill={`url(#${uid})`} />}

          {/* Actual line */}
          {actPts.length > 1 && (
            <polyline points={actLine} fill="none" stroke="var(--chart-actual)"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Uncertainty cone — rendered beneath the projection line */}
          {showProj && isPartialMonth && band && (
            <polygon
              points={`${sx(dayOfMonth)},${sy(spentSoFar)} ${sx(daysInMonth)},${sy(band.high)} ${sx(daysInMonth)},${sy(band.low)}`}
              fill="var(--chart-proj)" opacity="0.10" stroke="none"
            />
          )}

          {/* Projection line */}
          {showProj && isPartialMonth && (
            <>
              <line x1={sx(dayOfMonth)} y1={sy(spentSoFar)}
                x2={sx(daysInMonth)} y2={sy(projectedEnd)}
                stroke="var(--chart-proj)" strokeWidth="2.2" strokeDasharray="6 5" strokeLinecap="round" />
              <circle cx={sx(daysInMonth)} cy={sy(projectedEnd)} r="3.2" fill="var(--chart-proj)" />
              <circle cx={sx(dayOfMonth)} cy={sy(spentSoFar)} r="3.6"
                fill="var(--chart-actual)" stroke="var(--paper)" strokeWidth="1.5" />
            </>
          )}

          {/* Hover crosshair + tooltip */}
          {hover && (
            <>
              <line x1={hover.x} y1={y0} x2={hover.x} y2={y1}
                stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              <circle cx={hover.x} cy={hover.y} r="4"
                fill={hover.isProj ? "var(--chart-proj)" : "var(--chart-actual)"}
                stroke="var(--paper)" strokeWidth="2" />
              {(() => {
                const tw = 80, th = 34;
                const tx = hover.x > W / 2 ? hover.x - tw - 8 : hover.x + 8;
                const ty = Math.max(y0 + 2, hover.y - th - 4);
                return (
                  <>
                    <rect x={tx} y={ty} width={tw} height={th} rx="5"
                      fill="var(--paper)" stroke="var(--hair-strong)" strokeWidth="0.8" />
                    <text x={tx + tw / 2} y={ty + 13} textAnchor="middle"
                      fontSize="11" fill="var(--ink)" fontFamily="var(--mono)" fontWeight="600">
                      {eurK(hover.val)}
                    </text>
                    <text x={tx + tw / 2} y={ty + 27} textAnchor="middle"
                      fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{hover.label}</text>
                  </>
                );
              })()}
            </>
          )}
        </svg>

        <ChartExplain storageKey="month-curve" items={legendItems} />
      </div>
    );
  }

  // ── "This year" cumulative line chart (moved here from analysis.jsx so all charts share one
  // switcher on the Overview). Hand-built SVG — interactive crosshair, toggleable series.
  function ProjectionChart({ stats }) {
    const W = 340, H = 252, padL = 40, padR = 14, padT = 14, padB = 24;
    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const [showPace, setShowPace] = React.useState(true);
    const [showPrior, setShowPrior] = React.useState(true);
    const [showProj, setShowProj] = React.useState(true);
    const [showMain, setShowMain] = React.useState(true);

    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const priorCum = stats.priorCum;
    const priorMax = priorCum ? priorCum[Math.min(365, stats.doy)] : 0;
    const maxY = Math.max(stats.mainTarget, stats.ceiling, stats.projection, priorMax, stats.projHigh || 0) * 1.1;
    const sx = (d) => x0 + (d / 365) * (x1 - x0);
    const sy = (v) => y1 - (v / maxY) * (y1 - y0);
    const cum = YCalc.cumulativeByDay(stats.upto);

    const actDays = [];
    for (let d = 0; d <= stats.doy; d += 7) actDays.push(d);
    if (actDays[actDays.length - 1] !== stats.doy) actDays.push(stats.doy);
    if (stats.complete) { actDays.length = 0; for (let d = 0; d <= 365; d += 7) actDays.push(d); actDays.push(365); }
    const actPts = actDays.map((d) => [sx(d), sy(cum[Math.min(365, d)])]);
    const actLine = actPts.map((p) => p.join(",")).join(" ");
    const areaPts = `${x0},${y1} ${actLine} ${actPts[actPts.length - 1][0]},${y1}`;

    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
    const showMonths = [0, 2, 4, 6, 8, 10];
    const uid = "pg" + stats.year;

    const handlePointer = (e) => {
      if (stats.isFuture) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      const clampedX = Math.max(x0, Math.min(x1, rawX));
      const day = Math.max(0, Math.min(365, Math.round(((clampedX - x0) / (x1 - x0)) * 365)));
      const maxActualDay = stats.complete ? 365 : stats.doy;
      let val, isProj = false;
      if (day <= maxActualDay) {
        val = cum[day];
      } else if (!stats.complete && showProj) {
        const t = (day - stats.doy) / Math.max(1, 365 - stats.doy);
        val = stats.spent + t * (stats.projection - stats.spent);
        isProj = true;
      } else {
        val = cum[maxActualDay];
      }
      // Day-of-year → month label
      let month = 0;
      for (let m = 1; m < MONTH_STARTS.length; m++) { if (MONTH_STARTS[m] <= day) month = m; }
      const dayOfMonth = day - MONTH_STARTS[month] + 1;
      setHover({ day, x: sx(day), y: sy(val), val, dateLabel: MONTHS[month] + " " + dayOfMonth, isProj });
    };
    const handleEnd = () => setHover(null);

    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <ToggleChip label="Pace" active={showPace} color="var(--chart-pace)" onClick={() => setShowPace(!showPace)} />
          {!stats.complete && !stats.isFuture && <ToggleChip label="Projection" active={showProj} color="var(--chart-proj)" onClick={() => setShowProj(!showProj)} />}
          <ToggleChip label="Main" active={showMain} color="var(--ink-2)" onClick={() => setShowMain(!showMain)} />
          {priorCum && <ToggleChip label={String(stats.year - 1)} active={showPrior} color="var(--chart-target)" onClick={() => setShowPrior(!showPrior)} />}
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", overflow: "visible", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-actual)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-actual)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {grid.map((v, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(v)} x2={x1} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={x0 - 6} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{eurK(v)}</text>
            </g>
          ))}
          {showMonths.map((m) => (
            <text key={m} x={sx(MONTH_STARTS[m])} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{MONTHS[m]}</text>
          ))}
          {/* target = ceiling — always shown */}
          <line x1={x0} y1={sy(stats.ceiling)} x2={x1} y2={sy(stats.ceiling)} stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="4 4" />
          <text x={x1} y={sy(stats.ceiling) - 5} textAnchor="end" fontSize="9" fill="var(--chart-target)" fontFamily="var(--mono)">target {eurK(stats.ceiling)}</text>
          {/* main-budget decomposition — faint reference, not the target */}
          {showMain && (
            <>
              <line x1={x0} y1={sy(stats.mainTarget)} x2={x1} y2={sy(stats.mainTarget)} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
              <text x={x1} y={sy(stats.mainTarget) - 5} textAnchor="end" fontSize="9" fill="var(--ink-2)" fontFamily="var(--mono)" opacity="0.5">main {eurK(stats.mainTarget)}</text>
            </>
          )}
          {/* linear pace */}
          {showPace && <line x1={sx(0)} y1={sy(0)} x2={sx(365)} y2={sy(stats.ceiling)} stroke="var(--chart-pace)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />}
          {/* prior year */}
          {showPrior && priorCum && (() => {
            const endDay = stats.complete ? 365 : stats.doy;
            const days = [];
            for (let d = 0; d <= endDay; d += 7) days.push(d);
            if (days[days.length - 1] !== endDay) days.push(endDay);
            const pts = days.map((d) => sx(d) + "," + sy(priorCum[Math.min(365, d)])).join(" ");
            return <polyline points={pts} fill="none" stroke="var(--chart-target)" strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />;
          })()}
          {/* actual area + line */}
          <polygon points={areaPts} fill={`url(#${uid})`} />
          <polyline points={actLine} fill="none" stroke="var(--chart-actual)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          {/* uncertainty band — rendered beneath the projection line */}
          {showProj && !stats.complete && !stats.isFuture && stats.projLow != null && (
            <polygon
              points={`${sx(stats.doy)},${sy(stats.spent)} ${sx(365)},${sy(stats.projHigh)} ${sx(365)},${sy(stats.projLow)}`}
              fill="var(--chart-proj)" opacity="0.10" stroke="none"
            />
          )}
          {/* projected */}
          {showProj && !stats.complete && !stats.isFuture && (
            <>
              <line x1={sx(stats.doy)} y1={sy(stats.spent)} x2={sx(365)} y2={sy(stats.projection)} stroke="var(--chart-proj)" strokeWidth="2.2" strokeDasharray="6 5" strokeLinecap="round" />
              <circle cx={sx(365)} cy={sy(stats.projection)} r="3.2" fill="var(--chart-proj)" />
              <circle cx={sx(stats.doy)} cy={sy(stats.spent)} r="3.6" fill="var(--chart-actual)" stroke="var(--paper)" strokeWidth="1.5" />
            </>
          )}
          {/* crosshair tooltip */}
          {hover && !stats.isFuture && (
            <>
              <line x1={hover.x} y1={y0} x2={hover.x} y2={y1} stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              <circle cx={hover.x} cy={hover.y} r="4" fill={hover.isProj ? "var(--chart-proj)" : "var(--chart-actual)"} stroke="var(--paper)" strokeWidth="2" />
              {(() => {
                const tw = 80, th = 34;
                const tx = hover.x > W / 2 ? hover.x - tw - 8 : hover.x + 8;
                const ty = Math.max(y0 + 2, hover.y - th - 4);
                return (
                  <>
                    <rect x={tx} y={ty} width={tw} height={th} rx="5" fill="var(--paper)" stroke="var(--hair-strong)" strokeWidth="0.8" />
                    <text x={tx + tw / 2} y={ty + 13} textAnchor="middle" fontSize="11" fill="var(--ink)" fontFamily="var(--mono)" fontWeight="600">{eurK(hover.val)}</text>
                    <text x={tx + tw / 2} y={ty + 27} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{hover.dateLabel}</text>
                  </>
                );
              })()}
            </>
          )}
        </svg>
      </div>
    );
  }

  function ChartLegend({ stats }) {
    const Item = ({ c, dash, rect, label }) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        {rect
          ? <svg width="14" height="10"><rect x="0" y="2" width="14" height="6" rx="1.5" fill={c} opacity="0.30" /></svg>
          : <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2.4" strokeDasharray={dash || "0"} strokeLinecap="round" /></svg>
        }
        {label}
      </span>
    );
    return (
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
        <Item c="var(--chart-actual)" label="Actual" />
        {!stats.complete && <Item c="var(--chart-proj)" dash="6 5" label="Projected" />}
        {!stats.complete && !stats.isFuture && stats.projLow != null && <Item c="var(--chart-proj)" rect label="Range" />}
        <Item c="var(--chart-pace)" dash="2 4" label="Linear pace" />
        {stats.priorCum && <Item c="var(--chart-target)" dash="3 4" label={`${stats.year - 1}`} />}
      </div>
    );
  }

  function LegendItem({ c, dash, rect, label }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        {rect
          ? <svg width="14" height="10"><rect x="0" y="2" width="14" height="6" rx="1.5" fill={c} opacity="0.82" /></svg>
          : <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2.2" strokeDasharray={dash || "0"} strokeLinecap="round" /></svg>
        }
        {label}
      </span>
    );
  }

  // ── "Monthly breakdown" bar chart (moved here from analysis.jsx). One bar per calendar month.
  function MonthlyBarsChart({ stats }) {
    const W = 340, H = 170, padL = 38, padR = 10, padT = 12, padB = 20;
    const barArea = W - padL - padR;
    const slot = barArea / 12;
    const bw = Math.max(8, Math.floor(slot * 0.65));
    const barLeft = (m) => padL + m * slot + (slot - bw) / 2;
    const barCenter = (m) => padL + m * slot + slot / 2;

    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const [showAvg, setShowAvg] = React.useState(true);
    const [showPeak, setShowPeak] = React.useState(true);
    const [showReq, setShowReq] = React.useState(true);

    const curMonth = stats.isFuture ? -1 : stats.asOf.getMonth();
    const amounts = stats.byMonth.map((m) => m.amount);

    const completedMonths = stats.complete ? 12 : curMonth;
    const completedAmounts = amounts.slice(0, completedMonths);
    const avgMonthly = completedMonths > 0 ? completedAmounts.reduce((a, v) => a + v, 0) / completedMonths : 0;
    const maxMonthly = completedMonths > 0 ? Math.max(...completedAmounts) : 0;

    const requiredMonthlyAvg = (!stats.complete && !stats.isFuture)
      ? YCalc.neededMonthlyCap(stats) : 0;

    const maxY = Math.max(1, avgMonthly * 1.1, maxMonthly, requiredMonthlyAvg, ...amounts) * 1.2;
    const sy = (v) => padT + (1 - v / maxY) * (H - padT - padB);

    const canShowPeak = maxMonthly > avgMonthly * 1.1 && completedMonths > 0;
    const canShowReq = !stats.complete && !stats.isFuture && requiredMonthlyAvg > 0;

    const handlePointer = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      const month = Math.max(0, Math.min(11, Math.floor((rawX - padL) / slot)));
      const amt = amounts[month];
      const isCur = !stats.complete && month === curMonth;
      const isFut = !stats.complete && !stats.isFuture && month > curMonth;
      if (isFut) {
        setHover({
          month, x: barCenter(month),
          y: canShowReq ? sy(requiredMonthlyAvg) : padT + 20,
          val: requiredMonthlyAvg, label: MONTHS[month], subLabel: canShowReq ? "needed/mo" : null, isFut: true,
        });
      } else {
        setHover({
          month, x: barCenter(month), y: sy(amt),
          val: amt, label: MONTHS[month] + (isCur ? " (so far)" : ""), subLabel: null, isFut: false,
        });
      }
    };
    const handleEnd = () => setHover(null);

    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {avgMonthly > 0 && <ToggleChip label="Avg" active={showAvg} color="var(--chart-pace)" onClick={() => setShowAvg(!showAvg)} />}
          {canShowPeak && <ToggleChip label="Peak" active={showPeak} color="var(--amber)" onClick={() => setShowPeak(!showPeak)} />}
          {canShowReq && <ToggleChip label="Needed/mo" active={showReq} color="var(--chart-proj)" onClick={() => setShowReq(!showReq)} />}
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", overflow: "visible", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>

          {/* grid + y-axis */}
          {[0, 0.5, 1].map((f) => {
            const v = f * maxY;
            return (
              <g key={f}>
                <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth="0.8" />
                {f > 0 && <text x={padL - 4} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{eurK(v)}</text>}
              </g>
            );
          })}

          {/* bars */}
          {amounts.map((amt, m) => {
            const isPast = m < curMonth || stats.complete;
            const isCur = !stats.complete && m === curMonth;
            const isHov = hover && hover.month === m;
            const barH = Math.max(0, (amt / maxY) * (H - padT - padB));
            if (barH < 1 && !isCur) return null;
            return (
              <rect key={m} x={barLeft(m)} y={sy(amt)} width={bw} height={Math.max(1, barH)} rx="2"
                fill={isCur ? "color-mix(in srgb, var(--chart-actual) 55%, transparent)" : "var(--chart-actual)"}
                opacity={isHov ? 1 : isPast ? 0.82 : 1}
                stroke={isHov ? "var(--chart-actual)" : "none"} strokeWidth={isHov ? 1.5 : 0}
              />
            );
          })}

          {/* month labels */}
          {amounts.map((_, m) => (
            <text key={m} x={barCenter(m)} y={H - 4} textAnchor="middle" fontSize="9"
              fontWeight={hover && hover.month === m ? "600" : "400"}
              fill={hover && hover.month === m ? "var(--ink)" : m === curMonth ? "var(--ink)" : "var(--chart-axis)"}
              fontFamily="var(--mono)">{MONTHS[m][0]}</text>
          ))}

          {/* reference lines with inline labels */}
          {showAvg && avgMonthly > 0 && (
            <>
              <line x1={padL} y1={sy(avgMonthly)} x2={W - padR} y2={sy(avgMonthly)}
                stroke="var(--chart-pace)" strokeWidth="1.3" strokeDasharray="4 3" opacity="0.9" />
              <text x={padL + 3} y={sy(avgMonthly) - 3} textAnchor="start" fontSize="9"
                fill="var(--chart-pace)" fontFamily="var(--mono)">avg {eurK(avgMonthly)}</text>
            </>
          )}
          {showPeak && canShowPeak && (
            <>
              <line x1={padL} y1={sy(maxMonthly)} x2={W - padR} y2={sy(maxMonthly)}
                stroke="var(--amber)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
              <text x={W - padR} y={sy(maxMonthly) - 3} textAnchor="end" fontSize="9"
                fill="var(--amber)" fontFamily="var(--mono)">peak {eurK(maxMonthly)}</text>
            </>
          )}
          {showReq && canShowReq && (
            <>
              <line x1={padL + curMonth * slot} y1={sy(requiredMonthlyAvg)} x2={W - padR} y2={sy(requiredMonthlyAvg)}
                stroke="var(--chart-proj)" strokeWidth="1.5" strokeDasharray="5 4" />
              <text x={W - padR} y={sy(requiredMonthlyAvg) - 3} textAnchor="end" fontSize="9"
                fill="var(--chart-proj)" fontFamily="var(--mono)">needed {eurK(requiredMonthlyAvg)}</text>
            </>
          )}

          {/* crosshair + tooltip */}
          {hover && (
            <>
              <line x1={hover.x} y1={padT} x2={hover.x} y2={H - padB}
                stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              {hover.val > 0 && (
                <circle cx={hover.x} cy={hover.y} r="3.5"
                  fill={hover.isFut ? "var(--chart-proj)" : "var(--chart-actual)"}
                  stroke="var(--paper)" strokeWidth="1.5" />
              )}
              {(() => {
                const tw = 96, th = hover.subLabel ? 42 : 34;
                const tx = hover.x > W / 2 ? hover.x - tw - 8 : hover.x + 8;
                const ty = Math.max(padT + 2, hover.y - th - 6);
                return (
                  <>
                    <rect x={tx} y={ty} width={tw} height={th} rx="5"
                      fill="var(--paper)" stroke="var(--hair-strong)" strokeWidth="0.8" />
                    <text x={tx + tw / 2} y={ty + 13} textAnchor="middle"
                      fontSize="11" fill="var(--ink)" fontFamily="var(--mono)" fontWeight="600">
                      {hover.val > 0 ? eurK(hover.val) : "—"}
                    </text>
                    <text x={tx + tw / 2} y={ty + 27} textAnchor="middle"
                      fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{hover.label}</text>
                    {hover.subLabel && (
                      <text x={tx + tw / 2} y={ty + 39} textAnchor="middle"
                        fontSize="9" fill="var(--chart-proj)" fontFamily="var(--mono)">{hover.subLabel}</text>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </svg>

        {/* legend */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, justifyContent: "center" }}>
          <LegendItem c="var(--chart-actual)" rect label="Actual" />
          {showAvg && avgMonthly > 0 && <LegendItem c="var(--chart-pace)" dash="4 3" label="Mo avg" />}
          {showPeak && canShowPeak && <LegendItem c="var(--amber)" dash="2 3" label="Peak mo" />}
          {showReq && canShowReq && <LegendItem c="var(--chart-proj)" dash="5 4" label="Needed/mo" />}
        </div>

        <ChartExplain storageKey="monthly-breakdown" items={[
          { color: "var(--chart-actual)", label: "Bars", desc: "monthly total spend (main + fun)" },
          ...(avgMonthly > 0 ? [{ color: "var(--chart-pace)", label: `Avg (${eurK(avgMonthly)}/mo)`, desc: "monthly average over completed months" }] : []),
          ...(canShowPeak ? [{ color: "var(--amber)", label: `Peak (${eurK(maxMonthly)})`, desc: "highest single month so far" }] : []),
          ...(canShowReq ? [{ color: "var(--chart-proj)", label: `Needed/mo (${eurK(requiredMonthlyAvg)})`, desc: "monthly cap required to finish the year within your ceiling" }] : []),
        ]} />
      </div>
    );
  }

  // ── "Estimate over time" — how the projected year-end total (the holy number) has moved as
  // spend accrued. A derivative-flavoured view of the raw spend charts: the line can fall as you
  // slow down, which the cumulative charts never show. Pure retroactive derivation via
  // YCalc.projectionHistory (no stored snapshots). The y-axis is zoomed to the data range (it does
  // NOT start at 0) so a €2–3k move on a €27k number is actually visible — the whole point is the
  // change, not the absolute. Ceiling + main target frame it as fixed reference lines.
  function EstimateChart({ stats }) {
    const W = 340, H = 252, padL = 44, padR = 14, padT = 20, padB = 24;
    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const [showCeiling, setShowCeiling] = React.useState(true);
    const [showTarget, setShowTarget] = React.useState(true);

    if (stats.isFuture || stats.complete) {
      return (
        <p className="muted" style={{ textAlign: "center", padding: "24px 0", fontSize: 12, fontFamily: "var(--mono)" }}>
          Estimate history is only tracked during the current year.
        </p>
      );
    }
    const hist = YCalc.projectionHistory(stats, 5);
    if (hist.length < 2) {
      return (
        <p className="muted" style={{ textAlign: "center", padding: "24px 0", fontSize: 12, fontFamily: "var(--mono)" }}>
          Not enough of the year yet — the estimate history appears after your first couple of weeks of spending.
        </p>
      );
    }

    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const projs = hist.map((p) => p.projection);
    // Frame ceiling + target too so both reference lines stay on-screen and toggling them never
    // rescales the axis. Zoomed (non-zero) baseline: the movement is the message.
    const framed = [...projs, stats.ceiling, stats.mainTarget];
    let lo = Math.min(...framed), hi = Math.max(...framed);
    const span = Math.max(1, hi - lo);
    lo -= span * 0.12; hi += span * 0.12;
    const startDoy = hist[0].doy, endDoy = hist[hist.length - 1].doy;
    const sx = (doy) => x0 + ((doy - startDoy) / Math.max(1, endDoy - startDoy)) * (x1 - x0);
    const sy = (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);

    const linePts = hist.map((p) => [sx(p.doy), sy(p.projection)]);
    const lineStr = linePts.map((p) => p.join(",")).join(" ");

    // Y gridlines (nice round steps across the zoomed range)
    const roughStep = (hi - lo) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1))));
    const mult = roughStep / mag;
    const step = mult <= 1 ? mag : mult <= 2 ? 2 * mag : mult <= 5 ? 5 * mag : 10 * mag;
    const yTicks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(Math.round(v));

    // X month labels within the visible day range
    const xLabels = [];
    for (let m = 0; m < 12; m++) {
      if (MONTH_STARTS[m] >= startDoy && MONTH_STARTS[m] <= endDoy) xLabels.push({ m, doy: MONTH_STARTS[m] });
    }

    const now = hist[hist.length - 1].projection;
    const proj4 = stats.doy > 28 ? YCalc.projectionAsOf(stats, 28) : null;
    const move4 = proj4 !== null ? now - proj4 : null;

    const handlePointer = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      // nearest history point
      let best = 0, bestD = Infinity;
      linePts.forEach((p, i) => { const d = Math.abs(p[0] - rawX); if (d < bestD) { bestD = d; best = i; } });
      const pt = hist[best];
      let month = 0;
      for (let m = 1; m < MONTH_STARTS.length; m++) { if (MONTH_STARTS[m] <= pt.doy) month = m; }
      const dayOfMonth = pt.doy - MONTH_STARTS[month] + 1;
      setHover({ x: linePts[best][0], y: linePts[best][1], val: pt.projection, label: MONTHS[month] + " " + dayOfMonth });
    };
    const handleEnd = () => setHover(null);

    const moveColor = move4 == null ? "var(--muted)" : move4 > 0 ? "var(--terra)" : "var(--sage)";

    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <ToggleChip label="Ceiling" active={showCeiling} color="var(--chart-target)" onClick={() => setShowCeiling(!showCeiling)} />
          <ToggleChip label="Main target" active={showTarget} color="var(--ink-2)" onClick={() => setShowTarget(!showTarget)} />
        </div>

        {/* Compact "now vs 4 weeks ago" caption — the number the user came here to see. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, fontFamily: "var(--mono)" }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }} className="num">{eur0(now)}</span>
          {move4 != null && (
            <span style={{ fontSize: 12, color: moveColor }}>
              {move4 > 0 ? "▲" : "▼"} {eur0(Math.abs(move4))} vs 4 wks ago
            </span>
          )}
        </div>

        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", overflow: "visible", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>

          {/* Y grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(v)} x2={x1} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={x0 - 6} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{eurK(v)}</text>
            </g>
          ))}

          {/* X month labels */}
          {xLabels.map(({ m, doy }) => (
            <text key={m} x={sx(doy)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{MONTHS[m]}</text>
          ))}

          {/* Ceiling reference */}
          {showCeiling && stats.ceiling >= lo && stats.ceiling <= hi && (
            <>
              <line x1={x0} y1={sy(stats.ceiling)} x2={x1} y2={sy(stats.ceiling)} stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="4 4" />
              <text x={x1} y={sy(stats.ceiling) - 5} textAnchor="end" fontSize="9" fill="var(--chart-target)" fontFamily="var(--mono)">ceiling {eurK(stats.ceiling)}</text>
            </>
          )}
          {/* Main target reference */}
          {showTarget && stats.mainTarget >= lo && stats.mainTarget <= hi && (
            <>
              <line x1={x0} y1={sy(stats.mainTarget)} x2={x1} y2={sy(stats.mainTarget)} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
              <text x={x1} y={sy(stats.mainTarget) - 5} textAnchor="end" fontSize="9" fill="var(--ink-2)" fontFamily="var(--mono)" opacity="0.6">main {eurK(stats.mainTarget)}</text>
            </>
          )}

          {/* Estimate line */}
          <polyline points={lineStr} fill="none" stroke="var(--chart-proj)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={linePts[linePts.length - 1][0]} cy={linePts[linePts.length - 1][1]} r="3.6" fill="var(--chart-proj)" stroke="var(--paper)" strokeWidth="1.5" />

          {/* Hover crosshair + tooltip */}
          {hover && (
            <>
              <line x1={hover.x} y1={y0} x2={hover.x} y2={y1} stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              <circle cx={hover.x} cy={hover.y} r="4" fill="var(--chart-proj)" stroke="var(--paper)" strokeWidth="2" />
              {(() => {
                const tw = 84, th = 34;
                const tx = hover.x > W / 2 ? hover.x - tw - 8 : hover.x + 8;
                const ty = Math.max(y0 + 2, hover.y - th - 4);
                return (
                  <>
                    <rect x={tx} y={ty} width={tw} height={th} rx="5" fill="var(--paper)" stroke="var(--hair-strong)" strokeWidth="0.8" />
                    <text x={tx + tw / 2} y={ty + 13} textAnchor="middle" fontSize="11" fill="var(--ink)" fontFamily="var(--mono)" fontWeight="600">{eurK(hover.val)}</text>
                    <text x={tx + tw / 2} y={ty + 27} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">{hover.label}</text>
                  </>
                );
              })()}
            </>
          )}
        </svg>

        <ChartExplain storageKey="estimate-history" items={[
          { color: "var(--chart-proj)", label: `Estimate (${eur0(now)})`, desc: "projected year-end total, recomputed as of each past date — falls when you slow down, rises when you speed up" },
          { color: "var(--chart-target)", label: `Ceiling (${eurK(stats.ceiling)})`, desc: "your household ceiling — the one number the estimate is measured against" },
          { color: "var(--ink-2)", label: `Main (${eurK(stats.mainTarget)})`, desc: "ceiling minus the annual fun budget — an explanatory reference, not a target" },
        ]} />
        <p className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)", textAlign: "center", marginTop: 6, opacity: 0.7 }}>
          Derived from your transactions — replays the projection as of each date. Nothing is stored day-to-day.
        </p>
      </div>
    );
  }

  function StaleBanner({ staleDays }) {
    return (
      <div style={{
        borderTop: '1px solid var(--amber)', borderBottom: '1px solid var(--amber)',
        background: 'color-mix(in srgb, var(--amber) 8%, transparent)',
        padding: '9px 14px', display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <span style={{
          display: 'inline-block', marginTop: 5, width: 7, height: 7,
          borderRadius: '50%', background: 'var(--amber)', flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontFamily: 'var(--sans)', color: 'var(--ink-2)', lineHeight: 1.55 }}>
          Revolut data last refreshed <span className="num">{staleDays}</span> days ago. The projection now estimates the gap; figures may shift on your next import.
        </span>
      </div>
    );
  }

  // The app's "voice" — one orthogonal, plain-language insight under the Hero. Takes the single
  // highest-value callout that isn't redundant with the Hero (the ceiling restatement / buffer math)
  // or the complete/future single-liners. When nothing earns it, the line stays silent.
  function VoiceLine({ callout, onClick }) {
    const dot = callout.severity === "alert" ? "var(--terra)"
              : callout.severity === "watch" ? "var(--amber)"
              : "var(--sage)";
    return (
      <button onClick={onClick} style={{
        display: "flex", gap: 10, alignItems: "flex-start", width: "100%",
        marginTop: 16, paddingTop: 14, textAlign: "left", cursor: "pointer",
        background: "transparent", border: "none", borderTop: "1px solid var(--hair)",
      }}>
        <span style={{ display: "inline-block", marginTop: 6, width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontFamily: "var(--sans)", color: "var(--ink-2)", lineHeight: 1.5 }}>{rich(callout.text)}</span>
        <span style={{ color: "var(--muted)", fontSize: 14, marginTop: 1, flexShrink: 0 }}>{"→"}</span>
      </button>
    );
  }

  function HomeScreen({ stats, fun, travel, store, callouts, onCallout, onOpenFun, onOpenTravel }) {
    const verdict = (!stats.isFuture && !stats.complete) ? (() => {
      const cap = YCalc.neededMonthlyCap(stats);
      const proj = YCalc.projectedMonthEnd(stats);
      return proj > cap * 1.1  ? { cls: 'over',  text: 'Slow down ◂' } :
             proj > cap * 0.95 ? { cls: 'tight', text: 'Tight' }       :
                                 { cls: 'under', text: 'Fine ▸' };
    })() : null;

    // Rotate through the eligible callouts one-per-day (stable sorted order from buildCallouts),
    // instead of always showing the single highest-value one — keeps the Overview line fresh
    // without being random or repeating the same one back-to-back.
    const eligible = callouts
      ? callouts.filter((c) => !["ceiling", "buffer", "calm", "final", "future"].includes(c.id))
      : [];
    const dayIndex = Math.floor(Date.now() / 86400000);
    const voice = eligible.length ? eligible[dayIndex % eligible.length] : null;

    // One chart, four views, one place. Month view is the default for a live year; a completed or
    // future year has no meaningful "this month" so it opens on the year view instead.
    const CHART_VIEWS = ["Month", "Year", "By month", "Estimate"];
    const CHART_TITLES = { Month: "This month", Year: "This year", "By month": "Monthly breakdown", Estimate: "Estimate over time" };
    const [chartView, setChartView] = React.useState(stats.isCurrent ? "Month" : "Year");

    return (
      <div className="screen stagger">
        {stats.isCurrent && stats.staleDays >= 7 && <StaleBanner staleDays={stats.staleDays} />}
        <div>
          <StatusHero stats={stats} />
          {voice && <VoiceLine callout={voice} onClick={() => onCallout && onCallout(voice)} />}
        </div>

        <div>
          <div className="section-h">
            <h2>{CHART_TITLES[chartView]}</h2>
            {chartView === "Month" && verdict && <span className={`pulse-verdict ${verdict.cls}`}>{verdict.text}</span>}
            <span className="spacer" />
          </div>
          <div style={{ marginTop: 12, marginBottom: 14 }}>
            <SegmentedControl options={CHART_VIEWS} value={chartView} fill onChange={setChartView} />
          </div>
          {chartView === "Month" && <MonthCurve stats={stats} store={store} />}
          {chartView === "Year" && (
            <div>
              <ProjectionChart stats={stats} />
              <ChartLegend stats={stats} />
              {!stats.isFuture && (
                <ChartExplain storageKey="this-year" items={[
                  { color: "var(--chart-actual)", label: `Actual (${eur0(stats.spent)})`, desc: "cumulative total spend (main + fun) year-to-date" },
                  ...(!stats.complete ? [{ color: "var(--chart-proj)", label: `Projected (→${eur0(stats.projection)})`, desc: "year-end extrapolation at your current blended daily rate" }] : []),
                  ...(stats.projLow != null ? [{ color: "var(--chart-proj)", label: `Range (±${eur0(stats.bandAmt)})`, desc: "forecast uncertainty band based on weekly spending variance" }] : []),
                  { color: "var(--chart-pace)", label: `Pace (→${eur0(stats.ceiling)})`, desc: "ideal on-track trajectory from Jan 1 to the ceiling" },
                  ...(stats.priorCum ? [{ color: "var(--chart-target)", label: `${stats.year - 1} (${eur0(stats.priorSpent)})`, desc: "prior year's total spend at the same day of year" }] : []),
                ]} />
              )}
            </div>
          )}
          {chartView === "By month" && <MonthlyBarsChart stats={stats} />}
          {chartView === "Estimate" && <EstimateChart stats={stats} />}
        </div>

        <div>
          <SectionH title="Fun budget" />
          <FunStrip fun={fun} store={store} onOpen={onOpenFun} />
        </div>

        <div>
          <SectionH title="Travel budget" />
          <TravelStrip travel={travel} store={store} onOpen={onOpenTravel} />
        </div>
      </div>
    );
  }

  window.YHome = { HomeScreen };
})();
