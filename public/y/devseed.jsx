// devseed.jsx — DEV-ONLY sample data. NOT part of the production app.
//
// This file is loaded ONLY on localhost: index.html document-writes its <script> tag behind a
// hostname guard, so the deployed app never requests, caches, or executes it. The guard below is
// a second line of defence — the file is inert anywhere that isn't a local host.
//
// Why it exists: the real store starts empty (`YData.buildSeed()` has no transactions), so a fresh
// local session — e.g. Claude Code spinning up the preview to verify a change — has nothing to
// render. This seeds a realistic year of spend the FIRST time a local session has no store, so
// charts, callouts, and the Hero always have something to show.
//
// Safety: it only writes when `localStorage` has no store yet, so it never clobbers real data you
// pulled or edited locally. It is purely a localStorage seed — it never calls the API. The sync
// layer's `bootstrap()` only pushes to the server when the server is *empty and reachable*; against
// a real backend it adopts server data instead (replacing this fixture), and Claude's static dev
// server has no `/api` at all (every sync call 404s into a silent no-op).
(function () {
  // Defence-in-depth: do nothing unless we're genuinely on a local host.
  const host = location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]";
  if (!isLocal) return;

  const KEY = (window.YData && window.YData.STORAGE_KEY) || "yearly:store:v1";
  try {
    if (localStorage.getItem(KEY)) return; // a store already exists — leave it alone
  } catch (e) {
    return; // no storage access — bail quietly
  }

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  // Deterministic pseudo-variation so the fixture is identical across reloads (no Math.random).
  const wob = (seed, span) => (Math.abs(Math.sin(seed) * 1000) % span);

  const MERCH = {
    groceries:     ["Lidl", "Mercadona", "Carrefour"],
    restaurants:   ["Trattoria", "Sushi Bar", "Corner Cafe"],
    transport:     ["Metro", "Uber", "Shell"],
    utilities:     ["Electric Co", "Water Board", "Fibre"],
    shopping:      ["Zara", "Amazon", "IKEA"],
    health:        ["Pharmacy", "Clinic"],
    entertainment: ["Cinema", "Spotify", "Steam"],
    travel:        ["Ryanair", "Booking"],
  };
  let _n = 0;
  const mk = (date, category, amount, extra) => {
    const list = MERCH[category] || ["Shop"];
    return Object.assign({
      id: "dev-" + (_n++),
      date,
      category,
      description: list[_n % list.length],
      amount_eur: Math.round(amount * 100) / 100,
      source: "revolut",
    }, extra || {});
  };

  // One year of spend, scaled so the current year lands modestly over its ceiling (exercises the
  // pace / time-to-ceiling callouts) and the prior year a touch lower (exercises year-over-year).
  function genYear(Y, scale) {
    const tx = [];
    const today = new Date();
    const end = Y === today.getFullYear() ? today : new Date(Y, 11, 31);
    const dayCats = ["groceries", "restaurants", "transport", "health", "entertainment", "shopping"];
    const d = new Date(Y, 0, 1);
    while (d <= end) {
      const doy = Math.round((d - new Date(Y, 0, 0)) / 86400000);
      tx.push(mk(iso(d), dayCats[doy % dayCats.length], (30 + wob(doy * 1.3, 35)) * scale));
      if (doy % 7 === 0) tx.push(mk(iso(d), "groceries", (60 + wob(doy, 40)) * scale)); // weekly shop
      d.setDate(d.getDate() + 1);
    }
    // Monthly utility bill on the 2nd; a couple of fun purchases per month for each person.
    for (let m = 0; m < 12; m++) {
      const bill = new Date(Y, m, 2);
      if (bill <= end) tx.push(mk(iso(bill), "utilities", (180 + m * 6) * scale));
      const jFun = new Date(Y, m, 9);
      if (jFun <= end) tx.push(mk(iso(jFun), "shopping", 40 + wob(m, 30), { fun: true, person: "joseph" }));
      const mFun = new Date(Y, m, 17);
      if (mFun <= end) tx.push(mk(iso(mFun), "entertainment", 70 + wob(m * 2, 60), { fun: true, person: "marti" }));
    }
    // One genuine one-off lump (exercises winsorization — counts in spend, excluded from the rate).
    const lump = new Date(Y, 4, 12);
    if (lump <= end) tx.push(mk(iso(lump), "travel", 1100 * scale, { oneoff: true }));
    return tx;
  }

  const now = new Date();
  const Y = now.getFullYear();
  const from = (Y - 1) + "-01";
  const store = {
    version: 1,
    currentYear: Y,
    density: "balanced",
    people: [
      { id: "joseph", name: "Joseph", rates: [{ from, amount: 100 }], startMonth: from },
      { id: "marti",  name: "Marti",  rates: [{ from, amount: 200 }], startMonth: from },
    ],
    wishlist: [],
    years: {
      [Y - 2]: { ceiling: 21000, buffer: 0.04 },
      [Y - 1]: { ceiling: 23000, buffer: 0.04 },
      [Y]:     { ceiling: 25000, buffer: 0.04 },
    },
    templates: (window.YData && window.YData.DEFAULT_TEMPLATES) ? window.YData.DEFAULT_TEMPLATES.slice() : [],
    transactions: [].concat(genYear(Y - 1, 0.95), genYear(Y, 1.15)),
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    console.info("[devseed] Seeded " + store.transactions.length + " sample transactions for local dev. This never runs in production.");
  } catch (e) {}
})();
