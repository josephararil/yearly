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

    const headline = stats.isFuture ? stats.ceiling : stats.projection;
    const eyebrow = stats.complete
      ? "Final combined spend · " + stats.year
      : stats.isFuture
      ? "Household ceiling · " + stats.year
      : "Projected year-end";
    const over = stats.delta >= 0;
    const near = Math.abs(stats.delta) < stats.ceiling * 0.005;
    const totalSpent = stats.spent;

    // bullet bar — % positions along the rail (xMax leaves 4% breathing room on the right)
    const xMax = Math.max(stats.ceiling, stats.projection, 1) * 1.04;
    const pct = (v) => (v / xMax) * 100;
    const spentPct = pct(totalSpent);
    const projPct  = pct(stats.projection);
    const mainPct  = pct(stats.mainTarget);
    const ceilPct  = pct(stats.ceiling);
    const doyPct   = pct((stats.doy / 365) * stats.ceiling);
    const showProjTick = !near && !stats.complete;

    // compact label formatter: €21.4k, €25k, €500
    const eurK = (v) => {
      if (v >= 10000) return '€' + Math.round(v / 1000) + 'k';
      if (v >= 1000) return '€' + (Math.round(v / 100) / 10) + 'k';
      return eur0(v);
    };

    // tick labels (spent is already shown above in .hero-spent, so excluded here)
    const labelSet = [
      { id: 'main', x: mainPct, text: 'main ' + eurK(stats.mainTarget) },
      { id: 'ceil', x: ceilPct, text: 'ceiling ' + eurK(stats.ceiling) },
      ...(showProjTick ? [{ id: 'proj', x: projPct, text: 'proj ' + eurK(stats.projection) }] : []),
    ].sort((a, b) => a.x - b.x);

    const handleTap = (e) => {
      e.stopPropagation();
      const wrap = e.currentTarget;
      const rect = wrap.getBoundingClientRect();
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

    // tooltip position — left/center/right anchor avoids viewport overflow
    const tipStyle = tip.x < 25 ? { left: 0 }
                    : tip.x > 75 ? { right: 0 }
                    : { left: tip.x + '%', transform: 'translateX(-50%)' };
    const remaining  = Math.max(0, stats.ceiling - stats.projection);
    const overBy     = Math.max(0, stats.projection - stats.ceiling);

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
              <span className={"hero-emph " + (over ? "over" : "under")}>{eur0(Math.abs(stats.delta))}</span>
              {stats.bandAmt != null && (
                <span style={{ fontFamily: "var(--mono)", color: "var(--muted)", fontSize: "0.7em", marginLeft: 4 }}>
                  {'\u0028'}±{eur0(stats.bandAmt)}{'\u0029'}
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
                  ? <>Final spend <span className="num-big">{eur0(stats.projection)}</span></>
                  : <><span className="num-big">{eur0(totalSpent)}</span> spent</>}
              </span>
              <span className="meta">
                {stats.complete ? stats.year : `day ${stats.doy} / 365`}
              </span>
            </div>

            {/* Zone 2 — multi-stage bullet bar (HTML; restrained like the original .pace-rule) */}
            <div className="bullet-wrap" onPointerDown={handleTap}>
              <div className="bullet-rail">
                <div className="bullet-fill-spent" style={{ width: spentPct + '%' }} />
                {!stats.complete && stats.projection > totalSpent && (
                  <div className="bullet-fill-proj"
                    style={{ left: spentPct + '%', width: Math.max(0, projPct - spentPct) + '%' }} />
                )}
              </div>
              {!stats.complete && (
                <div className="bullet-doy" style={{ left: doyPct + '%' }} />
              )}
              <div className="bullet-tick main" style={{ left: mainPct + '%' }} />
              <div className="bullet-tick ceil" style={{ left: ceilPct + '%' }} />
              {showProjTick && (
                <div className="bullet-tick proj" style={{ left: projPct + '%' }} />
              )}
              {tip.open && (
                <div className="bullet-tip" style={tipStyle}>
                  <div className="bullet-tip-main">
                    {over ? `Over ceiling ${eur0(overBy)}` : `Remaining ${eur0(remaining)}`}
                  </div>
                  <div className="bullet-tip-sub">
                    {`Fun ${eur0(stats.funSpent)} of ${eur0(totalSpent)} spent`}
                  </div>
                </div>
              )}
            </div>
            <div className="bullet-labels">
              {labelSet.map((l, i) => {
                const isLeft = l.x < 10;
                const isRight = l.x > 90;
                const style = isLeft ? { left: 0 }
                            : isRight ? { right: 0 }
                            : { left: l.x + '%', transform: 'translateX(-50%)' };
                return (
                  <span key={l.id}
                    className={'bullet-label' + (i % 2 === 1 ? ' row2' : '')}
                    style={style}>{l.text}</span>
                );
              })}
            </div>

            {/* Zone 3 — monthly pulse (two deliberate rows; current year only) */}
            {!stats.complete && (() => {
              const month = stats.asOf.getMonth();
              const monthLabel = stats.asOf.toLocaleDateString('en', { month: 'long' }).toUpperCase();
              const now = stats.byMonth[month].amount;
              const cap = YCalc.neededMonthlyCap(stats);
              const proj = YCalc.projectedMonthEnd(stats);
              const verdict =
                proj > cap * 1.1  ? { cls: 'over',  text: 'Slow down ◂' } :
                proj > cap * 0.95 ? { cls: 'tight', text: 'Tight' }     :
                                    { cls: 'under', text: 'Fine ▸' };
              return (
                <div className="pulse">
                  <div className="pulse-r1">
                    <span className="pulse-month">{monthLabel}</span>
                    <span className={`pulse-verdict ${verdict.cls}`}>{verdict.text}</span>
                  </div>
                  <div className="pulse-r2">
                    <span className="pulse-now">{eur0(now)} so far</span>
                    <span className="pulse-sep">·</span>
                    <span className="pulse-cap">cap {eur0(cap)}</span>
                    <span className="pulse-sep">·</span>
                    <span className="pulse-proj">projected {eur0(proj)}</span>
                  </div>
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

function TxRow({ t, onClick, people }) {
    const c = YData.cat(t.category);
    const personName = t.person && people ? (people.find((p) => p.id === t.person) || {}).name : null;
    const isManual = t.source !== 'revolut';
    return (
      <button className="txrow" onClick={onClick}>
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          {t.merchant_logo
            ? <img className="tx-logo" src={t.merchant_logo} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'grid'; }} />
            : null}
          <span className="cat-ic" style={{ width: 24, height: 24, borderRadius: 6, background: tint(c.color, "22"), color: c.color, display: t.merchant_logo ? 'none' : 'grid' }}>
            <Icon name={c.icon} size={12} />
          </span>
          {isManual && (
            <span style={{ position: 'absolute', top: -2, left: -2, width: 7, height: 7, borderRadius: '50%', background: 'var(--terra)', border: '1.5px solid var(--paper)', zIndex: 1, pointerEvents: 'none' }} />
          )}
        </span>
        <span className="tx-main">
          <div className="tx-desc">{t.description}</div>
          <div className="tx-meta">{fmtDateShort(t.date)} · {c.label}{personName ? ` · ${personName}` : ""}{t.fun ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}> · fun</span> : null}</div>
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
