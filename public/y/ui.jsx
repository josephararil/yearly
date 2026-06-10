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

  // DeltaChip: restyled to a bare mono terra/sage figure for future reuse — no background chip.
  function DeltaChip({ delta, status }) {
    const color = status === "good" ? "var(--sage)" : status === "alert" ? "var(--terra)" : status === "watch" ? "var(--amber)" : "var(--ink-2)";
    return (
      <span className="num" style={{ fontWeight: 700, fontSize: "13px", color, letterSpacing: 0 }}>
        {signedEur(delta)}
      </span>
    );
  }

  // Status hero — no card. Serif ink number; combined vs ceiling; pace rule; main/fun decomp.
  function StatusHero({ stats }) {
    // Headline: combined projection for current/complete; ceiling for future
    const headline = stats.isFuture ? stats.ceiling : stats.combinedProjection;
    const eyebrow = stats.complete ? "Final combined spend · " + stats.year
      : stats.isFuture ? "Household ceiling · " + stats.year
      : "Projected year-end";
    const over = stats.combinedDelta >= 0;
    const near = Math.abs(stats.combinedDelta) < stats.ceiling * 0.005;
    // Pace fills to combined vs ceiling
    const fillPct = Math.max(0, Math.min(100, (stats.combinedProjection / stats.ceiling) * 100));
    const markPct = Math.max(0, Math.min(100, (stats.doy / 365) * 100));
    const mainColor = stats.status === "good" ? "var(--sage)" : stats.status === "alert" ? "var(--terra)" : "var(--amber)";
    return (
      <div className="hero">
        <div className="eyebrow">{eyebrow}</div>
        <div className="hero-num">{eur0(headline)}</div>
        <div className="hero-sub">
          {stats.isFuture ? (
            <>Nothing logged yet.</>
          ) : near ? (
            <>On your <span className="num">{eur0(stats.ceiling)}</span> ceiling.</>
          ) : (
            <>
              {over ? "Over" : "Under"} your <span className="num">{eur0(stats.ceiling)}</span> ceiling by{" "}
              <span className={"hero-emph " + (over ? "over" : "under")}>{eur0(Math.abs(stats.combinedDelta))}</span>.
            </>
          )}
        </div>
        {!stats.isFuture && (
          <>
            <div className="pace-rule">
              <div className="pace-fill" style={{ width: fillPct + "%" }} />
              {!stats.complete && <div className="pace-mark" style={{ left: markPct + "%" }} />}
            </div>
            <div className="pace-legend">
              <span>{eur0(stats.spent + stats.funSpent)} spent</span>
              <span>{stats.complete ? "year complete" : "day " + stats.doy + " / 365"}</span>
            </div>
            <div className="pace-legend">
              <span style={{ color: mainColor }}>main {eur0(stats.projection)} / {eur0(stats.mainTarget)}</span>
              <span style={{ color: "var(--ink-2)" }}>fun {eur0(stats.funProjection)}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // Callout — hairline list row: severity dot + sentence + faded serif arrow. No card, no icon chip.
  function CalloutCard({ c, onClick }) {
    const dotColor = c.severity === "alert" ? "var(--terra)" : c.severity === "watch" ? "var(--amber)" : "var(--sage)";
    return (
      <button className="callout" onClick={onClick}>
        <span className="callout-dot" style={{ background: dotColor }} />
        <span className="callout-body">
          <span className="callout-text">{rich(c.text)}</span>
        </span>
        <span className="callout-arrow">{"→"}</span>
      </button>
    );
  }

function TxRow({ t, onClick }) {
    const c = YData.cat(t.category);
    return (
      <button className="txrow" onClick={onClick}>
        {t.merchant_logo
          ? <img className="tx-logo" src={t.merchant_logo} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'grid'; }} />
          : null}
        <span className="cat-ic" style={{ width: 24, height: 24, borderRadius: 6, background: tint(c.color, "22"), color: c.color, display: t.merchant_logo ? 'none' : 'grid' }}>
          <Icon name={c.icon} size={12} />
        </span>
        <span className="tx-main">
          <div className="tx-desc">{t.description}</div>
          <div className="tx-meta">{fmtDateShort(t.date)} · {c.label}{t.source === "import" ? " · imported" : ""}{t.merchant_city ? ` · ${t.merchant_city}` : ""}</div>
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

  function SectionH({ title, action, onAction, meta }) {
    return (
      <div className="section-h">
        <h2>{title}</h2>
        <span className="spacer" />
        {meta && <span className="sec-meta">{meta}</span>}
        {action && <button className="linklike" onClick={onAction}>{action}<Icon name="chevronRight" size={14} /></button>}
      </div>
    );
  }

  window.YUI = { CatIcon, DeltaChip, StatusHero, CalloutCard, TxRow, Sheet, SectionH, Toast, rich, tint };
})();
