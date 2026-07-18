// plan.jsx — the Plan tab: scenario & decision-record view. Exposed on window.YPlan.
// A contained decision notebook: named lifestyle scenarios (packages of annual-cost "levers")
// resolving to a deficit and an implied portfolio draw rate, plus the recorded reasoning behind
// them. Informs the ceiling decision; never participates in ceiling math — store.plan is settings-
// blob synced (like trips/travel) and none of computeStats/buildCallouts/fun/travel ever read it.
// Phase 2: header strip (portfolio/income tap-to-edit + live "this year implies"), the draw ladder,
// and the expanded scenario (read + lever toggle/override + baseline/income override). Lever-library
// editing, decision-log entry, triggers, pin/duplicate/delete are Phase 3.
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, localISO } = YCalc;
  const { TxTag } = YUI;

  const pct1 = (n) => (n * 100).toFixed(1) + "%";

  function daysSince(dateStr) {
    if (!dateStr) return null;
    const then = new Date(dateStr + "T00:00:00");
    const now = new Date();
    return Math.floor((now - then) / 86400000);
  }

  // ---------- Header strip: Portfolio / Income (tap-to-edit) / This year implies (read-only) ----------

  function InlineEditNum({ value, onSave }) {
    const [editing, setEditing] = React.useState(false);
    const [val, setVal] = React.useState(String(value || ""));
    React.useEffect(() => { if (!editing) setVal(String(value || "")); }, [value, editing]);

    const commit = () => {
      setEditing(false);
      const n = parseFloat(val);
      onSave(Number.isFinite(n) ? n : 0);
    };

    if (editing) {
      return (
        <input
          className="inp inp-num"
          type="number"
          autoFocus
          value={val}
          style={{ height: 34, padding: "0 10px", fontSize: 18, fontWeight: 600, width: "100%" }}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        />
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left",
          fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)",
        }}
      >
        {eur0(value)}
      </button>
    );
  }

  function HeaderStrip({ plan, stats, setStore }) {
    const savePortfolio = (v) => setStore((s) => ({
      ...s,
      plan: { ...s.plan, portfolio: v, portfolioAsOf: localISO(new Date()), updatedAt: Date.now() },
    }));
    const saveIncome = (v) => setStore((s) => ({
      ...s,
      plan: { ...s.plan, externalIncome: v, updatedAt: Date.now() },
    }));

    const asOfDays = daysSince(plan.portfolioAsOf);
    const stale = asOfDays != null && asOfDays > 90;

    const thisYearDraw = plan.portfolio > 0
      ? Math.max(0, stats.projection - (plan.externalIncome || 0)) / plan.portfolio
      : null;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, paddingBottom: 18, borderBottom: "1px solid var(--hair)", marginBottom: 18 }}>
        <div>
          <div className="stat-label">Portfolio</div>
          <InlineEditNum value={plan.portfolio} onSave={savePortfolio} />
          <div className="stat-sub">
            as of {plan.portfolioAsOf || "—"}
            {stale && <span> · updated {asOfDays}d ago</span>}
          </div>
        </div>
        <div>
          <div className="stat-label">Income</div>
          <InlineEditNum value={plan.externalIncome} onSave={saveIncome} />
          <div className="stat-sub">per year</div>
        </div>
        <div>
          <div className="stat-label">This year implies</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
            {thisYearDraw != null ? pct1(thisYearDraw) : "—"}
          </div>
          <div className="stat-sub">projected draw</div>
        </div>
      </div>
    );
  }

  // ---------- Draw ladder ----------

  // Full-width hairline axis, 0–5%, faint vertical rules at 2.0 / 3.5 / 4.5, a dot at the
  // scenario's draw (terracotta only for band "d"; ink otherwise). No dot for a null draw
  // (portfolio not configured).
  function DrawAxis({ draw, band }) {
    const clampPct = (v) => Math.max(0, Math.min(100, (v * 100 / 5) * 100));
    const dotLeft = draw != null ? clampPct(draw) : null;
    const dotColor = band === "d" ? "var(--terra)" : "var(--ink)";
    return (
      <div style={{ position: "relative", height: 14, marginTop: 8 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 6, height: 1, background: "var(--hair)" }} />
        {[2.0, 3.5, 4.5].map((v) => (
          <div key={v} style={{ position: "absolute", left: (v / 5 * 100) + "%", top: 2, width: 1, height: 10, background: "var(--hair-strong)" }} />
        ))}
        {dotLeft != null && (
          <div style={{
            position: "absolute", left: `calc(${dotLeft}% - 4px)`, top: 2, width: 8, height: 8,
            borderRadius: "50%", background: dotColor,
          }} />
        )}
      </div>
    );
  }

  function NullableNumInput({ value, onCommit, placeholder, width }) {
    const [val, setVal] = React.useState(value == null ? "" : String(value));
    React.useEffect(() => { setVal(value == null ? "" : String(value)); }, [value]);
    const commit = () => {
      const raw = val.trim();
      onCommit(raw === "" ? null : (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : null));
    };
    return (
      <input
        className="inp inp-num"
        type="number"
        placeholder={placeholder}
        value={val}
        style={{ height: 34, padding: "0 10px", fontSize: 12.5, width: width || "100%" }}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      />
    );
  }

  // Expanded scenario — Phase 2: lever checklist (toggle enabled + amountOverride, live recompute),
  // baseline/income override fields, the sensitivity line, and read-only notes. Pin/duplicate/
  // delete/decision-log editing are Phase 3.
  function ExpandedScenario({ row, plan, setStore }) {
    const { scenario } = row;
    const leverById = Object.fromEntries((plan.levers || []).map((l) => [l.id, l]));

    const updateScenario = (updater) => setStore((s) => ({
      ...s,
      plan: {
        ...s.plan,
        scenarios: s.plan.scenarios.map((sc) => (sc.id === scenario.id ? { ...updater(sc), updatedAt: Date.now() } : sc)),
      },
    }));

    const toggleLever = (leverId) => updateScenario((sc) => ({
      ...sc,
      leverRefs: sc.leverRefs.map((ref) => (ref.leverId === leverId ? { ...ref, enabled: !ref.enabled } : ref)),
    }));

    const setLeverOverride = (leverId, val) => updateScenario((sc) => ({
      ...sc,
      leverRefs: sc.leverRefs.map((ref) => (ref.leverId === leverId ? { ...ref, amountOverride: val } : ref)),
    }));

    const setBaselineOverride = (val) => updateScenario((sc) => ({ ...sc, baselineOverride: val }));
    const setIncomeOverride = (val) => updateScenario((sc) => ({ ...sc, incomeOverride: val }));

    return (
      <div style={{ padding: "2px 2px 14px" }}>
        {scenario.leverRefs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="stat-label" style={{ marginBottom: 4 }}>Levers</div>
            {scenario.leverRefs.map((ref) => {
              const lever = leverById[ref.leverId];
              if (!lever) return null;
              return (
                <div key={ref.leverId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--hair)" }}>
                  <button
                    onClick={() => toggleLever(ref.leverId)}
                    aria-label={ref.enabled ? "Disable lever" : "Enable lever"}
                    style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0, padding: 0,
                      border: "1px solid " + (ref.enabled ? "var(--terra)" : "var(--hair-strong)"),
                      background: ref.enabled ? "var(--terra)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    }}
                  >
                    {ref.enabled && <window.Icon name="check" size={12} style={{ color: "var(--paper)" }} />}
                  </button>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--sans)", fontSize: 13, color: ref.enabled ? "var(--ink)" : "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lever.label}
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", marginLeft: 6 }}>
                      ({eur0(lever.amount)})
                    </span>
                  </span>
                  <NullableNumInput value={ref.amountOverride} onCommit={(v) => setLeverOverride(ref.leverId, v)} placeholder={String(lever.amount)} width={84} />
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="stat-label" style={{ marginBottom: 4 }}>Baseline override</div>
            <NullableNumInput value={scenario.baselineOverride} onCommit={setBaselineOverride} placeholder="live ceiling" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-label" style={{ marginBottom: 4 }}>Income override</div>
            <NullableNumInput value={scenario.incomeOverride} onCommit={setIncomeOverride} placeholder={String(plan.externalIncome || 0)} />
          </div>
        </div>

        <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--muted)", marginBottom: scenario.notes ? 10 : 0 }}>
          crosses 3.5% below {eur0(row.floor35)} · 4.5% below {eur0(row.floor45)} · headroom {eur0(row.headroom)}
        </div>

        {scenario.notes && (
          <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {scenario.notes}
          </div>
        )}
      </div>
    );
  }

  function ScenarioRow({ row, open, onToggle, plan, setStore }) {
    const { scenario, deficit, draw, band } = row;
    return (
      <div style={{ borderBottom: "1px solid var(--hair)" }}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          style={{ width: "100%", background: "none", border: 0, padding: "12px 0", cursor: "pointer", textAlign: "left" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scenario.name}
              </span>
              {scenario.pinned && <TxTag label="PINNED" color="var(--terra)" />}
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{eur0(deficit)}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: band === "d" ? "var(--terra)" : "var(--muted)", minWidth: 42, textAlign: "right" }}>
                {draw != null ? pct1(draw) : "—"}
              </span>
            </span>
          </div>
          <DrawAxis draw={draw} band={band} />
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            <ExpandedScenario row={row} plan={plan} setStore={setStore} />
          </div>
        </div>
      </div>
    );
  }

  function PlanTab({ store, setStore, stats }) {
    const plan = store.plan || { levers: [], scenarios: [], triggers: [] };
    const [openId, setOpenId] = React.useState(null);

    const currentCeiling = (store.years && store.currentYear != null && store.years[store.currentYear] && store.years[store.currentYear].ceiling) || stats.ceiling;
    const rows = YCalc.computeScenarios(plan, currentCeiling);

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <HeaderStrip plan={plan} stats={stats} setStore={setStore} />
        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 4 }}>
            <h2>Draw ladder</h2>
            <span className="spacer" />
            <span className="sec-meta">{rows.length} {rows.length === 1 ? "SCENARIO" : "SCENARIOS"}</span>
          </div>
          {rows.length === 0 ? (
            <div className="empty" style={{ marginTop: 8 }}>No scenarios yet.</div>
          ) : (
            rows.map((row) => (
              <ScenarioRow
                key={row.scenario.id}
                row={row}
                plan={plan}
                setStore={setStore}
                open={openId === row.scenario.id}
                onToggle={() => setOpenId(openId === row.scenario.id ? null : row.scenario.id)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  window.YPlan = { PlanTab };
})();
