// lb-data.jsx — shared mock data + a themeable Recharts spend chart.
(function () {
  const DATA = {
    year: 2026,
    target: 24000,
    spent: 10420,
    projection: 24760,
    projNoBuffer: 23810,
    buffer: 0.04,
    doy: 158,
    delta: 760,
    paceToday: 10380,
    dailyNow: 66,
    dailyToFinish: 99,
    recent: [
      { name: "Billa", cat: "Groceries", amount: 42.18, accent: "#5BA35B" },
      { name: "Cosmos Coffee", cat: "Restaurants", amount: 3.8, accent: "#D98A3D" },
      { name: "OMV Fuel", cat: "Transport", amount: 61.0, accent: "#3E84C4" },
      { name: "Netflix", cat: "Entertainment", amount: 12.99, accent: "#9B59B6" },
    ],
    categories: [
      { name: "Groceries", amount: 3180, color: "#5BA35B" },
      { name: "Restaurants", amount: 1920, color: "#D98A3D" },
      { name: "Kindergarten", amount: 1560, color: "#6C63C4" },
      { name: "Transport", amount: 980, color: "#3E84C4" },
      { name: "Utilities", amount: 870, color: "#E0B23A" },
      { name: "Shopping", amount: 760, color: "#D45D9C" },
      { name: "Other", amount: 1150, color: "#9b9382" },
    ],
  };

  // cumulative spend curve
  const CHART = [
    { x: 0, actual: 0, pace: 0 },
    { x: 1, actual: 1850, pace: 2000 },
    { x: 2, actual: 3550, pace: 4000 },
    { x: 3, actual: 5400, pace: 6000 },
    { x: 4, actual: 7100, pace: 8000 },
    { x: 5, actual: 9050, pace: 10000 },
    { x: 5.2, actual: 10420, projected: 10420, pace: 10400 },
    { x: 6, projected: 12106, pace: 12000 },
    { x: 7, projected: 14214, pace: 14000 },
    { x: 8, projected: 16322, pace: 16000 },
    { x: 9, projected: 18430, pace: 18000 },
    { x: 10, projected: 20538, pace: 20000 },
    { x: 11, projected: 22646, pace: 22000 },
    { x: 12, projected: 24760, pace: 24000 },
  ];
  const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  // Themeable cumulative area chart.
  // theme: { actual, projected, target, grid, axis, fillFrom, gridDash, paceColor }
  function SpendChart({ theme, height = 188 }) {
    const R = window.Recharts;
    if (!R) return React.createElement("div", { style: { height, display: "grid", placeItems: "center", color: theme.axis, fontFamily: "monospace", fontSize: 12 } }, "chart");
    const { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } = R;
    const gid = "g_" + theme.id;
    return (
      React.createElement(ResponsiveContainer, { width: "100%", height },
        React.createElement(ComposedChart, { data: CHART, margin: { top: 6, right: 6, bottom: 0, left: -14 } },
          React.createElement("defs", null,
            React.createElement("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
              React.createElement("stop", { offset: "0%", stopColor: theme.actual, stopOpacity: theme.fillTop != null ? theme.fillTop : 0.26 }),
              React.createElement("stop", { offset: "100%", stopColor: theme.actual, stopOpacity: 0 })
            )
          ),
          React.createElement(CartesianGrid, { stroke: theme.grid, strokeDasharray: theme.gridDash || "0", vertical: false }),
          React.createElement(XAxis, {
            dataKey: "x", type: "number", domain: [0, 12], ticks: [0, 2, 4, 6, 8, 10, 12],
            tickFormatter: (x) => MONTHS[Math.round(x)] || "", tick: { fill: theme.axis, fontSize: 10, fontFamily: theme.mono },
            tickLine: false, axisLine: { stroke: theme.grid }, interval: 0,
          }),
          React.createElement(YAxis, {
            domain: [0, 26000], ticks: [0, 12000, 24000], tickFormatter: (v) => (v ? "€" + v / 1000 + "k" : "€0"),
            tick: { fill: theme.axis, fontSize: 10, fontFamily: theme.mono }, tickLine: false, axisLine: false, width: 48,
          }),
          React.createElement(ReferenceLine, {
            y: 24000, stroke: theme.target, strokeDasharray: "4 4", strokeWidth: 1.2,
            label: { value: "target €24k", fill: theme.target, fontSize: 10, position: "insideTopRight", fontFamily: theme.mono },
          }),
          React.createElement(Line, { type: "linear", dataKey: "pace", stroke: theme.paceColor || theme.axis, strokeWidth: 1, strokeDasharray: "2 4", dot: false, opacity: 0.6, isAnimationActive: false }),
          React.createElement(Area, { type: "monotone", dataKey: "actual", stroke: theme.actual, strokeWidth: 2.6, fill: `url(#${gid})`, dot: false, connectNulls: false, isAnimationActive: false }),
          React.createElement(Line, { type: "monotone", dataKey: "projected", stroke: theme.projected, strokeWidth: 2.2, strokeDasharray: "6 5", dot: false, connectNulls: false, isAnimationActive: false })
        )
      )
    );
  }

  // donut for category mix
  function CatDonut({ theme, size = 132 }) {
    const R = window.Recharts;
    const total = DATA.categories.reduce((a, c) => a + c.amount, 0);
    if (!R) return null;
    const { PieChart, Pie, Cell, ResponsiveContainer } = R;
    return React.createElement(ResponsiveContainer, { width: size, height: size },
      React.createElement(PieChart, null,
        React.createElement(Pie, {
          data: DATA.categories, dataKey: "amount", innerRadius: size * 0.32, outerRadius: size * 0.48,
          paddingAngle: 2, stroke: "none", startAngle: 90, endAngle: -270, isAnimationActive: false,
        }, DATA.categories.map((c, i) => React.createElement(Cell, { key: i, fill: c.color })))
      )
    );
  }

  window.LB = { DATA, CHART, MONTHS, SpendChart, CatDonut };
})();
