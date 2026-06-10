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

  // Status hero — Zone 1 (reality block) + Zone 2 (bullet bar) + Zone 3 placeholder.
  function StatusHero({ stats }) {
    const [tip, setTip] = React.useState({ open: false, x: 0 });

    const headline = stats.isFuture ? stats.ceiling : stats.combinedProjection;
    const eyebrow = stats.complete
      ? "Final combined spend · " + stats.year
      : stats.isFuture
      ? "Household ceiling · " + stats.year
      : "Projected year-end";
    const over = stats.combinedDelta >= 0;
    const near = Math.abs(stats.combinedDelta) < stats.ceiling * 0.005;
    const totalSpent = stats.spent + stats.funSpent;

    // bullet bar coordinate system (viewBox 0 0 100 60)
    const xMax = Math.max(stats.ceiling, stats.combinedProjection, 1) * 1.02;
    const scaleX = (v) => (v / xMax) * 100;
    const showProjTick = !near;

    // compact label formatter: €21.4k, €25k, €500
    const eurK = (v) => {
      if (v >= 10000) return '€' + Math.round(v / 1000) + 'k';
      if (v >= 1000) return '€' + (Math.round(v / 100) / 10) + 'k';
      return eur0(v);
    };

    // labels sorted left-to-right; alternating y=44/52 prevents collision
    const labelSet = [
      { id: 'spent', x: scaleX(totalSpent), text: eurK(totalSpent) + ' spt' },
      { id: 'main',  x: scaleX(stats.mainTarget), text: eurK(stats.mainTarget) + ' main' },
      { id: 'ceil',  x: scaleX(stats.ceiling), text: eurK(stats.ceiling) + ' ceil' },
      ...(showProjTick
        ? [{ id: 'proj', x: scaleX(stats.combinedProjection), text: eurK(stats.combinedProjection) + ' proj' }]
        : []),
    ].sort((a, b) => a.x - b.x);

    const handleTap = (e) => {
      e.stopPropagation();
      const svg = e.currentTarget.closest('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const rawX = ((e.clientX - rect.left) / rect.width) * 100;
      const tapX = Math.max(0, Math.min(100, rawX));
      setTip((t) => t.open ? { open: false, x: 0 } : { open: true, x: tapX });
    };

    React.useEffect(() => {
      if (!tip.open) return;
      const dismiss = () => setTip({ open: false, x: 0 });
      document.addEventListener('pointerdown', dismiss);
      return () => document.removeEventListener('pointerdown', dismiss);
    }, [tip.open]);

    // tooltip geometry
    const tipBW = 50;
    const tipX = Math.max(tipBW / 2, Math.min(100 - tipBW / 2, tip.x)) - tipBW / 2;
    const remaining  = Math.max(0, stats.ceiling - stats.combinedProjection);
    const bufferMain = Math.max(0, stats.mainTarget - stats.projection);
    const overBy     = Math.max(0, stats.combinedProjection - stats.ceiling);
    const projVsMain = Math.max(0, stats.projection - stats.mainTarget);

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
              <span className={"hero-emph " + (over ? "over" : "under")}>{eur0(Math.abs(stats.combinedDelta))}</span>
              {stats.bandAmt != null && (
                <span style={{ fontFamily: "var(--mono)", color: "var(--muted)", fontSize: "0.85em", marginLeft: 4 }}>
                  ±{eur0(stats.bandAmt)}
                </span>
              )}.
            </>
          )}
        </div>
        {!stats.isFuture && (
          <>
            <div className="hero-hr" />
            <div className="hero-spent">
              <span>
                {stats.complete
                  ? <>Final spend <span className="num-big">{eur0(stats.combinedProjection)}</span></>
                  : <><span className="num-big">{eur0(totalSpent)}</span> spent</>}
              </span>
              <span className="meta">
                {stats.complete ? stats.year : `day ${stats.doy} / 365`}
              </span>
            </div>

            {/* Zone 2 — multi-stage bullet bar */}
            <svg className="bullet-svg" viewBox="0 0 100 60">
              {/* track background */}
              <rect x="0" y="23" width="100" height="6" fill="var(--chart-grid)" />
              {/* solid fill: actual spent */}
              <rect x="0" y="23" height="6" width={scaleX(totalSpent)} fill="var(--terra)" />
              {/* projection extension (current year, translucent) */}
              {!stats.complete && stats.combinedProjection > totalSpent && (
                <rect
                  x={scaleX(totalSpent)} y="23" height="6"
                  width={Math.max(0, scaleX(stats.combinedProjection) - scaleX(totalSpent))}
                  fill="var(--terra)" opacity="0.45"
                />
              )}
              {/* DOY pace marker (current year only) */}
              {!stats.complete && (
                <line
                  x1={scaleX((stats.doy / 365) * stats.ceiling)} y1="20"
                  x2={scaleX((stats.doy / 365) * stats.ceiling)} y2="27"
                  stroke="var(--muted)" strokeWidth="1" strokeDasharray="1 1"
                />
              )}
              {/* tick: main target */}
              <line
                x1={scaleX(stats.mainTarget)} y1="18"
                x2={scaleX(stats.mainTarget)} y2="33"
                stroke="var(--ink-2)" strokeWidth="1.5"
              />
              {/* tick: ceiling (taller = hard stop) */}
              <line
                x1={scaleX(stats.ceiling)} y1="15"
                x2={scaleX(stats.ceiling)} y2="35"
                stroke="var(--ink)" strokeWidth="1.5"
              />
              {/* tick: projection end (only when meaningfully different from ceiling) */}
              {showProjTick && (
                <line
                  x1={scaleX(stats.combinedProjection)} y1="18"
                  x2={scaleX(stats.combinedProjection)} y2="33"
                  stroke="var(--terra)" strokeWidth="1.5"
                />
              )}
              {/* labels: sorted left-to-right, alternating y-offset avoids collision */}
              {labelSet.map((l, i) => (
                <text
                  key={l.id}
                  x={l.x} y={i % 2 === 0 ? 44 : 52}
                  textAnchor="middle" fontSize="3.5"
                  fontFamily="var(--mono)" fill="var(--muted)"
                >{l.text}</text>
              ))}
              {/* transparent hit area — 24 vb-units tall (~40px) for mobile */}
              <rect
                x="0" y="10" width="100" height="24"
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onPointerDown={handleTap}
              />
              {/* tooltip */}
              {tip.open && (
                <g className="bullet-tip">
                  <rect
                    x={tipX} y="1" width={tipBW} height="19"
                    rx="1.5" fill="var(--paper)"
                    stroke="var(--hair-strong)" strokeWidth="0.5"
                  />
                  <text
                    x={tipX + tipBW / 2} y="9"
                    textAnchor="middle" fontSize="3.8"
                    fontFamily="var(--mono)" fontWeight="600" fill="var(--ink)"
                  >
                    {over ? `Over ceiling  ${eur0(overBy)}` : `Remaining  ${eur0(remaining)}`}
                  </text>
                  <text
                    x={tipX + tipBW / 2} y="16"
                    textAnchor="middle" fontSize="3.3"
                    fontFamily="var(--mono)" fill="var(--muted)"
                  >
                    {over ? `Proj vs main  +${eur0(projVsMain)}` : `Buffer to main  ${eur0(bufferMain)}`}
                  </text>
                </g>
              )}
            </svg>

            {/* Zone 3 — monthly pulse (current year only) */}
            {!stats.complete && (() => {
              const month = stats.asOf.getMonth();
              const monthLabel = stats.asOf.toLocaleDateString('en', { month: 'long' }).toUpperCase();
              const now = stats.byMonth[month].amount;
              const cap = YCalc.neededMonthlyCap(stats);
              const proj = YCalc.projectedMonthEnd(stats);
              const verdict =
                proj > cap * 1.1  ? { cls: 'over',  text: 'Slow down ▲' } :
                proj > cap * 0.95 ? { cls: 'tight', text: 'Tight ●' }     :
                                    { cls: 'under', text: 'Room to spend ▼' };
              return (
                <div className="pulse">
                  <span className="pulse-month">{monthLabel}</span>
                  <span className="pulse-now">{eur0(now)} so far</span>
                  <span className="pulse-sep">·</span>
                  <span className="pulse-cap">cap {eur0(cap)}</span>
                  <span className="pulse-sep">·</span>
                  <span className="pulse-proj">projected {eur0(proj)}</span>
                  <span className={`pulse-verdict ${verdict.cls}`}>{verdict.text}</span>
                </div>
              );
            })()}
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
