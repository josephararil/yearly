// app.jsx — root: nav, routing, year switch, store. Mounts the app.
(function () {
  const { YData, YCalc, YUI, YHome, YAnalysis, YSettings, YAdd } = window;
  const { Sheet, Toast } = YUI;

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
          <span>Overview</span>
        </button>
        <div className="nav-fab-wrap">
          <button className="fab" onClick={onAdd} aria-label="Log an expense">+</button>
        </div>
        <button className={"nav-tab" + (route === "analysis" ? " active" : "")} onClick={() => onRoute("analysis")}>
          <span>Analysis</span>
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
              {Number(y) === viewYear && <window.Icon name="check" size={18} style={{ color: "var(--terra)" }} />}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  function App() {
    const [store, setStore] = useStore();
    const [route, setRoute] = React.useState("home");
    const [viewYear, setViewYear] = React.useState(store.currentYear);
    const [analysisFocus, setAnalysisFocus] = React.useState(null);
    const [addOpen, setAddOpen] = React.useState(false);
    const [editTx, setEditTx] = React.useState(null);
    const [yearOpen, setYearOpen] = React.useState(false);
    const [deletedTx, setDeletedTx] = React.useState(null);
    const [showToast, setShowToast] = React.useState(false);
    const scrollRef = React.useRef(null);

    React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [route]);

    const stats = React.useMemo(() => YCalc.computeStats(store, viewYear), [store, viewYear]);
    const callouts = React.useMemo(() => YCalc.buildCallouts(store, stats), [store, stats]);
    const fun = React.useMemo(() => YCalc.computeFun(store), [store]);

    const onCallout = (c) => { setAnalysisFocus({ ...c.drill, _n: Date.now() }); setRoute("analysis"); };
    const onOpenFun = () => { setAnalysisFocus({ section: "fun", _n: Date.now() }); setRoute("analysis"); };

    const addTx = (tx) => setStore((s) => ({ ...s, transactions: [...s.transactions, tx] }));
    const saveTx = (tx) => setStore((s) => ({ ...s, transactions: s.transactions.map((x) => (x.id === tx.id ? tx : x)) }));
    const delTx = (id) => {
      const tx = store.transactions.find((x) => x.id === id);
      setStore((s) => ({ ...s, transactions: s.transactions.filter((x) => x.id !== id) }));
      setDeletedTx(tx);
      setShowToast(true);
    };
    const undoDelete = () => {
      if (deletedTx) setStore((s) => ({ ...s, transactions: [...s.transactions, deletedTx] }));
      setShowToast(false);
    };

    const inSettings = route === "settings";

    return (
      <div className="device">
        <header className="topbar">
          {inSettings ? (
            <button className="yearpill" onClick={() => setRoute("home")} style={{ paddingLeft: 8 }}>
              <window.Icon name="chevronLeft" size={16} /> Done
            </button>
          ) : (
            <div className="brand"><span className="brand-mark">Yearly</span></div>
          )}
          <span className="spacer" />
          {inSettings ? (
            <div style={{ fontSize: 15, fontWeight: 600 }}>Settings</div>
          ) : (
            <>
              <button className="yearpill" onClick={() => setYearOpen(true)}>
                <span className="num">{viewYear}</span>
                {viewYear !== store.currentYear && <span className="muted" style={{ fontSize: 11 }}>past</span>}
                <window.Icon name="chevronDown" size={15} style={{ color: "var(--muted)" }} />
              </button>
              <button className="yearpill" onClick={() => setRoute("settings")} style={{ width: 32, padding: 0, justifyContent: "center" }} aria-label="Settings">
                <window.Icon name="settings" size={17} />
              </button>
            </>
          )}
        </header>

        <div className="scroll" ref={scrollRef}>
          {route === "home" && (
            <YHome.HomeScreen stats={stats} callouts={callouts} density={store.density || "balanced"}
              onCallout={onCallout} fun={fun} store={store} onOpenFun={onOpenFun} />
          )}
          {route === "analysis" && (
            <YAnalysis.AnalysisScreen stats={stats} focus={analysisFocus} onEditTx={setEditTx}
              fun={fun} store={store} setStore={setStore} addTx={addTx} />
          )}
          {route === "settings" && (
            <YSettings.SettingsScreen store={store} setStore={setStore} stats={stats} />
          )}
        </div>

        <Toast open={showToast} message="Deleted" actionLabel="Undo" onAction={undoDelete} onDismiss={() => setShowToast(false)} />
        <NavBar route={route} onRoute={setRoute} onAdd={() => setAddOpen(true)} />

        <YAdd.AddSheet open={addOpen} onClose={() => setAddOpen(false)} store={store} onSave={addTx} />
        <YAdd.EditSheet open={!!editTx} txn={editTx} onClose={() => setEditTx(null)} onSave={saveTx} onDelete={delTx} store={store} />
        <YearMenu open={yearOpen} onClose={() => setYearOpen(false)} store={store} viewYear={viewYear} setViewYear={setViewYear} />
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
})();
