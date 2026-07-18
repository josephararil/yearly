// analysis.jsx — the deep surface: projection chart, activity (categories + transactions), fun.
(function () {
  const { YData, YCalc, YUI, YFun, YTravel, YPlan } = window;
  const { eur0, eurAuto, signedEur, signedPct, pct, MONTHS, fmtDateShort } = YCalc;
  const { TxRow, CatIcon, CalloutCard, SectionH, TxTag } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const SegmentedControl = DS.SegmentedControl, Input = DS.Input, Chip = DS.Chip;

  const eurK = (v) => (Math.abs(v) >= 1000 ? "€" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k" : "€" + Math.round(v));

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

  function StatCard({ label, value, sub, mono = true, color }) {
    return (
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className={"stat-val" + (mono ? " num" : "")} style={color ? { color } : undefined}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    );
  }

  // ── Amortization mini chart-switcher (Projection "In numbers") ───────────────────────────────
  function AmLegendItem({ c, dash, rect, label, opacity }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        {rect
          ? <svg width="14" height="10"><rect x="0" y="2" width="14" height="6" rx="1.5" fill={c} opacity={opacity != null ? opacity : 0.82} /></svg>
          : <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2.2" strokeDasharray={dash || "0"} strokeLinecap="round" /></svg>}
        {label}
      </span>
    );
  }

  // Small pill toggle — mirrors home.jsx's ToggleChip idiom (chart series toggles).
  function AmToggleChip({ label, active, color, onClick }) {
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

  // Shared hover tooltip box — mirrors the home.jsx chart tooltip idiom, with the tx clamped to
  // stay fully inside the SVG viewport (never clips at the left/right edge). Composition passes a
  // single value (hover.val); By-month/By-year pass real+virtual too, rendering a taller
  // Real/Virtual/Total breakdown instead.
  function AmTooltip({ hover, W, padT }) {
    if (!hover) return null;
    const multi = hover.real != null;
    const tw = multi ? 128 : 108, th = multi ? 64 : 34;
    let tx = hover.x > W / 2 ? hover.x - tw - 8 : hover.x + 8;
    tx = Math.max(4, Math.min(W - tw - 4, tx));
    const ty = Math.max((padT || 4) + 2, hover.y - th - 6);
    if (!multi) {
      return (
        <>
          <rect x={tx} y={ty} width={tw} height={th} rx="5" fill="var(--paper)" stroke="var(--hair-strong)" strokeWidth="0.8" />
          <text x={tx + tw / 2} y={ty + 14} textAnchor="middle" fontSize="11" fill="var(--ink)" fontFamily="var(--mono)" fontWeight="600">{eurAuto(hover.val)}</text>
          <text x={tx + tw / 2} y={ty + 27} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{hover.label}</text>
        </>
      );
    }
    const lx = tx + 8, ax = tx + tw - 8;
    return (
      <>
        <rect x={tx} y={ty} width={tw} height={th} rx="5" fill="var(--paper)" stroke="var(--hair-strong)" strokeWidth="0.8" />
        <text x={tx + tw / 2} y={ty + 12} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{hover.label}</text>
        <text x={lx} y={ty + 27} textAnchor="start" fontSize="10" fill="var(--chart-actual)" fontFamily="var(--mono)">Real</text>
        <text x={ax} y={ty + 27} textAnchor="end" fontSize="10" fill="var(--chart-actual)" fontFamily="var(--mono)">{eurAuto(hover.real)}</text>
        <text x={lx} y={ty + 41} textAnchor="start" fontSize="10" fill="var(--sage)" fontFamily="var(--mono)">Virtual</text>
        <text x={ax} y={ty + 41} textAnchor="end" fontSize="10" fill="var(--sage)" fontFamily="var(--mono)">{eurAuto(hover.virtual)}</text>
        <text x={lx} y={ty + 57} textAnchor="start" fontSize="10" fill="var(--ink)" fontWeight="600" fontFamily="var(--mono)">Total</text>
        <text x={ax} y={ty + 57} textAnchor="end" fontSize="10" fill="var(--ink)" fontWeight="600" fontFamily="var(--mono)">{eurAuto(hover.val)}</text>
      </>
    );
  }

  // Composition — one horizontal stacked bar of spent-to-date: non-amortized (neutral) · real
  // (terracotta) · virtual (sage).
  function AmComposition({ am, stats }) {
    const W = 340, H = 74, padX = 4, barY = 20, barH = 26;
    const total = Math.max(1, stats.spent);
    const nonAm = Math.max(0, stats.spent - am.ytd.total);
    const segs = [
      { key: "non", label: "Non-amortized", value: nonAm, color: "var(--muted)" },
      { key: "real", label: "Real (cash)", value: am.ytd.real, color: "var(--chart-actual)" },
      { key: "virtual", label: "Virtual (no-cash)", value: am.ytd.virtual, color: "var(--sage)" },
    ];
    let x = padX;
    const rects = segs.map((s) => {
      const w = (s.value / total) * (W - padX * 2);
      const r = { ...s, x, w };
      x += w;
      return r;
    });
    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const handlePointer = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      const seg = rects.find((r) => r.w > 0 && rawX >= r.x && rawX < r.x + r.w);
      if (!seg) { setHover(null); return; }
      setHover({ x: seg.x + seg.w / 2, y: barY, val: seg.value, label: seg.label, key: seg.key });
    };
    const handleEnd = () => setHover(null);
    return (
      <div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>
          {rects.filter((r) => r.w > 0).map((r) => (
            <rect key={r.key} x={r.x} y={barY} width={Math.max(1, r.w)} height={barH}
              fill={r.color} opacity={hover && hover.key === r.key ? 1 : 0.85}
              stroke={hover && hover.key === r.key ? "var(--ink)" : "none"} strokeWidth={hover && hover.key === r.key ? 1 : 0} />
          ))}
          {hover && (
            <>
              <line x1={hover.x} y1={4} x2={hover.x} y2={barY + barH + 4} stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              <AmTooltip hover={hover} W={W} padT={4} />
            </>
          )}
        </svg>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, justifyContent: "center" }}>
          <AmLegendItem c="var(--muted)" rect label="Non-amortized" />
          <AmLegendItem c="var(--chart-actual)" rect label="Real (cash)" />
          <AmLegendItem c="var(--sage)" rect label="Virtual (no-cash)" />
        </div>
      </div>
    );
  }

  // By month — 12 bars, real+virtual stacked (elapsed solid, future faded), plus a faint dashed
  // "as purchased (raw)" overlay drawn first so the smoothing is visible wherever it pokes above.
  function AmByMonth({ am, stats }) {
    const W = 340, H = 170, padL = 34, padR = 8, padT = 12, padB = 20;
    const barArea = W - padL - padR;
    const slot = barArea / 12;
    const bw = Math.max(8, Math.floor(slot * 0.6));
    const barLeft = (m) => padL + m * slot + (slot - bw) / 2;
    const barCenter = (m) => padL + m * slot + slot / 2;

    const [showRaw, setShowRaw] = React.useState(false);
    const rows = am.byMonth.map((mo) => ({ ...mo, total: mo.real + mo.virtual }));
    const maxY = Math.max(1, ...rows.map((r) => r.total), ...(showRaw ? rows.map((r) => r.rawPurchased) : [])) * 1.15;
    const sy = (v) => padT + (1 - v / maxY) * (H - padT - padB);
    const baseline = sy(0);

    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const handlePointer = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      const m = Math.max(0, Math.min(11, Math.floor((rawX - padL) / slot)));
      const r = rows[m];
      setHover({ x: barCenter(m), y: sy(r.total), val: r.total, real: r.real, virtual: r.virtual, label: MONTHS[m], month: m });
    };
    const handleEnd = () => setHover(null);

    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <AmToggleChip label="As purchased (raw)" active={showRaw} color="var(--chart-target)" onClick={() => setShowRaw((s) => !s)} />
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>

          <line x1={padL} y1={baseline} x2={W - padR} y2={baseline} stroke="var(--chart-grid)" strokeWidth="0.8" />

          {showRaw && (
            <>
              <polyline
                points={rows.map((r, m) => `${barCenter(m)},${sy(r.rawPurchased)}`).join(" ")}
                fill="none" stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.55" />
              {rows.map((r, m) => r.rawPurchased > 0 && (
                <circle key={"raw" + m} cx={barCenter(m)} cy={sy(r.rawPurchased)} r="2" fill="var(--chart-target)" opacity="0.55" />
              ))}
            </>
          )}

          {rows.map((r, m) => {
            const isHov = hover && hover.month === m;
            const op = r.elapsed ? (isHov ? 1 : 0.85) : (isHov ? 0.7 : 0.4);
            const hReal = (r.real / maxY) * (H - padT - padB);
            const hVirt = (r.virtual / maxY) * (H - padT - padB);
            return (
              <g key={m}>
                {r.real > 0 && <rect x={barLeft(m)} y={baseline - hReal} width={bw} height={Math.max(1, hReal)} fill="var(--chart-actual)" opacity={op} />}
                {r.virtual > 0 && <rect x={barLeft(m)} y={baseline - hReal - hVirt} width={bw} height={Math.max(1, hVirt)} fill="var(--sage)" opacity={op} />}
              </g>
            );
          })}

          {rows.map((r, m) => (
            <text key={"lbl" + m} x={barCenter(m)} y={H - 4} textAnchor="middle" fontSize="9"
              fill={hover && hover.month === m ? "var(--ink)" : "var(--chart-axis)"} fontFamily="var(--mono)">{m + 1}</text>
          ))}

          {hover && (
            <>
              <line x1={hover.x} y1={padT} x2={hover.x} y2={baseline} stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              <AmTooltip hover={hover} W={W} padT={padT} />
            </>
          )}
        </svg>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, justifyContent: "center" }}>
          <AmLegendItem c="var(--chart-actual)" rect label="Real (cash)" />
          <AmLegendItem c="var(--sage)" rect label="Virtual (no-cash)" />
        </div>
      </div>
    );
  }

  // By year — one bar per am.byYear entry (this year highlighted, future years faded), stacked
  // real/virtual. This is the per-year future breakdown (e.g. a multi-year amortization spilling
  // beyond viewYear).
  function AmByYear({ am, stats }) {
    const years = am.byYear;
    const n = Math.max(1, years.length);
    const W = 340, H = 170, padL = 34, padR = 8, padT = 12, padB = 20;
    const barArea = W - padL - padR;
    const slot = barArea / n;
    const bw = Math.max(10, Math.floor(slot * 0.55));
    const barLeft = (i) => padL + i * slot + (slot - bw) / 2;
    const barCenter = (i) => padL + i * slot + slot / 2;

    const rows = years.map((y) => ({ ...y, total: y.real + y.virtual }));
    const maxY = Math.max(1, ...rows.map((r) => r.total)) * 1.15;
    const sy = (v) => padT + (1 - v / maxY) * (H - padT - padB);
    const baseline = sy(0);

    const svgRef = React.useRef(null);
    const [hover, setHover] = React.useState(null);
    const handlePointer = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const rawX = (e.clientX - rect.left) * scaleX;
      const i = Math.max(0, Math.min(n - 1, Math.floor((rawX - padL) / slot)));
      const r = rows[i];
      if (!r) return;
      setHover({ x: barCenter(i), y: sy(r.total), val: r.total, real: r.real, virtual: r.virtual, label: String(r.year), i });
    };
    const handleEnd = () => setHover(null);

    return (
      <div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointer} onPointerDown={handlePointer}
          onPointerLeave={handleEnd} onPointerUp={handleEnd} onPointerCancel={handleEnd}>

          <line x1={padL} y1={baseline} x2={W - padR} y2={baseline} stroke="var(--chart-grid)" strokeWidth="0.8" />

          {rows.map((r, i) => {
            const isHov = hover && hover.i === i;
            const isCurYear = r.year === stats.year;
            const isFuture = r.year > stats.year;
            const op = isFuture ? (isHov ? 0.7 : 0.4) : (isHov || isCurYear ? 1 : 0.85);
            const hReal = (r.real / maxY) * (H - padT - padB);
            const hVirt = (r.virtual / maxY) * (H - padT - padB);
            return (
              <g key={r.year}>
                {r.real > 0 && <rect x={barLeft(i)} y={baseline - hReal} width={bw} height={Math.max(1, hReal)} fill="var(--chart-actual)" opacity={op} />}
                {r.virtual > 0 && <rect x={barLeft(i)} y={baseline - hReal - hVirt} width={bw} height={Math.max(1, hVirt)} fill="var(--sage)" opacity={op} />}
              </g>
            );
          })}

          {rows.map((r, i) => (
            <text key={"lbl" + r.year} x={barCenter(i)} y={H - 4} textAnchor="middle" fontSize="9"
              fontWeight={r.year === stats.year ? "600" : "400"}
              fill={hover && hover.i === i ? "var(--ink)" : "var(--chart-axis)"} fontFamily="var(--mono)">{r.year}</text>
          ))}

          {hover && (
            <>
              <line x1={hover.x} y1={padT} x2={hover.x} y2={baseline} stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
              <AmTooltip hover={hover} W={W} padT={padT} />
            </>
          )}
        </svg>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, justifyContent: "center" }}>
          <AmLegendItem c="var(--chart-actual)" rect label="Real (cash)" />
          <AmLegendItem c="var(--sage)" rect label="Virtual (no-cash)" />
        </div>
      </div>
    );
  }

  function AmortizationChart({ am, stats }) {
    const [view, setView] = React.useState("Composition");
    return (
      <div style={{ marginTop: 12 }}>
        <SegmentedControl options={["Composition", "By month", "By year"]} value={view} onChange={setView} />
        <div style={{ marginTop: 10 }}>
          {view === "Composition" && <AmComposition am={am} stats={stats} />}
          {view === "By month" && <AmByMonth am={am} stats={stats} />}
          {view === "By year" && <AmByYear am={am} stats={stats} />}
        </div>
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

    // Historical actuals
    const dailyMedian = !stats.isFuture ? YCalc.medianDailySpendYTD(stats) : null;
    const monthRange = !stats.isFuture
      ? YCalc.historicalMonthRange(store, YCalc.localISO(new Date()).slice(0, 7))
      : null;

    // Projections & forecasts
    const projMonthEnd = stats.isCurrent ? YCalc.projectedMonthEnd(stats) : null;

    // Targets & budgets
    const daysLeftYear = stats.daysInYear - stats.doy;
    const adjustedSpent = stats.spent + stats.bufferAmt;
    const overCeiling = stats.isCurrent && daysLeftYear > 0 ? stats.projection > stats.ceiling : null;
    const realDailyTarget = overCeiling !== null ? Math.max(0, (stats.ceiling - adjustedSpent) / daysLeftYear) : null;
    const daysLeftMonth = stats.isCurrent
      ? new Date(stats.asOf.getFullYear(), curMonth + 1, 0).getDate() - stats.asOf.getDate()
      : 0;
    const spentThisMonth = stats.isCurrent ? stats.byMonth[curMonth].amount : 0;
    const dailyTargetThisMonth = stats.isCurrent && neededMonthly !== null && daysLeftMonth > 0
      ? Math.max(0, (neededMonthly - spentThisMonth) / daysLeftMonth)
      : null;

    // Amortization — read-only explanatory layer (see YCalc.amortizationBreakdown).
    const am = YCalc.amortizationBreakdown(store, stats.year, stats.asOfStr);

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
          <div className="section-h" style={{ marginTop: 0, marginBottom: 14 }}><h2>In numbers</h2></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Historical actuals</div>
              <div className="statgrid">
                <StatCard label="Spent year-to-date" value={eur0(stats.spent)} sub={`${stats.upto.length} entries`} />
                {dailyMedian !== null && (
                  <StatCard label="Daily spend (YTD)" value={eur0(stats.dailyRate) + "/d"} sub={`median ${eur0(dailyMedian)}/d`} />
                )}
                {completedMonths > 0 && (
                  <StatCard
                    label="Avg spend/mo"
                    value={eur0(avgMonthly)}
                    sub={`${completedMonths} completed month${completedMonths === 1 ? "" : "s"}`}
                  />
                )}
                {monthRange && (
                  <StatCard
                    label="Monthly range"
                    value={`${eur0(monthRange.min)}–${eur0(monthRange.max)}`}
                    sub={`${monthRange.minLabel} to ${monthRange.maxLabel}`}
                  />
                )}
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
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Projections &amp; forecasts</div>
              <div className="statgrid">
                {projMonthEnd !== null && <StatCard label="Projected month-end" value={eur0(projMonthEnd)} sub="this month" />}
                {!stats.isFuture && (
                  <StatCard
                    label={stats.complete ? "Final total" : "Projected year-end"}
                    value={eur0(stats.projection)}
                    sub={`vs ${eur0(stats.ceiling)} ceiling`}
                  />
                )}
                <StatCard
                  label="Blended rate"
                  value={eur0(stats.trailingDailyRate) + "/d"}
                  sub={!stats.complete
                    ? `+${eur0(stats.bufferAmt)} buffer (${Math.round(stats.buffer * 100)}% missed-entry)`
                    : `YTD avg ${eur0(stats.dailyRate)}/d`}
                />
                {trend90 && <StatCard label="90d trend" value={trend90} mono={false} color={trend90Color} />}
                {!stats.isFuture && <StatCard label="FIRE portfolio" value={eurK(firePortfolio)} sub="at 4% rule" />}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Targets &amp; budgets</div>
              <div className="statgrid">
                <StatCard
                  label="Monthly target"
                  value={eur0(stats.ceiling / 12)}
                  sub={neededMonthly !== null
                    ? <span style={{ color: avgMonthly > neededMonthly ? "var(--terra)" : "var(--sage)" }}>adjusted ≤{eur0(neededMonthly)}/mo</span>
                    : "baseline"}
                />
                <StatCard label={stats.complete ? "Days" : "On-pace by today"} value={stats.complete ? "365" : eur0(stats.pace)} sub={stats.complete ? "complete" : `day ${stats.doy} of ${stats.daysInYear}`} />
                {!stats.isFuture && <StatCard label="Total fun budget" value={eur0(stats.funPlanAnnual) + "/yr"} sub={eur0(stats.funPlanAnnual / 12) + "/mo"} />}
                {realDailyTarget !== null && (
                  <StatCard
                    label="Real daily target"
                    value={overCeiling ? `≤ ${eur0(realDailyTarget)}/day` : `room ${eur0(realDailyTarget)}/day`}
                    sub={`${daysLeftYear} days left · buffer-adjusted`}
                    color={overCeiling ? "var(--watch)" : "var(--good)"}
                  />
                )}
                {dailyTargetThisMonth !== null && (
                  <StatCard
                    label="Daily target (this month)"
                    value={`≤ ${eur0(dailyTargetThisMonth)}/day`}
                    sub={`${daysLeftMonth} days left this month`}
                  />
                )}
                {stats.isCurrent && (
                  <StatCard
                    label="Target fun/mo"
                    value={eur0(targetFunPerMo)}
                    sub="per person"
                    color={targetFunPerMo === 0 ? "var(--terra)" : "var(--sage)"}
                  />
                )}
              </div>
            </div>

            {am.hasAmortized && !stats.isFuture && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Amortization</div>
                <div className="statgrid">
                  <StatCard
                    label="Amortized YTD"
                    value={eur0(am.ytd.total)}
                    sub={stats.spent > 0 ? pct(am.ytd.total / stats.spent) + " of spend" : undefined}
                  />
                  {stats.isCurrent && (
                    <StatCard
                      label="This month"
                      value={eur0(am.month.total)}
                      sub={stats.byMonth[curMonth].amount > 0
                        ? pct(am.month.total / stats.byMonth[curMonth].amount) + " of this month"
                        : undefined}
                    />
                  )}
                  <StatCard label="Real (cash)" value={eur0(am.ytd.real)} />
                  <StatCard label="Virtual (no-cash)" value={eur0(am.ytd.virtual)} color="var(--sage)" sub="no-cash" />
                  {stats.isCurrent && (
                    <StatCard label="Committed this year" value={eur0(am.committedThisYear)} sub={`rest of ${stats.year}`} />
                  )}
                </div>
                <AmortizationChart am={am} stats={stats} />
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  function CategoriesTab({ stats, focusCategory, onEditTx, people, store }) {
    const [sel, setSel] = React.useState(focusCategory || null);
    React.useEffect(() => { if (focusCategory) setSel(focusCategory); }, [focusCategory]);
    const curMonth = stats.asOf.getMonth();
    const max = stats.catList[0] ? stats.catList[0].amount : 1;
    const rawUpto = React.useMemo(() => (
      stats.isFuture ? [] : YCalc.yearTxns(store, stats.year).filter((t) => t.date <= stats.asOfStr)
    ), [store, stats.year, stats.asOfStr, stats.isFuture]);
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
                      {rawUpto.filter((t) => t.category === c.id).slice().reverse().slice(0, 5).map((t) => (
                        <TxRow key={t.id} t={t} onClick={onEditTx ? () => onEditTx(t) : undefined} people={people} />
                      ))}
                    </div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)", margin: "14px 2px 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Largest in {cat.label}</div>
                    <div className="txlist">
                      {rawUpto.filter((t) => t.category === c.id).slice().sort((a, b) => b.amount_eur - a.amount_eur).slice(0, 5).map((t) => (
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

  function TransactionsTab({ stats, onEditTx, people, store }) {
    const [q, setQ] = React.useState("");
    const [fc, setFc] = React.useState(null);
    const [sort, setSort] = React.useState("date-desc");
    const [filterManual, setFilterManual] = React.useState(false);
    const [filterFun, setFilterFun] = React.useState(false);
    const [filterTravel, setFilterTravel] = React.useState(false);
    const [showFilters, setShowFilters] = React.useState(false);

    const activeCount = (fc ? 1 : 0) + (sort !== "date-desc" ? 1 : 0) + (filterManual ? 1 : 0) + (filterFun ? 1 : 0) + (filterTravel ? 1 : 0);

    const rawTxns = React.useMemo(() => YCalc.yearTxns(store, stats.year), [store, stats.year]);

    let list = rawTxns.slice();
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
        <div className="muted" style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 11 }}>{list.length} of {rawTxns.length} entries</div>
      </div>
    );
  }

  // Amortized ledger row — a RAW parent (never a slice); tap → onEditTx opens the edit sheet.
  function AmortParentRow({ p, store, onEditTx }) {
    const fillColor = p.real ? "var(--chart-actual)" : "var(--sage)";
    const width = Math.max(3, (p.elapsedMonths / p.amortize_months) * 100);
    const handleClick = () => {
      const raw = store.transactions.find((t) => t.id === p.id);
      if (raw) onEditTx(raw);
    };
    return (
      <button className="catbar-row" onClick={handleClick}>
        <CatIcon catId={p.category} size={24} radius={6} />
        <span className="catbar-main">
          <span className="catbar-top">
            <span className="catbar-name" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</span>
              <TxTag label={(p.virtual ? "VIRTUAL " : "") + "×" + p.amortize_months + "mo"} color="var(--terra)" />
            </span>
            <span className="catbar-amt num">{eurAuto(p.amount_eur)}</span>
          </span>
          <span className="catbar-track"><span className="catbar-fill" style={{ width: width + "%", background: fillColor }} /></span>
          <span className="catbar-sub" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <span>{eur0(p.monthly)}/mo · {p.startYm}→{p.endYm}</span>
            <span>{eur0(p.remainingAmt)} remaining · {p.remaining} mo left</span>
          </span>
        </span>
      </button>
    );
  }

  function AmortSection({ title, list, store, onEditTx }) {
    if (!list.length) return null;
    const subtotal = list.reduce((a, p) => a + p.amount_eur, 0);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <div className="eyebrow">{title}</div>
          <span className="muted num" style={{ fontSize: 12 }}>{eurAuto(subtotal)}</span>
        </div>
        {list.map((p) => <AmortParentRow key={p.id} p={p} store={store} onEditTx={onEditTx} />)}
      </div>
    );
  }

  function AmortizedTab({ store, stats, onEditTx, people }) {
    const am = React.useMemo(
      () => YCalc.amortizationBreakdown(store, stats.year, stats.asOfStr),
      [store, stats.year, stats.asOfStr]
    );
    if (!am.hasAmortized) {
      return <div className="empty">No amortized transactions this year.</div>;
    }
    const real = am.parents.filter((p) => p.real);
    const virtual = am.parents.filter((p) => !p.real);
    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="statgrid">
          <StatCard label="Outstanding real" value={eur0(am.totals.real)} sub="cash" />
          <StatCard label="Outstanding virtual" value={eur0(am.totals.virtual)} sub="no-cash" color="var(--sage)" />
          <StatCard label="Active amortizations" value={String(am.parents.length)} mono={false} />
        </div>
        <AmortSection title="Real (cash)" list={real} store={store} onEditTx={onEditTx} />
        <AmortSection title="Virtual (no-cash)" list={virtual} store={store} onEditTx={onEditTx} />
      </div>
    );
  }

  function ActivityMergedTab({ stats, subtab, setSubtab, focusCategory, onEditTx, people, store }) {
    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SegmentedControl options={["Categories", "Transactions", "Amortized"]} value={subtab} onChange={setSubtab} />
        {subtab === "Categories" && <CategoriesTab stats={stats} focusCategory={focusCategory} onEditTx={onEditTx} people={people} store={store} />}
        {subtab === "Transactions" && <TransactionsTab stats={stats} onEditTx={onEditTx} people={people} store={store} />}
        {subtab === "Amortized" && <AmortizedTab store={store} stats={stats} onEditTx={onEditTx} people={people} />}
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
          <SegmentedControl options={["Projection", "Activity", "Fun", "Travel", "Plan"]} value={tab} fill onChange={setTab} />
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
            store={store}
          />
        )}
        {tab === "Fun" && <YFun.FunTab fun={fun} store={store} setStore={setStore} addTx={addTx} />}
        {tab === "Travel" && <YTravel.TravelTab travel={travel} store={store} setStore={setStore} />}
        {tab === "Plan" && <YPlan.PlanTab store={store} setStore={setStore} stats={stats} />}
      </div>
    );
  }

  window.YAnalysis = { AnalysisScreen };
})();
