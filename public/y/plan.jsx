// plan.jsx — the Plan tab: scenario & decision-record view. Exposed on window.YPlan.
// A contained decision notebook: named lifestyle scenarios (packages of annual-cost "levers")
// resolving to a deficit and an implied portfolio draw rate, plus the recorded reasoning behind
// them. Informs the ceiling decision; never participates in ceiling math — store.plan is settings-
// blob synced (like trips/travel) and none of computeStats/buildCallouts/fun/travel ever read it.
// Phase 2: header strip (portfolio/income tap-to-edit + live "this year implies"), the draw ladder,
// and the expanded scenario (read + lever toggle/override + baseline/income override).
// Phase 3: decision log, pin/duplicate/delete, the lever library (add/edit/delete-blocked-while-
// referenced) and the triggers block (add/edit/delete) — the full editing surface.
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, localISO } = YCalc;
  const { TxTag } = YUI;

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

  // Expanded scenario — lever checklist (toggle enabled + amountOverride, live recompute),
  // baseline/income override fields, the sensitivity line, notes, the decision log, and the
  // pin/duplicate/delete controls.
  function ExpandedScenario({ row, plan, setStore, onDuplicated, onDeleted }) {
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
    const togglePinned = () => updateScenario((sc) => ({ ...sc, pinned: !sc.pinned }));

    const addLeverRef = (leverId) => updateScenario((sc) => ({
      ...sc,
      leverRefs: [...sc.leverRefs, { leverId, enabled: true, amountOverride: null }],
    }));

    const availableLevers = (plan.levers || []).filter(
      (l) => !scenario.leverRefs.some((ref) => ref.leverId === l.id)
    );

    const duplicateScenario = () => {
      const newId = "sc_" + YData.uid();
      const copy = {
        ...scenario,
        id: newId,
        name: scenario.name + " (copy)",
        leverRefs: scenario.leverRefs.map((ref) => ({ ...ref })),
        log: [{ id: YData.uid(), date: localISO(new Date()), text: `Duplicated from "${scenario.name}".` }],
        pinned: false,
        updatedAt: Date.now(),
      };
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: [...s.plan.scenarios, copy] } }));
      onDuplicated(newId);
    };

    const deleteScenario = () => {
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: s.plan.scenarios.filter((sc) => sc.id !== scenario.id) } }));
      onDeleted();
    };

    return (
      <div style={{ padding: "2px 2px 14px" }}>
        <div style={{ marginBottom: 14 }}>
          {scenario.leverRefs.length > 0 && <div className="stat-label" style={{ marginBottom: 4 }}>Levers</div>}
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
          <AddLeverPicker availableLevers={availableLevers} onAdd={addLeverRef} />
        </div>

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

        <DecisionLog scenario={scenario} updateScenario={updateScenario} />

        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hair)" }}>
          <button className="linklike" onClick={togglePinned}>{scenario.pinned ? "Unpin" : "Pin"}</button>
          <button className="linklike" onClick={duplicateScenario}>Duplicate</button>
          <span style={{ flex: 1 }} />
          <ConfirmDelete onConfirm={deleteScenario} />
        </div>
      </div>
    );
  }

  function ScenarioRow({ row, open, onToggle, plan, setStore, onDuplicated, onDeleted }) {
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
            <ExpandedScenario row={row} plan={plan} setStore={setStore} onDuplicated={onDuplicated} onDeleted={onDeleted} />
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
    const valid = label.trim().length > 0;

    const save = () => {
      const n = parseFloat(amount);
      onSave({
        label: label.trim(), amount: Number.isFinite(n) ? n : 0,
        reversibility, horizon: horizon.trim(), beneficiary: beneficiary.trim(),
        durability, notes: notes.trim(),
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
            <label>Reversibility</label>
            <select className="inp" style={{ height: 36 }} value={reversibility} onChange={(e) => setReversibility(e.target.value)}>
              {REVERSIBILITY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Durability</label>
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
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>{eur0(lever.amount)}</span>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
          {lever.reversibility} · {lever.horizon || "—"} · {lever.beneficiary || "—"} · {lever.durability}
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
          <label>Portfolio floor</label>
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

  function TriggerRow({ trow, onSave, onDelete }) {
    const [editing, setEditing] = React.useState(false);
    if (editing) {
      return <TriggerEditForm trigger={trow} onSave={(fields) => { onSave(fields); setEditing(false); }} onCancel={() => setEditing(false)} />;
    }
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)" }}>{trow.label}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>{eur0(trow.portfolioFloor)}</span>
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
            {trow.breached ? "breached" : "—"}
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
              <TriggerRow key={t.id} trow={t} onSave={(fields) => saveTrigger(t.id, fields)} onDelete={() => deleteTrigger(t.id)} />
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

  function PlanTab({ store, setStore, stats }) {
    const plan = store.plan || { levers: [], scenarios: [], triggers: [] };
    const [openId, setOpenId] = React.useState(null);
    const [addingScenario, setAddingScenario] = React.useState(false);
    const [newName, setNewName] = React.useState("");

    const currentCeiling = (store.years && store.currentYear != null && store.years[store.currentYear] && store.years[store.currentYear].ceiling) || stats.ceiling;
    const rows = YCalc.computeScenarios(plan, currentCeiling);

    const addScenario = () => {
      const name = newName.trim();
      if (!name) return;
      const newId = "sc_" + YData.uid();
      const scenario = {
        id: newId, name, leverRefs: [],
        baselineOverride: null, incomeOverride: null, notes: "",
        log: [], pinned: false, updatedAt: Date.now(),
      };
      setStore((s) => ({ ...s, plan: { ...s.plan, scenarios: [...(s.plan.scenarios || []), scenario] } }));
      setNewName("");
      setAddingScenario(false);
      setOpenId(newId);
    };

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <HeaderStrip plan={plan} stats={stats} setStore={setStore} />
        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 4 }}>
            <h2>Draw ladder</h2>
            <span className="spacer" />
            <span className="sec-meta">{rows.length} {rows.length === 1 ? "SCENARIO" : "SCENARIOS"}</span>
          </div>
          {addingScenario ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 0" }}>
              <input
                className="inp"
                style={{ height: 34, padding: "0 10px", fontSize: 12.5 }}
                placeholder="Scenario name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addScenario(); if (e.key === "Escape") setAddingScenario(false); }}
              />
              <button className="linklike" onClick={addScenario}>Add</button>
              <button className="linklike" onClick={() => { setAddingScenario(false); setNewName(""); }}>Cancel</button>
            </div>
          ) : (
            <button className="linklike" style={{ marginTop: 4, marginBottom: 4 }} onClick={() => setAddingScenario(true)}>
              <window.Icon name="plus" size={13} />Add scenario
            </button>
          )}
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
                onDuplicated={(newId) => setOpenId(newId)}
                onDeleted={() => setOpenId((cur) => (cur === row.scenario.id ? null : cur))}
              />
            ))
          )}
        </div>

        <LeverLibrary plan={plan} setStore={setStore} />
        <TriggersBlock plan={plan} setStore={setStore} />
      </div>
    );
  }

  window.YPlan = { PlanTab };
})();
