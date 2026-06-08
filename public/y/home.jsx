// home.jsx — calm overview: status hero + callouts + fun strip + spend curve.
(function () {
  const { YUI, YFun } = window;
  const { StatusHero, CalloutCard, SpendCurve, SectionH } = YUI;
  const { FunStrip } = YFun;

  function sliceCallouts(callouts, density) {
    const sev = { alert: 3, watch: 2, info: 1, good: 0 };
    if (density === "all") return callouts;
    if (density === "minimal") {
      const hot = callouts.filter((c) => sev[c.severity] >= 2).slice(0, 2);
      return hot.length ? hot : callouts.slice(0, 1);
    }
    return callouts.slice(0, 4); // balanced
  }

  function HomeScreen({ stats, callouts, density, onCallout, fun, store, onOpenFun }) {
    const shown = sliceCallouts(callouts, density);
    const noteCount = shown.length;
    return (
      <div className="screen stagger">
        <StatusHero stats={stats} />

        <div>
          <SectionH
            title={stats.complete ? "The year in review" : "What's happening"}
            meta={noteCount + (noteCount === 1 ? " NOTE" : " NOTES")}
          />
          <div className="callouts">
            {shown.map((c) => (
              <CalloutCard key={c.id} c={c} onClick={() => onCallout(c)} />
            ))}
          </div>
        </div>

        <div>
          <SectionH title="Fun budget" />
          <FunStrip fun={fun} store={store} onOpen={onOpenFun} />
        </div>

        <div>
          <SectionH title="Spend curve" />
          <div style={{ marginTop: 14 }}>
            <SpendCurve stats={stats} />
          </div>
        </div>
      </div>
    );
  }

  window.YHome = { HomeScreen, sliceCallouts };
})();
