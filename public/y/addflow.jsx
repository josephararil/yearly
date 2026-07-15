// addflow.jsx — frictionless logging (Quick templates + Manual) and edit/delete.
(function () {
  const { YData, YCalc, YUI } = window;
  const { localISO } = YCalc;
  const { Sheet } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button, Chip = DS.Chip;

  const DEL_HOLD_MS = 500;

  function NumPad({ value, onChange }) {
    const holdTimer = React.useRef(null);
    const heldClear = React.useRef(false);

    const digit = (k) => {
      if (!value || value === "0") { onChange(k === "00" ? "0" : k); return; }
      if (value.includes(".")) {
        const room = 2 - value.split(".")[1].length;
        if (room <= 0) return;
        onChange(value + k.slice(0, room));
        return;
      }
      onChange(value + k);
    };
    const press = (k) => {
      if (k === "del") return onChange(value.slice(0, -1));
      if (k === ".") { if (value.includes(".")) return; return onChange((value || "0") + "."); }
      digit(k);
    };

    const delDown = () => {
      heldClear.current = false;
      holdTimer.current = setTimeout(() => { heldClear.current = true; onChange("0"); }, DEL_HOLD_MS);
    };
    const delUp = () => {
      clearTimeout(holdTimer.current);
      if (!heldClear.current) press("del");
    };

    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "00"];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginTop: 4 }}>
        {keys.map((k) => (
          <button key={k} className="numpad-key" disabled={k === "." && value.includes(".")}
            onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button className="numpad-key numpad-key-wide"
          onMouseDown={delDown} onMouseUp={delUp} onMouseLeave={() => clearTimeout(holdTimer.current)}
          onTouchStart={(e) => { e.preventDefault(); delDown(); }} onTouchEnd={(e) => { e.preventDefault(); delUp(); }}>
          <window.Icon name="chevronLeft" size={20} />
        </button>
      </div>
    );
  }

  function formatAmountDisplay(amount) {
    if (!amount) return "0.00";
    const [intPart, decPart] = amount.split(".");
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decPart !== undefined ? grouped + "." + decPart : grouped;
  }

  // Shared amount hero — used by both Quick and Manual. The NumPad below drives the value.
  function AmountHero({ amount, onChange }) {
    const empty = !amount || parseFloat(amount) === 0;
    return (
      <div>
        <div className="amount-display">
          <span className="cur">€</span>
          <span className={"num" + (empty ? " dim" : "")}>{empty ? "0.00" : formatAmountDisplay(amount)}</span>
        </div>
        <NumPad value={amount} onChange={onChange} />
      </div>
    );
  }

  // Collapsed "Tags & options" disclosure — Fun/Travel/One-off/Save-as-template are presented as a
  // row of icon tiles rather than four identical-looking switches. Tapping a tile toggles it; each
  // active tile's caption (and the fun-budget owner picker) appears stacked below the row.
  function OptionsDisclosure({
    open, setOpen, funOn, setFunOn, funPerson, setFunPerson, travelOn, setTravelOn,
    oneOff, setOneOff, saveAsTemplate, setSaveAsTemplate, store, showOneOff, showSaveAsTemplate,
    tripId, setTripId, trips, onCreateTrip,
  }) {
    const people = (store && store.people) || [];
    const tiles = [
      {
        key: "fun", icon: "entertainment", label: "Fun budget", chip: "FUN", on: funOn, toggle: () => setFunOn(!funOn),
        caption: "Counts against this month's fun money.",
      },
      {
        key: "travel", icon: "travel", label: "Travel budget", chip: "TRAVEL", on: travelOn, toggle: () => setTravelOn(!travelOn),
        caption: "Tagged to the travel envelope, not monthly spend.",
      },
      showOneOff && {
        key: "oneOff", icon: "calendar", label: "One-off", chip: "ONE-OFF", on: oneOff, toggle: () => setOneOff(!oneOff),
        caption: "Excluded from the spending-trend forecast — still counts in totals. Large amounts are excluded automatically.",
      },
      showSaveAsTemplate && {
        key: "template", icon: "layers", label: "Save as template", chip: "TEMPLATE", on: saveAsTemplate, toggle: () => setSaveAsTemplate(!saveAsTemplate),
        caption: "Adds this to your Quick templates for one-tap logging.",
      },
    ].filter(Boolean);
    const activeTiles = tiles.filter((t) => t.on);

    return (
      <div className="field">
        <button type="button" className="opts-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>Tags & options</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {activeTiles.length > 0 && <span className="opts-chips">{activeTiles.map((t) => t.chip).join(" · ")}</span>}
            <window.Icon name="chevronDown" size={16} style={{
              color: "var(--muted)", transform: open ? "rotate(180deg)" : "none",
              transition: "transform var(--dur-fast) var(--ease)",
            }} />
          </span>
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            <div className="opt-tiles" style={{ gridTemplateColumns: "repeat(" + tiles.length + ", 1fr)" }}>
              {tiles.map((t) => (
                <button key={t.key} type="button" className={"opt-tile" + (t.on ? " on" : "")}
                  onClick={t.toggle} aria-pressed={t.on}>
                  {t.on && <span className="opt-tile-check"><window.Icon name="check" size={9} /></span>}
                  <window.Icon name={t.icon} size={20} />
                  <span className="opt-tile-label">{t.label}</span>
                </button>
              ))}
            </div>
            {activeTiles.length > 0 && (
              <div className="opt-details">
                {activeTiles.map((t) => <p key={t.key} className="toggle-caption">{t.caption}</p>)}
                {funOn && people.length > 0 && (
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {people.map((p) => (
                      <Chip key={p.id} pressed={funPerson === p.id} onClick={() => setFunPerson(p.id)}>{p.name}</Chip>
                    ))}
                  </div>
                )}
                {travelOn && (
                  <TripField tripId={tripId} onChange={setTripId} trips={trips} onCreateTrip={onCreateTrip} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // "Today" / "Yesterday" label alongside the date value, when the picked date matches.
  function relativeDateLabel(iso) {
    const today = YData.todayISO();
    if (iso === today) return "Today";
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return iso === localISO(d) ? "Yesterday" : null;
  }

  function DateField({ value, onChange }) {
    const rel = relativeDateLabel(value);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input className="inp" type="date" value={value} max={YData.todayISO()}
          onChange={(e) => onChange(e.target.value)} style={{ colorScheme: "light" }} />
        {rel && <span className="date-rel">{rel}</span>}
      </div>
    );
  }

  // Categories ordered frequent-first (all-time usage count), ties broken by canonical order — a
  // stable, predictable grid. Each tile is a thin line icon tinted its category color; tap to select.
  function CategoryPicker({ value, onChange, store }) {
    const ordered = React.useMemo(() => {
      const counts = {};
      if (store && Array.isArray(store.transactions)) {
        for (const t of store.transactions) {
          const id = YData.normalizeCategory(t.category);
          counts[id] = (counts[id] || 0) + 1;
        }
      }
      const rank = new Map(YData.CATEGORIES.map((c, i) => [c.id, i]));
      return [...YData.CATEGORIES].sort((a, b) => {
        const byUse = (counts[b.id] || 0) - (counts[a.id] || 0);
        return byUse !== 0 ? byUse : rank.get(a.id) - rank.get(b.id);
      });
    }, [store]);
    return (
      <div className="catgrid">
        {ordered.map((c) => (
          <button key={c.id} type="button" className={"catgrid-item" + (value === c.id ? " sel" : "")} onClick={() => onChange(c.id)}>
            <span className="catgrid-icon" style={{ color: c.color }}><window.Icon name={c.icon} size={22} /></span>
            <span className="catgrid-label">{c.label}</span>
          </button>
        ))}
      </div>
    );
  }

  // Compact "Category   ⟨icon⟩ General ⌄" row — the value reads as a tappable link; tapping expands
  // the picker grid inline (no modal).
  function CategoryField({ value, onChange, store }) {
    const [open, setOpen] = React.useState(false);
    const c = YData.cat(value);
    return (
      <div className="field catsel-field">
        <button type="button" className="catsel-row" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="field-label">Category</span>
          <span className="catsel-value">
            <span className="catsel-icon" style={{ color: c.color }}><window.Icon name={c.icon} size={16} /></span>
            <span className="catsel-name">{c.label}</span>
            <window.Icon name="chevronDown" size={15} className="catsel-chev"
              style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </span>
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            <CategoryPicker value={value} onChange={(id) => { onChange(id); setOpen(false); }} store={store} />
          </div>
        </div>
      </div>
    );
  }

  function tripSortKey(t) {
    return t.startDate || localISO(new Date(t.createdAt || 0));
  }

  // Collapsed "TRIP — <name>" summary row; expands to the 3 most-recent trips + "More…" + inline create.
  function TripField({ tripId, onChange, trips, onCreateTrip }) {
    const [open, setOpen] = React.useState(false);
    const [showMore, setShowMore] = React.useState(false);
    const [newName, setNewName] = React.useState("");

    const sorted = React.useMemo(() => (
      [...(trips || [])].sort((a, b) => tripSortKey(b).localeCompare(tripSortKey(a)))
    ), [trips]);
    const recent = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const selected = (trips || []).find((t) => t.id === tripId);

    const pick = (id) => { onChange(id); setOpen(false); setShowMore(false); };
    const addNewTrip = () => {
      const name = newName.trim();
      if (!name || !onCreateTrip) return;
      const id = onCreateTrip(name);
      setNewName("");
      if (id) pick(id);
    };

    return (
      <div className="field">
        <button type="button" className="opts-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="field-label">Trip</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: selected ? "var(--ink)" : "var(--muted)" }}>{selected ? selected.name : "Select a trip"}</span>
            <window.Icon name="chevronDown" size={16} style={{
              color: "var(--muted)", transform: open ? "rotate(180deg)" : "none",
              transition: "transform var(--dur-fast) var(--ease)",
            }} />
          </span>
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            <div className="catpick">
              {(showMore ? sorted : recent).map((t) => (
                <button key={t.id} className={"catpick-item" + (tripId === t.id ? " sel" : "")} onClick={() => pick(t.id)}>
                  <span>{t.name}</span>
                </button>
              ))}
              {!showMore && rest.length > 0 && (
                <button type="button" className="catpick-item" onClick={() => setShowMore(true)}>More…</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="inp" style={{ flex: 1, height: 40 }} value={newName} placeholder="+ New trip name"
                onChange={(e) => setNewName(e.target.value)} />
              <Button variant="secondary" disabled={!newName.trim()} onClick={addNewTrip}>Add</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Horizontal-scroll strip of template tiles at the top of the sheet — Quick is an accelerator on the
  // one unified form, not a separate mode. "See all" expands the full grid inline.
  function TemplateStrip({ templates, selectedId, onPick, allOpen, setAllOpen }) {
    if (templates.length === 0) {
      return (
        <div className="field">
          <p className="tplstrip-empty">
            No templates yet. Turn any expense into a template with "Save as template".
          </p>
        </div>
      );
    }
    return (
      <div className="field">
        <div className="tplstrip">
          {templates.map((t) => {
            const c = YData.cat(t.category);
            return (
              <button key={t.id} className={"tpl-sm" + (selectedId === t.id ? " sel" : "")} onClick={() => onPick(t)}>
                <span className="tpl-dot" style={{ background: c.color }} />
                <span className="tpl-name">{t.name}</span>
              </button>
            );
          })}
          <button className="tpl-seeall" onClick={() => setAllOpen((o) => !o)} aria-expanded={allOpen}>
            <window.Icon name="chevronDown" size={14} style={{
              transform: allOpen ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease)",
            }} />
            See all
          </button>
        </div>
        <div className={"opts-body" + (allOpen ? " open" : "")}>
          <div className="opts-body-inner">
            <div className="tilegrid">
              {templates.map((t) => {
                const c = YData.cat(t.category);
                return (
                  <button key={t.id} className={"tpl" + (selectedId === t.id ? " sel" : "")} onClick={() => onPick(t)}>
                    <span className="tpl-dot" style={{ background: c.color }} />
                    <span className="tpl-name">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function AddSheet({ open, onClose, store, onSave, onSaveTemplate, onCreateTrip }) {
    const [tpl, setTpl] = React.useState(null); // last-tapped template, for strip/grid highlight
    const [allTplOpen, setAllTplOpen] = React.useState(false);
    const [amount, setAmount] = React.useState("");
    const blank = () => ({ description: "", category: "general", date: YData.todayISO(), note: "" });
    const [draft, setDraft] = React.useState(blank());
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const defaultPerson = () => (store.people && store.people[0] && store.people[0].id) || "marti";
    const [funOn, setFunOn] = React.useState(false);
    const [funPerson, setFunPerson] = React.useState(defaultPerson());
    const [travelOn, setTravelOn] = React.useState(false);
    const [tripId, setTripId] = React.useState(null);
    const [oneOff, setOneOff] = React.useState(false);
    const [saveAsTemplate, setSaveAsTemplate] = React.useState(false);
    const [optsOpen, setOptsOpen] = React.useState(false);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
      if (open) {
        setTpl(null); setAllTplOpen(false); setAmount(""); setDraft(blank());
        setFunOn(false); setFunPerson(defaultPerson()); setTravelOn(false); setTripId(null); setOneOff(false);
        setSaveAsTemplate(false); setOptsOpen(false); setError(null);
      }
    }, [open]);

    const commit = (t) => {
      try {
        const tx = {
          id: YData.uid(), date: t.date, description: t.description || YData.cat(t.category).label,
          amount_eur: Math.round(parseFloat(t.amount) * 100) / 100, category: t.category,
          note: t.note || undefined, source: "manual",
        };
        if (funOn) { tx.fun = true; tx.person = funPerson; }
        if (travelOn) { tx.travel = true; tx.trip_id = tripId; }
        if (oneOff) tx.oneoff = true;
        if (saveAsTemplate && t.description && t.description.trim() && onSaveTemplate) {
          const tplObj = { id: YData.uid(), name: t.description.trim(), category: t.category };
          const amt = parseFloat(t.amount);
          if (amt > 0) tplObj.defaultAmount = Math.round(amt * 100) / 100;
          onSaveTemplate(tplObj);
        }
        onSave(tx);
        onClose();
      } catch (e) {
        setError("Couldn't save this expense. Try again.");
      }
    };

    const applyTemplate = (t) => {
      setTpl(t); setAllTplOpen(false);
      set({ description: t.name, category: t.category });
      setAmount(t.defaultAmount ? String(t.defaultAmount) : "");
    };

    const valid = parseFloat(amount) > 0 && (!travelOn || !!tripId);
    const body = (
      <div>
        <TemplateStrip templates={store.templates} selectedId={tpl && tpl.id} onPick={applyTemplate}
          allOpen={allTplOpen} setAllOpen={setAllTplOpen} />
        <AmountHero amount={amount} onChange={(v) => { setAmount(v); setError(null); }} />
        <CategoryField value={draft.category} onChange={(category) => { setTpl(null); set({ category }); }} store={store} />
        <div className="field">
          <label>Description</label>
          <input className="inp" value={draft.description} placeholder="e.g. Billa groceries"
            onChange={(e) => { setTpl(null); set({ description: e.target.value }); }} />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <textarea className="inp" value={draft.note || ""} placeholder="Anything worth remembering"
            onChange={(e) => set({ note: e.target.value })} />
        </div>
        <div className="field">
          <label>Date</label>
          <DateField value={draft.date} onChange={(date) => set({ date })} />
        </div>
        <OptionsDisclosure
          open={optsOpen} setOpen={setOptsOpen}
          funOn={funOn} setFunOn={setFunOn} funPerson={funPerson} setFunPerson={setFunPerson}
          travelOn={travelOn} setTravelOn={setTravelOn}
          oneOff={oneOff} setOneOff={setOneOff} saveAsTemplate={saveAsTemplate} setSaveAsTemplate={setSaveAsTemplate}
          store={store} showOneOff={true} showSaveAsTemplate={true}
          tripId={tripId} setTripId={setTripId} trips={store.trips} onCreateTrip={onCreateTrip} />
      </div>
    );
    const footer = (
      <div>
        {error && <p className="add-error">{error}</p>}
        <Button variant="primary" block disabled={!valid} onClick={() => commit({ ...draft, amount })}>
          {valid ? "Add €" + amount : "Add expense"}
        </Button>
        {!valid && !error && (
          <p className="add-helper">{travelOn && !tripId ? "Select a trip" : "Enter an amount"}</p>
        )}
      </div>
    );

    return (
      <Sheet open={open} onClose={onClose} title="Log an expense" footer={footer}>
        {body}
      </Sheet>
    );
  }

  function EditSheet({ open, txn, onClose, onSave, onDelete, store, onCreateTrip }) {
    const [draft, setDraft] = React.useState(null);
    const defaultPerson = () => (store && store.people && store.people[0] && store.people[0].id) || "marti";
    const [funOn, setFunOn] = React.useState(false);
    const [funPerson, setFunPerson] = React.useState(defaultPerson());
    const [travelOn, setTravelOn] = React.useState(false);
    const [tripId, setTripId] = React.useState(null);
    const [oneOff, setOneOff] = React.useState(false);
    const [optsOpen, setOptsOpen] = React.useState(false);
    React.useEffect(() => {
      if (txn) {
        setDraft({ description: txn.description, amount: String(txn.amount_eur), category: txn.category, date: txn.date, note: txn.note || "" });
        setFunOn(!!txn.fun);
        setFunPerson(txn.person || defaultPerson());
        setTravelOn(!!txn.travel);
        setTripId(txn.trip_id || null);
        setOneOff(!!txn.oneoff);
        setOptsOpen(false);
      }
    }, [txn]);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    if (!draft) return <Sheet open={open} onClose={onClose} title="Edit" />;
    const valid = parseFloat(draft.amount) > 0 && (!travelOn || !!tripId);

    const body = (
      <div>
        <AmountHero amount={draft.amount} onChange={(amount) => set({ amount })} />
        <CategoryField value={draft.category} onChange={(category) => set({ category })} store={store} />
        <div className="field">
          <label>Description</label>
          <input className="inp" value={draft.description} placeholder="e.g. Billa groceries"
            onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <textarea className="inp" value={draft.note || ""} placeholder="Anything worth remembering"
            onChange={(e) => set({ note: e.target.value })} />
        </div>
        <div className="field">
          <label>Date</label>
          <DateField value={draft.date} onChange={(date) => set({ date })} />
        </div>
        <OptionsDisclosure
          open={optsOpen} setOpen={setOptsOpen}
          funOn={funOn} setFunOn={setFunOn} funPerson={funPerson} setFunPerson={setFunPerson}
          travelOn={travelOn} setTravelOn={setTravelOn}
          oneOff={oneOff} setOneOff={setOneOff} saveAsTemplate={false} setSaveAsTemplate={() => {}}
          store={store} showOneOff={true} showSaveAsTemplate={false}
          tripId={tripId} setTripId={setTripId} trips={store && store.trips} onCreateTrip={onCreateTrip} />
      </div>
    );
    const footer = (
      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="secondary" onClick={() => { onDelete(txn.id); onClose(); }} icon={<window.Icon name="trash" size={16} />}>Delete</Button>
        <div style={{ flex: 1 }}>
          <Button variant="primary" block disabled={!valid}
            onClick={() => {
              const updated = { ...txn, description: draft.description, amount_eur: Math.round(parseFloat(draft.amount) * 100) / 100, category: draft.category, date: draft.date, note: draft.note || undefined };
              if (funOn) { updated.fun = true; updated.person = funPerson; } else { delete updated.fun; delete updated.person; }
              if (travelOn) { updated.travel = true; updated.trip_id = tripId; } else { delete updated.travel; delete updated.trip_id; }
              if (oneOff) { updated.oneoff = true; } else { delete updated.oneoff; }
              onSave(updated); onClose();
            }}>
            Save changes
          </Button>
        </div>
      </div>
    );

    return (
      <Sheet open={open} onClose={onClose} title="Edit expense" footer={footer}>
        {body}
      </Sheet>
    );
  }

  window.YAdd = { AddSheet, EditSheet, CategoryPicker, CategoryField };
})();
