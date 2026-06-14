// home.jsx — calm overview: status hero + fun strip + monthly spend curve.
(function () {
  const { YUI, YFun, YCalc } = window;
  const { StatusHero, SectionH } = YUI;
  const { FunStrip } = YFun;

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  function MonthCurve({ stats }) {
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
          Year {stats.year} is complete — see Analysis for the full breakdown.
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
    const monthlyDailyRate = dayOfMonth > 0 ? spentSoFar / dayOfMonth : 0;
    const projectedEnd = YCalc.projectedMonthEnd(stats);

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

    const maxY = Math.max(neededMonthly, projectedEnd, spentSoFar, prevTotal, 1) * 1.12;
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
        val = spentSoFar + monthlyDailyRate * (day - dayOfMonth);
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

        {/* Legend */}
        <div style={{ marginTop: 14, borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
          {legendItems.map(({ color, label, desc }) => (
            <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <span style={{
                display: "inline-block", marginTop: 4, width: 7, height: 7,
                borderRadius: "50%", background: color, flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", lineHeight: 1.5 }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{label}</span>{" — "}{desc}
              </span>
            </div>
          ))}
        </div>
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

  function HomeScreen({ stats, fun, store, onOpenFun }) {
    return (
      <div className="screen stagger">
        {stats.isCurrent && stats.staleDays >= 7 && <StaleBanner staleDays={stats.staleDays} />}
        <StatusHero stats={stats} />

        <div>
          <SectionH title="Fun budget" />
          <FunStrip fun={fun} store={store} onOpen={onOpenFun} />
        </div>

        <div>
          <SectionH title="This month" />
          <div style={{ marginTop: 14 }}>
            <MonthCurve stats={stats} />
          </div>
        </div>
      </div>
    );
  }

  window.YHome = { HomeScreen };
})();
