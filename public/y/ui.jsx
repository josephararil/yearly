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
  function StatusHero({ stats, store, hideBar }) {
    const [tip, setTip] = React.useState({ open: false, x: 0 });

    const headline = stats.isFuture ? stats.ceiling : stats.projection;
    // Implied portfolio draw rate — the number you actually manage. Dormant until a portfolio is set.
    const draw = !stats.isFuture && store ? YCalc.impliedDraw(store, stats.projection) : null;
    const drawZone = draw != null ? YCalc.drawZone(draw) : null;
    const eyebrow = stats.complete
      ? "Final spend · " + stats.year
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
        {draw != null && (
          <div className="hero-draw" style={{ fontFamily: "var(--mono)", fontSize: 12.5, marginTop: 8, color: drawZone.color }}>
            implies a <span className="num" style={{ fontWeight: 700 }}>{(draw * 100).toFixed(1)}%</span> draw
            <span style={{ color: "var(--muted)" }}> · {drawZone.label}</span>
          </div>
        )}
        {!hideBar && !stats.isFuture && (
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

function TxTag({ label, color }) {
    return (
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        borderRadius: 5, padding: '1px 5px', lineHeight: 1.4, flexShrink: 0,
      }}>{label}</span>
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
          <div className="tx-desc" style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
            {t.fun && <TxTag label="Fun" color="var(--amber)" />}
            {t.travel && <TxTag label="Travel" color={YData.cat('travel').color} />}
            {t.amortize_months && <TxTag label={(t.virtual ? "VIRTUAL " : "") + "×" + t.amortize_months + "mo"} color="var(--terra)" />}
          </div>
          <div className="tx-meta">{fmtDateShort(t.date)} · {c.label}{personName ? ` · ${personName}` : ""}</div>
        </span>
        <span className="tx-amt num">{eurAuto(t.amount_eur)}</span>
      </button>
    );
  }

  function Sheet({ open, onClose, title, headRight, footer, children }) {
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
          <div className={"sheet-scroll" + (footer ? " has-footer" : "")}>{children}</div>
          {footer && <div className="sheet-footer">{footer}</div>}
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

  // Collapsible line-by-line chart legend. Open/closed state persists per storageKey across reloads.
  function ChartExplain({ storageKey, items }) {
    const lsKey = "yearly:explain:" + storageKey;
    const [open, setOpen] = React.useState(() => {
      try {
        const raw = localStorage.getItem(lsKey);
        return raw === null ? true : raw === "1";
      } catch (e) { return true; }
    });
    const toggle = () => setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(lsKey, next ? "1" : "0"); } catch (e) {}
      return next;
    });
    return (
      <div style={{ marginTop: 14, borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
        <button onClick={toggle} style={{
          display: "flex", alignItems: "center", gap: 5, width: "100%",
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)",
          textTransform: "uppercase", letterSpacing: "0.07em",
        }}>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
          <span>What's this?</span>
        </button>
        {open && (
          <div style={{ marginTop: 10 }}>
            {items.map(({ color, label, desc }) => (
              <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                <span style={{ display: "inline-block", marginTop: 4, width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", lineHeight: 1.5 }}>
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{label}</span>{" — "}{desc}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  window.YUI = { CatIcon, DeltaChip, StatusHero, CalloutCard, TxRow, TxTag, Sheet, SectionH, Toast, rich, tint, ChartExplain };
})();
