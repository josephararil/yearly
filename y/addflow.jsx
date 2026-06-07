// addflow.jsx — frictionless logging (Quick templates + Manual) and edit/delete.
(function () {
  const { YData, YCalc, YUI } = window;
  const { Sheet, CatIcon } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button, SegmentedControl = DS.SegmentedControl;

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
            height: 56, borderRadius: 14, border: "1px solid var(--hairline)",
            background: k === "del" ? "transparent" : "var(--surface)", color: "var(--text)",
            font: "500 24px var(--font-mono)", cursor: "pointer",
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
        onChange={(e) => onChange(e.target.value)} style={{ colorScheme: "dark" }} />
    );
  }

  function CategoryPicker({ value, onChange }) {
    return (
      <div className="catpick">
        {YData.CATEGORIES.map((c) => (
          <button key={c.id} className={"catpick-item" + (value === c.id ? " sel" : "")} onClick={() => onChange(c.id)}>
            <CatIcon catId={c.id} size={26} radius={8} iconSize={15} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
          </button>
        ))}
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

    React.useEffect(() => {
      if (open) { setMode("Quick"); setStep("grid"); setTpl(null); setAmount(""); setDraft(blank()); }
    }, [open]);

    const commit = (t) => {
      onSave({
        id: YData.uid(), date: t.date, description: t.description || YData.cat(t.category).label,
        amount_eur: Math.round(parseFloat(t.amount) * 100) / 100, category: t.category,
        note: t.note || undefined, source: "manual",
      });
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
                  <span className="tpl-ic" style={{ background: YUI.tint(c.color, "22"), color: c.color }}>
                    <window.Icon name={t.icon || c.icon} size={22} />
                  </span>
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
            <span className="tpl-ic" style={{ width: 34, height: 34, borderRadius: 10, background: YUI.tint(c.color, "22"), color: c.color }}>
              <window.Icon name={tpl.icon || c.icon} size={18} />
            </span>
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

  function EditSheet({ open, txn, onClose, onSave, onDelete }) {
    const [draft, setDraft] = React.useState(null);
    React.useEffect(() => {
      if (txn) setDraft({ description: txn.description, amount: String(txn.amount_eur), category: txn.category, date: txn.date, note: txn.note || "" });
    }, [txn]);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    if (!draft) return <Sheet open={open} onClose={onClose} title="Edit" />;
    const valid = parseFloat(draft.amount) > 0;
    return (
      <Sheet open={open} onClose={onClose} title="Edit expense">
        <TxForm draft={draft} set={set} />
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={() => { onDelete(txn.id); onClose(); }} icon={<window.Icon name="trash" size={16} />}>Delete</Button>
          <div style={{ flex: 1 }}>
            <Button variant="primary" block disabled={!valid}
              onClick={() => { onSave({ ...txn, description: draft.description, amount_eur: Math.round(parseFloat(draft.amount) * 100) / 100, category: draft.category, date: draft.date, note: draft.note || undefined }); onClose(); }}>
              Save changes
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  window.YAdd = { AddSheet, EditSheet, TxForm, CategoryPicker };
})();
