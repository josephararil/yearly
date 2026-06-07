// app.jsx — root: nav, routing, year switch, store + tweaks. Mounts the app.
(function () {
  const { YData, YCalc, YUI, YHome, YAnalysis, YSettings, YAdd } = window;
  const { Sheet } = YUI;
  const { useTweaks, TweaksPanel, TweakSection, TweakSelect, TweakRadio, TweakColor } = window;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "heroVariant": "numerals",
    "accent": "#0071e3",
    "density": "balanced"
  }/*EDITMODE-END*/;

  function useStore() {
    const [store, setStoreState] = React.useState(() => YData.loadStore());
    const setStore = React.useCallback((upd) => {
      setStoreState((prev) => {
        const next = typeof upd === "function" ? upd(prev) : upd;
        YData.saveStore(next);
        return next;
      });
    }, []);
    return [store, setStore];
  }

  function NavBar({ route, onRoute, onAdd }) {
    return (
      <nav className="nav">
        <button className={"nav-tab" + (route === "home" ? " active" : "")} onClick={() => onRoute("home")}>
          <window.Icon name="home" size={22} /><span>Overview</span>
        </button>
        <div className="nav-fab-wrap">
          <button className="fab" onClick={onAdd} aria-label="Log an expense"><window.Icon name="plus" size={26} /></button>
        </div>
        <button className={"nav-tab" + (route === "analysis" ? " active" : "")} onClick={() => onRoute("analysis")}>
          <window.Icon name="layers" size={22} /><span>Analysis</span>
        </button>
      </nav>
    );
  }

  function YearMenu({ open, onClose, store, viewYear, setViewYear }) {
    const years = Object.keys(store.years).sort((a, b) => b - a);
    return (
      <Sheet open={open} onClose={onClose} title="View year">
        <div className="panel panel-pad" style={{ padding: "4px 12px" }}>
          {years.map((y) => (
            <button key={y} className="setrow" onClick={() => { setViewYear(Number(y)); onClose(); }}>
              <span className="setrow-main"><span className="setrow-title num">{y}{Number(y) === store.currentYear ? "  ·  current" : ""}</span></span>
              {Number(y) === viewYear && <window.Icon name="check" size={18} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  function App() {
    const [store, setStore] = useStore();
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
    const [route, setRoute] = React.useState("home");
    const [viewYear, setViewYear] = React.useState(store.currentYear);
    const [analysisFocus, setAnalysisFocus] = React.useState(null);
    const [addOpen, setAddOpen] = React.useState(false);
    const [editTx, setEditTx] = React.useState(null);
    const [yearOpen, setYearOpen] = React.useState(false);
    const scrollRef = React.useRef(null);

    React.useEffect(() => { document.documentElement.style.setProperty("--accent", t.accent); }, [t.accent]);
    React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [route]);

    const stats = React.useMemo(() => YCalc.computeStats(store, viewYear), [store, viewYear]);
    const callouts = React.useMemo(() => YCalc.buildCallouts(store, stats), [store, stats]);

    const onCallout = (c) => { setAnalysisFocus({ ...c.drill, _n: Date.now() }); setRoute("analysis"); };
    const goCategories = () => { setAnalysisFocus({ section: "categories", _n: Date.now() }); setRoute("analysis"); };
    const seeAllTx = () => { setAnalysisFocus({ section: "activity", _n: Date.now() }); setRoute("analysis"); };

    const addTx = (tx) => setStore((s) => ({ ...s, transactions: [...s.transactions, tx] }));
    const saveTx = (tx) => setStore((s) => ({ ...s, transactions: s.transactions.map((x) => (x.id === tx.id ? tx : x)) }));
    const delTx = (id) => setStore((s) => ({ ...s, transactions: s.transactions.filter((x) => x.id !== id) }));

    const inSettings = route === "settings";

    return (
      <div className="device">
        <header className="topbar">
          {inSettings ? (
            <button className="yearpill" onClick={() => setRoute("home")} style={{ paddingLeft: 8 }}>
              <window.Icon name="chevronLeft" size={16} /> Done
            </button>
          ) : (
            <div className="brand"><span className="brand-mark">Yearly<span className="dot">.</span></span></div>
          )}
          <span className="spacer" />
          {inSettings ? (
            <div style={{ fontSize: 15, fontWeight: 600 }}>Settings</div>
          ) : (
            <>
              <button className="yearpill" onClick={() => setYearOpen(true)}>
                <span className="num">{viewYear}</span>
                {viewYear !== store.currentYear && <span className="muted" style={{ fontSize: 11 }}>past</span>}
                <window.Icon name="chevronDown" size={15} style={{ color: "var(--text-3)" }} />
              </button>
              <button className="yearpill" onClick={() => setRoute("settings")} style={{ width: 32, padding: 0, justifyContent: "center" }} aria-label="Settings">
                <window.Icon name="settings" size={17} />
              </button>
            </>
          )}
        </header>

        <div className="scroll" ref={scrollRef}>
          {route === "home" && (
            <YHome.HomeScreen stats={stats} callouts={callouts} density={t.density} heroVariant={t.heroVariant}
              onCallout={onCallout} onSeeAllTx={seeAllTx} onEditTx={setEditTx} onGoCategories={goCategories} />
          )}
          {route === "analysis" && (
            <YAnalysis.AnalysisScreen stats={stats} focus={analysisFocus} onEditTx={setEditTx} />
          )}
          {route === "settings" && (
            <YSettings.SettingsScreen store={store} setStore={setStore} stats={stats} />
          )}
        </div>

        <NavBar route={route} onRoute={setRoute} onAdd={() => setAddOpen(true)} />

        <YAdd.AddSheet open={addOpen} onClose={() => setAddOpen(false)} store={store} onSave={addTx} />
        <YAdd.EditSheet open={!!editTx} txn={editTx} onClose={() => setEditTx(null)} onSave={saveTx} onDelete={delTx} />
        <YearMenu open={yearOpen} onClose={() => setYearOpen(false)} store={store} viewYear={viewYear} setViewYear={setViewYear} />

        <TweaksPanel>
          <TweakSection label="Hero" />
          <TweakSelect label="Status treatment" value={t.heroVariant}
            options={["numerals", "gauge", "bar", "projection"]} onChange={(v) => setTweak("heroVariant", v)} />
          <TweakSection label="Callouts" />
          <TweakRadio label="Density on Overview" value={t.density}
            options={["minimal", "balanced", "all"]} onChange={(v) => setTweak("density", v)} />
          <TweakSection label="Accent" />
          <TweakColor label="Accent color" value={t.accent}
            options={["#0071e3", "#3b82f6", "#5e5ce6", "#e8e8ea"]} onChange={(v) => setTweak("accent", v)} />
        </TweaksPanel>
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
})();
