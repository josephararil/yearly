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
    const W = 340, H = 200, padL = 40, padR = 14, padT = 14, padB = 24;
    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const [showPace, setShowPace] = React.useState(true);
    const [showProj, setShowProj] = React.useState(true);
    const [showTarget, setShowTarget] = React.useState(true);

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
    const monthlyTarget = stats.mainTarget / 12;
    const monthlyDailyRate = dayOfMonth > 0 ? spentSoFar / dayOfMonth : 0;
    const projectedEnd = spentSoFar + monthlyDailyRate * (daysInMonth - dayOfMonth);

    const maxY = Math.max(monthlyTarget, projectedEnd, spentSoFar, 1) * 1.12;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const sx = (d) => x0 + ((d - 1) / Math.max(1, daysInMonth - 1)) * (x1 - x0);
    const sy = (v) => y1 - (v / maxY) * (y1 - y0);

    // Actual line: all days 1→dayOfMonth
    const actPts = [];
    for (let d = 1; d <= dayOfMonth; d++) actPts.push([sx(d), sy(dayCum[d])]);
    const actLine = actPts.map((p) => p.join(",")).join(" ");
    const areaPts = actPts.length > 0
      ? `${x0},${y1} ${actLine} ${actPts[actPts.length - 1][0]},${y1}`
      : "";

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

    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <ToggleChip label="Pace" active={showPace} color="var(--chart-pace)" onClick={() => setShowPace(!showPace)} />
          <ToggleChip label="Projection" active={showProj} color="var(--chart-proj)" onClick={() => setShowProj(!showProj)} />
          <ToggleChip label="Target" active={showTarget} color="var(--chart-target)" onClick={() => setShowTarget(!showTarget)} />
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
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={x0} y1={sy(v)} x2={x1} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={x0 - 6} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--chart-axis)" fontFamily="var(--mono)">{eurK(v)}</text>
            </g>
          ))}
          {xLabels.map((d) => (
            <text key={d} x={sx(d)} y={H - 8} textAnchor="middle" fontSize="9"
              fill={d === dayOfMonth ? "var(--ink)" : "var(--chart-axis)"}
              fontFamily="var(--mono)">{d}</text>
          ))}
          {showTarget && (
            <>
              <line x1={x0} y1={sy(monthlyTarget)} x2={x1} y2={sy(monthlyTarget)}
                stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="4 4" />
              <text x={x1} y={sy(monthlyTarget) - 5} textAnchor="end" fontSize="9"
                fill="var(--chart-target)" fontFamily="var(--mono)">target {eurK(monthlyTarget)}</text>
            </>
          )}
          {showPace && (
            <line x1={sx(1)} y1={sy(0)} x2={sx(daysInMonth)} y2={sy(monthlyTarget)}
              stroke="var(--chart-pace)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
          )}
          {areaPts && <polygon points={areaPts} fill={`url(#${uid})`} />}
          {actPts.length > 1 && (
            <polyline points={actLine} fill="none" stroke="var(--chart-actual)"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {showProj && dayOfMonth < daysInMonth && (
            <>
              <line x1={sx(dayOfMonth)} y1={sy(spentSoFar)}
                x2={sx(daysInMonth)} y2={sy(projectedEnd)}
                stroke="var(--chart-proj)" strokeWidth="2.2" strokeDasharray="6 5" strokeLinecap="round" />
              <circle cx={sx(daysInMonth)} cy={sy(projectedEnd)} r="3.2" fill="var(--chart-proj)" />
              <circle cx={sx(dayOfMonth)} cy={sy(spentSoFar)} r="3.6"
                fill="var(--chart-actual)" stroke="var(--paper)" strokeWidth="1.5" />
            </>
          )}
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
      </div>
    );
  }

  function HomeScreen({ stats, fun, store, onOpenFun }) {
    return (
      <div className="screen stagger">
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
