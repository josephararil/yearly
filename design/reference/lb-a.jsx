// lb-a.jsx — Direction A: "Broadsheet" — editorial light, Tennis DNA.
(function () {
  const { DATA, SpendChart } = window.LB;
  const A = {
    paper: "#F4F1E8", ink: "#221f19", muted: "#8d846f", hair: "rgba(34,28,18,0.13)",
    terra: "#BE4A30", sage: "#5E7C54", amber: "#C0852B",
    serif: "'Newsreader', serif", sans: "'Hanken Grotesk', sans-serif", mono: "'JetBrains Mono', monospace",
  };
  const chartTheme = { id: "a", actual: A.terra, projected: "#b98e6a", target: "#8d846f", grid: "rgba(34,28,18,0.10)", axis: "#9a9176", mono: A.mono, paceColor: "#b6ad95", fillTop: 0.22 };

  const Dot = ({ c }) => React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: c, display: "inline-block", flex: "0 0 auto", marginTop: 7 } });

  function Num(props) {
    return React.createElement("span", { style: { fontFamily: A.mono, fontWeight: 500, color: A.ink, ...(props.style || {}) } }, props.children);
  }

  function Callout({ dot, children }) {
    return React.createElement("div", { style: { display: "flex", gap: 13, padding: "16px 0", borderBottom: `1px solid ${A.hair}`, alignItems: "flex-start" } },
      React.createElement(Dot, { c: dot }),
      React.createElement("div", { style: { flex: 1, fontFamily: A.sans, fontSize: 15, lineHeight: 1.5, color: "#3b352a" } }, children),
      React.createElement("span", { style: { color: "#bdb39a", fontFamily: A.serif, fontSize: 18, marginTop: -2 } }, "\u2192")
    );
  }

  function ScreenA() {
    const S = {
      wrap: { background: A.paper, height: "100%", overflow: "hidden", fontFamily: A.sans, color: A.ink, display: "flex", flexDirection: "column" },
      body: { padding: "0 26px", overflow: "hidden", flex: 1 },
    };
    const mono = { fontFamily: A.mono };
    return React.createElement("div", { style: S.wrap },
      // top bar
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 26px 14px" } },
        React.createElement("span", { style: { fontFamily: A.serif, fontSize: 21, fontWeight: 500, letterSpacing: "-0.01em" } }, "Yearly"),
        React.createElement("span", { style: { ...mono, fontSize: 12.5, letterSpacing: "0.12em", color: A.muted } }, "2026 \u25BE")
      ),
      React.createElement("div", { style: S.body },
        // hero
        React.createElement("div", { style: { paddingTop: 16 } },
          React.createElement("div", { style: { ...mono, fontSize: 11.5, letterSpacing: "0.2em", textTransform: "uppercase", color: A.muted } }, "Projected year-end"),
          React.createElement("div", { style: { fontFamily: A.serif, fontWeight: 300, fontSize: 76, lineHeight: 0.98, letterSpacing: "-0.03em", margin: "12px 0 6px", color: A.ink } }, "\u20ac24,760"),
          React.createElement("div", { style: { fontSize: 15, color: "#5b5547" } },
            "Over your ", React.createElement(Num, null, "\u20ac24,000"), " target by ",
            React.createElement("span", { style: { ...mono, fontWeight: 700, color: A.terra } }, "\u20ac760"), "."
          ),
          // pace rule
          React.createElement("div", { style: { marginTop: 22, position: "relative", height: 3, background: "rgba(34,28,18,0.10)", borderRadius: 2 } },
            React.createElement("div", { style: { position: "absolute", left: 0, top: 0, height: 3, width: "43%", background: A.terra, borderRadius: 2 } }),
            React.createElement("div", { style: { position: "absolute", left: "43%", top: -4, width: 1.5, height: 11, background: A.ink } })
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 8, ...mono, fontSize: 11, color: A.muted } },
            React.createElement("span", null, "\u20ac10,420 spent"),
            React.createElement("span", null, "day 158 / 365")
          )
        ),
        // what's happening
        React.createElement("div", { style: { marginTop: 30 } },
          React.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `1.5px solid ${A.ink}`, paddingBottom: 8 } },
            React.createElement("span", { style: { fontFamily: A.serif, fontSize: 23, fontWeight: 500 } }, "What\u2019s happening"),
            React.createElement("span", { style: { ...mono, fontSize: 11, color: A.muted, letterSpacing: "0.1em" } }, "3 NOTES")
          ),
          React.createElement(Callout, { dot: A.amber },
            "Pace runs ", React.createElement(Num, null, "\u20ac110/day"), "; holding ",
            React.createElement(Num, { style: { color: A.terra } }, "\u20ac99/day"), " from here finishes you on target."
          ),
          React.createElement(Callout, { dot: A.terra },
            React.createElement("b", { style: { fontWeight: 700 } }, "Restaurants"), " reached ", React.createElement(Num, null, "\u20ac340"),
            " in May \u2014 ", React.createElement(Num, { style: { color: A.terra } }, "+60%"), " over April."
          ),
          React.createElement(Callout, { dot: A.sage },
            "Logged spend projects to ", React.createElement(Num, null, "\u20ac23,810"), "; the ",
            React.createElement(Num, null, "4%"), " missed-entry buffer lifts it to ", React.createElement(Num, null, "\u20ac24,760"), "."
          )
        ),
        // chart
        React.createElement("div", { style: { marginTop: 26 } },
          React.createElement("div", { style: { fontFamily: A.serif, fontSize: 17, fontWeight: 500, marginBottom: 6 } }, "Spend curve"),
          React.createElement(SpendChart, { theme: chartTheme, height: 168 })
        )
      ),
      // bottom nav
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center", borderTop: `1px solid ${A.hair}`, padding: "14px 26px 22px", background: A.paper } },
        React.createElement("div", { style: { textAlign: "center" } },
          React.createElement("div", { style: { ...mono, fontSize: 12.5, color: A.ink, fontWeight: 700 } }, "Overview"),
          React.createElement("div", { style: { height: 2, width: 22, background: A.terra, margin: "6px auto 0" } })
        ),
        React.createElement("div", { style: { textAlign: "center" } },
          React.createElement("div", { style: { width: 44, height: 44, borderRadius: 99, border: `1.5px solid ${A.terra}`, color: A.terra, display: "grid", placeItems: "center", margin: "0 auto", fontSize: 24, fontWeight: 300, fontFamily: A.serif } }, "+")
        ),
        React.createElement("div", { style: { textAlign: "center" } },
          React.createElement("div", { style: { ...mono, fontSize: 12.5, color: A.muted } }, "Analysis")
        )
      )
    );
  }

  window.ScreenA = ScreenA;
})();
