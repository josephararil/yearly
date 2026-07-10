// travel.jsx — family-wide travel budget UI primitives. Exposed on window.YTravel.
// Mirrors fun.jsx, but the travel budget is a single household allowance (no per-person split):
// a monthly drip accrues, travel-tagged spend draws it down, and the running balance is the
// psychological signal — green means "book something", terracotta means "wait a while".
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, eurAuto } = YCalc;
  const { Sheet } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button;

  // Pick the wishlist trip nearest to affordable.
  // balance > 0: highest balance/price ratio. balance ≤ 0: cheapest trip first.
  function nearestTrip(items, balance) {
    if (!items.length) return null;
    if (balance <= 0) return items.reduce((best, item) => (item.price < best.price ? item : best));
    return items.reduce((best, item) => ((balance / item.price) > (balance / best.price) ? item : best));
  }

  // TravelStrip — compact glanceable indicator for the Overview. Whole strip taps through to
  // Analysis → Travel tab.
  function TravelStrip({ travel, store, onOpen }) {
    const balance = (travel && travel.balance) || 0;
    const monthlyRate = (travel && travel.monthlyRate) || 0;
    const usedThisMonth = (travel && travel.usedThisMonth) || 0;
    const wishlist = (store && store.travelWishlist) || [];
    const isNeg = balance < 0;
    const balColor = isNeg ? "var(--terra)" : "var(--sage)";

    // Unconfigured + never used → a quiet prompt instead of a bare €0.
    const unconfigured = monthlyRate === 0 && balance === 0 && (travel && travel.spentAllTime === 0);

    const goal = nearestTrip(wishlist, balance);
    const goalPct = goal ? Math.max(0, Math.min(100, (Math.max(0, balance) / goal.price) * 100)) : 0;

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
        style={{ cursor: "pointer" }}
      >
        {/* Balance headline */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "6px 0 2px" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {unconfigured ? "Travel budget" : "Available"}
          </span>
          {unconfigured ? (
            <span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)" }}>
              Set an allowance in Settings →
            </span>
          ) : (
            <span style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, color: balColor, whiteSpace: "nowrap" }}>
              {isNeg ? ("−" + eur0(Math.abs(balance))) : eur0(balance)}
              {isNeg && (
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)", marginLeft: 6 }}>owe back</span>
              )}
            </span>
          )}
        </div>

        {/* Meta line */}
        {!unconfigured && (
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginBottom: goal ? 10 : 0 }}>
            {eur0(monthlyRate)}/mo · {eur0(usedThisMonth)} used this month
          </div>
        )}

        {/* Nearest trip goal */}
        {!unconfigured && goal && (
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
              {goal.name}{" "}
              <span style={{ fontFamily: "var(--mono)", color: balColor }}>{Math.round(goalPct)}%</span>
            </div>
            <div style={{ height: 2, borderRadius: 1, background: "var(--hair)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: goalPct + "%", background: balColor, borderRadius: 1 }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- TravelTab internals ----------

  // Sheet for adding a new trip goal.
  function TripAddSheet({ open, onClose, onAdd }) {
    const [name, setName] = React.useState("");
    const [price, setPrice] = React.useState("");

    React.useEffect(() => { if (open) { setName(""); setPrice(""); } }, [open]);

    const valid = name.trim() && parseFloat(price) > 0;

    return (
      <Sheet open={open} onClose={onClose} title="Add a trip">
        <div className="field">
          <label>Trip name</label>
          <input className="inp" value={name} placeholder="e.g. Weekend in Rome"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Estimated cost (EUR)</label>
          <input className="inp inp-num" inputMode="decimal" value={price} placeholder="0.00"
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <Button variant="primary" block disabled={!valid}
          onClick={() => {
            onAdd({
              id: YData.uid(),
              name: name.trim(),
              price: Math.round(parseFloat(price) * 100) / 100,
              createdMonth: new Date().toISOString().slice(0, 7),
            });
            onClose();
          }}>
          Add trip
        </Button>
      </Sheet>
    );
  }

  // TravelTab — the Analysis workshop: balance stats, trip wishlist, travel category breakdown.
  function TravelTab({ travel, store, setStore, addTx }) {
    const [addTripOpen, setAddTripOpen] = React.useState(false);

    const balance = (travel && travel.balance) || 0;
    const monthlyRate = (travel && travel.monthlyRate) || 0;
    const usedThisMonth = (travel && travel.usedThisMonth) || 0;
    const travelSpentYTD = (travel && travel.travelSpentYTD) || 0;
    const travelProjection = (travel && travel.travelProjection) || 0;
    const wishlist = (store && store.travelWishlist) || [];
    const catList = (travel && travel.travelCatList) || [];
    const max = catList[0] ? catList[0].amount : 1;
    const yearStr = String(store.currentYear);
    const travelTxns = (store.transactions || []).filter((t) => t.travel && t.date.slice(0, 4) === yearStr);

    const isOver = usedThisMonth > monthlyRate && monthlyRate > 0;
    const monthDelta = usedThisMonth - monthlyRate;

    const removeTrip = (id) => setStore((s) => ({ ...s, travelWishlist: (s.travelWishlist || []).filter((w) => w.id !== id) }));
    const addTrip = (item) => setStore((s) => ({ ...s, travelWishlist: [...(s.travelWishlist || []), item] }));
    const bookIt = (item) => {
      addTx({
        id: YData.uid(),
        date: YData.todayISO(),
        description: item.name,
        amount_eur: item.price,
        category: "travel",
        travel: true,
        source: "manual",
      });
      removeTrip(item.id);
    };

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Balance stats */}
        <div style={{ borderBottom: "1px solid var(--hair)", paddingBottom: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Travel budget</span>
            {monthlyRate > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {eur0(monthlyRate)}/mo
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Available</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: balance < 0 ? "var(--terra)" : "var(--sage)" }}>
                {balance < 0 ? "−" + eur0(Math.abs(balance)) : eur0(balance)}
              </div>
              {balance < 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)" }}>owe back</div>}
            </div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>This month</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{eur0(usedThisMonth)}</div>
              {monthlyRate > 0 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: isOver ? "var(--terra)" : "var(--sage)" }}>
                  {isOver ? "+" + eur0(monthDelta) + " over" : eur0(Math.abs(monthDelta)) + " left"}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Spent YTD</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink-2)" }}>{eur0(travelSpentYTD)}</div>
              {travelProjection > 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>~{eur0(travelProjection)}/yr</div>}
            </div>
          </div>
        </div>

        {/* Trip wishlist */}
        <div style={{ borderBottom: "1px solid var(--hair)", paddingBottom: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Trips</span>
            <button className="linklike" onClick={() => setAddTripOpen(true)} style={{ fontSize: 12 }}>
              <window.Icon name="plus" size={13} />Add
            </button>
          </div>
          {wishlist.length === 0 ? (
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", padding: "6px 0 2px" }}>No trips yet — add somewhere you'd like to go!</div>
          ) : (
            wishlist.map((item) => {
              const pct = Math.min(100, item.price > 0 ? (Math.max(0, balance) / item.price) * 100 : 0);
              const ready = balance >= item.price;
              let eta;
              if (ready) eta = "ready now";
              else if (!monthlyRate) eta = "—";
              else {
                const months = Math.max(0, Math.ceil((item.price - balance) / monthlyRate));
                eta = months + (months === 1 ? " mo" : " mos");
              }
              return (
                <div key={item.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)", flexShrink: 0 }}>{eur0(item.price)}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: ready ? "var(--sage)" : "var(--muted)", flexShrink: 0, minWidth: 50, textAlign: "right" }}>{eta}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "var(--hair)", marginBottom: 6, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: pct + "%", background: ready ? "var(--sage)" : "var(--terra)", borderRadius: 2 }} />
                  </div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <Button variant="primary" onClick={() => bookIt(item)}>Booked it</Button>
                    <button className="linklike" onClick={() => removeTrip(item.id)}
                      style={{ color: "var(--muted)", fontSize: 12, padding: "4px 6px" }}>
                      <window.Icon name="x" size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Travel category breakdown */}
        {catList.length > 0 ? (
          <div>
            <div className="section-h" style={{ marginTop: 0, marginBottom: 6 }}>
              <h2>Travel spend</h2>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12 }}>{eur0(travelSpentYTD)} total</span>
            </div>
            {catList.map((c) => {
              const cat = YData.cat(c.id);
              const catTxns = travelTxns
                .filter((t) => YData.normalizeCategory(t.category) === c.id)
                .sort((a, b) => b.date.localeCompare(a.date));
              return (
                <div key={c.id}>
                  <div className="catbar-row" style={{ pointerEvents: "none", borderBottom: catTxns.length > 0 ? "0" : undefined }}>
                    <span className="cat-dot" style={{ background: cat.color }} />
                    <span className="catbar-main">
                      <span className="catbar-top">
                        <span className="catbar-name">{cat.label}</span>
                        <span className="catbar-amt num">{eurAuto(c.amount)}</span>
                      </span>
                      <span className="catbar-track">
                        <span className="catbar-fill" style={{ width: Math.max(3, (c.amount / max) * 100) + "%", background: cat.color }} />
                      </span>
                      <span className="catbar-sub">
                        <span>{Math.round(c.share * 100)}% of travel</span>
                        <span>{c.count} {c.count === 1 ? "entry" : "entries"}</span>
                      </span>
                    </span>
                  </div>
                  {catTxns.length > 0 && (
                    <div style={{ padding: "4px 4px 10px 32px", borderBottom: "1px solid var(--hair)" }}>
                      {catTxns.map((t) => (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0" }}>
                          <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
                            {t.description}
                          </span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
                            {eur0(t.amount_eur)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ marginTop: 8 }}>No travel expenses logged yet.</div>
        )}

        {/* Trip add sheet */}
        <TripAddSheet open={addTripOpen} onClose={() => setAddTripOpen(false)} onAdd={addTrip} />
      </div>
    );
  }

  window.YTravel = { TravelStrip, TravelTab };
})();
