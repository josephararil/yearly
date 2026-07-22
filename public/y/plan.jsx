// plan.jsx — the Plan tab: scenario & decision-record view. Exposed on window.YPlan.
// A contained decision notebook: named lifestyle scenarios (packages of annual-cost "levers")
// resolving to a deficit and an implied portfolio draw rate, plus the recorded reasoning behind
// them. Informs the ceiling decision; never participates in ceiling math — store.plan is settings-
// blob synced (like trips/travel) and none of computeStats/buildCallouts/fun/travel ever read it.
// Phase 2: header strip (portfolio/income tap-to-edit + live "this year implies"), the draw ladder,
// and the expanded scenario (read + lever toggle/override + baseline/income override).
// Phase 3: decision log, pin/duplicate/delete, the lever library (add/edit/delete-blocked-while-
// referenced) and the triggers block (add/edit/delete) — the full editing surface.
// Phase 4: builder-first redesign — a shared comparison axis (all scenarios as dots on one draw
// scale) plus an always-visible builder (the selected scenario's levers/overrides/result, edited in
// local sandbox state that never touches the store until Save). Lever library and triggers stay as
// collapsed sections underneath, unchanged.
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, localISO } = YCalc;
  const { TxTag, InfoTip } = YUI;

  const pct1 = (n) => (n * 100).toFixed(1) + "%";
  const REVERSIBILITY_OPTS = ["instant", "medium", "low"];
  const DURABILITY_OPTS = ["high", "medium", "low"];

  // Two-step inline delete: "Delete" → "Confirm delete / Cancel". Blocked entirely (with a quiet
  // explanation) when `disabled` — mirrors the trip delete-blocked-while-has-transactions idiom.
  function ConfirmDelete({ onConfirm, disabled, blockedReason }) {
    const [confirming, setConfirming] = React.useState(false);
    if (disabled) {
      return <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{blockedReason}</span>;
    }
    if (confirming) {
      return (
        <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="linklike" style={{ color: "var(--terra)" }} onClick={() => { setConfirming(false); onConfirm(); }}>Confirm delete</button>
          <button className="linklike" onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      );
    }
    return <button className="linklike" style={{ color: "var(--terra)" }} onClick={() => setConfirming(true)}>Delete</button>;
  }

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
          <div className="stat-label"><InfoTip id="plan-portfolio">Portfolio</InfoTip></div>
          <InlineEditNum value={plan.portfolio} onSave={savePortfolio} />
          <div className="stat-sub">
            as of {plan.portfolioAsOf || "—"}
            {stale && <span> · updated {asOfDays}d ago</span>}
          </div>
        </div>
        <div>
          <div className="stat-label"><InfoTip id="plan-income">Income</InfoTip></div>
          <InlineEditNum value={plan.externalIncome} onSave={saveIncome} />
          <div className="stat-sub">per year</div>
        </div>
        <div>
          <div className="stat-label"><InfoTip id="plan-thisyear" ctx={{ stats, plan, thisYearDraw }}>This year implies</InfoTip></div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
            {thisYearDraw != null ? pct1(thisYearDraw) : "—"}
          </div>
          <div className="stat-sub">projected draw</div>
        </div>
      </div>
    );
  }

  // ---------- Small shared inline-edit inputs ----------

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

  // Inline-editable heading text (scenario name). Click to edit, blur/Enter commits, Escape cancels;
  // an empty commit is discarded (reverts to the previous value).
  function InlineEditText({ value, onCommit }) {
    const [editing, setEditing] = React.useState(false);
    const [val, setVal] = React.useState(value);
    React.useEffect(() => { if (!editing) setVal(value); }, [value, editing]);
    const commit = () => {
      setEditing(false);
      const trimmed = val.trim();
      if (trimmed && trimmed !== value) onCommit(trimmed); else setVal(value);
    };
    if (editing) {
      return (
        <input
          className="inp" autoFocus value={val}
          style={{ height: 36, padding: "0 8px", fontSize: 19, fontWeight: 600, fontFamily: "var(--serif)", width: "auto", minWidth: 140 }}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
        />
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600, color: "var(--ink)" }}
      >
        {value}
      </button>
    );
  }

  // Small muted tap-to-edit figure for the baseline/income line — a compact sibling of
  // InlineEditNum, sized for inline mono text rather than a labeled stat block.
  function InlineTapNum({ value, placeholder, onCommit }) {
    const [editing, setEditing] = React.useState(false);
    const [val, setVal] = React.useState(value == null ? "" : String(value));
    React.useEffect(() => { if (!editing) setVal(value == null ? "" : String(value)); }, [value, editing]);
    const commit = () => {
      setEditing(false);
      const raw = val.trim();
      onCommit(raw === "" ? null : (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : null));
    };
    if (editing) {
      return (
        <input
          className="inp inp-num" type="number" autoFocus value={val}
          style={{ height: 24, padding: "0 6px", fontSize: 11.5, width: 84, fontFamily: "var(--mono)" }}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        />
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--muted)", textDecoration: "underline dotted", textUnderlineOffset: 2 }}
      >
        {value == null ? placeholder : eur0(value)}
      </button>
    );
  }

  // Decision log — dated entries, newest first (new entries are prepended). Add-entry input mints
  // an id via YData.uid() and a localISO date, matching the trips id/date conventions.
  function DecisionLog({ scenario, updateScenario }) {
    const [text, setText] = React.useState("");
    const log = scenario.log || [];

    const addEntry = () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const entry = { id: YData.uid(), date: localISO(new Date()), text: trimmed };
      updateScenario((sc) => ({ ...sc, log: [entry, ...(sc.log || [])] }));
      setText("");
    };

    return (
      <div style={{ marginTop: 14 }}>
        <div className="stat-label" style={{ marginBottom: 4 }}>Decision log</div>
        {log.map((e) => (
          <div key={e.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--hair)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>{e.date}</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.4 }}>{e.text}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <input
            className="inp"
            style={{ height: 34, padding: "0 10px", fontSize: 12.5 }}
            placeholder="Add an entry…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addEntry(); }}
          />
          <button className="linklike" onClick={addEntry}>Add</button>
        </div>
      </div>
    );
  }

  // Picker to attach an existing library lever to a scenario (levers not yet referenced).
  function AddLeverPicker({ availableLevers, onAdd }) {
    const [selected, setSelected] = React.useState(availableLevers[0] ? availableLevers[0].id : "");
    React.useEffect(() => {
      if (availableLevers.length && !availableLevers.some((l) => l.id === selected)) setSelected(availableLevers[0].id);
    }, [availableLevers, selected]);
    if (availableLevers.length === 0) return null;
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <select className="inp" style={{ height: 34, fontSize: 12.5 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
          {availableLevers.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <button className="linklike" onClick={() => onAdd(selected)}>Add lever</button>
      </div>
    );
  }

  // ---------- Comparison strip — one shared 0–5% axis, every scenario plotted as a dot ----------

  const BAND_WASH = { a: "var(--good-dim)", b: "var(--good-dim)", c: "var(--watch-dim)", d: "var(--alert-dim)" };
  const bandDotColor = (band) => (band === "d" ? "var(--terra)" : "var(--ink)");
  const leftPct = (draw) => (draw == null ? null : Math.min(100, (draw / 0.05) * 100));

  // Only the SELECTED scenario ever renders a name label — every other scenario is an unlabeled
  // dot. This is a deliberate simplification: with 5+ scenarios, several can land at nearly
  // identical draws (two seed scenarios tie exactly), and no fixed above/below alternation avoids
  // every collision at small mobile widths. One label at a time never collides with anything, and
  // tapping any dot both selects it (revealing its name) and drives the builder — the label IS the
  // selection state, not a separate always-on annotation.
  function ComparisonStrip({ rows, selectedId, liveRow, dirty, onSelect }) {
    const plotRows = rows.map((r) => (r.scenario.id === selectedId && liveRow ? { ...r, draw: liveRow.draw, band: liveRow.band } : r));
    const savedSelected = dirty ? rows.find((r) => r.scenario.id === selectedId) : null;

    return (
      <div style={{ paddingTop: 18, marginBottom: 10 }}>
        <div style={{ position: "relative", height: 36 }}>
          <div style={{ position: "absolute", left: 0, width: "40%", top: 0, height: 10, background: "color-mix(in srgb, var(--sage) 5%, transparent)" }} />
          <div style={{ position: "absolute", left: "40%", width: "30%", top: 0, height: 10, background: "color-mix(in srgb, var(--sage) 8%, transparent)" }} />
          <div style={{ position: "absolute", left: "70%", width: "20%", top: 0, height: 10, background: "color-mix(in srgb, var(--amber) 9%, transparent)" }} />
          <div style={{ position: "absolute", left: "90%", width: "10%", top: 0, height: 10, background: "color-mix(in srgb, var(--terra) 11%, transparent)" }} />
          {[2.0, 3.5, 4.5].map((v) => (
            <React.Fragment key={v}>
              <div style={{ position: "absolute", left: (v / 5 * 100) + "%", top: -4, width: 1, height: 18, background: "var(--hair-strong)" }} />
              <div style={{ position: "absolute", left: (v / 5 * 100) + "%", top: 16, transform: "translateX(-50%)", fontFamily: "var(--mono)", fontSize: 8.5, color: "var(--muted)" }}>
                <InfoTip id="plan-bands">{v.toFixed(1)}</InfoTip>
              </div>
            </React.Fragment>
          ))}
          {savedSelected && leftPct(savedSelected.draw) != null && (
            <div style={{
              position: "absolute", left: `calc(${leftPct(savedSelected.draw)}% - 5px)`, top: -4, width: 10, height: 10,
              borderRadius: "50%", border: "1.5px solid var(--muted)", background: "var(--paper)",
            }} />
          )}
          {plotRows.map((r) => {
            const selected = r.scenario.id === selectedId;
            const pct = leftPct(r.draw);
            const clamped = r.draw != null && r.draw > 0.05;
            const label = r.scenario.name + (clamped ? " +" : "");
            const size = selected ? 12 : 8;
            return (
              <button
                key={r.scenario.id}
                onClick={() => onSelect(r.scenario.id)}
                style={{
                  position: "absolute", left: pct == null ? "auto" : `${pct}%`, right: pct == null ? 0 : "auto", top: 5 - size / 2,
                  transform: pct == null ? "none" : "translateX(-50%)", background: "none", border: 0, padding: 4, margin: -4,
                  cursor: "pointer", zIndex: selected ? 1 : 0,
                }}
              >
                <span style={{ display: "block", width: size, height: size, borderRadius: "50%", background: selected ? "var(--terra)" : bandDotColor(r.band) }} />
                {selected && (
                  <span style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 4, fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>{label}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- The builder — the centerpiece; edits are local sandbox state until Save ----------

  const zoneVerdict = (band, liveRow) => {
    if (band === "a") return "within 2.0% · survives any recorded market history";
    if (band === "b") return `within the 3.5% envelope · headroom ${eur0(liveRow.headroom)}`;
    if (band === "c") return `over the envelope · crosses 3.5% below ${eur0(liveRow.floor35)}`;
    if (band === "d") return "over 4.5% · not sustainable without income";
    return "set a portfolio in the header above to see the draw-rate verdict";
  };
  const zoneTextColor = (band) => (band === "d" ? "var(--terra)" : band === "c" ? "var(--amber)" : band === "a" || band === "b" ? "var(--sage)" : "var(--muted)");

  function ScenarioBuilder({
    plan, rows, scenario, sandbox, setSandbox, dirty, pendingTarget, liveRow, currentCeiling,
    requestSwitch, updateScenario, duplicateScenario, deleteScenario, onDirtyAction, onPendingAction, onCancelPending,
  }) {
    const leverById = Object.fromEntries((plan.levers || []).map((l) => [l.id, l]));
    const availableLevers = (plan.levers || []).filter((l) => !sandbox.leverRefs.some((ref) => ref.leverId === l.id));

    const toggleLever = (leverId) => setSandbox((sb) => ({
      ...sb, leverRefs: sb.leverRefs.map((ref) => (ref.leverId === leverId ? { ...ref, enabled: !ref.enabled } : ref)),
    }));
    const setLeverOverride = (leverId, val) => setSandbox((sb) => ({
      ...sb, leverRefs: sb.leverRefs.map((ref) => (ref.leverId === leverId ? { ...ref, amountOverride: val } : ref)),
    }));
    const addLeverRef = (leverId) => setSandbox((sb) => ({ ...sb, leverRefs: [...sb.leverRefs, { leverId, enabled: true, amountOverride: null }] }));
    const setBaselineOverride = (v) => setSandbox((sb) => ({ ...sb, baselineOverride: v }));
    const setIncomeOverride = (v) => setSandbox((sb) => ({ ...sb, incomeOverride: v }));
    const togglePinned = () => updateScenario((sc) => ({ ...sc, pinned: !sc.pinned }));
    const renameScenario = (name) => updateScenario((sc) => ({ ...sc, name }));

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 6 }}>
          <InlineEditText value={scenario.name} onCommit={renameScenario} />
          {scenario.pinned && <TxTag label="PINNED" color="var(--terra)" />}
          <span style={{ flex: 1 }} />
          <select className="inp" style={{ height: 30, fontSize: 11.5, maxWidth: 160 }} value={scenario.id} onChange={(e) => requestSwitch(e.target.value)}>
            {rows.map((r) => <option key={r.scenario.id} value={r.scenario.id}>{r.scenario.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
          <button className="linklike" onClick={togglePinned}>{scenario.pinned ? "Unpin" : "Pin"}</button>
          <button className="linklike" onClick={duplicateScenario}>Duplicate</button>
          <span style={{ flex: 1 }} />
          <ConfirmDelete onConfirm={deleteScenario} />
        </div>

        {sandbox.leverRefs.map((ref) => {
          const lever = leverById[ref.leverId];
          if (!lever) return null;
          const amount = ref.amountOverride ?? lever.amount;
          return (
            <div key={ref.leverId} style={{ borderBottom: "1px solid var(--hair)" }}>
              <div
                onClick={() => toggleLever(ref.leverId)}
                style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, cursor: "pointer", opacity: ref.enabled ? 1 : 0.45 }}
              >
                <span
                  aria-label={ref.enabled ? "Disable lever" : "Enable lever"}
                  style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: "1px solid " + (ref.enabled ? "var(--terra)" : "var(--hair-strong)"),
                    background: ref.enabled ? "var(--terra)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {ref.enabled && <window.Icon name="check" size={12} style={{ color: "var(--paper)" }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--sans)", fontSize: 14, color: ref.enabled ? "var(--ink)" : "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lever.label}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>{eur0(amount)}</span>
                {ref.enabled && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <NullableNumInput value={ref.amountOverride} onCommit={(v) => setLeverOverride(ref.leverId, v)} placeholder={String(lever.amount)} width={84} />
                  </span>
                )}
              </div>
              {ref.enabled && lever.scale && (
                <input
                  type="range" className="rng"
                  min={lever.scale.min} max={lever.scale.max} step={lever.scale.step}
                  value={amount}
                  onChange={(e) => setLeverOverride(ref.leverId, parseFloat(e.target.value))}
                  style={{ width: "100%", marginBottom: 8, "--rng-fill": ((amount - lever.scale.min) / (lever.scale.max - lever.scale.min) * 100) + "%" }}
                />
              )}
            </div>
          );
        })}
        <AddLeverPicker availableLevers={availableLevers} onAdd={addLeverRef} />

        <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--muted)" }}>
          <InfoTip id="plan-baseline" ctx={{ currentCeiling, sandbox }}>baseline</InfoTip> <InlineTapNum value={sandbox.baselineOverride} placeholder={`${eur0(currentCeiling)} (live ceiling)`} onCommit={setBaselineOverride} />
          {" · "}<InfoTip id="plan-income-lever" ctx={{ plan, sandbox }}>income</InfoTip> <InlineTapNum value={sandbox.incomeOverride} placeholder={eur0(plan.externalIncome || 0)} onCommit={setIncomeOverride} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="stat-label"><InfoTip id="plan-spend" ctx={{ liveRow }}>Spend</InfoTip></div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{eur0(liveRow.spend)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-label"><InfoTip id="plan-deficit" ctx={{ liveRow }}>Deficit</InfoTip></div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{eur0(liveRow.deficit)}</div>
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div className="stat-label"><InfoTip id="plan-draw" ctx={{ liveRow, plan }}>Draw</InfoTip></div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 29, fontWeight: 700, color: liveRow.band === "d" ? "var(--terra)" : "var(--ink)" }}>
              {liveRow.draw != null ? pct1(liveRow.draw) : "—"}
            </div>
          </div>
        </div>
        <div style={{ background: BAND_WASH[liveRow.band] || "var(--paper-tint)", color: zoneTextColor(liveRow.band), fontFamily: "var(--sans)", fontSize: 12.5, padding: "9px 11px", borderRadius: 8 }}>
          {zoneVerdict(liveRow.band, liveRow)}
        </div>

        {dirty && !pendingTarget && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
            <span>edited</span>
            <button className="linklike" onClick={() => onDirtyAction("save")}>Save</button>
            <button className="linklike" onClick={() => onDirtyAction("saveAsNew")}>Save as new</button>
            <button className="linklike" onClick={() => onDirtyAction("revert")}>Revert</button>
          </div>
        )}
        {pendingTarget && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
            <span>unsaved edits —</span>
            <button className="linklike" onClick={() => onPendingAction("save")}>Save</button>
            <button className="linklike" onClick={() => onPendingAction("saveAsNew")}>Save as new</button>
            <button className="linklike" onClick={() => onPendingAction("revert")}>Revert</button>
            <button className="linklike" onClick={onCancelPending}>Cancel</button>
          </div>
        )}

        <NotesAndLog scenario={scenario} updateScenario={updateScenario} />
      </div>
    );
  }

  function NotesAndLog({ scenario, updateScenario }) {
    const [open, setOpen] = React.useState(false);
    const [notes, setNotes] = React.useState(scenario.notes || "");
    React.useEffect(() => { setNotes(scenario.notes || ""); }, [scenario.id]);
    const commitNotes = () => { if (notes !== (scenario.notes || "")) updateScenario((sc) => ({ ...sc, notes })); };

    return (
      <div style={{ marginTop: 18 }}>
        <button type="button" className="opts-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>Notes & log</span>
          <window.Icon name="chevronDown" size={16} style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease)" }} />
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            <textarea
              className="inp" value={notes} placeholder="Notes…"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
            />
            <DecisionLog scenario={scenario} updateScenario={updateScenario} />
          </div>
        </div>
      </div>
    );
  }

  // ---------- Lever library (collapsed by default; "Levers · N") ----------

  function LeverEditForm({ lever, onSave, onCancel }) {
    const [label, setLabel] = React.useState(lever ? lever.label : "");
    const [amount, setAmount] = React.useState(lever ? String(lever.amount) : "0");
    const [reversibility, setReversibility] = React.useState(lever ? lever.reversibility : "medium");
    const [horizon, setHorizon] = React.useState(lever ? lever.horizon : "");
    const [beneficiary, setBeneficiary] = React.useState(lever ? lever.beneficiary : "");
    const [durability, setDurability] = React.useState(lever ? lever.durability : "medium");
    const [notes, setNotes] = React.useState(lever ? lever.notes : "");
    const [scaleMin, setScaleMin] = React.useState(lever && lever.scale ? String(lever.scale.min) : "");
    const [scaleMax, setScaleMax] = React.useState(lever && lever.scale ? String(lever.scale.max) : "");
    const [scaleStep, setScaleStep] = React.useState(lever && lever.scale ? String(lever.scale.step) : "");
    const valid = label.trim().length > 0;

    const save = () => {
      const n = parseFloat(amount);
      const sMin = parseFloat(scaleMin), sMax = parseFloat(scaleMax), sStep = parseFloat(scaleStep);
      const scale = (Number.isFinite(sMin) && Number.isFinite(sMax) && Number.isFinite(sStep) && sMax > sMin && sStep > 0)
        ? { min: sMin, max: sMax, step: sStep } : undefined;
      onSave({
        label: label.trim(), amount: Number.isFinite(n) ? n : 0,
        reversibility, horizon: horizon.trim(), beneficiary: beneficiary.trim(),
        durability, notes: notes.trim(), scale,
      });
    };

    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}>
        <div className="field">
          <label>Label</label>
          <input className="inp" style={{ height: 36 }} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Amount / yr</label>
            <input className="inp inp-num" style={{ height: 36 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label><InfoTip id="plan-form-reversibility">Reversibility</InfoTip></label>
            <select className="inp" style={{ height: 36 }} value={reversibility} onChange={(e) => setReversibility(e.target.value)}>
              {REVERSIBILITY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label><InfoTip id="plan-form-durability">Durability</InfoTip></label>
            <select className="inp" style={{ height: 36 }} value={durability} onChange={(e) => setDurability(e.target.value)}>
              {DURABILITY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Horizon</label>
            <input className="inp" style={{ height: 36 }} value={horizon} onChange={(e) => setHorizon(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Beneficiary</label>
            <input className="inp" style={{ height: 36 }} value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label><InfoTip id="plan-form-scale">Scale (optional — renders a slider in the builder)</InfoTip></label>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="inp inp-num" style={{ height: 36 }} type="number" placeholder="min" value={scaleMin} onChange={(e) => setScaleMin(e.target.value)} />
            <input className="inp inp-num" style={{ height: 36 }} type="number" placeholder="max" value={scaleMax} onChange={(e) => setScaleMax(e.target.value)} />
            <input className="inp inp-num" style={{ height: 36 }} type="number" placeholder="step" value={scaleStep} onChange={(e) => setScaleStep(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <button className="linklike" disabled={!valid} onClick={save}>Save</button>
          <button className="linklike" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  function LeverRow({ lever, referenced, onSave, onDelete }) {
    const [editing, setEditing] = React.useState(false);
    if (editing) {
      return <LeverEditForm lever={lever} onSave={(fields) => { onSave(fields); setEditing(false); }} onCancel={() => setEditing(false)} />;
    }
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)" }}>{lever.label}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>
            <InfoTip id="plan-lever-amt" ctx={{ lever }}>{eur0(lever.amount)}</InfoTip>
          </span>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
          <InfoTip id="plan-lever-meta" ctx={{ lever }}>
            {lever.reversibility} · {lever.horizon || "—"} · {lever.beneficiary || "—"} · {lever.durability}
          </InfoTip>
        </div>
        {lever.notes && (
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.4 }}>{lever.notes}</div>
        )}
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
          <button className="linklike" onClick={() => setEditing(true)}>Edit</button>
          <ConfirmDelete
            onConfirm={onDelete}
            disabled={referenced > 0}
            blockedReason={`Used by ${referenced} ${referenced === 1 ? "scenario" : "scenarios"} — can't delete`}
          />
        </div>
      </div>
    );
  }

  function LeverLibrary({ plan, setStore }) {
    const [open, setOpen] = React.useState(false);
    const [adding, setAdding] = React.useState(false);
    const levers = plan.levers || [];

    const refCount = (leverId) =>
      (plan.scenarios || []).filter((sc) => (sc.leverRefs || []).some((ref) => ref.leverId === leverId)).length;

    const saveLever = (id, fields) => setStore((s) => ({
      ...s,
      plan: { ...s.plan, levers: s.plan.levers.map((l) => (l.id === id ? { ...l, ...fields, updatedAt: Date.now() } : l)) },
    }));
    const deleteLever = (id) => setStore((s) => ({ ...s, plan: { ...s.plan, levers: s.plan.levers.filter((l) => l.id !== id) } }));
    const addLever = (fields) => {
      setStore((s) => ({ ...s, plan: { ...s.plan, levers: [...(s.plan.levers || []), { id: "lv_" + YData.uid(), ...fields, updatedAt: Date.now() }] } }));
      setAdding(false);
    };

    return (
      <div style={{ marginTop: 22 }}>
        <button type="button" className="opts-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{"Levers · " + levers.length}</span>
          <window.Icon name="chevronDown" size={16} style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease)" }} />
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            {levers.map((lever) => (
              <LeverRow
                key={lever.id}
                lever={lever}
                referenced={refCount(lever.id)}
                onSave={(fields) => saveLever(lever.id, fields)}
                onDelete={() => deleteLever(lever.id)}
              />
            ))}
            {adding ? (
              <LeverEditForm onSave={addLever} onCancel={() => setAdding(false)} />
            ) : (
              <button className="linklike" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
                <window.Icon name="plus" size={13} />Add lever
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Triggers (collapsed by default; "Triggers · N") ----------

  function TriggerEditForm({ trigger, onSave, onCancel }) {
    const [label, setLabel] = React.useState(trigger ? trigger.label : "");
    const [floor, setFloor] = React.useState(trigger ? String(trigger.portfolioFloor) : "0");
    const [action, setAction] = React.useState(trigger ? trigger.action : "");
    const valid = label.trim().length > 0;

    const save = () => {
      const n = parseFloat(floor);
      onSave({ label: label.trim(), portfolioFloor: Number.isFinite(n) ? n : 0, action: action.trim() });
    };

    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}>
        <div className="field">
          <label>Label</label>
          <input className="inp" style={{ height: 36 }} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label><InfoTip id="plan-form-floor">Portfolio floor</InfoTip></label>
          <input className="inp inp-num" style={{ height: 36 }} type="number" value={floor} onChange={(e) => setFloor(e.target.value)} />
        </div>
        <div className="field">
          <label>Action</label>
          <textarea className="inp" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <button className="linklike" disabled={!valid} onClick={save}>Save</button>
          <button className="linklike" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  function TriggerRow({ trow, plan, onSave, onDelete }) {
    const [editing, setEditing] = React.useState(false);
    if (editing) {
      return <TriggerEditForm trigger={trow} onSave={(fields) => { onSave(fields); setEditing(false); }} onCancel={() => setEditing(false)} />;
    }
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)" }}>{trow.label}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>
            <InfoTip id="plan-trigger-floor" ctx={{ trow }}>{eur0(trow.portfolioFloor)}</InfoTip>
          </span>
        </div>
        {trow.action && (
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.4 }}>{trow.action}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <button className="linklike" onClick={() => setEditing(true)}>Edit</button>
            <ConfirmDelete onConfirm={onDelete} />
          </div>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: trow.breached ? "var(--terra)" : "var(--muted)" }}>
            <InfoTip id="plan-trigger-breach" ctx={{ trow, plan }}>{trow.breached ? "breached" : "—"}</InfoTip>
          </span>
        </div>
      </div>
    );
  }

  function TriggersBlock({ plan, setStore }) {
    const [open, setOpen] = React.useState(false);
    const [adding, setAdding] = React.useState(false);
    const trows = YCalc.checkTriggers(plan);

    const saveTrigger = (id, fields) => setStore((s) => ({
      ...s,
      plan: { ...s.plan, triggers: s.plan.triggers.map((t) => (t.id === id ? { ...t, ...fields, updatedAt: Date.now() } : t)) },
    }));
    const deleteTrigger = (id) => setStore((s) => ({ ...s, plan: { ...s.plan, triggers: s.plan.triggers.filter((t) => t.id !== id) } }));
    const addTrigger = (fields) => {
      setStore((s) => ({ ...s, plan: { ...s.plan, triggers: [...(s.plan.triggers || []), { id: "tr_" + YData.uid(), ...fields, updatedAt: Date.now() }] } }));
      setAdding(false);
    };

    return (
      <div style={{ marginTop: 20 }}>
        <button type="button" className="opts-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{"Triggers · " + trows.length}</span>
          <window.Icon name="chevronDown" size={16} style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease)" }} />
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            {trows.map((t) => (
              <TriggerRow key={t.id} trow={t} plan={plan} onSave={(fields) => saveTrigger(t.id, fields)} onDelete={() => deleteTrigger(t.id)} />
            ))}
            {adding ? (
              <TriggerEditForm onSave={addTrigger} onCancel={() => setAdding(false)} />
            ) : (
              <button className="linklike" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
                <window.Icon name="plus" size={13} />Add trigger
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Sandbox shape held for the selected scenario — the builder's local, unsaved edit surface.
  // Never written to the store except via Save/Save as new.
  const makeSandbox = (sc) => ({
    leverRefs: (sc.leverRefs || []).map((ref) => ({ ...ref })),
    baselineOverride: sc.baselineOverride,
    incomeOverride: sc.incomeOverride,
  });
  const sandboxEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function PlanTab({ store, setStore, stats }) {
    const plan = store.plan || { levers: [], scenarios: [], triggers: [] };
    const currentCeiling = (store.years && store.currentYear != null && store.years[store.currentYear] && store.years[store.currentYear].ceiling) || stats.ceiling;
    const rows = YCalc.computeScenarios(plan, currentCeiling);

    const [selectedId, setSelectedId] = React.useState(() => {
      const pinned = rows.find((r) => r.scenario.pinned);
      return pinned ? pinned.scenario.id : (rows[0] ? rows[0].scenario.id : null);
    });
    const [sandbox, setSandbox] = React.useState(() => {
      const sel = (plan.scenarios || []).find((sc) => sc.id === selectedId);
      return sel ? makeSandbox(sel) : null;
    });
    const [pendingTarget, setPendingTarget] = React.useState(null);

    const selectedScenario = (plan.scenarios || []).find((sc) => sc.id === selectedId) || null;

    // Reseed the sandbox whenever the selection actually changes (not on every store update).
    React.useEffect(() => {
      const sel = (plan.scenarios || []).find((sc) => sc.id === selectedId);
      setSandbox(sel ? makeSandbox(sel) : null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    // If the selected scenario vanished (deleted elsewhere), fall back to pinned/first/none.
    React.useEffect(() => {
      if (selectedId && !(plan.scenarios || []).some((sc) => sc.id === selectedId)) {
        const pinned = rows.find((r) => r.scenario.pinned);
        setSelectedId(pinned ? pinned.scenario.id : (rows[0] ? rows[0].scenario.id : null));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan.scenarios]);

    const dirty = !!(selectedScenario && sandbox && !sandboxEqual(sandbox, makeSandbox(selectedScenario)));

    const liveRow = selectedScenario && sandbox
      ? YCalc.computeScenario(plan, { ...selectedScenario, ...sandbox }, currentCeiling)
      : null;

    const updateScenario = (updater) => setStore((s) => ({
      ...s,
      plan: { ...s.plan, scenarios: s.plan.scenarios.map((sc) => (sc.id === selectedScenario.id ? { ...updater(sc), updatedAt: Date.now() } : sc)) },
    }));

    const saveSandbox = () => updateScenario((sc) => ({ ...sc, ...sandbox }));

    const saveAsNew = () => {
      const newId = "sc_" + YData.uid();
      const copy = {
        ...selectedScenario, ...sandbox, id: newId, name: selectedScenario.name + " (copy)",
        log: [{ id: YData.uid(), date: localISO(new Date()), text: "Saved from builder" }],
        pinned: false, updatedAt: Date.now(),
      };
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: [...s.plan.scenarios, copy] } }));
      return newId;
    };

    const requestSwitch = (targetId) => {
      if (!targetId || targetId === selectedId) return;
      if (dirty) setPendingTarget(targetId);
      else setSelectedId(targetId);
    };

    const handleDirtyAction = (action) => {
      if (action === "save") saveSandbox();
      else if (action === "saveAsNew") setSelectedId(saveAsNew());
      else if (action === "revert") setSandbox(makeSandbox(selectedScenario));
    };

    const handlePendingAction = (action) => {
      if (action === "save") saveSandbox();
      else if (action === "saveAsNew") saveAsNew();
      const target = pendingTarget;
      setPendingTarget(null);
      setSelectedId(target);
    };

    const duplicateScenario = () => {
      const newId = "sc_" + YData.uid();
      const copy = {
        ...selectedScenario, id: newId, name: selectedScenario.name + " (copy)",
        leverRefs: selectedScenario.leverRefs.map((ref) => ({ ...ref })),
        log: [{ id: YData.uid(), date: localISO(new Date()), text: `Duplicated from "${selectedScenario.name}".` }],
        pinned: false, updatedAt: Date.now(),
      };
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: [...s.plan.scenarios, copy] } }));
      requestSwitch(newId);
    };

    const deleteScenario = () => {
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: s.plan.scenarios.filter((sc) => sc.id !== selectedScenario.id) } }));
      setPendingTarget(null);
    };

    const addScenario = () => {
      const newId = "sc_" + YData.uid();
      const scenario = {
        id: newId, name: "New scenario", leverRefs: [],
        baselineOverride: null, incomeOverride: null, notes: "",
        log: [], pinned: false, updatedAt: Date.now(),
      };
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: [...(s.plan.scenarios || []), scenario] } }));
      requestSwitch(newId);
    };

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <HeaderStrip plan={plan} stats={stats} setStore={setStore} />

        {rows.length === 0 ? (
          <div className="empty" style={{ marginTop: 8 }}>No scenarios yet.</div>
        ) : (
          <ComparisonStrip rows={rows} selectedId={selectedId} liveRow={liveRow} dirty={dirty} onSelect={requestSwitch} />
        )}

        {selectedScenario && sandbox && (
          <ScenarioBuilder
            plan={plan}
            rows={rows}
            scenario={selectedScenario}
            sandbox={sandbox}
            setSandbox={setSandbox}
            dirty={dirty}
            pendingTarget={pendingTarget}
            liveRow={liveRow}
            currentCeiling={currentCeiling}
            requestSwitch={requestSwitch}
            updateScenario={updateScenario}
            duplicateScenario={duplicateScenario}
            deleteScenario={deleteScenario}
            onDirtyAction={handleDirtyAction}
            onPendingAction={handlePendingAction}
            onCancelPending={() => setPendingTarget(null)}
          />
        )}

        <button className="linklike" style={{ marginTop: 12, marginBottom: 4 }} onClick={addScenario}>
          <window.Icon name="plus" size={13} />Add scenario
        </button>

        <LeverLibrary plan={plan} setStore={setStore} />
        <TriggersBlock plan={plan} setStore={setStore} />
      </div>
    );
  }

  window.YPlan = { PlanTab };
})();
