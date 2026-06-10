// settings.jsx — target, buffer, years, templates, CSV import/export, clear.
(function () {
  const APP_VERSION = 'v25';
  const { YData, YCalc, YUI } = window;
  const { eur0, signedPct, computeStats } = YCalc;
  const { Sheet, DeltaChip } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button, SegmentedControl = DS.SegmentedControl;

  function Row({ icon, title, sub, value, onClick, danger }) {
    return (
      <button className="setrow" onClick={onClick}>
        <span className="setrow-ic" style={danger ? { color: "var(--alert)" } : undefined}><window.Icon name={icon} size={18} /></span>
        <span className="setrow-main">
          <div className="setrow-title" style={danger ? { color: "var(--alert)" } : undefined}>{title}</div>
          {sub && <div className="setrow-sub">{sub}</div>}
        </span>
        {value && <span className="setrow-val">{value}</span>}
        <window.Icon name="chevronRight" size={16} style={{ color: "var(--muted)" }} />
      </button>
    );
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    text.trim().split(/\r?\n/).forEach((line) => {
      const cells = []; let cur = ""; let inq = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inq) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inq = false; else cur += ch; }
        else { if (ch === '"') inq = true; else if (ch === ",") { cells.push(cur); cur = ""; } else cur += ch; }
      }
      cells.push(cur); rows.push(cells);
    });
    return rows;
  }
  const CAT_LOOKUP = (() => { const m = {}; YData.CATEGORIES.forEach((c) => { m[c.id] = c.id; m[c.label.toLowerCase()] = c.id; }); return m; })();
  const resolveCat = (s) => CAT_LOOKUP[(s || "").trim().toLowerCase()] || "general";

  const SAMPLE_CSV = `date,description,amount_eur,original_amount,original_currency,category
2026-06-02,Billa,42.18,82.50,BGN,Groceries
2026-06-03,Cosmos Coffee,3.80,,,Restaurants
2026-06-04,OMV fuel,61.00,,,Transport
2026-06-04,Netflix,12.99,,,Entertainment
2026-06-05,Zoomag pet food,18.40,,,Pets`;

  function ImportSheet({ open, onClose, store, setStore }) {
    const [raw, setRaw] = React.useState("");
    const [rows, setRows] = React.useState(null); // parsed preview rows
    React.useEffect(() => { if (open) { setRaw(""); setRows(null); } }, [open]);

    const parse = (text) => {
      const data = parseCSV(text);
      if (!data.length) return;
      const header = data[0].map((h) => h.trim().toLowerCase());
      const idx = (k) => header.indexOf(k);
      const existing = new Set(store.transactions.map((t) => `${t.description}|${t.date}|${t.amount_eur}`));
      const out = [];
      for (let i = 1; i < data.length; i++) {
        const r = data[i]; if (!r || r.join("").trim() === "") continue;
        const date = (r[idx("date")] || "").trim();
        const description = (r[idx("description")] || "").trim();
        const amount_eur = Math.round(parseFloat(r[idx("amount_eur")] || "0") * 100) / 100;
        if (!date || !(amount_eur > 0)) continue;
        const oa = r[idx("original_amount")] ? parseFloat(r[idx("original_amount")]) : undefined;
        const oc = (r[idx("original_currency")] || "").trim() || undefined;
        const category = resolveCat(r[idx("category")]);
        const dup = existing.has(`${description}|${date}|${amount_eur}`);
        out.push({ date, description, amount_eur, original_amount: oa, original_currency: oc, category, dup, skip: dup });
      }
      setRows(out);
    };

    const toggleSkip = (i) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, skip: !r.skip } : r)));
    const setCat = (i, cat) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, category: cat } : r)));

    const doImport = () => {
      const add = rows.filter((r) => !r.skip).map((r) => ({
        id: YData.uid(), date: r.date, description: r.description, amount_eur: r.amount_eur,
        original_amount: r.original_amount, original_currency: r.original_currency, category: r.category, source: "import",
      }));
      setStore((s) => ({ ...s, transactions: [...s.transactions, ...add] }));
      onClose();
    };

    const kept = rows ? rows.filter((r) => !r.skip).length : 0;
    const dups = rows ? rows.filter((r) => r.dup).length : 0;

    return (
      <Sheet open={open} onClose={onClose} title="Import CSV">
        {!rows ? (
          <div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
              Columns: <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>date, description, amount_eur, original_amount, original_currency, category</code>
            </p>
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }} id="csvfile"
              onChange={(e) => { const f = e.target.files[0]; if (f) f.text().then((t) => { setRaw(t); parse(t); }); }} />
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <Button variant="primary" onClick={() => document.getElementById("csvfile").click()} icon={<window.Icon name="upload" size={16} />}>Choose file</Button>
              <Button variant="secondary" onClick={() => { setRaw(SAMPLE_CSV); parse(SAMPLE_CSV); }}>Try sample</Button>
            </div>
            <div className="field"><label>…or paste CSV</label>
              <textarea className="inp" style={{ minHeight: 110, fontFamily: "var(--mono)", fontSize: 12 }} value={raw}
                onChange={(e) => setRaw(e.target.value)} placeholder="date,description,amount_eur,…" />
            </div>
            <Button variant="primary" block disabled={!raw.trim()} onClick={() => parse(raw)}>Preview</Button>
          </div>
        ) : (
          <div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              {rows.length} rows · <span style={{ color: "var(--ink)" }}>{kept} to import</span>{dups ? ` · ${dups} duplicate${dups > 1 ? "s" : ""} skipped` : ""}
            </div>
            <div style={{ maxHeight: "44vh", overflowY: "auto", marginBottom: 12 }}>
              {rows.map((r, i) => (
                <div key={i} className={"imp-row" + (r.skip ? " skip" : "")}>
                  <span className="chk" onClick={() => toggleSkip(i)} style={r.skip ? {} : { background: "var(--terra)", borderColor: "var(--terra)" }}>
                    {!r.skip && <window.Icon name="check" size={14} />}
                  </span>
                  <span className="imp-main">
                    <div className="tx-desc" style={{ fontSize: 13.5 }}>{r.description || "—"} {r.dup && <span className="dupflag">DUP</span>}</div>
                    <div className="tx-meta">{YCalc.fmtDateShort(r.date)} · <span className="num">{eur0(r.amount_eur)}</span></div>
                  </span>
                  <select className="selpill" value={r.category} onChange={(e) => setCat(i, e.target.value)}>
                    {YData.CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setRows(null)}>Back</Button>
              <div style={{ flex: 1 }}><Button variant="primary" block disabled={!kept} onClick={doImport}>Import {kept} {kept === 1 ? "row" : "rows"}</Button></div>
            </div>
          </div>
        )}
      </Sheet>
    );
  }

  // ---------- Templates manager ----------
  function TemplatesSheet({ open, onClose, store, setStore }) {
    const [edit, setEdit] = React.useState(null); // template being edited or {new}
    const tpls = store.templates;
    const move = (i, dir) => {
      const j = i + dir; if (j < 0 || j >= tpls.length) return;
      const arr = tpls.slice(); const [x] = arr.splice(i, 1); arr.splice(j, 0, x);
      setStore((s) => ({ ...s, templates: arr }));
    };
    const remove = (id) => setStore((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }));
    const save = (t) => {
      setStore((s) => {
        const exists = s.templates.some((x) => x.id === t.id);
        return { ...s, templates: exists ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] };
      });
      setEdit(null);
    };

    if (edit) {
      const t = edit;
      const set = (p) => setEdit((e) => ({ ...e, ...p }));
      return (
        <Sheet open={open} onClose={() => setEdit(null)} title={store.templates.some((x) => x.id === t.id) ? "Edit template" : "New template"}>
          <div className="field"><label>Name</label><input className="inp" value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Billa" /></div>
          <div className="field"><label>Default amount (optional)</label><input className="inp inp-num" inputMode="decimal" value={t.defaultAmount || ""} onChange={(e) => set({ defaultAmount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="leave blank to type each time" /></div>
          <div className="field"><label>Category</label><window.YAdd.CategoryPicker value={t.category} onChange={(category) => set({ category })} /></div>
          <Button variant="primary" block disabled={!t.name.trim()}
            onClick={() => save({ id: t.id, name: t.name.trim(), category: t.category, defaultAmount: t.defaultAmount ? parseFloat(t.defaultAmount) : undefined })}>Save template</Button>
        </Sheet>
      );
    }
    return (
      <Sheet open={open} onClose={onClose} title="Quick templates"
        headRight={<button className="linklike" onClick={() => setEdit({ id: YData.uid(), name: "", category: "groceries" })}><window.Icon name="plus" size={15} />New</button>}>
        <div className="panel panel-pad" style={{ padding: "4px 12px" }}>
          {tpls.map((t, i) => {
            const c = YData.cat(t.category);
            return (
              <div key={t.id} className="txrow" style={{ cursor: "default" }}>
                <span className="cat-dot" style={{ background: YData.cat(t.category).color }} />
                <span className="tx-main"><div className="tx-desc">{t.name}</div><div className="tx-meta">{c.label}{t.defaultAmount ? ` · €${t.defaultAmount}` : ""}</div></span>
                <span style={{ display: "flex", gap: 2 }}>
                  <button className="linklike" onClick={() => move(i, -1)} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }}><window.Icon name="chevronUp" size={16} /></button>
                  <button className="linklike" onClick={() => move(i, 1)} disabled={i === tpls.length - 1} style={{ opacity: i === tpls.length - 1 ? 0.3 : 1 }}><window.Icon name="chevronDown" size={16} /></button>
                  <button className="linklike" onClick={() => setEdit({ ...t, defaultAmount: t.defaultAmount || "" })}><window.Icon name="pencil" size={15} /></button>
                  <button className="linklike" onClick={() => remove(t.id)} style={{ color: "var(--alert)" }}><window.Icon name="trash" size={15} /></button>
                </span>
              </div>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // ---------- simple value sheets ----------
  function TargetSheet({ open, onClose, store, setStore, year }) {
    const yr = year != null ? Number(year) : Number(store.currentYear);
    const getCeiling = (s) => { const y = s.years[String(yr)] || {}; return y.ceiling != null ? y.ceiling : (y.target || 25000); };
    const [v, setV] = React.useState(String(getCeiling(store)));
    React.useEffect(() => { if (open) setV(String(getCeiling(store))); }, [open, yr]);
    return (
      <Sheet open={open} onClose={onClose} title={`${yr} household ceiling`}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>Your total annual outflow ceiling — the sacred number everything is measured against.</p>
        <div className="amount-display"><span className="cur">€</span><span className="num">{v || "0"}</span></div>
        <input className="inp inp-num" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} style={{ textAlign: "center", fontSize: 18, marginBottom: 16 }} />
        <Button variant="primary" block disabled={!(parseInt(v) > 0)} onClick={() => {
          setStore((s) => {
            const yr_ = s.years[String(yr)] || {};
            const updated = { ...yr_, ceiling: parseInt(v) };
            delete updated.target;
            return { ...s, years: { ...s.years, [String(yr)]: updated } };
          });
          onClose();
        }}>Save ceiling</Button>
      </Sheet>
    );
  }

  function BufferSheet({ open, onClose, store, setStore, year }) {
    const yr = year != null ? Number(year) : Number(store.currentYear);
    const isPast = yr < Number(store.currentYear);
    const cur = store.years[String(yr)] || { target: 25000, buffer: 0.04 };
    const [v, setV] = React.useState(Math.round((cur.buffer || 0) * 100));
    React.useEffect(() => {
      if (open) setV(Math.round(((store.years[String(yr)] || { buffer: 0 }).buffer || 0) * 100));
    }, [open, yr]);
    const buffStats = YCalc.computeStats(store, yr);
    const preview = buffStats.projNoBuffer * (1 + v / 100);
    return (
      <Sheet open={open} onClose={onClose} title="Missed-entry buffer">
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>People forget to log things. This lifts the projection by a flat percentage so it isn't artificially optimistic.</p>
        {isPast ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>Buffer is not applicable to completed years — final spend is already known.</p>
        ) : (
          <>
            <div style={{ textAlign: "center", margin: "8px 0 14px" }}>
              <div className="num" style={{ fontSize: 44, fontWeight: 600 }}>{v}%</div>
              <div className="muted" style={{ fontSize: 13 }}>projection {eur0(buffStats.projNoBuffer)} → <span style={{ color: "var(--ink)" }} className="num">{eur0(preview)}</span></div>
            </div>
            <div className="rangewrap" style={{ marginBottom: 20 }}>
              <span className="muted num">0%</span>
              <input className="rng" type="range" min="0" max="15" step="1" value={v} onChange={(e) => setV(parseInt(e.target.value))}
                style={{ "--rng-fill": `${Math.round(v / 15 * 100)}%` }} />
              <span className="muted num">15%</span>
            </div>
            <Button variant="primary" block onClick={() => {
              setStore((s) => ({ ...s, years: { ...s.years, [String(yr)]: { ...s.years[String(yr)], buffer: v / 100 } } }));
              onClose();
            }}>Save buffer</Button>
          </>
        )}
      </Sheet>
    );
  }

  // ---------- Years ----------
  function YearsSheet({ open, onClose, store, setStore }) {
    const [sel, setSel] = React.useState(null); // null | { year: Number, editing: null|"target"|"buffer" }
    React.useEffect(() => { if (!open) setSel(null); }, [open]);

    const currentYear = Number(store.currentYear);
    const years = Object.keys(store.years).sort((a, b) => b - a);

    const addYear = () => {
      const maxY = Math.max(...Object.keys(store.years).map(Number));
      const newY = maxY + 1;
      if (store.years[String(newY)]) return;
      const src = store.years[String(maxY)] || { ceiling: 25000, buffer: 0.04 };
      const srcCeiling = src.ceiling != null ? src.ceiling : (src.target || 25000);
      setStore((s) => ({ ...s, years: { ...s.years, [String(newY)]: { ceiling: srcCeiling, buffer: src.buffer || 0 } } }));
    };

    const delYear = (y) => {
      const hasTxns = store.transactions.some((t) => t.date.slice(0, 4) === String(y));
      if (hasTxns) return;
      setSel(null);
      setStore((s) => { const yrs = { ...s.years }; delete yrs[String(y)]; return { ...s, years: yrs }; });
    };

    // Nested: editing target for a year
    if (sel && sel.editing === "target") {
      return <TargetSheet open={open} onClose={() => setSel({ year: sel.year, editing: null })} store={store} setStore={setStore} year={sel.year} />;
    }

    // Nested: editing buffer for a year
    if (sel && sel.editing === "buffer") {
      return <BufferSheet open={open} onClose={() => setSel({ year: sel.year, editing: null })} store={store} setStore={setStore} year={sel.year} />;
    }

    // Year detail view
    if (sel) {
      const y = sel.year;
      const past = y < currentYear;
      const future = y > currentYear;
      const yd = store.years[String(y)] || { ceiling: 25000, buffer: 0.04 };
      const ydCeiling = yd.ceiling != null ? yd.ceiling : (yd.target || 25000);
      const hasTxns = store.transactions.some((t) => t.date.slice(0, 4) === String(y));
      return (
        <Sheet open={open} onClose={() => setSel(null)} title={`${y}${y === currentYear ? " · current" : ""}`}>
          <div className="panel" style={{ overflow: "hidden" }}>
            <Row icon="target" title="Household ceiling" value={eur0(ydCeiling)} onClick={() => setSel({ year: y, editing: "target" })} />
            {!past && <Row icon="layers" title="Missed-entry buffer" value={Math.round((yd.buffer || 0) * 100) + "%"} onClick={() => setSel({ year: y, editing: "buffer" })} />}
          </div>
          {future && !hasTxns && (
            <div style={{ marginTop: 16 }}>
              <Button variant="secondary" block onClick={() => delYear(y)}>Remove {y}</Button>
            </div>
          )}
        </Sheet>
      );
    }

    // Main year list
    return (
      <Sheet open={open} onClose={onClose} title="Years"
        headRight={<button className="linklike" onClick={addYear}><window.Icon name="plus" size={15} />Add year</button>}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>Targets are set per year — your history of the sacred number.</p>
        <div className="panel panel-pad">
          {years.map((y) => {
            const st = computeStats(store, y);
            return (
              <button key={y} className="year-row" onClick={() => setSel({ year: Number(y), editing: null })}
                style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 600 }} className="num">{y}{st.isCurrent && <span style={{ fontSize: 11, color: "var(--terra)", fontFamily: "var(--mono)", marginLeft: 8, letterSpacing: "0.04em" }}>CURRENT</span>}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    Ceiling <span className="num" style={{ color: "var(--ink-2)" }}>{eur0(st.ceiling)}</span> · {st.complete ? "combined" : "proj"} <span className="num" style={{ color: "var(--ink-2)" }}>{eur0(st.combinedProjection)}</span>
                  </div>
                </div>
                <DeltaChip delta={st.combinedDelta} status={st.combinedStatus} />
                <window.Icon name="chevronRight" size={16} style={{ color: "var(--muted)", marginLeft: 4 }} />
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // ---------- Fun budget config ----------
  function FunConfigSheet({ open, onClose, person, store, setStore, stats }) {
    const currentYM = new Date().toISOString().slice(0, 7);
    const latestRate = (() => {
      const rates = (person && person.rates) || [];
      let best = 0;
      rates.forEach((r) => { if (r.from <= currentYM) best = r.amount; });
      return best;
    })();
    const [v, setV] = React.useState(String(latestRate));
    const [balMode, setBalMode] = React.useState(false);
    // Current balance shown to the user (with any existing adjustment included)
    const currentBalance = React.useMemo(() => {
      if (!person || !open) return 0;
      const fun = YCalc.computeFun(store);
      const pd = fun.people.find((p) => p.id === person.id);
      return pd ? pd.balance : 0;
    }, [open, person, store]);
    const [balVal, setBalVal] = React.useState("");
    React.useEffect(() => {
      if (open) {
        setV(String(latestRate));
        setBalMode(false);
        setBalVal(String(Math.round(currentBalance)));
      }
    }, [open]);

    const save = () => {
      const amount = parseInt(v) || 0;
      setStore((s) => {
        const updated = (s.people || []).map((p) => {
          if (p.id !== person.id) return p;
          const rates = (p.rates || []).slice();
          const idx = rates.findIndex((r) => r.from === currentYM);
          if (idx >= 0) {
            rates[idx] = { from: currentYM, amount };
          } else {
            rates.push({ from: currentYM, amount });
          }
          rates.sort((a, b) => (a.from < b.from ? -1 : 1));
          // Compute raw balance (without existing adjustment) to back-calculate new adjustment
          const existingAdj = p.balanceAdjustment || 0;
          const rawBalance = currentBalance - existingAdj;
          const targetBalance = parseInt(balVal);
          const newAdj = isNaN(targetBalance) ? existingAdj : targetBalance - rawBalance;
          return { ...p, rates, balanceAdjustment: Math.round(newAdj) };
        });
        return { ...s, people: updated };
      });
      onClose();
    };

    if (!person) return null;
    return (
      <Sheet open={open} onClose={onClose} title={person.name + "'s fun budget"}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          Monthly allowance from {currentYM} onwards — past months keep their old rate.
        </p>
        <div className="amount-display"><span className="cur">€</span><span className="num">{v || "0"}</span></div>
        <input className="inp inp-num" inputMode="numeric" value={v}
          onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
          style={{ textAlign: "center", fontSize: 18, marginBottom: 20 }} />

        <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Current balance</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: currentBalance < 0 ? "var(--terra)" : "var(--sage)" }}>
              {currentBalance < 0 ? "−€" + Math.round(Math.abs(currentBalance)) : "€" + Math.round(currentBalance)}
            </span>
          </div>
          <button className="linklike" style={{ fontSize: 12, color: "var(--ink-2)" }}
            onClick={() => setBalMode((b) => !b)}>
            {balMode ? "Hide balance correction" : "Correct balance…"}
          </button>
          {balMode && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10, lineHeight: 1.5 }}>
                Override the calculated balance. Enter the actual balance {person.name} should have right now. Future accruals and spending apply on top.
              </p>
              <div className="field">
                <label>Set balance to (€)</label>
                <input className="inp inp-num" inputMode="numeric" value={balVal}
                  onChange={(e) => setBalVal(e.target.value.replace(/[^-\d]/g, ""))}
                  style={{ textAlign: "center", fontSize: 18 }} />
              </div>
            </div>
          )}
        </div>

        <Button variant="primary" block onClick={save}>Save</Button>
      </Sheet>
    );
  }

  function DensitySheet({ open, onClose, store, setStore }) {
    const OPTIONS = [
      { value: "minimal", label: "Minimal", sub: "Up to 2 alert/watch callouts" },
      { value: "balanced", label: "Balanced", sub: "Up to 4 callouts" },
      { value: "all", label: "All", sub: "Show every callout" },
    ];
    const current = store.density || "balanced";
    return (
      <Sheet open={open} onClose={onClose} title="Overview density">
        <div className="panel" style={{ overflow: "hidden" }}>
          {OPTIONS.map((o) => (
            <button key={o.value} className="setrow" onClick={() => { setStore((s) => ({ ...s, density: o.value })); onClose(); }}>
              <span className="setrow-main">
                <div className="setrow-title">{o.label}</div>
                <div className="setrow-sub">{o.sub}</div>
              </span>
              {current === o.value && <window.Icon name="check" size={18} style={{ color: "var(--terra)" }} />}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  function ClearSheet({ open, onClose, setStore }) {
    const [v, setV] = React.useState("");
    React.useEffect(() => { if (open) setV(""); }, [open]);
    return (
      <Sheet open={open} onClose={onClose} title="Clear all data">
        <p className="muted" style={{ fontSize: 13.5, marginTop: 0, lineHeight: 1.5 }}>This permanently deletes every transaction. Targets and templates are kept. Type <b style={{ color: "var(--alert)" }}>DELETE</b> to confirm.</p>
        <input className="inp" value={v} onChange={(e) => setV(e.target.value)} placeholder="DELETE" style={{ marginBottom: 16, textAlign: "center", letterSpacing: "0.1em" }} />
        <Button variant="primary" block disabled={v !== "DELETE"} onClick={() => { setStore((s) => ({ ...s, transactions: [] })); onClose(); }}>Delete everything</Button>
      </Sheet>
    );
  }

  function backupJSON(store) {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "yearly-backup.json"; a.click();
  }

  function exportCSV(store) {
    const head = ["date", "description", "amount_eur", "original_amount", "original_currency", "category", "note", "source"];
    const esc = (v) => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [head.join(",")];
    store.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((t) => {
      lines.push([t.date, t.description, t.amount_eur, t.original_amount, t.original_currency, YData.cat(t.category).label, t.note, t.source].map(esc).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "yearly-export.csv"; a.click();
  }

  function SettingsScreen({ store, setStore, stats }) {
    const [sub, setSub] = React.useState(null);
    const [funPersonSub, setFunPersonSub] = React.useState(null); // person id | null
    const [syncing, setSyncing] = React.useState(false);
    const cur = store.years[String(store.currentYear)];
    const density = store.density || "balanced";
    const densityLabel = density.charAt(0).toUpperCase() + density.slice(1);
    const people = store.people || [];
    const funPersonOpen = people.find((p) => p.id === funPersonSub) || null;
    return (
      <div className="screen">
        <div className="section-h" style={{ marginTop: 0 }}><h2>This year</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="target" title="Household ceiling" sub={`${store.currentYear} ceiling`} value={eur0(cur.ceiling != null ? cur.ceiling : (cur.target || 25000))} onClick={() => setSub("target")} />
          <Row icon="layers" title="Missed-entry buffer" sub="lifts the projection" value={Math.round((cur.buffer || 0) * 100) + "%"} onClick={() => setSub("buffer")} />
          <Row icon="clock" title="Past years" sub="target vs actual history" onClick={() => setSub("years")} />
        </div>

        <div className="section-h"><h2>Fun budget</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          {people.map((p) => {
            const currentYM = new Date().toISOString().slice(0, 7);
            const rates = p.rates || [];
            let rate = 0;
            rates.forEach((r) => { if (r.from <= currentYM) rate = r.amount; });
            return (
              <Row key={p.id} icon="activity" title={p.name} sub="monthly fun allowance" value={eur0(rate) + "/mo"} onClick={() => setFunPersonSub(p.id)} />
            );
          })}
          {stats && (
            <div style={{ padding: "10px 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", borderTop: people.length ? "1px solid var(--hair)" : "none" }}>
              {eur0(stats.ceiling)} ceiling = {eur0(stats.mainTarget)} main + {eur0(stats.funPlanAnnual)}/yr fun
            </div>
          )}
        </div>

        <div className="section-h"><h2>Display</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="activity" title="Overview density" sub="callouts shown on Overview" value={densityLabel} onClick={() => setSub("density")} />
        </div>

        <div className="section-h"><h2>Data</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="layers" title="Quick templates" sub={`${store.templates.length} templates`} onClick={() => setSub("templates")} />
          <Row icon="upload" title="Import CSV" sub="with duplicate detection" onClick={() => setSub("import")} />
          <Row icon="download" title="Export all data" sub="CSV of every transaction" onClick={() => exportCSV(store)} />
          <Row icon="download" title="Back up (JSON)" sub="full backup incl. years & templates" onClick={() => backupJSON(store)} />
          <input type="file" accept=".json,application/json" style={{ display: "none" }} id="jsonfile"
            onChange={(e) => {
              const f = e.target.files[0]; if (!f) return;
              e.target.value = "";
              f.text().then((text) => {
                let parsed;
                try { parsed = JSON.parse(text); } catch (_) { alert("Invalid JSON file — restore cancelled."); return; }
                if (!parsed || typeof parsed.years !== "object" || !Array.isArray(parsed.transactions)) {
                  alert("File doesn't look like a Yearly backup — restore cancelled."); return;
                }
                YData.migrateStore(parsed);
                if (!confirm("Replace ALL current data with this backup?")) return;
                setStore(parsed);
              });
            }} />
          <Row icon="upload" title="Restore (JSON)" sub="replace all data from a backup" onClick={() => document.getElementById("jsonfile").click()} />
          <Row icon="activity" title={syncing ? "Syncing…" : "Sync now"} sub="fetch latest data from server"
            onClick={async () => { setSyncing(true); await window.YSync.pull(); setSyncing(false); }} />
        </div>

        <div className="section-h"><h2>Danger zone</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="trash" title="Clear all data" sub="delete every transaction" danger onClick={() => setSub("clear")} />
        </div>

        <div className="muted" style={{ textAlign: "center", fontSize: 11.5, marginTop: 6, fontFamily: "var(--mono)" }}>Yearly · {APP_VERSION}</div>

        <TargetSheet open={sub === "target"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <BufferSheet open={sub === "buffer"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <YearsSheet open={sub === "years"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <DensitySheet open={sub === "density"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <TemplatesSheet open={sub === "templates"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <ImportSheet open={sub === "import"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <ClearSheet open={sub === "clear"} onClose={() => setSub(null)} setStore={setStore} />
        <FunConfigSheet open={!!funPersonOpen} onClose={() => setFunPersonSub(null)} person={funPersonOpen} store={store} setStore={setStore} stats={stats} />
      </div>
    );
  }

  window.YSettings = { SettingsScreen };
})();
