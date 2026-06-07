// addflow.jsx — frictionless logging (Quick templates + Manual) and edit/delete.
(function () {
  const { YData, YCalc, YUI } = window;
  const { Sheet } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button, SegmentedControl = DS.SegmentedControl, Chip = DS.Chip;

  function NumPad({ value, onChange }) {
    const press = (k) => {
      if (k === "del") return onChange(value.slice(0, -1));
      if (k === ".") { if (value.includes(".")) return; return onChange((value || "0") + "."); }
      if (value.includes(".") && value.split(".")[1].length >= 2) return;
      if (value === "0") return onChange(k);
      onChange(value + k);
    };
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 6 }}>
        {keys.map((k) => (
          <button key={k} onClick={() => press(k)} style={{
            height: 56, borderRadius: 14, border: "1px solid var(--hair)",
            background: "var(--paper)", color: "var(--ink)",
            font: "500 24px var(--mono)", cursor: "pointer",
          }}>
            {k === "del" ? <window.Icon name="chevronLeft" size={20} /> : k}
          </button>
        ))}
      </div>
    );
  }

  function DateField({ value, onChange }) {
    return (
      <input className="inp" type="date" value={value} max={YData.todayISO()}
        onChange={(e) => onChange(e.target.value)} style={{ colorScheme: "light" }} />
    );
  }

  function CategoryPicker({ value, onChange }) {
    return (
      <div className="catpick">
        {YData.CATEGORIES.map((c) => (
          <button key={c.id} className={"catpick-item" + (value === c.id ? " sel" : "")} onClick={() => onChange(c.id)}>
            <span className="cat-dot" style={{ background: c.color }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
          </button>
        ))}
      </div>
    );
  }

  // Fun budget toggle + owner picker, used in both AddSheet and EditSheet.
  function FunFields({ funOn, setFunOn, funPerson, setFunPerson, store }) {
    const people = (store && store.people) || [];
    return (
      <div className="field">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: funOn ? 8 : 0 }}>
          <label style={{ margin: 0 }}>Fun budget</label>
          <button
            onClick={() => setFunOn((v) => !v)}
            style={{
              width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
              background: funOn ? "var(--terra)" : "var(--hair)",
              position: "relative", flexShrink: 0, transition: "background 0.15s",
            }}
            aria-checked={funOn} role="switch">
            <span style={{
              position: "absolute", top: 2, left: funOn ? 20 : 2,
              width: 18, height: 18, borderRadius: "50%",
              background: "var(--paper)", transition: "left 0.15s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            }} />
          </button>
        </div>
        {funOn && people.length > 0 && (
          <div style={{ display: "flex", gap: 7, marginTop: 0 }}>
            {people.map((p) => (
              <Chip key={p.id} pressed={funPerson === p.id} onClick={() => setFunPerson(p.id)}>{p.name}</Chip>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Manual / edit form
  function TxForm({ draft, set, showDescription = true }) {
    return (
      <div>
        {showDescription && (
          <div className="field">
            <label>Description</label>
            <input className="inp" value={draft.description} placeholder="e.g. Billa groceries"
              onChange={(e) => set({ description: e.target.value })} />
          </div>
        )}
        <div className="field">
          <label>Amount (EUR)</label>
          <input className="inp inp-num" inputMode="decimal" value={draft.amount} placeholder="0.00"
            onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, "") })} />
        </div>
        <div className="field">
          <label>Category</label>
          <CategoryPicker value={draft.category} onChange={(category) => set({ category })} />
        </div>
        <div className="field">
          <label>Date</label>
          <DateField value={draft.date} onChange={(date) => set({ date })} />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <textarea className="inp" value={draft.note || ""} placeholder="Anything worth remembering"
            onChange={(e) => set({ note: e.target.value })} />
        </div>
      </div>
    );
  }

  function AddSheet({ open, onClose, store, onSave }) {
    const [mode, setMode] = React.useState("Quick");
    const [step, setStep] = React.useState("grid"); // grid | entry (quick)
    const [tpl, setTpl] = React.useState(null);
    const [amount, setAmount] = React.useState("");
    const blank = () => ({ description: "", amount: "", category: "general", date: YData.todayISO(), note: "" });
    const [draft, setDraft] = React.useState(blank());
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const defaultPerson = () => (store.people && store.people[0] && store.people[0].id) || "marti";
    const [funOn, setFunOn] = React.useState(false);
    const [funPerson, setFunPerson] = React.useState(defaultPerson());

    React.useEffect(() => {
      if (open) { setMode("Quick"); setStep("grid"); setTpl(null); setAmount(""); setDraft(blank()); setFunOn(false); setFunPerson(defaultPerson()); }
    }, [open]);

    const commit = (t) => {
      const tx = {
        id: YData.uid(), date: t.date, description: t.description || YData.cat(t.category).label,
        amount_eur: Math.round(parseFloat(t.amount) * 100) / 100, category: t.category,
        note: t.note || undefined, source: "manual",
      };
      if (funOn) { tx.fun = true; tx.person = funPerson; }
      onSave(tx);
      onClose();
    };

    const pickTemplate = (t) => {
      setTpl(t); setAmount(t.defaultAmount ? String(t.defaultAmount) : ""); setStep("entry");
    };

    let body;
    if (mode === "Quick" && step === "grid") {
      body = (
        <div>
          <div className="tilegrid">
            {store.templates.map((t) => {
              const c = YData.cat(t.category);
              return (
                <button key={t.id} className="tpl" onClick={() => pickTemplate(t)}>
                  <span className="tpl-dot" style={{ background: c.color }} />
                  <span className="tpl-name">{t.name}</span>
                </button>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 12.5, textAlign: "center", marginTop: 16, marginBottom: 0 }}>
            Manage templates in Settings · or switch to Manual for one-offs.
          </p>
        </div>
      );
    } else if (mode === "Quick" && step === "entry") {
      const c = YData.cat(tpl.category);
      const valid = parseFloat(amount) > 0;
      body = (
        <div>
          <button className="linklike" onClick={() => setStep("grid")} style={{ paddingLeft: 0, marginBottom: 4 }}>
            <window.Icon name="chevronLeft" size={15} />Templates
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 11, justifyContent: "center", marginTop: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flex: "0 0 auto" }} />
            <div style={{ fontSize: 17, fontWeight: 600 }}>{tpl.name}</div>
          </div>
          <div className="amount-display">
            <span className="cur">€</span><span className="num">{amount || "0"}</span>
          </div>
          <NumPad value={amount} onChange={setAmount} />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1 }}><DateField value={draft.date} onChange={(date) => set({ date })} /></div>
          </div>
          <input className="inp" style={{ marginTop: 10 }} value={draft.note || ""} placeholder="Note (optional)"
            onChange={(e) => set({ note: e.target.value })} />
          <FunFields funOn={funOn} setFunOn={setFunOn} funPerson={funPerson} setFunPerson={setFunPerson} store={store} />
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" block disabled={!valid}
              onClick={() => commit({ ...draft, amount, description: tpl.name, category: tpl.category })}>
              Add {valid ? "€" + amount : "expense"}
            </Button>
          </div>
        </div>
      );
    } else {
      // manual
      const valid = parseFloat(draft.amount) > 0;
      body = (
        <div>
          <TxForm draft={draft} set={set} />
          <FunFields funOn={funOn} setFunOn={setFunOn} funPerson={funPerson} setFunPerson={setFunPerson} store={store} />
          <Button variant="primary" block disabled={!valid} onClick={() => commit(draft)}>
            Add expense
          </Button>
        </div>
      );
    }

    return (
      <Sheet open={open} onClose={onClose} title="Log an expense"
        headRight={<div style={{ width: 150 }}><SegmentedControl options={["Quick", "Manual"]} value={mode} fill
          onChange={(v) => { setMode(v); setStep("grid"); }} /></div>}>
        {body}
      </Sheet>
    );
  }

  function EditSheet({ open, txn, onClose, onSave, onDelete, store }) {
    const [draft, setDraft] = React.useState(null);
    const defaultPerson = () => (store && store.people && store.people[0] && store.people[0].id) || "marti";
    const [funOn, setFunOn] = React.useState(false);
    const [funPerson, setFunPerson] = React.useState(defaultPerson());
    React.useEffect(() => {
      if (txn) {
        setDraft({ description: txn.description, amount: String(txn.amount_eur), category: txn.category, date: txn.date, note: txn.note || "" });
        setFunOn(!!txn.fun);
        setFunPerson(txn.person || defaultPerson());
      }
    }, [txn]);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    if (!draft) return <Sheet open={open} onClose={onClose} title="Edit" />;
    const valid = parseFloat(draft.amount) > 0;
    return (
      <Sheet open={open} onClose={onClose} title="Edit expense">
        <TxForm draft={draft} set={set} />
        <FunFields funOn={funOn} setFunOn={setFunOn} funPerson={funPerson} setFunPerson={setFunPerson} store={store || {}} />
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={() => { onDelete(txn.id); onClose(); }} icon={<window.Icon name="trash" size={16} />}>Delete</Button>
          <div style={{ flex: 1 }}>
            <Button variant="primary" block disabled={!valid}
              onClick={() => {
                const updated = { ...txn, description: draft.description, amount_eur: Math.round(parseFloat(draft.amount) * 100) / 100, category: draft.category, date: draft.date, note: draft.note || undefined };
                if (funOn) { updated.fun = true; updated.person = funPerson; } else { delete updated.fun; delete updated.person; }
                onSave(updated); onClose();
              }}>
              Save changes
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  window.YAdd = { AddSheet, EditSheet, TxForm, CategoryPicker };
})();
