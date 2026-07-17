// data.jsx — categories, templates, default store shape, localStorage persistence.
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
  const CAT_BY_ID    = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  // also index by lowercase label so "Groceries" (Revolut) → "groceries" (id)
  const CAT_BY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.label.toLowerCase(), c]));
  function normalizeCategory(raw) {
    if (!raw) return 'general';
    if (CAT_BY_ID[raw]) return raw;                           // already a valid id
    const lower = raw.toLowerCase();
    if (CAT_BY_ID[lower]) return lower;                       // title-case id → lowercase
    return CAT_BY_LABEL[lower] ? CAT_BY_LABEL[lower].id : 'general'; // label match
  }
  function cat(id) { return CAT_BY_ID[normalizeCategory(id)]; }

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

  const uid = () => crypto.randomUUID();

  const DEFAULT_PEOPLE = [
    { id: "joseph", name: "Joseph", rates: [{ from: "2026-01", amount: 100 }], startMonth: "2026-01" },
    { id: "marti",  name: "Marti",  rates: [{ from: "2026-01", amount: 200 }], startMonth: "2026-01" },
  ];

  function buildSeed() {
    return {
      version: 1,
      currentYear: 2026,
      density: "balanced",
      people: DEFAULT_PEOPLE.map((p) => ({ ...p, rates: p.rates.slice() })),
      wishlist: [],
      travel: { rates: [{ from: "2026-01", amount: 0 }], startMonth: "2026-01", balanceAdjustment: 0 },
      trips: [],
      years: {
        "2024": { ceiling: 21000, buffer: 0.04 },
        "2025": { ceiling: 23000, buffer: 0.04 },
        "2026": { ceiling: 25000, buffer: 0.04 },
      },
      templates: DEFAULT_TEMPLATES.slice(),
      transactions: [],
    };
  }

  // Idempotent migration — run on every load and on JSON restore.
  function migrateStore(s) {
    // ceiling rename
    if (s.years) {
      Object.keys(s.years).forEach((y) => {
        const yr = s.years[y];
        if (yr.ceiling == null && yr.target != null) {
          yr.ceiling = yr.target;
          delete yr.target;
        }
      });
    }
    // people default
    if (!s.people) {
      const earliest = s.years ? Object.keys(s.years).sort()[0] || "2026" : "2026";
      const from = earliest + "-01";
      s.people = [
        { id: "joseph", name: "Joseph", rates: [{ from, amount: 100 }], startMonth: from },
        { id: "marti",  name: "Marti",  rates: [{ from, amount: 200 }], startMonth: from },
      ];
    }
    // wishlist default
    if (!s.wishlist) s.wishlist = [];
    // travelWishlist: removed feature. Drop it so it stops being re-uploaded into the
    // settings blob. (Note: we deliberately do NOT delete s.transactions here — migrateStore
    // also runs on the local full store in loadStore, where transactions is authoritative.)
    if ('travelWishlist' in s) delete s.travelWishlist;
    // travel budget defaults (family-wide; startMonth mirrors the people migration)
    if (!s.travel) {
      const earliest = s.years ? Object.keys(s.years).sort()[0] || "2026" : "2026";
      const from = earliest + "-01";
      s.travel = { rates: [{ from, amount: 0 }], startMonth: from, balanceAdjustment: 0 };
    }
    if (!s.trips) s.trips = [];
    // legacy travel tx → trip_legacy (deterministic, idempotent; fixed timestamps keep the
    // settings-blob byte-identical across devices so merges never conflict)
    if (Array.isArray(s.transactions) && s.transactions.some((t) => t.travel && !t.trip_id)) {
      if (!s.trips.some((tr) => tr.id === "trip_legacy")) {
        s.trips.push({ id: "trip_legacy", name: "Past travel", location: "", startDate: null, endDate: null, createdAt: 0, updatedAt: 0 });
      }
      s.transactions = s.transactions.map((t) => (t.travel && !t.trip_id) ? { ...t, trip_id: "trip_legacy" } : t);
    }
    // density default
    if (!s.density) s.density = "balanced";
    // normalize transaction categories (Revolut stores title-case labels like "Groceries")
    if (Array.isArray(s.transactions)) {
      const unknowns = [];
      s.transactions = s.transactions.map((t) => {
        const nc = normalizeCategory(t.category);
        if (nc === 'general' && String(t.category || '').toLowerCase() !== 'general') unknowns.push(t.category);
        return nc === t.category ? t : { ...t, category: nc };
      });
      if (unknowns.length) console.warn('Yearly: unknown categories bucketed into General:', [...new Set(unknowns)]);
    }
    return s;
  }

  function todayISO() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return migrateStore(s);
      }
    } catch (e) {}
    const seed = buildSeed();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); } catch (e) {}
    return seed;
  }
  function saveStore(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {} }
  function resetStore() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} return buildSeed(); }

  window.YData = {
    STORAGE_KEY, CATEGORIES, CAT_BY_ID, cat, normalizeCategory, DEFAULT_TEMPLATES,
    loadStore, saveStore, resetStore, buildSeed, migrateStore, todayISO, uid,
  };
})();
