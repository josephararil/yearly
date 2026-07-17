// settings.jsx — target, buffer, years, templates, CSV import/export, clear.
(function () {
  const APP_VERSION = 'v77';
  const { YData, YCalc, YUI } = window;
  const { eur0, eur2, signedPct, computeStats, localISO } = YCalc;
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

  // ---------- Revolut mobile import ----------
  const COMPARE_FIELDS = ["date", "description", "amount_eur"];

  // existingById: id -> raw D1 row (includes deleted=1 rows — the local React store never does,
  // since the client sync layer drops deleted rows from its in-memory map entirely). Diffing
  // against that local store would misclassify every soft-deleted id as "new".
  function diffRevolutRows(rows, existingById) {
    const fresh = [], changed = [], alreadyDeleted = [];
    for (const r of rows) {
      const old = existingById.get(r.id);
      if (!old) { fresh.push(r); continue; }
      if (old.deleted) { alreadyDeleted.push(r); continue; }
      const diffs = COMPARE_FIELDS.filter((f) => {
        if (f === "amount_eur") return Math.round((old.amount_eur || 0) * 100) !== Math.round((r.amount_eur || 0) * 100);
        return (old[f] || "") !== (r[f] || "");
      }).map((f) => ({ field: f, old: old[f], next: r[f] }));
      if (diffs.length) changed.push({ row: r, diffs });
    }
    const addedTotal = fresh.reduce((s, r) => s + r.amount_eur, 0);
    const changedDelta = changed.reduce((s, c) => {
      const d = c.diffs.find((x) => x.field === "amount_eur");
      return s + (d ? d.next - d.old : 0);
    }, 0);
    return { fresh, changed, alreadyDeleted, net: addedTotal + changedDelta };
  }

  const FIELD_LABEL = { date: "date", description: "desc", amount_eur: "amount" };

  function RevolutImportSheet({ open, onClose, store }) {
    const [raw, setRaw] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [preview, setPreview] = React.useState(null); // { rows, skipped, diff }
    const [result, setResult] = React.useState(null); // { imported, changed, net }
    React.useEffect(() => { if (open) { setRaw(""); setBusy(false); setError(null); setPreview(null); setResult(null); } }, [open]);

    const doPreview = async () => {
      setError(null);
      let arr;
      try { arr = JSON.parse(raw); } catch (e) { setError("Invalid JSON — check the paste and try again."); return; }
      if (!Array.isArray(arr)) { setError("Expected a JSON array of transactions."); return; }
      setBusy(true);
      try {
        const built = await window.YRevolutImport.buildRows(arr);
        if (!built.rows.length) {
          setError(`Nothing to import — ${built.parsed} parsed, all ${built.skipped.length} excluded by filters.`);
          setBusy(false);
          return;
        }
        // Prefer a live full D1 snapshot (includes deleted=1 rows) over the local store, which
        // never carries deleted rows at all. Falls back to the local store (no deleted-row
        // visibility) if the endpoint is unreachable, e.g. the no-backend local static preview.
        let existingById = new Map(store.transactions.map((t) => [t.id, t]));
        let liveSnapshot = false;
        try {
          const res = await fetch('/api/sync?since=0');
          const ct = res.headers.get('content-type') || '';
          if (res.ok && ct.includes('application/json')) {
            const data = await res.json();
            existingById = new Map((data.transactions || []).map((t) => [t.id, t]));
            liveSnapshot = true;
          }
        } catch (e) { /* offline/unreachable — fall back to local store below */ }
        const diff = diffRevolutRows(built.rows, existingById);
        setPreview({ rows: built.rows, skipped: built.skipped, diff, liveSnapshot });
      } catch (e) {
        setError("Couldn't process the paste: " + (e && e.message ? e.message : e));
      }
      setBusy(false);
    };

    const skipGroups = React.useMemo(() => {
      if (!preview) return [];
      const m = new Map();
      preview.skipped.forEach((s) => { m.set(s.reason, (m.get(s.reason) || 0) + 1); });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [preview]);

    const doImport = async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/revolut/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preview.rows),
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) throw new Error('Server error (HTTP ' + res.status + ')');
        await res.json();
        await window.YSync.pull({ force: true });
        setResult({ imported: preview.diff.fresh.length, changed: preview.diff.changed.length, net: preview.diff.net });
      } catch (e) {
        setError("Import failed — the paste is kept so you can retry. (" + (e && e.message ? e.message : e) + ")");
      }
      setBusy(false);
    };

    return (
      <Sheet open={open} onClose={onClose} title="Import Revolut">
        {result ? (
          <div>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 0, lineHeight: 1.5 }}>Import complete.</p>
            <div className="panel panel-pad" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span className="muted">Imported (new)</span><span className="num">{result.imported}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span className="muted">Changed (existing)</span><span className="num">{result.changed}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span className="muted">Net impact</span><span className="num">{eur2(result.net)}</span></div>
            </div>
            <Button variant="primary" block onClick={onClose}>Done</Button>
          </div>
        ) : !preview ? (
          <div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
              Paste the raw Revolut JSON array (from the bookmarklet or console script). It's cleaned
              and previewed here before anything is pushed — your in-app category/fun/note edits are
              never overwritten.
            </p>
            <div className="field"><label>Raw JSON</label>
              <textarea className="inp" style={{ minHeight: 160, fontFamily: "var(--mono)", fontSize: 11.5 }} value={raw}
                onChange={(e) => setRaw(e.target.value)} placeholder="[{...}, {...}]" />
            </div>
            {error && <p style={{ color: "var(--alert)", fontSize: 13, marginTop: -4 }}>{error}</p>}
            <Button variant="primary" block disabled={!raw.trim() || busy} onClick={doPreview}>{busy ? "Cleaning…" : "Preview"}</Button>
          </div>
        ) : (
          <div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              {preview.diff.fresh.length} new · {preview.diff.changed.length} changed · {preview.diff.alreadyDeleted.length} already deleted · {preview.skipped.length} skipped ·{" "}
              net <span className="num" style={{ color: "var(--ink)" }}>{eur2(preview.diff.net)}</span>
            </div>
            {!preview.liveSnapshot && (
              <p style={{ color: "var(--alert)", fontSize: 12, marginTop: -2, marginBottom: 8, lineHeight: 1.4 }}>
                Couldn't reach the server to check for deleted rows — this diff is only against the
                data already loaded on this device, so a deleted row you haven't synced may show as new.
              </p>
            )}
            <div style={{ maxHeight: "44vh", overflowY: "auto", marginBottom: 12 }}>
              {preview.diff.fresh.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="field-label" style={{ marginBottom: 4 }}>New ({preview.diff.fresh.length})</div>
                  {preview.diff.fresh.map((r) => (
                    <div key={r.id} className="imp-row">
                      <span className="imp-main">
                        <div className="tx-desc" style={{ fontSize: 13.5 }}>{r.description || "—"}</div>
                        <div className="tx-meta">{YCalc.fmtDateShort(r.date)} · {r.category}</div>
                      </span>
                      <span className="num">{eur2(r.amount_eur)}</span>
                    </div>
                  ))}
                </div>
              )}
              {preview.diff.changed.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="field-label" style={{ marginBottom: 4 }}>Changed ({preview.diff.changed.length})</div>
                  {preview.diff.changed.map((c) => (
                    <div key={c.row.id} className="imp-row" style={{ alignItems: "flex-start" }}>
                      <span className="imp-main">
                        <div className="tx-desc" style={{ fontSize: 13.5 }}>{c.row.description || "—"} <span className="muted" style={{ fontSize: 11 }}>{YCalc.fmtDateShort(c.row.date)}</span></div>
                        {c.diffs.map((d) => (
                          <div key={d.field} className="tx-meta">
                            {FIELD_LABEL[d.field]}: {d.field === "amount_eur" ? eur2(d.old) : (d.old || "—")}
                            {" → "}
                            <span style={{ color: "var(--ink)" }}>{d.field === "amount_eur" ? eur2(d.next) : (d.next || "—")}</span>
                          </div>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {preview.diff.alreadyDeleted.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="field-label" style={{ marginBottom: 4 }}>Already deleted in D1 ({preview.diff.alreadyDeleted.length}) — stays deleted</div>
                  {preview.diff.alreadyDeleted.map((r) => (
                    <div key={r.id} className="muted" style={{ fontSize: 12.5, padding: "3px 0" }}>{YCalc.fmtDateShort(r.date)} · {r.description || "—"}</div>
                  ))}
                </div>
              )}
              {skipGroups.length > 0 && (
                <div>
                  <div className="field-label" style={{ marginBottom: 4 }}>Skipped ({preview.skipped.length})</div>
                  {skipGroups.map(([reason, count]) => (
                    <div key={reason} className="muted" style={{ fontSize: 12.5, padding: "3px 0" }}>{reason} — {count}</div>
                  ))}
                </div>
              )}
            </div>
            {error && <p style={{ color: "var(--alert)", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setPreview(null)}>Back</Button>
              <div style={{ flex: 1 }}><Button variant="primary" block disabled={busy} onClick={doImport}>{busy ? "Importing…" : "Import"}</Button></div>
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
          <div className="field"><label>Category</label><window.YAdd.CategoryPicker value={t.category} onChange={(category) => set({ category })} store={store} /></div>
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
                    Ceiling <span className="num" style={{ color: "var(--ink-2)" }}>{eur0(st.ceiling)}</span> · {st.complete ? "final" : "proj"} <span className="num" style={{ color: "var(--ink-2)" }}>{eur0(st.projection)}</span>
                  </div>
                </div>
                <DeltaChip delta={st.delta} status={st.status} />
                <window.Icon name="chevronRight" size={16} style={{ color: "var(--muted)", marginLeft: 4 }} />
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // ---------- Fun budget config (all people in one banner) ----------
  // Small per-person balance display + collapsible correction, shared with the allowance editor.
  function BalanceCorrection({ name, balance, value, onChange, open, onToggle, noun }) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Current balance</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: balance < 0 ? "var(--terra)" : "var(--sage)" }}>
            {balance < 0 ? "−€" + Math.round(Math.abs(balance)) : "€" + Math.round(balance)}
          </span>
        </div>
        <button className="linklike" style={{ fontSize: 12, color: "var(--ink-2)" }} onClick={onToggle}>
          {open ? "Hide balance correction" : "Correct balance…"}
        </button>
        {open && (
          <div style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10, lineHeight: 1.5 }}>
              Override the calculated balance. Enter the actual {noun} available right now. Future accruals and spending apply on top.
            </p>
            <div className="field">
              <label>Set balance to (€)</label>
              <input className="inp inp-num" inputMode="numeric" value={value}
                onChange={(e) => onChange(e.target.value.replace(/[^-\d]/g, ""))}
                style={{ textAlign: "center", fontSize: 18 }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  function FunBudgetSheet({ open, onClose, store, setStore, stats }) {
    const currentYM = new Date().toISOString().slice(0, 7);
    const people = store.people || [];
    const latestRate = (p) => { let best = 0; (p.rates || []).forEach((r) => { if (r.from <= currentYM) best = r.amount; }); return best; };
    // Balances (with existing adjustments) as of open; store is frozen while the sheet is open.
    const balances = React.useMemo(() => {
      if (!open) return {};
      const m = {};
      YCalc.computeFun(store).people.forEach((pd) => { m[pd.id] = pd.balance; });
      return m;
    }, [open, store]);

    const [rates, setRates] = React.useState({});
    const [bals, setBals] = React.useState({});
    const [balOpen, setBalOpen] = React.useState({});
    React.useEffect(() => {
      if (open) {
        const r = {}, b = {};
        people.forEach((p) => { r[p.id] = String(latestRate(p)); b[p.id] = String(Math.round(balances[p.id] || 0)); });
        setRates(r); setBals(b); setBalOpen({});
      }
    }, [open]);

    const save = () => {
      setStore((s) => {
        const updated = (s.people || []).map((p) => {
          const amount = parseInt(rates[p.id]) || 0;
          const rs = (p.rates || []).slice();
          const idx = rs.findIndex((r) => r.from === currentYM);
          if (idx >= 0) rs[idx] = { from: currentYM, amount };
          else rs.push({ from: currentYM, amount });
          rs.sort((a, b) => (a.from < b.from ? -1 : 1));
          // Back-calculate the adjustment that lands the balance on the entered target.
          const existingAdj = p.balanceAdjustment || 0;
          const rawBalance = (balances[p.id] || 0) - existingAdj;
          const targetBalance = parseInt(bals[p.id]);
          const newAdj = isNaN(targetBalance) ? existingAdj : targetBalance - rawBalance;
          return { ...p, rates: rs, balanceAdjustment: Math.round(newAdj) };
        });
        return { ...s, people: updated };
      });
      onClose();
    };

    return (
      <Sheet open={open} onClose={onClose} title="Fun budget">
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          Each person's monthly allowance, effective from {currentYM} onwards — past months keep their old rate.
        </p>
        {people.map((p) => (
          <div key={p.id} className="panel panel-pad" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{p.name}</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Monthly allowance (€)</label>
              <input className="inp inp-num" inputMode="numeric" value={rates[p.id] || ""}
                onChange={(e) => setRates((r) => ({ ...r, [p.id]: e.target.value.replace(/[^\d]/g, "") }))}
                style={{ textAlign: "center", fontSize: 18 }} />
            </div>
            <BalanceCorrection
              name={p.name} noun={"balance " + p.name + " should have"}
              balance={balances[p.id] || 0}
              value={bals[p.id] || ""}
              onChange={(val) => setBals((b) => ({ ...b, [p.id]: val }))}
              open={!!balOpen[p.id]}
              onToggle={() => setBalOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
            />
          </div>
        ))}
        {stats && (
          <div style={{ padding: "2px 2px 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
            {eur0(stats.ceiling)} ceiling = {eur0(stats.mainTarget)} main + {eur0(stats.funPlanAnnual)}/yr fun
          </div>
        )}
        <Button variant="primary" block onClick={save}>Save</Button>
      </Sheet>
    );
  }

  // ---------- Travel budget config (family-wide) ----------
  function TravelConfigSheet({ open, onClose, store, setStore }) {
    const currentYM = new Date().toISOString().slice(0, 7);
    const travel = store.travel || { rates: [], startMonth: currentYM, balanceAdjustment: 0 };
    const latestRate = (() => {
      let best = 0;
      (travel.rates || []).forEach((r) => { if (r.from <= currentYM) best = r.amount; });
      return best;
    })();
    const [v, setV] = React.useState(String(latestRate));
    const [balMode, setBalMode] = React.useState(false);
    const currentBalance = React.useMemo(() => {
      if (!open) return 0;
      return YCalc.computeTravel(store).balance;
    }, [open, store]);
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
        const t = s.travel || { rates: [], startMonth: currentYM, balanceAdjustment: 0 };
        const rates = (t.rates || []).slice();
        const idx = rates.findIndex((r) => r.from === currentYM);
        if (idx >= 0) rates[idx] = { from: currentYM, amount };
        else rates.push({ from: currentYM, amount });
        rates.sort((a, b) => (a.from < b.from ? -1 : 1));
        // Back-calculate the adjustment that preserves the balance shown to the user.
        const existingAdj = t.balanceAdjustment || 0;
        const rawBalance = currentBalance - existingAdj;
        const targetBalance = parseInt(balVal);
        const newAdj = isNaN(targetBalance) ? existingAdj : targetBalance - rawBalance;
        return { ...s, travel: { ...t, rates, balanceAdjustment: Math.round(newAdj) } };
      });
      onClose();
    };

    return (
      <Sheet open={open} onClose={onClose} title="Travel budget">
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          A household travel allowance that accrues from {currentYM} onwards — past months keep their old rate. Tag a
          transaction as “Travel” to draw it down.
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
                Override the calculated balance. Enter the actual travel budget available right now. Future accruals and spending apply on top.
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

  function ClearSheet({ open, onClose }) {
    const [v, setV] = React.useState("");
    React.useEffect(() => { if (open) setV(""); }, [open]);
    const doClear = async () => {
      if (window.caches) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      // Wipe the ENTIRE yearly: namespace, not just the store. Removing only
      // 'yearly:store:v1' left the sync bookkeeping behind — notably
      // 'yearly:settings:appliedAt' and 'yearly:bootstrapped' — so on reload
      // bootstrap() no-oped and pull() gated the settings blob out
      // (updated_at <= appliedAt). Transactions re-hydrated but settings
      // (people/years/trips/…) did not, leaving e.g. "No trips yet" after a clear.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('yearly:'))
        .forEach((k) => localStorage.removeItem(k));
      window.location.reload();
    };
    return (
      <Sheet open={open} onClose={onClose} title="Clear all data">
        <p className="muted" style={{ fontSize: 13.5, marginTop: 0, lineHeight: 1.5 }}>
          Clears all local data and the app cache. <b>Server data is preserved</b> — everything will be re-fetched on next load. Type <b style={{ color: "var(--alert)" }}>DELETE</b> to confirm.
        </p>
        <input className="inp" value={v} onChange={(e) => setV(e.target.value)} placeholder="DELETE" style={{ marginBottom: 16, textAlign: "center", letterSpacing: "0.1em" }} />
        <Button variant="primary" block disabled={v !== "DELETE"} onClick={doClear}>Clear local data &amp; reload</Button>
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

  // ---------- Combined ceiling + missed-entry buffer (current year) ----------
  function CeilingBufferSheet({ open, onClose, store, setStore }) {
    const yr = Number(store.currentYear);
    const getCeiling = (s) => { const y = s.years[String(yr)] || {}; return y.ceiling != null ? y.ceiling : (y.target || 25000); };
    const [v, setV] = React.useState(String(getCeiling(store)));
    const [buf, setBuf] = React.useState(Math.round(((store.years[String(yr)] || {}).buffer || 0) * 100));
    React.useEffect(() => {
      if (open) {
        setV(String(getCeiling(store)));
        setBuf(Math.round(((store.years[String(yr)] || {}).buffer || 0) * 100));
      }
    }, [open]);
    // Projection is independent of the ceiling, so this preview is safe even while the ceiling is edited.
    const buffStats = YCalc.computeStats(store, yr);
    const preview = buffStats.projNoBuffer * (1 + buf / 100);
    return (
      <Sheet open={open} onClose={onClose} title={`${yr} household ceiling`}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>Your total annual outflow ceiling — the sacred number everything is measured against.</p>
        <div className="amount-display"><span className="cur">€</span><span className="num">{v || "0"}</span></div>
        <input className="inp inp-num" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} style={{ textAlign: "center", fontSize: 18, marginBottom: 4 }} />

        <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 16, marginTop: 16, marginBottom: 8 }}>
          <div className="field-label" style={{ marginBottom: 4 }}>Missed-entry buffer</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.5 }}>People forget to log things. This lifts the projection by a flat percentage so it isn't artificially optimistic.</p>
          <div style={{ textAlign: "center", margin: "8px 0 14px" }}>
            <div className="num" style={{ fontSize: 40, fontWeight: 600 }}>{buf}%</div>
            <div className="muted" style={{ fontSize: 13 }}>projection {eur0(buffStats.projNoBuffer)} → <span style={{ color: "var(--ink)" }} className="num">{eur0(preview)}</span></div>
          </div>
          <div className="rangewrap" style={{ marginBottom: 8 }}>
            <span className="muted num">0%</span>
            <input className="rng" type="range" min="0" max="15" step="1" value={buf} onChange={(e) => setBuf(parseInt(e.target.value))}
              style={{ "--rng-fill": `${Math.round(buf / 15 * 100)}%` }} />
            <span className="muted num">15%</span>
          </div>
        </div>

        <Button variant="primary" block disabled={!(parseInt(v) > 0)} onClick={() => {
          setStore((s) => {
            const yr_ = s.years[String(yr)] || {};
            const updated = { ...yr_, ceiling: parseInt(v), buffer: buf / 100 };
            delete updated.target;
            return { ...s, years: { ...s.years, [String(yr)]: updated } };
          });
          onClose();
        }}>Save</Button>
      </Sheet>
    );
  }

  // ---------- Import / Export submenus ----------
  const SAMPLE_JSON = `{
  "currentYear": 2026,
  "years": { "2026": { "ceiling": 25000, "buffer": 0.04 } },
  "people": [ { "id": "…", "name": "Joseph", "rates": […] } ],
  "travel": { "rates": […], "startMonth": "2026-01" },
  "trips": [ … ],
  "templates": [ … ],
  "transactions": [
    { "id": "…", "date": "2026-06-02", "description": "Billa",
      "amount_eur": 42.18, "category": "groceries" }
  ]
}`;

  function ImportMenuSheet({ open, onClose, onPick }) {
    return (
      <Sheet open={open} onClose={onClose} title="Import">
        <div className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
          <Row icon="revolut" title="Import Revolut" sub="paste raw JSON, preserves your edits" onClick={() => onPick("revolut")} />
          <Row icon="upload" title="Import CSV" sub="with duplicate detection" onClick={() => onPick("csv")} />
          <Row icon="download" title="Import JSON" sub="replace all data from a full backup" onClick={() => document.getElementById("jsonfile").click()} />
        </div>
        <div className="field-label" style={{ marginBottom: 6 }}>What a JSON backup looks like</div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 8, lineHeight: 1.5 }}>
          The whole store object — every year, person, template and transaction. Importing replaces
          <b> all</b> current data. Make one with Export → JSON.
        </p>
        <pre style={{ background: "var(--paper-2, var(--hair))", border: "1px solid var(--hair)", borderRadius: 8, padding: "10px 12px", overflowX: "auto", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.45, color: "var(--ink-2)", margin: 0 }}>{SAMPLE_JSON}</pre>
      </Sheet>
    );
  }

  function ExportMenuSheet({ open, onClose, store }) {
    return (
      <Sheet open={open} onClose={onClose} title="Export">
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="download" title="Export CSV" sub="every transaction, one row each" onClick={() => { exportCSV(store); onClose(); }} />
          <Row icon="download" title="Export JSON" sub="full backup incl. years, people & templates" onClick={() => { backupJSON(store); onClose(); }} />
        </div>
      </Sheet>
    );
  }

  function SettingsScreen({ store, setStore, stats, lastSyncTs }) {
    const [sub, setSub] = React.useState(null);
    const [funOpen, setFunOpen] = React.useState(false);
    const [travelOpen, setTravelOpen] = React.useState(false);
    const [syncing, setSyncing] = React.useState(false);
    const cur = store.years[String(store.currentYear)];
    const curCeiling = cur.ceiling != null ? cur.ceiling : (cur.target || 25000);
    const currentYM = new Date().toISOString().slice(0, 7);

    // Travel: annual aggregate = latest monthly rate × 12; balance shown as the sub.
    let travelRate = 0;
    ((store.travel && store.travel.rates) || []).forEach((r) => { if (r.from <= currentYM) travelRate = r.amount; });
    const travelBal = YCalc.computeTravel(store).balance;
    const travelBalStr = travelBal < 0 ? "−" + eur0(Math.abs(travelBal)) + " owed" : eur0(travelBal) + " available";

    return (
      <div className="screen">
        <div className="section-h" style={{ marginTop: 0 }}><h2>Budget settings</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="target" title="Household ceiling" sub={`${store.currentYear} ceiling · ${Math.round((cur.buffer || 0) * 100)}% buffer`} value={eur0(curCeiling)} onClick={() => setSub("ceiling")} />
          <Row icon="clock" title="Past years" sub="target vs actual history" onClick={() => setSub("years")} />
          <Row icon="activity" title="Fun budget" sub="per-person allowances & balances" value={stats ? eur0(stats.funPlanAnnual) + "/yr" : undefined} onClick={() => setFunOpen(true)} />
          <Row icon="travel" title="Travel budget" sub={travelBalStr} value={eur0(travelRate * 12) + "/yr"} onClick={() => setTravelOpen(true)} />
        </div>

        <div className="section-h"><h2>Data settings</h2></div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <Row icon="layers" title="Quick templates" sub={`${store.templates.length} templates`} onClick={() => setSub("templates")} />
          <Row icon="upload" title="Import" sub="Revolut, CSV or JSON" onClick={() => setSub("import")} />
          <Row icon="download" title="Export" sub="CSV or JSON backup" onClick={() => setSub("export")} />
          <Row icon="refresh" title={syncing ? "Resyncing…" : "Force resync from server"}
            sub="refetches every row (escape hatch if the app looks out of date)"
            onClick={async () => {
              const before = store.transactions.length;
              setSyncing(true);
              await window.YSync.pull({ force: true });
              setSyncing(false);
              // Snapshot count after pull: setStore is async, so read from the latest store via a ref isn't trivial here.
              // We rely on the next render to reflect the merged state; the alert quotes the before/after delta from localStorage.
              try {
                const raw = localStorage.getItem('yearly:store:v1');
                const after = raw ? (JSON.parse(raw).transactions || []).length : before;
                const delta = after - before;
                if (delta === 0) alert(`Resync complete — no new transactions (${after} total).`);
                else             alert(`Resync complete — ${delta > 0 ? '+' : ''}${delta} transactions (${after} total).`);
              } catch { /* swallow display errors */ }
            }} />
          <Row icon="trash" title="Clear all data" sub="delete every local transaction" danger onClick={() => setSub("clear")} />
        </div>

        {/* Hidden JSON restore input — kept mounted here so the Import submenu can trigger it. */}
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
              setSub(null);
            });
          }} />

        <div className="muted" style={{ textAlign: "center", fontSize: 11.5, marginTop: 6, fontFamily: "var(--mono)" }}>Yearly · {APP_VERSION}</div>
        {lastSyncTs != null && (() => {
          const ageDays = Math.max(0, Math.floor((Date.now() - lastSyncTs) / 86400000));
          return (
            <div className="muted" style={{ textAlign: "center", fontSize: 11, marginTop: 3, fontFamily: "var(--mono)" }}>
              Data as of {localISO(new Date(lastSyncTs))} · {ageDays} {ageDays === 1 ? 'day' : 'days'} ago
            </div>
          );
        })()}

        <CeilingBufferSheet open={sub === "ceiling"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <YearsSheet open={sub === "years"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <TemplatesSheet open={sub === "templates"} onClose={() => setSub(null)} store={store} setStore={setStore} />
        <ImportMenuSheet open={sub === "import"} onClose={() => setSub(null)} onPick={(k) => setSub(k === "csv" ? "import-csv" : "import-revolut")} />
        <ImportSheet open={sub === "import-csv"} onClose={() => setSub("import")} store={store} setStore={setStore} />
        <RevolutImportSheet open={sub === "import-revolut"} onClose={() => setSub("import")} store={store} />
        <ExportMenuSheet open={sub === "export"} onClose={() => setSub(null)} store={store} />
        <ClearSheet open={sub === "clear"} onClose={() => setSub(null)} />
        <FunBudgetSheet open={funOpen} onClose={() => setFunOpen(false)} store={store} setStore={setStore} stats={stats} />
        <TravelConfigSheet open={travelOpen} onClose={() => setTravelOpen(false)} store={store} setStore={setStore} />
      </div>
    );
  }

  window.YSettings = { SettingsScreen };
})();
