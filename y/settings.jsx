// settings.jsx — target, buffer, years, templates, CSV import/export, clear.
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, signedPct, computeStats } = YCalc;
  const { Sheet, CatIcon } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button, SegmentedControl = DS.SegmentedControl;

  function Row({ icon, title, sub, value, onClick, danger }) {
    return (
      <button className="setrow" onClick={onClick}>
        <span className="setrow-ic" style={danger ? { color: "var(--alert)", background: "var(--alert-dim)" } : undefined}><window.Icon name={icon} size={18} /></span>
        <span className="setrow-main">
          <div className="setrow-title" style={danger ? { color: "var(--alert)" } : undefined}>{title}</div>
          {sub && <div className="setrow-sub">{sub}</div>}
        </span>
        {value && <span className="setrow-val">{value}</span>}
        <window.Icon name="chevronRight" size={16} style={{ color: "var(--text-3)" }} />
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
              Columns: <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>date, description, amount_eur, original_amount, original_currency, category</code>
            </p>
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }} id="csvfile"
              onChange={(e) => { const f = e.target.files[0]; if (f) f.text().then((t) => { setRaw(t); parse(t); }); }} />
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <Button variant="primary" onClick={() => document.getElementById("csvfile").click()} icon={<window.Icon name="upload" size={16} />}>Choose file</Button>
              <Button variant="secondary" onClick={() => { setRaw(SAMPLE_CSV); parse(SAMPLE_CSV); }}>Try sample</Button>
            </div>
            <div className="field"><label>…or paste CSV</label>
              <textarea className="inp" style={{ minHeight: 110, fontFamily: "var(--font-mono)", fontSize: 12 }} value={raw}
                onChange={(e) => setRaw(e.target.value)} placeholder="date,description,amount_eur,…" />
            </div>
            <Button variant="primary" block disabled={!raw.trim()} onClick={() => parse(raw)}>Preview</Button>
          </div>
        ) : (
          <div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              {rows.length} rows · <span style={{ color: "var(--text)" }}>{kept} to import</span>{dups ? ` · ${dups} duplicate${dups > 1 ? "s" : ""} skipped` : ""}
            </div>
            <div style={{ maxHeight: "44vh", overflowY: "auto", marginBottom: 12 }}>
              {rows.map((r, i) => (
                <div key={i} className={"imp-row" + (r.skip ? " skip" : "")}>
                  <span className="chk" onClick={() => toggleSkip(i)} style={r.skip ? {} : { background: "var(--accent)", borderColor: "var(--accent)" }}>
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
                <CatIcon catId={t.category} />
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

  // ---------- Years ----------
  function YearsSheet({ open, onClose, store, setStore }) {
    const years = Object.keys(store.years).sort((a, b) => b - a);
    return (
      <Sheet open={open} onClose={onClose} title="Years">
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>Targets are set per year — your history of the sacred number.</p>
        <div className="panel panel-pad">
          {years.map((y) => {
            const st = computeStats(store, y);
            const over = st.delta >= 0;
            const cls = st.status === "good" ? "bg-good" : st.status === "alert" ? "bg-alert" : "bg-watch";
            return (
              <div key={y} className="year-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 600 }} className="num">{y}{st.isCurrent && <span style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--font)", marginLeft: 8, letterSpacing: "0.04em" }}>CURRENT</span>}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    Target <span className="num" style={{ color: "var(--text-2)" }}>{eur0(st.target)}</span> · {st.complete ? "spent" : "projected"} <span className="num" style={{ color: "var(--text-2)" }}>{eur0(st.projection)}</span>
                  </div>
                </div>
                <span className={"delta-chip " + cls}><span className="num">{(over ? "+" : "−") + eur0(Math.abs(st.delta))}</span></span>
              </div>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // ---------- simple value sheets ----------
  function TargetSheet({ open, onClose, store, setStore }) {
    const cur = store.years[String(store.currentYear)];
    const [v, setV] = React.useState(String(cur.target));
    React.useEffect(() => { if (open) setV(String(cur.target)); }, [open]);
    return (
      <Sheet open={open} onClose={onClose} title={`${store.currentYear} target`}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>Your annual spending goal — the number everything is measured against.</p>
        <div className="amount-display"><span className="cur">€</span><span className="num">{v || "0"}</span></div>
        <input className="inp inp-num" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} style={{ textAlign: "center", fontSize: 18, marginBottom: 16 }} />
        <Button variant="primary" block disabled={!(parseInt(v) > 0)} onClick={() => { setStore((s) => ({ ...s, years: { ...s.years, [s.currentYear]: { ...s.years[s.currentYear], target: parseInt(v) } } })); onClose(); }}>Save target</Button>
      </Sheet>
    );
  }

  function BufferSheet({ open, onClose, store, setStore, stats }) {
    const cur = store.years[String(store.currentYear)];
    const [v, setV] = React.useState(Math.round((cur.buffer || 0) * 100));
    React.useEffect(() => { if (open) setV(Math.round((cur.buffer || 0) * 100)); }, [open]);
    const preview = stats.projNoBuffer * (1 + v / 100);
    return (
      <Sheet open={open} onClose={onClose} title="Missed-entry buffer">
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>People forget to log things. This lifts the projection by a flat percentage so it isn't artificially optimistic.</p>
        <div style={{ textAlign: "center", margin: "8px 0 14px" }}>
          <div className="num" style={{ fontSize: 44, fontWeight: 600 }}>{v}%</div>
          <div className="muted" style={{ fontSize: 13 }}>projection {eur0(stats.projNoBuffer)} → <span style={{ color: "var(--text)" }} className="num">{eur0(preview)}</span></div>
        </div>
        <div className="rangewrap" style={{ marginBottom: 20 }}>
          <span className="muted num">0%</span>
          <input className="rng" type="range" min="0" max="15" step="1" value={v} onChange={(e) => setV(parseInt(e.target.value))} />
          <span className="muted num">15%</span>
        </div>
        <Button variant="primary" block onClick={() => { setStore((s) => ({ ...s, years: { ...s.years, [s.currentYear]: { ...s.years[s.currentYear], buffer: v / 100 } } })); onClose(); }}>Save buffer</Button>
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
    const cur = store.years[String(store.currentYear)];
    return (
      <div className="screen">
        <div className="section-h" style={{ marginTop: 0 }}><h2>This year</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="target" title="Annual target" sub={`${store.currentYear} goal`} value={eur0(cur.target)} onClick={() => setSub("target")} />
          <Row icon="layers" title="Missed-entry buffer" sub="lifts the projection" value={Math.round((cur.buffer || 0) * 100) + "%"} onClick={() => setSub("buffer")} />
          <Row icon="clock" title="Past years" sub="target vs actual history" onClick={() => setSub("years")} />
        </div>

        <div className="section-h"><h2>Data</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="layers" title="Quick templates" sub={`${store.templates.length} templates`} onClick={() => setSub("templates")} />
          <Row icon="upload" title="Import CSV" sub="with duplicate detection" onClick={() => setSub("import")} />
          <Row icon="download" title="Export all data" sub="CSV of every transaction" onClick={() => exportCSV(store)} />
          <Row icon="activity" title="Restore sample data" sub="reset to the demo dataset" onClick={() => { if (confirm("Replace all data with the sample dataset?")) setStore(YData.resetStore()); }} />
        </div>

        <div className="section-h"><h2>Danger zone</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="trash" title="Clear all data" sub="delete every transaction" danger onClick={() => setSub("clear")} />
        </div>

        <div className="muted" style={{ textAlign: "center", fontSize: 11.5, marginTop: 6 }}>Yearly · all data stays on this device</div>

        <TargetSheet open={sub === "target"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <BufferSheet open={sub === "buffer"} onClose={() => setSub(null)} store={store} setStore={setStore} stats={stats} />
        <YearsSheet open={sub === "years"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <TemplatesSheet open={sub === "templates"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <ImportSheet open={sub === "import"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <ClearSheet open={sub === "clear"} onClose={() => setSub(null)} setStore={setStore} />
      </div>
    );
  }

  window.YSettings = { SettingsScreen };
})();
