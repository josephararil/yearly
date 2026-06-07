// ui.jsx — shared presentational primitives. Exposed on window.
(function () {
  const { Icon, YData, YCalc } = window;
  const { eur0, eurAuto, signedEur, fmtDateShort, fmtDateLong } = YCalc;

  // tint a hex color with alpha (e.g. "#32d74b" -> "#32d74b26")
  const tint = (hex, aa) => hex + aa;

  function CatIcon({ catId, size = 40, radius = 12, iconSize }) {
    const c = YData.cat(catId);
    return (
      <span className="cat-ic" style={{ width: size, height: size, borderRadius: radius, background: tint(c.color, "22"), color: c.color }}>
        <Icon name={c.icon} size={iconSize || Math.round(size * 0.5)} />
      </span>
    );
  }

  // wrap numbers / currency / percent in mono spans
  function rich(text) {
    const re = /(€[\d.,]+|[+−-]?\d[\d.,]*%?|day \d+ of \d+|\d+\/\d+)/g;
    const out = []; let last = 0; let m; let i = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(<span key={i++} className="num">{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function DeltaChip({ delta, status, label }) {
    const cls = status === "good" ? "bg-good" : status === "alert" ? "bg-alert" : status === "watch" ? "bg-watch" : "bg-info";
    const over = delta >= 0;
    return (
      <span className={"delta-chip " + cls}>
        <Icon name={over ? "arrowUpRight" : "arrowDownRight"} size={14} />
        <span className="num">{signedEur(delta)}</span>
        <span style={{ opacity: 0.8, fontWeight: 500 }}>{label || (over ? "over" : "under")}</span>
      </span>
    );
  }

  function StatusHero({ stats }) {
    const statusCls = "status-" + stats.status;
    const headline = stats.complete ? stats.spent : stats.projection;
    const eyebrow = stats.complete ? "Final spend · " + stats.year : "Projected year-end";
    return (
      <div className="panel hero">
        <div className="eyebrow">{eyebrow}</div>
        <div className={"hero-num num " + statusCls}>{eur0(headline)}</div>
        <div className="hero-sub">
          <span className="hero-target">vs <span className="num">{eur0(stats.target)}</span> target</span>
          <DeltaChip delta={stats.delta} status={stats.status} />
        </div>
        <div className="hero-foot">
          <span className="num">{eur0(stats.spent)}</span> spent{stats.complete ? "" : <> · day <span className="num">{stats.doy}</span> of <span className="num">365</span></>}
        </div>
      </div>
    );
  }

  function CalloutCard({ c, onClick }) {
    const sevCls = c.severity === "alert" ? "bg-alert" : c.severity === "watch" ? "bg-watch" : c.severity === "good" ? "bg-good" : "bg-info";
    const icStyle = c.accent ? { background: tint(c.accent, "22"), color: c.accent } : undefined;
    const showTag = c.severity === "alert" || c.severity === "watch";
    return (
      <button className="callout" onClick={onClick}>
        <span className={"callout-ic " + (c.accent ? "" : sevCls)} style={icStyle}>
          <Icon name={c.icon} size={19} />
        </span>
        <span className="callout-body">
          {showTag && <div className={"callout-tag " + (c.severity === "alert" ? "status-alert" : "status-watch")}>{c.severity === "alert" ? "Worth a look" : "Watch"}</div>}
          <div className="callout-text">{rich(c.text)}</div>
        </span>
        <span className="callout-chev"><Icon name="chevronRight" size={16} /></span>
      </button>
    );
  }

  function TxRow({ t, onClick }) {
    const c = YData.cat(t.category);
    return (
      <button className="txrow" onClick={onClick}>
        <CatIcon catId={t.category} />
        <span className="tx-main">
          <div className="tx-desc">{t.description}</div>
          <div className="tx-meta">{fmtDateShort(t.date)} · {c.label}{t.source === "import" ? " · imported" : ""}</div>
        </span>
        <span className="tx-amt num">{eurAuto(t.amount_eur)}</span>
      </button>
    );
  }

  function Sheet({ open, onClose, title, headRight, children }) {
    const [mounted, setMounted] = React.useState(open);
    const [shown, setShown] = React.useState(false);
    React.useEffect(() => {
      if (open) { setMounted(true); const r = setTimeout(() => setShown(true), 20); return () => clearTimeout(r); }
      else { setShown(false); const t = setTimeout(() => setMounted(false), 340); return () => clearTimeout(t); }
    }, [open]);
    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape" && open) onClose(); };
      window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!mounted) return null;
    return (
      <>
        <div className={"sheet-scrim" + (shown ? " open" : "")} onClick={onClose} />
        <div className={"sheet" + (shown ? " open" : "")} role="dialog" aria-modal="true">
          <div className="grabber" />
          {title && (
            <div className="sheet-head">
              <h3>{title}</h3>
              <span className="spacer" style={{ flex: 1 }} />
              {headRight}
            </div>
          )}
          <div className="sheet-scroll">{children}</div>
        </div>
      </>
    );
  }

  function Toast({ open, message, actionLabel, onAction, onDismiss }) {
    const [mounted, setMounted] = React.useState(open);
    const [shown, setShown] = React.useState(false);
    React.useEffect(() => {
      if (open) { setMounted(true); const r = setTimeout(() => setShown(true), 20); return () => clearTimeout(r); }
      else { setShown(false); const t = setTimeout(() => setMounted(false), 240); return () => clearTimeout(t); }
    }, [open]);
    React.useEffect(() => {
      if (!open) return;
      const t = setTimeout(onDismiss, 5000);
      return () => clearTimeout(t);
    }, [open, message]);
    if (!mounted) return null;
    return (
      <div className={"toast" + (shown ? " open" : "")} role="status">
        <span className="toast-msg">{message}</span>
        {actionLabel && <button className="toast-btn" onClick={onAction}>{actionLabel}</button>}
      </div>
    );
  }

  function SectionH({ title, action, onAction }) {
    return (
      <div className="section-h">
        <h2>{title}</h2>
        <span className="spacer" />
        {action && <button className="linklike" onClick={onAction}>{action}<Icon name="chevronRight" size={14} /></button>}
      </div>
    );
  }

  window.YUI = { CatIcon, DeltaChip, StatusHero, CalloutCard, TxRow, Sheet, SectionH, Toast, rich, tint };
})();
