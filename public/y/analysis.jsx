// analysis.jsx — the deep surface: projection chart, activity (categories + transactions), fun.
(function () {
  const { YData, YCalc, YUI, YFun, YTravel } = window;
  const { eur0, eurAuto, signedEur, signedPct, pct, MONTHS, fmtDateShort } = YCalc;
  const { TxRow, CatIcon, CalloutCard, SectionH } = YUI;
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

  function ActivityMergedTab({ stats, subtab, setSubtab, focusCategory, onEditTx, people, store }) {
    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SegmentedControl options={["Categories", "Transactions"]} value={subtab} onChange={setSubtab} />
        {subtab === "Categories" && <CategoriesTab stats={stats} focusCategory={focusCategory} onEditTx={onEditTx} people={people} store={store} />}
        {subtab === "Transactions" && <TransactionsTab stats={stats} onEditTx={onEditTx} people={people} store={store} />}
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
            store={store}
          />
        )}
        {tab === "Fun" && <YFun.FunTab fun={fun} store={store} setStore={setStore} addTx={addTx} />}
        {tab === "Travel" && <YTravel.TravelTab travel={travel} store={store} setStore={setStore} />}
      </div>
    );
  }

  window.YAnalysis = { AnalysisScreen };
})();
