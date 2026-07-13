// analysis.jsx — the deep surface: projection chart, activity (categories + transactions), fun.
(function () {
  const { YData, YCalc, YUI, YFun, YTravel } = window;
  const { eur0, eurAuto, signedEur, signedPct, pct, MONTHS, fmtDateShort } = YCalc;
  const { TxRow, CatIcon, CalloutCard, SectionH, ChartExplain } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const SegmentedControl = DS.SegmentedControl, Input = DS.Input, Chip = DS.Chip;

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

  // Hand-built SVG projection chart — interactive: touch/drag for crosshair, toggleable series.
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

  function CatTrend({ cid, catMonth, upToMonth }) {
    const arr = catMonth[cid] || [];
    const months = []; for (let m = 0; m <= upToMonth; m++) months.push(m);
    const vals = months.map((m) => arr[m] || 0);
    const max = Math.max(1, ...vals);
    const W = 320, H = 110, padB = 16, padT = 6;
    const n = months.length;
    const slot = (W) / n;
    const bw = Math.min(26, slot * 0.6);
    const color = YData.cat(cid).color;
    const lastFull = upToMonth - 1;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {months.map((m, i) => {
          const h = (vals[i] / max) * (H - padB - padT);
          const x = i * slot + (slot - bw) / 2;
          const isLast = m === lastFull;
          return (
            <g key={m}>
              <rect x={x} y={H - padB - h} width={bw} height={Math.max(1, h)} rx="3"
                fill={isLast ? color : YUI.tint(color, "59")} />
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{MONTHS[m][0]}</text>
            </g>
          );
        })}
      </svg>
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
        <div className="section-h" style={{ marginTop: 0, marginBottom: 10 }}><h2>Monthly breakdown</h2></div>
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

  function StatCard({ label, value, sub, mono = true, color }) {
    return (
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className={"stat-val" + (mono ? " num" : "")} style={color ? { color } : undefined}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    );
  }

  function ProjectionTab({ stats, fun, store, callouts, onCallout }) {
    const curMonth = stats.isFuture ? -1 : stats.asOf.getMonth();
    const completedMonths = stats.complete ? 12 : Math.max(0, curMonth);
    const completedAmounts = stats.byMonth.slice(0, completedMonths).map((m) => m.amount);
    const avgMonthly = completedMonths > 0 ? completedAmounts.reduce((a, v) => a + v, 0) / completedMonths : 0;
    const neededMonthly = stats.isCurrent ? YCalc.neededMonthlyCap(stats) : null;

    let trend90 = null, trend90Color = "var(--ink)";
    if (stats.isCurrent && stats.doy >= 90) {
      const d45 = new Date(stats.asOf); d45.setDate(d45.getDate() - 45);
      const d45str = YCalc.localISO(d45);
      const d90 = new Date(stats.asOf); d90.setDate(d90.getDate() - 90);
      const d90str = YCalc.localISO(d90);
      const recent45 = stats.upto.filter((t) => t.date > d45str).reduce((a, t) => a + t.amount_eur, 0) / 45;
      const prior45 = stats.upto.filter((t) => t.date > d90str && t.date <= d45str).reduce((a, t) => a + t.amount_eur, 0) / 45;
      if (prior45 > 0) {
        const ratio = recent45 / prior45;
        if (ratio > 1.08) { trend90 = "↑ Increasing"; trend90Color = "var(--terra)"; }
        else if (ratio < 0.92) { trend90 = "↓ Decreasing"; trend90Color = "var(--sage)"; }
        else { trend90 = "→ Constant"; }
      }
    }

    const numPeople = (store && store.people && store.people.length) || 1;
    const monthsLeft = Math.max(1, stats.daysRemaining / 30.4);
    const targetFunPerMo = Math.max(0, stats.ceiling - stats.projection) / monthsLeft / numPeople;
    const firePortfolio = stats.projection / 0.04;

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 10 }}><h2>This year</h2></div>
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

        {!stats.isFuture && <MonthlyBarsChart stats={stats} />}

        {callouts && callouts.length > 0 && (
          <div>
            <SectionH
              title={stats.complete ? "The year in review" : "What's happening"}
              meta={callouts.length + (callouts.length === 1 ? " NOTE" : " NOTES")}
            />
            <div className="callouts">
              {callouts.map((c) => (
                <CalloutCard key={c.id} c={c} onClick={() => onCallout && onCallout(c)} />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 10 }}><h2>In numbers</h2></div>
          <div className="statgrid">
            <StatCard label="Spent year-to-date" value={eur0(stats.spent)} sub={`${stats.upto.length} entries`} />
            <StatCard label={stats.complete ? "Days" : "On-pace by today"} value={stats.complete ? "365" : eur0(stats.pace)} sub={stats.complete ? "complete" : `day ${stats.doy} of ${stats.daysInYear}`} />
            <StatCard label="Blended rate" value={eur0(stats.trailingDailyRate) + "/d"} sub={`YTD avg ${eur0(stats.dailyRate)}/d`} />
            {!stats.complete && <StatCard label="Buffer adds" value={"+" + eur0(stats.bufferAmt)} sub={`${Math.round(stats.buffer * 100)}% missed-entry`} />}
            {completedMonths > 0 && (
              <StatCard
                label="Avg spend/mo"
                value={eur0(avgMonthly)}
                sub={neededMonthly !== null
                  ? <span style={{ color: avgMonthly > neededMonthly ? "var(--terra)" : "var(--sage)" }}>need ≤{eur0(neededMonthly)}/mo</span>
                  : null}
              />
            )}
            {trend90 && <StatCard label="90d trend" value={trend90} mono={false} color={trend90Color} />}
            {!stats.isFuture && <StatCard label="Total fun budget" value={eur0(stats.funPlanAnnual) + "/yr"} sub={eur0(stats.funPlanAnnual / 12) + "/mo"} />}
            {stats.isCurrent && (
              <StatCard
                label="Target fun/mo"
                value={eur0(targetFunPerMo)}
                sub="per person"
                color={targetFunPerMo === 0 ? "var(--terra)" : "var(--sage)"}
              />
            )}
            {!stats.isFuture && <StatCard label="FIRE portfolio" value={eurK(firePortfolio)} sub="at 4% rule" />}
            {stats.priorSpent > 0 && (() => {
              const diff = stats.spent - stats.priorSpent;
              return (
                <StatCard
                  label={stats.complete ? `vs ${stats.year - 1} final` : `vs ${stats.year - 1} same point`}
                  value={signedEur(diff)}
                  sub={signedPct(diff / stats.priorSpent)}
                  color={diff > 0 ? "var(--watch)" : "var(--good)"}
                />
              );
            })()}
            {(() => {
              // Same maxDaily number, framed by direction: a cut target when over the ceiling,
              // headroom when under. Mirrors the home pace-guidance callout.
              const over = YCalc.requiredDailyToHit(stats);
              const room = over === null ? YCalc.dailyHeadroom(stats) : null;
              if (over === null && room === null) return null;
              return (
                <StatCard
                  label="To finish on target"
                  value={over !== null ? `≤ ${eur0(over)}/day` : `room ${eur0(room)}/day`}
                  sub={`${stats.daysInYear - stats.doy} days left`}
                  color={over !== null ? "var(--watch)" : "var(--good)"}
                />
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  function CategoriesTab({ stats, focusCategory, onEditTx, people }) {
    const [sel, setSel] = React.useState(focusCategory || null);
    React.useEffect(() => { if (focusCategory) setSel(focusCategory); }, [focusCategory]);
    const curMonth = stats.asOf.getMonth();
    const max = stats.catList[0] ? stats.catList[0].amount : 1;
    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 6 }}>
            <h2>Where it's going</h2><span className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>{eur0(stats.spent)} total</span>
          </div>
          {stats.catList.map((c) => {
            const cat = YData.cat(c.id);
            const open = sel === c.id;
            const lastFull = curMonth - 1, prior = curMonth - 2;
            const arr = stats.catMonth[c.id] || [];
            const mv = lastFull >= 1 && arr[prior] > 0 ? (arr[lastFull] - arr[prior]) / arr[prior] : null;
            return (
              <div key={c.id}>
                <button className="catbar-row" onClick={() => setSel(open ? null : c.id)} style={{ borderBottom: open ? "0" : undefined }}>
                  <CatIcon catId={c.id} size={24} radius={6} />
                  <span className="catbar-main">
                    <span className="catbar-top">
                      <span className="catbar-name">{cat.label}</span>
                      <span className="catbar-amt num">{eurAuto(c.amount)}</span>
                    </span>
                    <span className="catbar-track"><span className="catbar-fill" style={{ width: Math.max(3, (c.amount / max) * 100) + "%", background: cat.color }} /></span>
                    <span className="catbar-sub">
                      <span>{pct(c.share)} of spend</span>
                      <span>{c.count} entries</span>
                      {mv != null && Math.abs(mv) > 0.05 && (
                        <span style={{ color: mv > 0 ? "var(--amber)" : "var(--sage)" }}>{signedPct(mv)} MoM</span>
                      )}
                    </span>
                  </span>
                  <window.Icon name={open ? "chevronUp" : "chevronDown"} size={16} style={{ color: "var(--muted)" }} />
                </button>
                {open && (
                  <div style={{ padding: "4px 2px 14px", borderBottom: "1px solid var(--hair)" }}>
                    <CatTrend cid={c.id} catMonth={stats.catMonth} upToMonth={curMonth} />
                    <div className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)", margin: "8px 2px 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Recent in {cat.label}</div>
                    <div className="txlist">
                      {stats.upto.filter((t) => t.category === c.id).slice().reverse().slice(0, 5).map((t) => (
                        <TxRow key={t.id} t={t} onClick={onEditTx ? () => onEditTx(t) : undefined} people={people} />
                      ))}
                    </div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)", margin: "14px 2px 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Largest in {cat.label}</div>
                    <div className="txlist">
                      {stats.upto.filter((t) => t.category === c.id).slice().sort((a, b) => b.amount_eur - a.amount_eur).slice(0, 5).map((t) => (
                        <TxRow key={t.id} t={t} onClick={onEditTx ? () => onEditTx(t) : undefined} people={people} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const SORT_OPTS = [
    { id: "date-desc", label: "Newest" },
    { id: "date-asc", label: "Oldest" },
    { id: "amt-desc", label: "€ High" },
    { id: "amt-asc", label: "€ Low" },
    { id: "az", label: "A → Z" },
    { id: "za", label: "Z → A" },
  ];

  function FilterChip({ label, active, onClick }) {
    return (
      <button onClick={onClick} style={{
        height: 26, padding: "0 10px", borderRadius: 99, flexShrink: 0,
        fontFamily: "var(--mono)", fontSize: 11, fontWeight: 500,
        cursor: "pointer", whiteSpace: "nowrap",
        border: "1px solid " + (active ? "var(--terra)" : "var(--hair)"),
        background: active ? "color-mix(in srgb, var(--terra) 12%, transparent)" : "transparent",
        color: active ? "var(--terra)" : "var(--muted)",
      }}>{label}</button>
    );
  }

  function TransactionsTab({ stats, onEditTx, people }) {
    const [q, setQ] = React.useState("");
    const [fc, setFc] = React.useState(null);
    const [sort, setSort] = React.useState("date-desc");
    const [filterManual, setFilterManual] = React.useState(false);
    const [filterFun, setFilterFun] = React.useState(false);
    const [filterTravel, setFilterTravel] = React.useState(false);
    const [showFilters, setShowFilters] = React.useState(false);

    const activeCount = (fc ? 1 : 0) + (sort !== "date-desc" ? 1 : 0) + (filterManual ? 1 : 0) + (filterFun ? 1 : 0) + (filterTravel ? 1 : 0);

    let list = stats.txns.slice();
    if (fc) list = list.filter((t) => t.category === fc);
    if (filterManual) list = list.filter((t) => t.source === "manual");
    if (filterFun) list = list.filter((t) => t.fun);
    if (filterTravel) list = list.filter((t) => t.travel);
    if (q.trim()) { const s = q.toLowerCase(); list = list.filter((t) => t.description.toLowerCase().includes(s)); }
    if (sort === "date-desc") list.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === "date-asc") list.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === "amt-desc") list.sort((a, b) => b.amount_eur - a.amount_eur);
    else if (sort === "amt-asc") list.sort((a, b) => a.amount_eur - b.amount_eur);
    else if (sort === "az") list.sort((a, b) => a.description.localeCompare(b.description));
    else if (sort === "za") list.sort((a, b) => b.description.localeCompare(a.description));

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Search bar + filter toggle button */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <Input icon={<window.Icon name="search" size={16} />} placeholder="Search descriptions…" value={q} ariaLabel="Search transactions"
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10,
              border: "1px solid " + (activeCount > 0 ? "var(--terra)" : "var(--hair)"),
              background: activeCount > 0 ? "color-mix(in srgb, var(--terra) 10%, transparent)" : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
            }}
          >
            <window.Icon name="sliders" size={16} style={{ color: activeCount > 0 ? "var(--terra)" : "var(--muted)" }} />
            {activeCount > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5,
                width: 16, height: 16, borderRadius: "50%",
                background: "var(--terra)", color: "var(--paper)",
                fontSize: 9, fontFamily: "var(--mono)", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1,
              }}>{activeCount}</span>
            )}
          </button>
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--ink) 4%, transparent)", border: "1px solid var(--hair)" }}>
            {/* Category row */}
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Category</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <FilterChip label="All" active={!fc} onClick={() => setFc(null)} />
                {stats.catList.map((c) => <FilterChip key={c.id} label={YData.cat(c.id).label} active={fc === c.id} onClick={() => setFc(fc === c.id ? null : c.id)} />)}
              </div>
            </div>
            {/* Sort row */}
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Sort</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {SORT_OPTS.map((s) => <FilterChip key={s.id} label={s.label} active={sort === s.id} onClick={() => setSort(s.id)} />)}
              </div>
            </div>
            {/* Extra filters row */}
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Show only</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <FilterChip label="Manual" active={filterManual} onClick={() => setFilterManual(!filterManual)} />
                <FilterChip label="Fun" active={filterFun} onClick={() => setFilterFun(!filterFun)} />
                <FilterChip label="Travel" active={filterTravel} onClick={() => setFilterTravel(!filterTravel)} />
              </div>
            </div>
          </div>
        )}

        <div>
          {list.length ? (
            <div className="txlist">{list.map((t) => <TxRow key={t.id} t={t} onClick={() => onEditTx(t)} people={people} />)}</div>
          ) : <div className="empty">No matching transactions.</div>}
        </div>
        <div className="muted" style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 11 }}>{list.length} of {stats.txns.length} entries</div>
      </div>
    );
  }

  function ActivityMergedTab({ stats, subtab, setSubtab, focusCategory, onEditTx, people }) {
    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SegmentedControl options={["Categories", "Transactions"]} value={subtab} onChange={setSubtab} />
        {subtab === "Categories" && <CategoriesTab stats={stats} focusCategory={focusCategory} onEditTx={onEditTx} people={people} />}
        {subtab === "Transactions" && <TransactionsTab stats={stats} onEditTx={onEditTx} people={people} />}
      </div>
    );
  }

  function AnalysisScreen({ stats, focus, onEditTx, fun, travel, store, setStore, addTx, callouts, onCallout }) {
    const [tab, setTab] = React.useState("Projection");
    const [activitySubtab, setActivitySubtab] = React.useState("Categories");
    React.useEffect(() => {
      if (focus && focus.section === "categories") { setTab("Activity"); setActivitySubtab("Categories"); }
      else if (focus && focus.section === "projection") setTab("Projection");
      else if (focus && focus.section === "activity") { setTab("Activity"); setActivitySubtab("Transactions"); }
      else if (focus && focus.section === "fun") setTab("Fun");
      else if (focus && focus.section === "travel") setTab("Travel");
    }, [focus]);
    return (
      <div className="screen">
        <div style={{ position: "sticky", top: 0, zIndex: 5, paddingBottom: 4 }}>
          <SegmentedControl options={["Projection", "Activity", "Fun", "Travel"]} value={tab} fill onChange={setTab} />
        </div>
        {tab === "Projection" && <ProjectionTab stats={stats} fun={fun} store={store} callouts={callouts} onCallout={onCallout} />}
        {tab === "Activity" && (
          <ActivityMergedTab
            stats={stats}
            subtab={activitySubtab}
            setSubtab={setActivitySubtab}
            focusCategory={focus && focus.category}
            onEditTx={onEditTx}
            people={store && store.people || []}
          />
        )}
        {tab === "Fun" && <YFun.FunTab fun={fun} store={store} setStore={setStore} addTx={addTx} />}
        {tab === "Travel" && <YTravel.TravelTab travel={travel} store={store} setStore={setStore} />}
      </div>
    );
  }

  window.YAnalysis = { AnalysisScreen };
})();
