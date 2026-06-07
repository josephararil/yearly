// fun.jsx — fun budget UI primitives. Exposed on window.YFun.
(function () {
  const { eur0 } = window.YCalc;

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
                {isNeg ? ("−" + eur0(Math.abs(p.balance))) : eur0(p.balance)}
                {isNeg && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terra)", marginLeft: 4 }}>owe back</span>
                )}
              </span>

              {/* Nearest wishlist goal */}
              <span style={{ flex: 1, minWidth: 0 }}>
                {goal ? (
                  <>
                    <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                      {goal.name}{" "}
                      <span style={{ fontFamily: "var(--mono)", color: balColor }}>{Math.round(goalPct)}%</span>
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

  // FunTab arrives in Session 3 — placeholder so S3 can add it without touching index.html.
  function FunTab() {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>
        Fun tab coming soon.
      </div>
    );
  }

  window.YFun = { FunStrip, FunTab };
})();
