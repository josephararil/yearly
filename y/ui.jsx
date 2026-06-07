// ui.jsx — shared presentational primitives. Exposed on window.
(function () {
  const { Icon, YData, YCalc } = window;
  const { eur0, eurAuto, signedEur, fmtDateShort, fmtDateLong } = YCalc;

  // tint a hex color with alpha (e.g. "#32d74b" -> "#32d74b26")
  const tint = (hex, aa) => hex + aa;

  // first-of-month day-of-year offsets; month initials for the spend curve axis
  const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const eurK = (v) => (Math.abs(v) >= 1000 ? "€" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k" : "€" + Math.round(v));

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

  // Status hero — no card. Serif ink number; over/under carried by a small mono terra/sage
  // figure; a pace rule (terra fill to spent/target, ink marker at day-of-year).
  function StatusHero({ stats }) {
    const headline = stats.isFuture ? stats.mainTarget : stats.complete ? stats.spent : stats.projection;
    const eyebrow = stats.complete ? "Final spend · " + stats.year
      : stats.isFuture ? "Main budget · " + stats.year
      : "Projected year-end";
    const over = stats.delta >= 0;
    const near = Math.abs(stats.delta) < stats.mainTarget * 0.005;
    const fillPct = Math.max(0, Math.min(100, (stats.spent / stats.mainTarget) * 100));
    const markPct = Math.max(0, Math.min(100, (stats.doy / 365) * 100));
    return (
      <div className="hero">
        <div className="eyebrow">{eyebrow}</div>
        <div className="hero-num">{eur0(headline)}</div>
        <div className="hero-sub">
          {stats.isFuture ? (
            <>Nothing logged yet.</>
          ) : near ? (
            <>On your <span className="num">{eur0(stats.mainTarget)}</span> main budget.</>
          ) : (
            <>
              {over ? "Over" : "Under"} your <span className="num">{eur0(stats.mainTarget)}</span> main budget by{" "}
              <span className={"hero-emph " + (over ? "over" : "under")}>{eur0(Math.abs(stats.delta))}</span>.
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
              <span>{eur0(stats.spent)} spent</span>
              <span>{stats.complete ? "year complete" : "day " + stats.doy + " / 365"}</span>
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

  // Broadsheet spend curve — themed SVG (dependency-free, mirrors the reference SpendChart):
  // terra actual area + line, muted-terra dashed projection, dashed target reference, faint pace.
  function SpendCurve({ stats }) {
    const W = 360, H = 168, padL = 38, padR = 8, padT = 10, padB = 22;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const maxY = Math.max(stats.mainTarget, stats.projection, 1) * 1.08;
    const sx = (d) => x0 + (d / 365) * (x1 - x0);
    const sy = (v) => y1 - (v / maxY) * (y1 - y0);
    const cum = YCalc.cumulativeByDay(stats.upto);
    const endDay = stats.complete ? 365 : Math.max(1, stats.doy);

    const days = [];
    for (let d = 0; d <= endDay; d += 7) days.push(d);
    if (days[days.length - 1] !== endDay) days.push(endDay);
    const actPts = days.map((d) => [sx(d), sy(cum[Math.min(365, d)])]);
    const actLine = actPts.map((p) => p.join(",")).join(" ");
    const areaPts = `${x0},${y1} ${actLine} ${actPts[actPts.length - 1][0]},${y1}`;

    const yTicks = [0, stats.mainTarget / 2, stats.mainTarget];
    const uid = "sc" + stats.year;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-actual)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--chart-actual)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={x0} y1={sy(v)} x2={x1} y2={sy(v)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={x0 - 6} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="var(--chart-axis)" fontFamily="var(--mono)">{eurK(v)}</text>
          </g>
        ))}
        {[0, 2, 4, 6, 8, 10].map((m) => (
          <text key={m} x={sx(MONTH_STARTS[m])} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--chart-axis)" fontFamily="var(--mono)">{MONTH_INITIALS[m]}</text>
        ))}
        {/* faint linear pace diagonal */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(365)} y2={sy(stats.mainTarget)} stroke="var(--chart-pace)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
        {/* target reference */}
        <line x1={x0} y1={sy(stats.mainTarget)} x2={x1} y2={sy(stats.mainTarget)} stroke="var(--chart-target)" strokeWidth="1.2" strokeDasharray="4 4" />
        <text x={x1} y={sy(stats.mainTarget) - 5} textAnchor="end" fontSize="10" fill="var(--chart-target)" fontFamily="var(--mono)">target {eurK(stats.mainTarget)}</text>
        {/* actual area + line */}
        <polygon points={areaPts} fill={`url(#${uid})`} />
        <polyline points={actLine} fill="none" stroke="var(--chart-actual)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* projection */}
        {!stats.complete && !stats.isFuture && (
          <line x1={sx(stats.doy)} y1={sy(stats.spent)} x2={sx(365)} y2={sy(stats.projection)} stroke="var(--chart-proj)" strokeWidth="2.2" strokeDasharray="6 5" strokeLinecap="round" />
        )}
      </svg>
    );
  }

  function TxRow({ t, onClick }) {
    const c = YData.cat(t.category);
    return (
      <button className="txrow" onClick={onClick}>
        <span className="cat-dot" style={{ background: c.color }} />
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

  window.YUI = { CatIcon, DeltaChip, StatusHero, CalloutCard, TxRow, SpendCurve, Sheet, SectionH, Toast, rich, tint };
})();
