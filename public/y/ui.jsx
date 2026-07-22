// ui.jsx — shared presentational primitives. Exposed on window.
(function () {
  const { Icon, YData, YCalc } = window;
  const { eur0, eurAuto, signedEur, signedPct, pct, fmtDateShort, fmtDateLong } = YCalc;

  // ── TIP_CONTENT — central copy registry for InfoTip, keyed by tip id. Each value is either a
  // static { meaning, derivation } object, or a function (ctx) => { meaning, derivation } that reads
  // live values off the ctx bag passed at the call site. Copy references only ctx fields + YCalc
  // formatters (eur0, pct, signedEur, signedPct) — no new state, no new math.
  const TIP_CONTENT = {
    "hero-projection": ({ stats }) => ({
      meaning: "Your projected total household spend by Dec 31.",
      derivation: `${eur0(stats.spent)} spent + ${eur0(stats.projection - stats.spent)} projected for the rest of the year (incl. ${eur0(stats.bufferAmt)} buffer) = ${eur0(stats.projection)}`,
    }),
    "hero-delta": ({ stats }) => ({
      meaning: "How far the projection lands from the ceiling.",
      derivation: `${eur0(stats.projection)} projected − ${eur0(stats.ceiling)} ceiling = ${signedEur(stats.delta)}`,
    }),
    "hero-band": ({ stats }) => ({
      meaning: "Forecast uncertainty from how much recent weekly spend has varied.",
      derivation: `±${eur0(stats.bandAmt)}, narrows as more of the year becomes known fact.`,
    }),
    "hero-draw": ({ stats, store, draw }) => ({
      meaning: "Portfolio withdrawal rate this year's projected spend implies.",
      derivation: `(${eur0(stats.projection)} projected − ${eur0((store && store.externalIncome) || 0)} income) / ${eur0(store.portfolio)} portfolio = ${(draw * 100).toFixed(1)}%`,
    }),
    "hero-drawzone": ({ draw, drawZone }) => ({
      meaning: "Where this draw rate sits against the 4% rule.",
      derivation: `≤2% conservative · ≤3.5% sustainable · ≤4% at the limit · above is high — ${(draw * 100).toFixed(1)}% is ${drawZone.label}.`,
    }),
    "metric-spent": ({ stats }) => ({
      meaning: stats.complete ? "Total logged for the year." : "Total logged so far this year.",
      derivation: `${stats.upto.length} entries = ${eur0(stats.spent)}`,
    }),
    "metric-daily": ({ stats, dailyMedian }) => ({
      meaning: "Average daily spend year-to-date.",
      derivation: dailyMedian != null
        ? `${eur0(stats.spent)} / ${stats.doy} days = ${eur0(stats.dailyRate)}/day (median ${eur0(dailyMedian)}/day)`
        : `${eur0(stats.spent)} / ${stats.doy} days = ${eur0(stats.dailyRate)}/day`,
    }),
    "metric-blended": ({ stats }) => ({
      meaning: "Forward rate blending year-to-date pace with the last 60 days, then a missed-entry buffer.",
      derivation: `${eur0(stats.trailingDailyRate)}/day blended + ${Math.round(stats.buffer * 100)}% buffer (${eur0(stats.bufferAmt)}) applied to the projected remainder`,
    }),
    "trend90-dir": ({ recent45, prior45 }) => ({
      meaning: "Direction of the last 45 days vs the 45 days before that.",
      derivation: `${eur0(recent45)}/day recent vs ${eur0(prior45)}/day prior (${signedPct((recent45 - prior45) / prior45)})`,
    }),
    "velo-pace": ({ stats }) => ({
      meaning: "Where you'd be if spending exactly on-ceiling today; the even monthly baseline for comparison.",
      derivation: `day ${stats.doy} / ${stats.daysInYear} × ${eur0(stats.ceiling)} = ${eur0(stats.pace)} on-pace · ${eur0(stats.ceiling / 12)}/mo baseline`,
    }),
    "velo-cap": ({ stats, neededMonthly, spentBefore, monthsLeftCount }) => ({
      meaning: "Max average monthly spend for the rest of the year to still land on the ceiling.",
      derivation: `(${eur0(stats.ceiling)} ceiling − ${eur0(spentBefore)} spent before this month) / ${monthsLeftCount} months left = ${eur0(neededMonthly)}/mo`,
    }),
    "velo-daily": ({ overCeiling, adjustedSpent, stats, daysLeftYear, realDailyTarget }) => ({
      meaning: overCeiling
        ? "Daily spend cap to get back under the ceiling by year end."
        : "Daily room left while staying under the ceiling.",
      derivation: `(${eur0(stats.ceiling)} ceiling − ${eur0(adjustedSpent)} spent+buffer) / ${daysLeftYear} days left = ${eur0(realDailyTarget)}/day`,
    }),
    "velo-daily-month": ({ neededMonthly, spentThisMonth, daysLeftMonth, dailyTargetThisMonth }) => ({
      meaning: "Daily cap for the rest of this month to hit the adjusted monthly cap.",
      derivation: `(${eur0(neededMonthly)} cap − ${eur0(spentThisMonth)} spent this month) / ${daysLeftMonth} days left = ${eur0(dailyTargetThisMonth)}/day`,
    }),
    "velo-fun": ({ stats, targetFunPerMo, numPeople, monthsLeft }) => ({
      meaning: "Per-person fun allowance that still lands on the ceiling.",
      derivation: `max(0, ${eur0(stats.ceiling)} − ${eur0(stats.projection)}) / ${monthsLeft.toFixed(1)} months / ${numPeople} people = ${eur0(targetFunPerMo)}/mo`,
    }),
    "fact-monthend": ({ projMonthEnd }) => ({
      meaning: "Forecast total for the current month.",
      derivation: `Spent so far this month + blended rate for the remaining days + anything committed = ${eur0(projMonthEnd)}`,
    }),
    "fact-avg": ({ avgMonthly, completedMonths }) => ({
      meaning: "Mean of completed-month totals this year.",
      derivation: `sum of ${completedMonths} completed month${completedMonths === 1 ? "" : "s"} / ${completedMonths} = ${eur0(avgMonthly)}`,
    }),
    "fact-range": ({ monthRange }) => ({
      meaning: "Lowest and highest completed-month totals in your history.",
      derivation: `${monthRange.minLabel} ${eur0(monthRange.min)} – ${monthRange.maxLabel} ${eur0(monthRange.max)}`,
    }),
    "fact-fun": ({ stats }) => ({
      meaning: "Sum of everyone's per-person fun allowance, annualized.",
      derivation: `${eur0(stats.funPlanAnnual / 12)}/mo × 12 = ${eur0(stats.funPlanAnnual)}/yr`,
    }),
    "fact-travel": ({ travelMonthly, travelPlanAnnual }) => ({
      meaning: "Household travel allowance, annualized from the current monthly rate.",
      derivation: `${eur0(travelMonthly)}/mo × 12 = ${eur0(travelPlanAnnual)}/yr`,
    }),
    "fact-prior": ({ stats }) => ({
      meaning: "Spend vs the same point last year.",
      derivation: `${eur0(stats.spent)} this year − ${eur0(stats.priorSpent)} last year = ${signedEur(stats.spent - stats.priorSpent)} (${signedPct((stats.spent - stats.priorSpent) / stats.priorSpent)})`,
    }),
    "fire-cap": ({ stats }) => ({
      meaning: "Portfolio size that would fund this year's projected spend forever, under the 4% rule.",
      derivation: `A safe-withdrawal portfolio pays out ~4% (or less) of its value a year without depleting principal, sustaining ${eur0(stats.projection)}/yr.`,
    }),
    "fire-4": ({ stats, firePortfolio }) => ({
      meaning: "Portfolio needed under the standard 4% safe-withdrawal rule.",
      derivation: `${eur0(stats.projection)} / 4% = ${eur0(firePortfolio)}`,
    }),
    "fire-35": ({ stats, firePortfolio35 }) => ({
      meaning: "Portfolio needed under a more conservative 3.5% rule.",
      derivation: `${eur0(stats.projection)} / 3.5% = ${eur0(firePortfolio35)}`,
    }),
    "fire-35i": ({ stats, externalIncome, firePortfolio35Income }) => ({
      meaning: "Portfolio needed under the 3.5% rule, net of external income.",
      derivation: `(${eur0(stats.projection)} − ${eur0(externalIncome)} income) / 3.5% = ${eur0(firePortfolio35Income)}`,
    }),
    "amort-cap": ({ am, stats }) => ({
      meaning: "Share of year-to-date spend that comes from spread-out (amortized) purchases.",
      derivation: stats.spent > 0
        ? `${eur0(am.ytd.total)} / ${eur0(stats.spent)} = ${pct(am.ytd.total / stats.spent)}`
        : "",
    }),
    "amort-ytd": ({ am }) => ({
      meaning: "Year-to-date spend from purchases spread over multiple months.",
      derivation: `${eur0(am.ytd.real)} real + ${eur0(am.ytd.virtual)} virtual = ${eur0(am.ytd.total)}`,
    }),
    "amort-real": ({ am }) => ({
      meaning: "Amortized slices backed by real cash outflow.",
      derivation: `${eur0(am.ytd.real)}`,
    }),
    "amort-virtual": ({ am }) => ({
      meaning: "No-cash entries (e.g. depreciation) that still count against the ceiling.",
      derivation: `${eur0(am.ytd.virtual)}`,
    }),
    "amort-month": ({ am }) => ({
      meaning: "Amortized amount landing in the current month.",
      derivation: `${eur0(am.month.total)}`,
    }),
    "amort-committed": ({ am, stats }) => ({
      meaning: "Not-yet-elapsed amortized slices due later this year.",
      derivation: `${eur0(am.committedThisYear)} committed for the rest of ${stats.year}`,
    }),
  };

  let tipSeq = 0;

  // InfoTip — reusable hover/tap tooltip. Wraps children in a dotted-underline trigger; shows a card
  // above the trigger with a plain-language meaning + a live derivation, sourced from TIP_CONTENT.
  function InfoTip({ id, ctx, children, hoverOnly, className }) {
    const entry = TIP_CONTENT[id];
    const [open, setOpen] = React.useState(false);
    const [anchor, setAnchor] = React.useState({});
    const instanceId = React.useRef("ytip-" + (++tipSeq));
    const hostRef = React.useRef(null);

    React.useEffect(() => {
      const onOtherOpen = (e) => { if (e.detail !== instanceId.current) setOpen(false); };
      document.addEventListener("ytip:open", onOtherOpen);
      return () => document.removeEventListener("ytip:open", onOtherOpen);
    }, []);

    React.useEffect(() => {
      if (!open) return;
      const dismiss = () => setOpen(false);
      document.addEventListener("pointerdown", dismiss);
      document.addEventListener("scroll", dismiss, true);
      const onKey = (e) => { if (e.key === "Escape") dismiss(); };
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("pointerdown", dismiss);
        document.removeEventListener("scroll", dismiss, true);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    if (!entry) return children;
    const { meaning, derivation } = typeof entry === "function" ? entry(ctx || {}) : entry;
    if (!meaning && !derivation) return children;

    const computeAnchor = () => {
      const el = hostRef.current;
      if (!el) return {};
      const rect = el.getBoundingClientRect();
      const w = window.innerWidth;
      if (rect.left < w * 0.2) return { left: 0 };
      if (rect.right > w * 0.8) return { right: 0 };
      return { left: "50%", transform: "translateX(-50%)" };
    };

    const openTip = () => {
      setAnchor(computeAnchor());
      setOpen(true);
      document.dispatchEvent(new CustomEvent("ytip:open", { detail: instanceId.current }));
    };

    const onClick = (e) => {
      e.stopPropagation();
      if (hoverOnly) return;
      if (open) {
        setOpen(false);
      } else {
        setAnchor(computeAnchor());
        setOpen(true);
        document.dispatchEvent(new CustomEvent("ytip:open", { detail: instanceId.current }));
      }
    };

    return (
      <span ref={hostRef} style={{ position: "relative", display: "inline" }}>
        <span
          className={"tip-trigger" + (className ? " " + className : "")}
          onPointerEnter={openTip}
          onPointerLeave={() => setOpen(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClick}
        >
          {children}
        </span>
        {open && (
          <div className="ytip" style={anchor}>
            {meaning && <div className="ytip-meaning">{meaning}</div>}
            {derivation && <div className="ytip-deriv">{derivation}</div>}
          </div>
        )}
      </span>
    );
  }

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
        <div className="hero-num">
          {stats.isFuture
            ? eur0(headline)
            : <InfoTip id="hero-projection" ctx={{ stats }}>{eur0(headline)}</InfoTip>}
        </div>
        <div className="hero-sub">
          {stats.isFuture ? (
            <>Nothing logged yet.</>
          ) : near ? (
            <>On your <span className="num">{eur0(stats.ceiling)}</span> ceiling.</>
          ) : (
            <>
              {over ? "Over" : "Under"} your <span className="num">{eur0(stats.ceiling)}</span> ceiling by{" "}
              <InfoTip id="hero-delta" ctx={{ stats }}>
                <span className={"hero-emph " + (over ? "over" : "under")}>{eur0(Math.abs(stats.delta))}</span>
              </InfoTip>
              {stats.bandAmt != null && (
                <InfoTip id="hero-band" ctx={{ stats }}><span style={{ fontFamily: "var(--mono)", color: "var(--muted)", fontSize: "0.7em", marginLeft: 4 }}>
                  {'\u0028'}±{eur0(stats.bandAmt)}{'\u0029'}
                </span></InfoTip>
              )}.
            </>
          )}
        </div>
        {draw != null && (
          <div className="hero-draw" style={{ fontFamily: "var(--mono)", fontSize: 12.5, marginTop: 8, color: drawZone.color }}>
            implies a <InfoTip id="hero-draw" ctx={{ stats, store, draw }}>
              <span className="num" style={{ fontWeight: 700 }}>{(draw * 100).toFixed(1)}%</span>
            </InfoTip> draw
            <InfoTip id="hero-drawzone" ctx={{ draw, drawZone }}>
              <span style={{ color: "var(--muted)" }}> · {drawZone.label}</span>
            </InfoTip>
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
            {t.fun && <TxTag label={personName ? `Fun (${personName})` : "Fun"} color="var(--amber)" />}
            {t.travel && <TxTag label="Travel" color={YData.cat('travel').color} />}
            {t.amortize_months && <TxTag label={(t.virtual ? "VIRTUAL " : "") + "×" + t.amortize_months + "mo"} color="var(--terra)" />}
          </div>
          <div className="tx-meta">{fmtDateShort(t.date)} · {c.label}</div>
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

  window.YUI = { CatIcon, DeltaChip, StatusHero, CalloutCard, TxRow, TxTag, Sheet, SectionH, Toast, rich, tint, ChartExplain, InfoTip, TIP_CONTENT };
})();
