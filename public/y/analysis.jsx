// analysis.jsx — the deep surface: projection chart, category diagnostics, activity, fun.
(function () {
  const { YData, YCalc, YUI, YFun } = window;
  const { eur0, eurAuto, signedEur, signedPct, pct, MONTHS, fmtDateShort } = YCalc;
  const { TxRow, CatIcon } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const SegmentedControl = DS.SegmentedControl, Input = DS.Input, Chip = DS.Chip;

  const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const eurK = (v) => (Math.abs(v) >= 1000 ? "€" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k" : "€" + Math.round(v));

  // Hand-built SVG projection chart — DS-styled, dependency-free.
  function ProjectionChart({ stats }) {
    const W = 340, H = 212, padL = 40, padR = 14, padT = 12, padB = 24;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const priorCum = stats.priorCum;
    const priorMax = priorCum ? priorCum[Math.min(365, stats.doy)] : 0;
    const maxY = Math.max(stats.mainTarget, stats.ceiling, stats.projection, priorMax) * 1.1;
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
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
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
        {/* target reference */}
        <line x1={x0} y1={sy(stats.mainTarget)} x2={x1} y2={sy(stats.mainTarget)} stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="4 4" />
        <text x={x1} y={sy(stats.mainTarget) - 5} textAnchor="end" fontSize="9" fill="var(--chart-target)" fontFamily="var(--mono)">target {eurK(stats.mainTarget)}</text>
        {/* household ceiling */}
        <line x1={x0} y1={sy(stats.ceiling)} x2={x1} y2={sy(stats.ceiling)} stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="6 3" />
        <text x={x1} y={sy(stats.ceiling) - 5} textAnchor="end" fontSize="9" fill="var(--ink-2)" fontFamily="var(--mono)">ceiling {eurK(stats.ceiling)}</text>
        {/* linear pace */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(365)} y2={sy(stats.mainTarget)} stroke="var(--chart-pace)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
        {/* prior year */}
        {priorCum && (() => {
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
        {/* projected */}
        {!stats.complete && (
          <>
            <line x1={sx(stats.doy)} y1={sy(stats.spent)} x2={sx(365)} y2={sy(stats.projection)} stroke="var(--chart-proj)" strokeWidth="2.2" strokeDasharray="6 5" strokeLinecap="round" />
            <circle cx={sx(365)} cy={sy(stats.projection)} r="3.2" fill="var(--chart-proj)" />
            <circle cx={sx(stats.doy)} cy={sy(stats.spent)} r="3.6" fill="var(--chart-actual)" stroke="var(--paper)" strokeWidth="1.5" />
          </>
        )}
      </svg>
    );
  }

  function ChartLegend({ stats }) {
    const Item = ({ c, dash, label }) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2.4" strokeDasharray={dash || "0"} strokeLinecap="round" /></svg>{label}
      </span>
    );
    return (
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
        <Item c="var(--chart-actual)" label="Actual" />
        {!stats.complete && <Item c="var(--chart-proj)" dash="6 5" label="Projected" />}
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

  function StatCard({ label, value, sub, mono = true, color }) {
    return (
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className={"stat-val" + (mono ? " num" : "")} style={color ? { color } : undefined}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    );
  }

  function ProjectionTab({ stats }) {
    const curMonth = stats.asOf.getMonth();
    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 10 }}><h2>Spend vs pace</h2></div>
          <ProjectionChart stats={stats} />
          <ChartLegend stats={stats} />
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "12px 2px 0", textWrap: "pretty" }}>
            Projection is linear: your daily spend so far, extended across all 365 days{stats.complete ? "" : `, then lifted ${Math.round(stats.buffer * 100)}% for missed entries`}.
          </p>
        </div>

        <div className="statgrid">
          <StatCard label="Spent year-to-date" value={eur0(stats.spent)} sub={`${stats.upto.length} entries`} />
          <StatCard label={stats.complete ? "Days" : "On-pace by today"} value={stats.complete ? "365" : eur0(stats.pace)} sub={stats.complete ? "complete" : `day ${stats.doy} of 365`} />
          <StatCard label="Daily rate" value={eur0(stats.dailyRate) + "/d"} sub={`linear pace ${eur0(stats.mainTarget / 365)}/d`} />
          {!stats.complete && <StatCard label="Buffer adds" value={"+" + eur0(stats.bufferAmt)} sub={`${Math.round(stats.buffer * 100)}% missed-entry`} />}
          <StatCard label={stats.complete ? "Final spend" : "Projected finish"} value={eur0(stats.projection)}
            color={stats.status === "good" ? "var(--good)" : stats.status === "alert" ? "var(--alert)" : "var(--watch)"} />
          <StatCard label="vs target" value={(stats.delta >= 0 ? "+" : "−") + eur0(Math.abs(stats.delta))} sub={signedPct(stats.deltaPct)}
            color={stats.status === "good" ? "var(--good)" : stats.status === "alert" ? "var(--alert)" : "var(--watch)"} />
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
            const req = YCalc.requiredDailyToHit(stats);
            if (req === null) return null;
            return (
              <StatCard
                label="To finish on target"
                value={`≤ ${eur0(req)}/day`}
                sub={`${365 - stats.doy} days left`}
                color="var(--watch)"
              />
            );
          })()}
        </div>
      </div>
    );
  }

  function CategoriesTab({ stats, focusCategory, onEditTx }) {
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
                        <TxRow key={t.id} t={t} onClick={onEditTx ? () => onEditTx(t) : undefined} />
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

  function ActivityTab({ stats, onEditTx }) {
    const [q, setQ] = React.useState("");
    const [fc, setFc] = React.useState(null);
    let list = stats.txns.slice().reverse();
    if (fc) list = list.filter((t) => t.category === fc);
    if (q.trim()) { const s = q.toLowerCase(); list = list.filter((t) => t.description.toLowerCase().includes(s)); }
    const cats = stats.catList.slice(0, 8);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input icon={<window.Icon name="search" size={16} />} placeholder="Search descriptions…" value={q} ariaLabel="Search transactions"
          onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
          <Chip pressed={!fc} onClick={() => setFc(null)}>All</Chip>
          {cats.map((c) => <Chip key={c.id} pressed={fc === c.id} onClick={() => setFc(fc === c.id ? null : c.id)}>{YData.cat(c.id).label}</Chip>)}
        </div>
        <div>
          {list.length ? (
            <div className="txlist">{list.map((t) => <TxRow key={t.id} t={t} onClick={() => onEditTx(t)} />)}</div>
          ) : <div className="empty">No matching transactions.</div>}
        </div>
        <div className="muted" style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 11 }}>{list.length} of {stats.txns.length} entries</div>
      </div>
    );
  }

  function AnalysisScreen({ stats, focus, onEditTx, fun, store, setStore, addTx }) {
    const [tab, setTab] = React.useState("Projection");
    React.useEffect(() => {
      if (focus && focus.section === "categories") setTab("Categories");
      else if (focus && focus.section === "projection") setTab("Projection");
      else if (focus && focus.section === "activity") setTab("Activity");
      else if (focus && focus.section === "fun") setTab("Fun");
    }, [focus]);
    return (
      <div className="screen">
        <div style={{ position: "sticky", top: 0, zIndex: 5, paddingBottom: 4 }}>
          <SegmentedControl options={["Projection", "Categories", "Activity", "Fun"]} value={tab} fill onChange={setTab} />
        </div>
        {tab === "Projection" && <ProjectionTab stats={stats} />}
        {tab === "Categories" && <CategoriesTab stats={stats} focusCategory={focus && focus.category} onEditTx={onEditTx} />}
        {tab === "Activity" && <ActivityTab stats={stats} onEditTx={onEditTx} />}
        {tab === "Fun" && <YFun.FunTab fun={fun} store={store} setStore={setStore} addTx={addTx} />}
      </div>
    );
  }

  window.YAnalysis = { AnalysisScreen };
})();
