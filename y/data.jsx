// data.jsx — categories, templates, seeded sample data, localStorage store.
(function () {
  const STORAGE_KEY = "yearly:store:v1";

  // ---- Categories (fixed list). icon -> y/icons.jsx names, color = identity tint ----
  const CATEGORIES = [
    { id: "groceries", label: "Groceries", icon: "groceries", color: "#32d74b" },
    { id: "restaurants", label: "Restaurants", icon: "restaurants", color: "#ff9f0a" },
    { id: "shopping", label: "Shopping", icon: "shopping", color: "#ff6ac1" },
    { id: "gym", label: "Gym", icon: "gym", color: "#9be15d" },
    { id: "health", label: "Health", icon: "health", color: "#ff6961" },
    { id: "utilities", label: "Utilities", icon: "utilities", color: "#ffd60a" },
    { id: "house", label: "House Stuff", icon: "house", color: "#40c8e0" },
    { id: "transport", label: "Transport", icon: "transport", color: "#0a84ff" },
    { id: "taxes", label: "Taxes", icon: "taxes", color: "#98989d" },
    { id: "travel", label: "Travel", icon: "travel", color: "#5ac8fa" },
    { id: "entertainment", label: "Entertainment", icon: "entertainment", color: "#bf5af2" },
    { id: "kindergarten", label: "Sophie Kindergarten", icon: "kindergarten", color: "#5e5ce6" },
    { id: "services", label: "Services", icon: "services", color: "#d0a24c" },
    { id: "gift", label: "Gift", icon: "gift", color: "#e0489a" },
    { id: "pets", label: "Pets", icon: "pets", color: "#cd8b4f" },
    { id: "donation", label: "Donation", icon: "donation", color: "#30d0c0" },
    { id: "cash", label: "Cash", icon: "cash", color: "#99a06b" },
    { id: "general", label: "General", icon: "general", color: "#8e8e93" },
  ];
  const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  function cat(id) { return CAT_BY_ID[id] || CAT_BY_ID.general; }

  const DEFAULT_TEMPLATES = [
    { id: "t_billa", name: "Billa", category: "groceries" },
    { id: "t_lidl", name: "Lidl", category: "groceries" },
    { id: "t_kaufland", name: "Kaufland", category: "groceries" },
    { id: "t_coffee", name: "Coffee", category: "restaurants", defaultAmount: 4 },
    { id: "t_fuel", name: "Fuel", category: "transport", defaultAmount: 60 },
    { id: "t_pharmacy", name: "Pharmacy", category: "health" },
    { id: "t_kg", name: "Kindergarten", category: "kindergarten", defaultAmount: 260 },
    { id: "t_utilities", name: "Utilities", category: "utilities" },
  ];

  // ---- deterministic PRNG ----
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const uid = (() => { let n = 1000; return () => "tx_" + (n++).toString(36); })();

  // merchant pools per category for realistic descriptions
  const MERCHANTS = {
    groceries: { Billa: 1, Lidl: 1, Kaufland: 1, Fantastico: 1, "T Market": 1 },
    restaurants: { "Made in Home": 1, "Hadjidraganov's": 1, Skaptoburger: 1, "Cosmos Coffee": 1, "Villa Rosiche": 1, "Boho Bar": 1, Furna: 1 },
    shopping: { Zara: 1, "H&M": 1, eMAG: 1, Technopolis: 1, Decathlon: 1, Pepco: 1 },
    gym: { "Pulse Fitness": 1 },
    health: { "SOpharmacy": 1, "Framar.bg": 1, "Dr. Petrov dental": 1 },
    utilities: { "ChEZ electricity": 1, "Sofiyska voda": 1, "Vivacom internet": 1, Toplofikatsia: 1 },
    house: { IKEA: 1, JYSK: 1, Praktiker: 1, "Mr.Bricolage": 1 },
    transport: { "OMV fuel": 1, "Lukoil fuel": 1, "Yellow taxi": 1, "Sofia Metro": 1 },
    taxes: { "NAP tax": 1, "Property tax": 1 },
    travel: { "Wizz Air": 1, Booking: 1, "Bansko lift": 1, "Airbnb": 1 },
    entertainment: { Netflix: 1, Spotify: 1, "Cinema City": 1, "Arena cinema": 1, Steam: 1 },
    kindergarten: { "Sophie kindergarten": 1 },
    services: { "Barber shop": 1, "Dry cleaning": 1, "iCloud+": 1, "Notary fee": 1 },
    gift: { "Gift — birthday": 1, "Flowers": 1, "Toys R Us": 1 },
    pets: { "Vet clinic": 1, "Zoomag pet food": 1 },
    donation: { "Red Cross": 1, "BCause foundation": 1 },
    cash: { "ATM withdrawal": 1, Cash: 1 },
    general: { "General expense": 1, Misc: 1 },
  };
  const pick = (rng, obj) => { const k = Object.keys(obj); return k[Math.floor(rng() * k.length)]; };

  // 2026 monthly mean spend (EUR) per category + transactions-per-month
  const CFG_2026 = {
    groceries: { mean: 540, n: [12, 16] },
    restaurants: { mean: 235, n: [6, 10] },
    kindergarten: { mean: 260, n: [1, 1] },
    utilities: { mean: 175, n: [3, 4] },
    transport: { mean: 105, n: [3, 6] },
    shopping: { mean: 145, n: [2, 4] },
    health: { mean: 65, n: [1, 3] },
    house: { mean: 85, n: [1, 2] },
    entertainment: { mean: 58, n: [3, 4] },
    services: { mean: 75, n: [2, 3] },
    gym: { mean: 45, n: [1, 1] },
    pets: { mean: 38, n: [1, 2] },
    travel: { mean: 80, n: [0, 2] },
    gift: { mean: 28, n: [0, 2] },
    cash: { mean: 55, n: [1, 2] },
    general: { mean: 38, n: [1, 2] },
    donation: { mean: 15, n: [0, 1] },
  };
  // seasonal multiplier per month index (0=Jan..) for a couple of categories -> the "trending worse" + May restaurant spike story
  const SEASON = {
    restaurants: [0.8, 0.85, 0.95, 1.0, 1.6, 1.7],
    shopping: [0.7, 0.8, 1.0, 1.0, 1.3, 1.5],
    travel: [0.2, 0.3, 0.6, 1.0, 1.4, 1.2],
  };

  function genYear2026(rng, todayStr) {
    const txns = [];
    const today = new Date(todayStr + "T00:00:00");
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(2026, m, 1);
      if (monthStart > today) break;
      const daysInMonth = new Date(2026, m + 1, 0).getDate();
      const lastDay = (monthStart.getFullYear() === today.getFullYear() && m === today.getMonth())
        ? today.getDate() : daysInMonth;
      const monthFrac = lastDay / daysInMonth; // partial current month
      for (const cid in CFG_2026) {
        const cfg = CFG_2026[cid];
        const season = (SEASON[cid] && SEASON[cid][m] != null) ? SEASON[cid][m] : 1;
        let target = cfg.mean * season * monthFrac;
        if (target <= 0) continue;
        let count = Math.round(cfg.n[0] + rng() * (cfg.n[1] - cfg.n[0]));
        count = Math.max(cfg.n[0] === 0 && rng() < 0.4 ? 0 : Math.max(1, count), 0);
        if (count === 0) continue;
        // split target into `count` jittered amounts
        const weights = Array.from({ length: count }, () => 0.5 + rng());
        const wsum = weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < count; i++) {
          const amt = Math.max(1, (target * weights[i]) / wsum);
          const day = 1 + Math.floor(rng() * lastDay);
          const d = new Date(2026, m, Math.min(day, lastDay));
          txns.push({
            id: uid(), date: fmtDate(d), description: pick(rng, MERCHANTS[cid] || MERCHANTS.general),
            amount_eur: Math.round(amt * 100) / 100, category: cid, source: "manual",
          });
        }
      }
    }
    return txns;
  }

  // light historical years: representative txns summing to a chosen actual
  function genHistory(rng, year, actual) {
    const txns = [];
    const cids = ["groceries", "restaurants", "kindergarten", "utilities", "transport", "shopping", "health", "entertainment"];
    const monthly = actual / 12;
    for (let m = 0; m < 12; m++) {
      const weights = cids.map(() => 0.5 + rng());
      const ws = weights.reduce((a, b) => a + b, 0);
      cids.forEach((cid, i) => {
        const amt = (monthly * weights[i]) / ws;
        const day = 2 + Math.floor(rng() * 25);
        txns.push({
          id: uid(), date: fmtDate(new Date(year, m, day)), description: pick(rng, MERCHANTS[cid]),
          amount_eur: Math.round(amt * 100) / 100, category: cid, source: "manual",
        });
      });
    }
    return txns;
  }

  function buildSeed(todayStr) {
    const rng = mulberry32(20260606);
    let t2026 = genYear2026(rng, todayStr);
    // scale 2026 so YTD lands ~10,950 (slightly over linear pace; buffer tips projection clearly over target)
    const raw = t2026.reduce((a, t) => a + t.amount_eur, 0);
    const TARGET_YTD = 10950;
    const scale = TARGET_YTD / raw;
    t2026 = t2026.map((t) => ({ ...t, amount_eur: Math.round(t.amount_eur * scale * 100) / 100 }));
    // a couple of imported-looking txns (original currency) for realism
    t2026.slice(0, 2).forEach((t, i) => { t.source = "import"; if (i === 0) { t.original_amount = Math.round(t.amount_eur * 1.96 * 100) / 100; t.original_currency = "BGN"; } });

    const t2025 = genHistory(mulberry32(2025), 2025, 22340);
    const t2024 = genHistory(mulberry32(2024), 2024, 21650);

    return {
      version: 1,
      currentYear: 2026,
      years: {
        "2024": { target: 21000, buffer: 0.04 },
        "2025": { target: 23000, buffer: 0.04 },
        "2026": { target: 25000, buffer: 0.04 },
      },
      templates: DEFAULT_TEMPLATES.slice(),
      transactions: [...t2024, ...t2025, ...t2026],
    };
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const seed = buildSeed(todayISO());
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); } catch (e) {}
    return seed;
  }
  function saveStore(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {} }
  function resetStore() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} return buildSeed(todayISO()); }

  window.YData = {
    STORAGE_KEY, CATEGORIES, CAT_BY_ID, cat, DEFAULT_TEMPLATES,
    loadStore, saveStore, resetStore, buildSeed, todayISO, uid,
  };
})();
