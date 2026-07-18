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

  // ---- store.plan — scenario/decision-record seed (settings-blob synced, one-time migration) ----
  // Fixed ids/timestamps (not Date.now()/uid()) so independent devices that migrate before their
  // first sync produce a byte-identical seed and never conflict — same pattern as trip_legacy.
  function buildSeedPlan() {
    const SEED_LOG_TEXT = "Seeded from July 2026 analysis (rental arbitrage / Rowing Channel / school decision).";
    const seedLog = () => [{ id: "log_seed", date: "2026-07-18", text: SEED_LOG_TEXT }];
    return {
      portfolio: 530000,
      portfolioAsOf: "2026-07-18",
      externalIncome: 18000,
      levers: [
        {
          id: "lv_move", label: "Rowing Channel move (net)", amount: 6500,
          reversibility: "medium", horizon: "open-ended, re-decided yearly",
          beneficiary: "Whole family / Marti daily", durability: "high",
          notes: "≈€15.6k rent + €1.5k utilities/fuel − €10.7k net apartment rent (after 9% tax, 10% vacancy). Only lever that partially self-finances. Durable QoL = friction removal, Marti walk-to-work, park; house-size upgrade hedonically adapts in ~1–2 yrs. Requires 60-day owner-occupancy clause on apartment lease; reversibility decays as daughter roots. Risks: Marti stabilization, landlord/tenant friction, in-laws no longer walkable.",
          updatedAt: 0,
        },
        {
          id: "lv_maplebear", label: "Maple Bear (all-in)", amount: 6000,
          reversibility: "low", horizon: "2028–2040, rising with grades",
          beneficiary: "Daughter", durability: "high",
          notes: "PLACEHOLDER — replace with real tuition quote + bus (€2k/yr) or own driving. 10-year commitment; least reversible item. Short run from Rowing Channel; from center it re-adds the cross-town commute.",
          updatedAt: 0,
        },
        {
          id: "lv_crosstown", label: "Cross-town school run", amount: 500,
          reversibility: "instant", horizon: "school years",
          beneficiary: "—", durability: "low",
          notes: "Fuel + time cost of Maple Bear from the center. Only applies to center-based scenarios.",
          updatedAt: 0,
        },
        {
          id: "lv_travel", label: "Extra travel & fun", amount: 8000,
          reversibility: "instant", horizon: "none",
          beneficiary: "Marti / family memories", durability: "high",
          notes: "Scalable €0–12k; cancel any quarter. Experiences resist hedonic adaptation (anticipation + event + memory). Solves none of the daily frictions.",
          scale: { min: 0, max: 12000, step: 500 },
          updatedAt: 0,
        },
      ],
      scenarios: [
        {
          id: "sc_fortress", name: "Fortress", leverRefs: [],
          baselineOverride: null, incomeOverride: null,
          notes: "Reference case: center apartment, public school. Survives any recorded market history.",
          log: seedLog(), pinned: true, updatedAt: 0,
        },
        {
          id: "sc_fortress_travel", name: "Fortress + travel",
          leverRefs: [{ leverId: "lv_travel", enabled: true, amountOverride: null }],
          baselineOverride: null, incomeOverride: null,
          notes: "Marti-preferred package. Fully sustainable; every euro buys exactly one euro of consumption.",
          log: seedLog(), pinned: false, updatedAt: 0,
        },
        {
          id: "sc_move_public", name: "Move, public school",
          leverRefs: [{ leverId: "lv_move", enabled: true, amountOverride: null }],
          baselineOverride: null, incomeOverride: null,
          notes: "€6.5k net buys ~€17k of housing via the apartment offset.",
          log: seedLog(), pinned: false, updatedAt: 0,
        },
        {
          id: "sc_move_maplebear", name: "Move + Maple Bear",
          leverRefs: [
            { leverId: "lv_move", enabled: true, amountOverride: null },
            { leverId: "lv_maplebear", enabled: true, amountOverride: null },
          ],
          baselineOverride: null, incomeOverride: null,
          notes: "Over the 3.5% envelope at a €26k baseline; viable only with the trigger system or consulting income (~10–15 senior fintech days/yr covers it).",
          log: seedLog(), pinned: false, updatedAt: 0,
        },
        {
          id: "sc_center_maplebear", name: "Center + Maple Bear",
          leverRefs: [
            { leverId: "lv_maplebear", enabled: true, amountOverride: null },
            { leverId: "lv_crosstown", enabled: true, amountOverride: null },
          ],
          baselineOverride: null, incomeOverride: null,
          notes: "Recreates the commute the move was meant to eliminate. Worst money-to-lifestyle ratio of the set.",
          log: seedLog(), pinned: false, updatedAt: 0,
        },
      ],
      triggers: [
        {
          id: "tr_return_apt", label: "Return to apartment (60-day clause)", portfolioFloor: 400000,
          action: "Cancel suburban lease; reoccupy apartment at tenancy end — deletes ≈€10k/yr net.",
          updatedAt: 0,
        },
        {
          id: "tr_switch_school", label: "Switch school at year boundary", portfolioFloor: 330000,
          action: "Maple Bear → public at next school year — deletes ≈€6k/yr.",
          updatedAt: 0,
        },
        {
          id: "tr_sell_apt", label: "Consolidate: sell apartment", portfolioFloor: 270000,
          action: "Sell (CGT-free, 3+ yr sole residence) into portfolio; rent consumption permanently.",
          updatedAt: 0,
        },
      ],
    };
  }

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
      plan: buildSeedPlan(),
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
    // plan (scenario/decision-record view) default — one-time seed migration; never overwrites
    // an existing store.plan (mirrors the trips/travel migration pattern above).
    if (!s.plan) s.plan = buildSeedPlan();
    // scale on "Extra travel & fun" — additive backfill for stores that migrated s.plan before
    // the scale field existed (the builder renders a slider only when scale is present).
    if (s.plan && Array.isArray(s.plan.levers)) {
      const travelLever = s.plan.levers.find((l) => l.id === "lv_travel");
      if (travelLever && !travelLever.scale) travelLever.scale = { min: 0, max: 12000, step: 500 };
    }
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
