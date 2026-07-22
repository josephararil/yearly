// fun.jsx — fun budget UI primitives. Exposed on window.YFun.
(function () {
  const { YData, YCalc, YUI } = window;
  const { eur0, eurAuto } = YCalc;
  const { Sheet, SectionH, InfoTip } = YUI;
  const DS = window.ApertureDesignSystem_72a4cd || {};
  const Button = DS.Button, Chip = DS.Chip;

  // FunStrip — compact glanceable strip for the Overview.
  // One hairline row per person: name, all-time balance, nearest wishlist goal progress.
  // Whole strip tappable → onOpen() (routes to Analysis → Fun tab).
  function FunStrip({ fun, store, onOpen }) {
    const people = (fun && fun.people) || [];
    const wishlist = (store && store.wishlist) || [];

    // Pick the wishlist item that person is nearest to affording.
    // When balance > 0: highest balance/price ratio. When balance ≤ 0: cheapest item first.
    function nearestGoal(personId, balance) {
      const items = wishlist.filter((w) => w.owner === personId);
      if (!items.length) return null;
      if (balance <= 0) {
        return items.reduce((best, item) => (item.price < best.price ? item : best));
      }
      return items.reduce((best, item) =>
        (balance / item.price) > (balance / best.price) ? item : best
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
        style={{ cursor: "pointer" }}
      >
        {people.map((p, i) => {
          const isNeg = p.balance < 0;
          const balColor = isNeg ? "var(--terra)" : "var(--sage)";
          const goal = nearestGoal(p.id, p.balance);
          const goalPct = goal ? Math.max(0, Math.min(100, (p.balance / goal.price) * 100)) : 0;

          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 0",
                gap: 12,
                borderBottom: i < people.length - 1 ? "1px solid var(--hair)" : "none",
              }}
            >
              {/* Person name */}
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", width: 64, flexShrink: 0 }}>
                {p.name}
              </span>

              {/* Balance */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: balColor, flexShrink: 0, whiteSpace: "nowrap" }}>
                <InfoTip id="fun-strip-balance" ctx={{ p }} hoverOnly>
                  {isNeg ? ("−" + eur0(Math.abs(p.balance))) : eur0(p.balance)}
                  {isNeg && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)", marginLeft: 4 }}>owe back</span>
                  )}
                </InfoTip>
              </span>

              {/* Nearest wishlist goal */}
              <span style={{ flex: 1, minWidth: 0 }}>
                {goal ? (
                  <>
                    <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                      {goal.name}{" "}
                      <InfoTip id="fun-strip-goal" ctx={{ p, goal, goalPct }} hoverOnly>
                        <span style={{ fontFamily: "var(--mono)", color: balColor }}>{Math.round(goalPct)}%</span>
                      </InfoTip>
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: "var(--hair)", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: goalPct + "%", background: balColor, borderRadius: 1 }} />
                    </div>
                  </>
                ) : (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>no goals yet</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- FunTab internals ----------

  // Sheet for adding a new wishlist item.
  function WishlistAddSheet({ open, onClose, onAdd, store, initialOwner }) {
    const people = (store && store.people) || [];
    const [name, setName] = React.useState("");
    const [price, setPrice] = React.useState("");
    const [owner, setOwner] = React.useState(initialOwner || (people[0] && people[0].id) || "marti");

    React.useEffect(() => {
      if (open) {
        setName(""); setPrice("");
        setOwner(initialOwner || (people[0] && people[0].id) || "marti");
      }
    }, [open]);

    const valid = name.trim() && parseFloat(price) > 0;

    return (
      <Sheet open={open} onClose={onClose} title="Add wishlist item">
        <div className="field">
          <label>Item name</label>
          <input className="inp" value={name} placeholder="e.g. AirPods Pro"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Price (EUR)</label>
          <input className="inp inp-num" inputMode="decimal" value={price} placeholder="0.00"
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <div className="field">
          <label>For</label>
          <div style={{ display: "flex", gap: 7, marginTop: 4 }}>
            {people.map((p) => (
              <Chip key={p.id} pressed={owner === p.id} onClick={() => setOwner(p.id)}>{p.name}</Chip>
            ))}
          </div>
        </div>
        <Button variant="primary" block disabled={!valid}
          onClick={() => {
            onAdd({
              id: YData.uid(),
              owner,
              name: name.trim(),
              price: Math.round(parseFloat(price) * 100) / 100,
              createdMonth: new Date().toISOString().slice(0, 7),
            });
            onClose();
          }}>
          Add to wishlist
        </Button>
      </Sheet>
    );
  }

  // Per-person card: balance stats + wishlist items.
  function PersonCard({ p, wishlist, onBuy, onRemove, onAddWish }) {
    const isOver = p.usedThisMonth > p.monthlyRate && p.monthlyRate > 0;
    const monthDelta = p.usedThisMonth - p.monthlyRate;

    return (
      <div style={{ marginBottom: 4 }}>
        {/* Person header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--sans)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{p.name}</span>
          {p.monthlyRate > 0 && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <InfoTip id="fun-rate" ctx={{ p }}>{eur0(p.monthlyRate)}/mo</InfoTip>
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
              <InfoTip id="fun-balance" ctx={{ p }}>Balance</InfoTip>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: p.balance < 0 ? "var(--terra)" : "var(--sage)" }}>
              {p.balance < 0 ? "−" + eur0(Math.abs(p.balance)) : eur0(p.balance)}
            </div>
            {p.balance < 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)" }}>owe back</div>}
          </div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
              <InfoTip id="fun-month" ctx={{ p }}>This month</InfoTip>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{eur0(p.usedThisMonth)}</div>
            {p.monthlyRate > 0 && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: isOver ? "var(--terra)" : "var(--sage)" }}>
                {isOver ? "+" + eur0(monthDelta) + " over" : eur0(Math.abs(monthDelta)) + " left"}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
              <InfoTip id="fun-alltime" ctx={{ p }}>All-time</InfoTip>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink-2)" }}>{eur0(p.spentAllTime)}</div>
          </div>
        </div>

        {/* Wishlist */}
        <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Wishlist</span>
            <button className="linklike" onClick={onAddWish} style={{ fontSize: 12 }}>
              <window.Icon name="plus" size={13} />Add
            </button>
          </div>
          {wishlist.length === 0 ? (
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", padding: "6px 0 8px" }}>No items yet — add a goal!</div>
          ) : (
            wishlist.map((item) => {
              const balanceForProgress = Math.max(0, p.balance);
              const pct = Math.min(100, item.price > 0 ? (balanceForProgress / item.price) * 100 : 0);
              const ready = p.balance >= item.price;
              let eta;
              if (ready) {
                eta = "ready now";
              } else if (!p.monthlyRate) {
                eta = "—";
              } else {
                const months = Math.max(0, Math.ceil((item.price - p.balance) / p.monthlyRate));
                eta = months + (months === 1 ? " mo" : " mos");
              }

              return (
                <div key={item.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)", flexShrink: 0 }}>{eur0(item.price)}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: ready ? "var(--sage)" : "var(--muted)", flexShrink: 0, minWidth: 50, textAlign: "right" }}>
                      <InfoTip id="fun-eta" ctx={{ item, p }}>{eta}</InfoTip>
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "var(--hair)", marginBottom: 6, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: pct + "%", background: ready ? "var(--sage)" : "var(--terra)", borderRadius: 2 }} />
                  </div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <Button variant="primary" onClick={() => onBuy(item)}>Bought it</Button>
                    <button className="linklike" onClick={() => onRemove(item.id)}
                      style={{ color: "var(--muted)", fontSize: 12, padding: "4px 6px" }}>
                      <window.Icon name="x" size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // FunTab — the Analysis workshop: per-person cards, fun category breakdown, wishlist.
  function FunTab({ fun, store, setStore, addTx }) {
    const [addWishFor, setAddWishFor] = React.useState(null); // person id while sheet is open

    const people = (fun && fun.people) || [];
    const wishlist = (store && store.wishlist) || [];
    const catList = (fun && fun.funCatList) || [];
    const max = catList[0] ? catList[0].amount : 1;
    const yearStr = String(store.currentYear);
    const funTxns = (store.transactions || []).filter((t) => t.fun && t.date.slice(0, 4) === yearStr);

    const removeWish = (id) => setStore((s) => ({ ...s, wishlist: (s.wishlist || []).filter((w) => w.id !== id) }));
    const addWish = (item) => setStore((s) => ({ ...s, wishlist: [...(s.wishlist || []), item] }));
    const buyIt = (item) => {
      addTx({
        id: YData.uid(),
        date: YData.todayISO(),
        description: item.name,
        amount_eur: item.price,
        category: "shopping",
        fun: true,
        person: item.owner,
        source: "manual",
      });
      removeWish(item.id);
    };

    return (
      <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Per-person cards */}
        {people.map((p, i) => (
          <div key={p.id} style={{ borderBottom: "1px solid var(--hair)", paddingBottom: 20, marginBottom: 20, paddingTop: i > 0 ? 4 : 0 }}>
            <PersonCard
              p={p}
              wishlist={wishlist.filter((w) => w.owner === p.id)}
              onBuy={buyIt}
              onRemove={removeWish}
              onAddWish={() => setAddWishFor(p.id)}
            />
          </div>
        ))}

        {/* Fun category breakdown */}
        {catList.length > 0 && (
          <div>
            <div className="section-h" style={{ marginTop: 0, marginBottom: 6 }}>
              <h2>Fun categories</h2>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12 }}><InfoTip id="fun-total" ctx={{ fun }}>{eur0(fun.funSpentYTD)} total</InfoTip></span>
            </div>
            {catList.map((c) => {
              const cat = YData.cat(c.id);
              const catTxns = funTxns
                .filter((t) => YData.normalizeCategory(t.category) === c.id)
                .sort((a, b) => b.date.localeCompare(a.date));
              return (
                <div key={c.id}>
                  <div className="catbar-row" style={{ pointerEvents: "none", borderBottom: catTxns.length > 0 ? "0" : undefined }}>
                    <span className="cat-dot" style={{ background: cat.color }} />
                    <span className="catbar-main">
                      <span className="catbar-top">
                        <span className="catbar-name">{cat.label}</span>
                        <span className="catbar-amt num" style={{ pointerEvents: "auto" }}>
                          <InfoTip id="fun-cat-amt" ctx={{ c }}>{eurAuto(c.amount)}</InfoTip>
                        </span>
                      </span>
                      <span className="catbar-track">
                        <span className="catbar-fill" style={{ width: Math.max(3, (c.amount / max) * 100) + "%", background: cat.color }} />
                      </span>
                      <span className="catbar-sub" style={{ pointerEvents: "auto" }}>
                        <InfoTip id="fun-cat-share" ctx={{ c }}>
                          <span style={{ display: "inline-flex", gap: 10 }}>
                            <span>{Math.round(c.share * 100)}% of fun</span>
                            <span>{c.count} {c.count === 1 ? "entry" : "entries"}</span>
                          </span>
                        </InfoTip>
                      </span>
                    </span>
                  </div>
                  {catTxns.length > 0 && (
                    <div style={{ padding: "4px 4px 10px 32px", borderBottom: "1px solid var(--hair)" }}>
                      {catTxns.map((t) => {
                        const personName = t.person ? ((people.find((p) => p.id === t.person) || {}).name) : null;
                        return (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0" }}>
                          <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
                            {t.description}{personName ? <span style={{ color: "var(--muted)" }}>{" (" + personName + ")"}</span> : null}
                          </span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
                            {eur0(t.amount_eur)}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {catList.length === 0 && (
          <div className="empty" style={{ marginTop: 8 }}>No fun expenses logged yet.</div>
        )}

        {/* Wishlist add sheet */}
        <WishlistAddSheet
          open={addWishFor !== null}
          onClose={() => setAddWishFor(null)}
          onAdd={addWish}
          store={store}
          initialOwner={addWishFor}
        />
      </div>
    );
  }

  window.YFun = { FunStrip, FunTab };
})();
