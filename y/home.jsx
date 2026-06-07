// home.jsx — calm overview: status hero + callouts + recent peek.
(function () {
  const { YUI, YCalc } = window;
  const { StatusHero, CalloutCard, TxRow, SectionH } = YUI;

  function sliceCallouts(callouts, density) {
    const sev = { alert: 3, watch: 2, info: 1, good: 0 };
    if (density === "all") return callouts;
    if (density === "minimal") {
      const hot = callouts.filter((c) => sev[c.severity] >= 2).slice(0, 2);
      return hot.length ? hot : callouts.slice(0, 1);
    }
    return callouts.slice(0, 4); // balanced
  }

  function HomeScreen({ stats, callouts, density, heroVariant, onCallout, onSeeAllTx, onEditTx, onGoCategories }) {
    const shown = sliceCallouts(callouts, density);
    const recent = stats.txns.slice().reverse().slice(0, 5);
    return (
      <div className="screen stagger">
        <StatusHero stats={stats} variant={heroVariant} />

        <div>
          <SectionH title={stats.complete ? "The year in review" : "What's happening"} />
          <div className="callouts">
            {shown.map((c) => (
              <CalloutCard key={c.id} c={c} onClick={() => onCallout(c)} />
            ))}
          </div>
        </div>

        <div>
          <SectionH title="Recent" action="All activity" onAction={onSeeAllTx} />
          <div className="panel panel-pad" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {recent.length ? (
              <div className="txlist">
                {recent.map((t) => <TxRow key={t.id} t={t} onClick={() => onEditTx(t)} />)}
              </div>
            ) : (
              <div className="empty">No transactions yet this year.<br />Tap + to log your first.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  window.YHome = { HomeScreen, sliceCallouts };
})();
