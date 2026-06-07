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

  function PaceBar({ stats }) {
    const fillPct = Math.min(100, (stats.spent / stats.target) * 100);
    const markPct = Math.min(100, (stats.doy / 365) * 100);
    const projPct = Math.min(112, (stats.projection / stats.target) * 100);
    const col = stats.status === "good" ? "var(--good)" : stats.status === "alert" ? "var(--alert)" : stats.status === "watch" ? "var(--watch)" : "var(--accent)";
    return (
      <div>
        <div className="pacebar">
          {!stats.complete && (
            <div className="pacebar-fill" style={{ width: projPct + "%", background: "var(--surface-sunk)", opacity: 1, outline: "1px dashed var(--hairline-strong)" }} />
          )}
          <div className="pacebar-fill" style={{ width: fillPct + "%", background: col }} />
          {!stats.complete && <div className="pacebar-mark" data-label="on-pace" style={{ left: markPct + "%" }} />}
        </div>
        <div className="pacebar-legend">
          <span className="num">€0</span>
          <span><span className="num">{eur0(stats.target)}</span> target</span>
        </div>
      </div>
    );
  }

  function GaugeHero({ stats }) {
    const ratio = stats.complete ? stats.spent / stats.target : stats.projection / stats.target;
    const shown = Math.min(1.18, ratio);
    const R = 78, C = Math.PI * R; // semicircle
    const dash = C * Math.min(1, shown);
    const col = stats.status === "good" ? "var(--good)" : stats.status === "alert" ? "var(--alert)" : "var(--watch)";
    return (
      <div className="gauge-wrap">
        <svg width="200" height="118" viewBox="0 0 200 118">
          <path d="M14 104 A86 86 0 0 1 186 104" fill="none" stroke="var(--surface-sunk)" strokeWidth="13" strokeLinecap="round" />
          <path d="M14 104 A86 86 0 0 1 186 104" fill="none" stroke={col} strokeWidth="13" strokeLinecap="round"
            strokeDasharray={`${(Math.PI * 86) * Math.min(1, shown)} 999`} />
          {/* target tick at 100% */}
          <line x1="100" y1="12" x2="100" y2="26" stroke="var(--text-2)" strokeWidth="2" />
          <text x="100" y="74" textAnchor="middle" className="gauge-num num" fill="currentColor">{Math.round(ratio * 100)}%</text>
          <text x="100" y="92" textAnchor="middle" className="gauge-label" fill="var(--text-3)">of target</text>
        </svg>
      </div>
    );
  }

  function ProjSpark({ stats }) {
    const w = 300, h = 84, pad = 6;
    const maxY = Math.max(stats.target, stats.projection) * 1.05;
    const sx = (x) => pad + (x / 365) * (w - pad * 2);
    const sy = (v) => h - pad - (v / maxY) * (h - pad * 2);
    const actualPts = stats.series.filter((p) => p.actual != null).map((p) => `${sx(p.x)},${sy(p.actual)}`).join(" ");
    const targetY = sy(stats.target);
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} preserveAspectRatio="none">
        <line x1={pad} y1={targetY} x2={w - pad} y2={targetY} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="4 4" />
        {!stats.complete && (
          <line x1={sx(stats.doy)} y1={sy(stats.spent)} x2={sx(365)} y2={sy(stats.projection)}
            stroke="var(--watch)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        )}
        <polyline points={actualPts} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {!stats.complete && <circle cx={sx(stats.doy)} cy={sy(stats.spent)} r="3.4" fill="var(--accent)" />}
      </svg>
    );
  }

  function StatusHero({ stats, variant }) {
    const statusCls = "status-" + stats.status;
    const headline = stats.complete ? stats.spent : stats.projection;
    const eyebrow = stats.complete ? "Final spend · " + stats.year : "Projected year-end";
    return (
      <div className="panel hero">
        <div className="eyebrow">{eyebrow}</div>
        {variant === "gauge" && <GaugeHero stats={stats} />}
        <div className={"hero-num num " + statusCls}>{eur0(headline)}</div>
        <div className="hero-sub">
          <span className="hero-target">vs <span className="num">{eur0(stats.target)}</span> target</span>
          <DeltaChip delta={stats.delta} status={stats.status} />
        </div>
        {variant === "bar" && <PaceBar stats={stats} />}
        {variant === "projection" && <div style={{ marginTop: 16 }}><ProjSpark stats={stats} /></div>}
        {variant !== "bar" && (
          <div className="hero-foot">
            <span className="num">{eur0(stats.spent)}</span> spent{stats.complete ? "" : <> · day <span className="num">{stats.doy}</span> of <span className="num">365</span></>}
          </div>
        )}
        {variant === "bar" && (
          <div className="hero-foot" style={{ marginTop: 30 }}>
            <span className="num">{eur0(stats.spent)}</span> spent · pace expects <span className="num">{eur0(stats.pace)}</span> by today
          </div>
        )}
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

  function SectionH({ title, action, onAction }) {
    return (
      <div className="section-h">
        <h2>{title}</h2>
        <span className="spacer" />
        {action && <button className="linklike" onClick={onAction}>{action}<Icon name="chevronRight" size={14} /></button>}
      </div>
    );
  }

  window.YUI = { CatIcon, DeltaChip, PaceBar, StatusHero, CalloutCard, TxRow, Sheet, SectionH, rich, tint };
})();
