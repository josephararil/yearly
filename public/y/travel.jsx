// travel.jsx — family-wide travel budget UI primitives. Exposed on window.YTravel.
// Mirrors fun.jsx, but the travel budget is a single household allowance (no per-person split):
// a monthly drip accrues, travel-tagged spend draws it down, and the running balance is the
// psychological signal — green means "book something", terracotta means "wait a while".
// Trips (store.trips) are discrete, user-named containers for travel spend — the Travel tab lists
// them as collapsible rows (name + total collapsed; category breakdown + tx expanded).
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, eurAuto, localISO } = YCalc;
  const { Sheet, InfoTip } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button;

  // TravelStrip — compact glanceable indicator for the Overview. Whole strip taps through to
  // Analysis → Travel tab.
  function TravelStrip({ travel, store, onOpen }) {
    const balance = (travel && travel.balance) || 0;
    const monthlyRate = (travel && travel.monthlyRate) || 0;
    const usedThisMonth = (travel && travel.usedThisMonth) || 0;
    const trips = (travel && travel.trips) || [];
    const isNeg = balance < 0;
    const balColor = isNeg ? "var(--terra)" : "var(--sage)";

    // Unconfigured + never used → a quiet prompt instead of a bare €0.
    const unconfigured = monthlyRate === 0 && balance === 0 && (travel && travel.spentAllTime === 0);
    const mostRecentTrip = trips[0];

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
              <InfoTip id="trv-strip-balance" ctx={{ travel }} hoverOnly>
                {isNeg ? ("−" + eur0(Math.abs(balance))) : eur0(balance)}
                {isNeg && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)", marginLeft: 6 }}>owe back</span>
                )}
              </InfoTip>
            </span>
          )}
        </div>

        {/* Meta line */}
        {!unconfigured && (
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
            <InfoTip id="trv-strip-meta" ctx={{ travel }} hoverOnly>
              {eur0(monthlyRate)}/mo · {eur0(usedThisMonth)} used this month
            </InfoTip>
          </div>
        )}

        {/* Most recent trip name */}
        {!unconfigured && mostRecentTrip && (
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-2)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {mostRecentTrip.name}
          </div>
        )}
      </div>
    );
  }

  // ---------- TravelTab internals ----------

  // Sheet for creating/editing a trip. Name required; Location/Start/End optional.
  function TripCreateSheet({ open, onClose, onSave, editing }) {
    const [name, setName] = React.useState("");
    const [location, setLocation] = React.useState("");
    const [startDate, setStartDate] = React.useState("");
    const [endDate, setEndDate] = React.useState("");

    React.useEffect(() => {
      if (!open) return;
      setName(editing ? editing.name : "");
      setLocation(editing ? (editing.location || "") : "");
      setStartDate(editing ? (editing.startDate || "") : "");
      setEndDate(editing ? (editing.endDate || "") : "");
    }, [open, editing]);

    const valid = name.trim().length > 0;

    return (
      <Sheet open={open} onClose={onClose} title={editing ? "Edit trip" : "Add a trip"}>
        <div className="field">
          <label>Trip name</label>
          <input className="inp" value={name} placeholder="e.g. Lucky Bansko, July 2026"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Location (optional)</label>
          <input className="inp" value={location} placeholder="e.g. Bansko, Bulgaria"
            onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label>Start date (optional)</label>
          <input className="inp" type="date" value={startDate} style={{ colorScheme: "light" }}
            onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>End date (optional)</label>
          <input className="inp" type="date" value={endDate} style={{ colorScheme: "light" }}
            onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button variant="primary" block disabled={!valid}
          onClick={() => {
            onSave({ name: name.trim(), location: location.trim(), startDate: startDate || null, endDate: endDate || null });
            onClose();
          }}>
          {editing ? "Save trip" : "Add trip"}
        </Button>
      </Sheet>
    );
  }

  // A single trip's category breakdown + tx list — same treatment the old global breakdown used.
  function TripBreakdown({ trip }) {
    const max = trip.catList[0] ? trip.catList[0].amount : 1;
    return (
      <div style={{ padding: "0 4px 4px" }}>
        {trip.catList.map((c) => {
          const cat = YData.cat(c.id);
          const catTxns = trip.txns.filter((t) => YData.normalizeCategory(t.category) === c.id);
          return (
            <div key={c.id}>
              <div className="catbar-row" style={{ pointerEvents: "none", borderBottom: catTxns.length > 0 ? "0" : undefined }}>
                <span className="cat-dot" style={{ background: cat.color }} />
                <span className="catbar-main">
                  <span className="catbar-top">
                    <span className="catbar-name">{cat.label}</span>
                    <span className="catbar-amt num" style={{ pointerEvents: "auto" }}>
                      <InfoTip id="trv-cat-amt" ctx={{ c }}>{eurAuto(c.amount)}</InfoTip>
                    </span>
                  </span>
                  <span className="catbar-track">
                    <span className="catbar-fill" style={{ width: Math.max(3, (c.amount / max) * 100) + "%", background: cat.color }} />
                  </span>
                  <span className="catbar-sub" style={{ pointerEvents: "auto" }}>
                    <InfoTip id="trv-cat-share" ctx={{ c }}>
                      <span style={{ display: "inline-flex", gap: 10 }}>
                        <span>{Math.round(c.share * 100)}% of trip</span>
                        <span>{c.count} {c.count === 1 ? "entry" : "entries"}</span>
                      </span>
                    </InfoTip>
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
    );
  }

  function tripDateRange(trip) {
    if (!trip.startDate && !trip.endDate) return null;
    if (trip.startDate && trip.endDate) return trip.startDate + " → " + trip.endDate;
    return trip.startDate || trip.endDate;
  }

  // One collapsible trip row: collapsed shows name + total (+ dates/location); expanded shows the
  // category breakdown + tx, plus rename/edit and delete (delete only allowed with 0 tx).
  function TripRow({ trip, open, onToggle, onEdit, onDelete }) {
    const range = tripDateRange(trip);
    return (
      <div style={{ borderBottom: "1px solid var(--hair)" }}>
        <button type="button" className="opts-summary" onClick={onToggle} aria-expanded={open} style={{ width: "100%" }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {trip.name}
            </span>
            {(range || trip.location) && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
                {[range, trip.location].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              <InfoTip id="trv-trip-total" ctx={{ trip }} hoverOnly>{eur0(trip.total)}</InfoTip>
            </span>
            <window.Icon name="chevronDown" size={16} style={{
              color: "var(--muted)", transform: open ? "rotate(180deg)" : "none",
              transition: "transform var(--dur-fast) var(--ease)",
            }} />
          </span>
        </button>
        <div className={"opts-body" + (open ? " open" : "")}>
          <div className="opts-body-inner">
            {trip.catList.length > 0 ? (
              <TripBreakdown trip={trip} />
            ) : (
              <div className="empty" style={{ margin: "8px 0" }}>No expenses logged for this trip yet.</div>
            )}
            <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "8px 4px 4px" }}>
              <button className="linklike" onClick={onEdit} style={{ fontSize: 12 }}>Edit</button>
              {trip.count === 0 ? (
                <button className="linklike" onClick={onDelete} style={{ fontSize: 12, color: "var(--terra)" }}>Delete</button>
              ) : (
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                  <InfoTip id="trv-trip-lock" ctx={{ trip }}>
                    Has {trip.count} {trip.count === 1 ? "expense" : "expenses"} — can't delete
                  </InfoTip>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TravelTab — the Analysis workshop: balance stats + the trips list.
  function TravelTab({ travel, store, setStore }) {
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [editingTrip, setEditingTrip] = React.useState(null);
    const [openMap, setOpenMap] = React.useState({});

    const balance = (travel && travel.balance) || 0;
    const monthlyRate = (travel && travel.monthlyRate) || 0;
    const usedThisMonth = (travel && travel.usedThisMonth) || 0;
    const travelSpentYTD = (travel && travel.travelSpentYTD) || 0;
    const travelProjection = (travel && travel.travelProjection) || 0;
    const trips = (travel && travel.trips) || [];

    const isOver = usedThisMonth > monthlyRate && monthlyRate > 0;
    const monthDelta = usedThisMonth - monthlyRate;

    const toggle = (id) => setOpenMap((m) => ({ ...m, [id]: !m[id] }));

    const saveTrip = (fields) => {
      if (editingTrip) {
        setStore((s) => ({
          ...s,
          trips: (s.trips || []).map((t) => (t.id === editingTrip.id ? { ...t, ...fields, updatedAt: Date.now() } : t)),
        }));
      } else {
        const trip = { id: YData.uid(), ...fields, createdAt: Date.now(), updatedAt: Date.now() };
        setStore((s) => ({ ...s, trips: [...(s.trips || []), trip] }));
      }
      setEditingTrip(null);
    };

    const deleteTrip = (id) => setStore((s) => ({ ...s, trips: (s.trips || []).filter((t) => t.id !== id) }));

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Balance stats */}
        <div style={{ borderBottom: "1px solid var(--hair)", paddingBottom: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Travel budget</span>
            {monthlyRate > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <InfoTip id="trv-rate" ctx={{ travel }}>{eur0(monthlyRate)}/mo</InfoTip>
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                <InfoTip id="trv-balance" ctx={{ travel }}>Available</InfoTip>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: balance < 0 ? "var(--terra)" : "var(--sage)" }}>
                {balance < 0 ? "−" + eur0(Math.abs(balance)) : eur0(balance)}
              </div>
              {balance < 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)" }}>owe back</div>}
            </div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                <InfoTip id="trv-month" ctx={{ travel }}>This month</InfoTip>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{eur0(usedThisMonth)}</div>
              {monthlyRate > 0 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: isOver ? "var(--terra)" : "var(--sage)" }}>
                  {isOver ? "+" + eur0(monthDelta) + " over" : eur0(Math.abs(monthDelta)) + " left"}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                <InfoTip id="trv-ytd" ctx={{ travel }}>Spent YTD</InfoTip>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink-2)" }}>{eur0(travelSpentYTD)}</div>
              {travelProjection > 0 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
                  <InfoTip id="trv-proj" ctx={{ travel }}>~{eur0(travelProjection)}/yr</InfoTip>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trips */}
        <div>
          <div className="section-h" style={{ marginTop: 0, marginBottom: 6 }}>
            <h2>Trips</h2>
            <span className="spacer" />
            <button className="linklike" onClick={() => { setEditingTrip(null); setSheetOpen(true); }} style={{ fontSize: 12 }}>
              <window.Icon name="plus" size={13} />Add trip
            </button>
          </div>
          {trips.length === 0 ? (
            <div className="empty" style={{ marginTop: 8 }}>No trips yet — add somewhere you've been or are going.</div>
          ) : (
            trips.map((trip) => (
              <TripRow
                key={trip.id}
                trip={trip}
                open={!!openMap[trip.id]}
                onToggle={() => toggle(trip.id)}
                onEdit={() => { setEditingTrip(trip); setSheetOpen(true); }}
                onDelete={() => deleteTrip(trip.id)}
              />
            ))
          )}
        </div>

        <TripCreateSheet
          open={sheetOpen}
          editing={editingTrip}
          onClose={() => { setSheetOpen(false); setEditingTrip(null); }}
          onSave={saveTrip}
        />
      </div>
    );
  }

  window.YTravel = { TravelStrip, TravelTab };
})();
