// revolut_import.jsx — browser-side port of scripts/revolut_clean.py (pure logic, no UI deps).
// Constants and detection rules are kept byte-for-byte in sync with the Python pipeline;
// see revolut_import.test.html for the parity test against a real Python-cleaned fixture.
(function () {

  // ---------------------------------------------------------------------------
  // CONFIG (revolut_clean.py:55-139, :197)
  // ---------------------------------------------------------------------------

  const REVOLUT_CATEGORY_MAP = {
    groceries:        "Groceries",
    restaurants:      "Restaurants",
    eating_out:       "Restaurants",
    cafe:             "Restaurants",
    transport:        "Transport",
    taxi:             "Transport",
    shopping:         "Shopping",
    clothes:          "Shopping",
    electronics:      "Shopping",
    health:           "Health",
    medical:          "Health",
    pharmacy:         "Health",
    fitness:          "Gym",
    sport:            "Gym",
    entertainment:    "Entertainment",
    travel:           "Travel",
    hotels:           "Travel",
    flights:          "Travel",
    utilities:        "Utilities",
    bills:            "Utilities",
    education:        "Sophie Kindergarten",
    services:         "Services",
    gifts:            "Gift",
    charity:          "Donation",
    pets:             "Pets",
    taxes:            "Taxes",
    transfers:        "Cash",
    general:          null, // fall through to name-based rules
  };

  const NAME_RULES = [
    // Groceries
    [/kaufland|aleks treyd|via trakia|t market|lidl|billa|fantastico|metro|carrefour|nak market|farma mol|btsm|lik 2/i, "Groceries"],
    // Restaurants & Food
    [/restaurant|mole|bigstroimat|horeca|borukov|tsveti i tedi|cafe|coffee|kfc|mcdonald|burger|pizza|sushi|kapancheto|bonbon|west cafe|gozba|amrest|rozhen|vm beykar|zlatna krusha|fusion|lagardere/i, "Restaurants"],
    // Health
    [/pharmacy|apteka|eczanesi|dr\.|clinic|hospital|dental|medical|diagnostichno|vision farm|farma/i, "Health"],
    // Transport
    [/omv|oil|vinetki|shell|lukoil|petrol|parking|uber|bolt|taxi|fuel/i, "Transport"],
    // Entertainment / Subscriptions
    [/spotify|realdebrid|google|netflix|apple|google play|youtube|steam|disney|hbo|prirodonauc/i, "Entertainment"],
    // Gym (Playbox Tennis Court shows as garbled Cyrillic — match on partial decode)
    [/gym|toni k eood|royal santelo|sila|dekatlon|fitness|sport|pulse|playbox/i, "Gym"],
    // Shopping
    [/pepco|itx bulgaria|penti|kik|denim 2019|nike|waikiki|aliexpress|mall|outlet|jumbo|zara|h&m|reserved|amazon|emag|deichmann|plovdiv plaza/i, "Shopping"],
    // Utilities & Bill payments
    [/evn|toplofikacia|vivacom|to christo|a1|yettel|water|electric|internet|epay|epaygo/i, "Utilities"],
    // House
    [/buildermart|partners|gospodinovi|ikea|mr bricolage|praktiker|jysk|gstroy/i, "House Stuff"],
    // Travel
    [/airbnb|suites|booking|hotel|ryanair|wizz|lufthansa|airport|airways|finkbeiner/i, "Travel"],
    // Taxes
    [/nap |noi |national revenue|tax |данък|osigurovki|epay/i, "Taxes"],
    // Services
    [/be partnars|et dobrina|herts|yani|sofi 3012|noir nicol/i, "Services"],
    // Kindergarten
    [/kindergarten|детска|gradina|sophie/i, "Sophie Kindergarten"],
  ];

  // Friendly description override for specific merchants. Each entry is
  // [name pattern, required amount_eur or null for any amount, override description].
  const DESCRIPTION_OVERRIDES = [
    [/lik 2 1926 eood/i, null, "Mesarnitza"],
    [/epay/i, 14.27, "Internet"],
  ];

  const SKIP_DESCRIPTION_PATTERNS = [
    "^transfer from joseph",
    "^transfer from martina",
    "^transfer to joseph",
    "^transfer to martina",
    "pocket withdrawal",
  ];
  const SKIP_DESC_REGEX = new RegExp(SKIP_DESCRIPTION_PATTERNS.join("|"), "i");

  const SKIP_TYPES = new Set(["TOPUP", "EXCHANGE"]);
  const SKIP_STATES = new Set(["REVERTED", "DECLINED", "FAILED"]);

  // Outbound transfers to self (the old cash-tracking IBAN hack): use Revolut's own
  // category instead of defaulting to Cash, since the user manually set the category
  // on these transfers at the time.
  const SELF_TRANSFER_DESCRIPTIONS = new Set([
    "to joseph harari laniado",
    "to джоузеф харари ланиадо",
  ]);

  // ---------------------------------------------------------------------------
  // FX (revolut_clean.py:155)
  // ---------------------------------------------------------------------------

  const _fxCache = new Map();
  // Tracks (currency, date) pairs that failed FX lookup, so callers can skip those rows
  // instead of silently falling back to rate=1.0 (which would massively misstate spending
  // for high-rate currencies like TRY).
  const _fxFailures = new Set();

  async function getEurRate(currency, dateStr) {
    if (currency === "EUR") return 1.0;
    const key = currency + "_" + dateStr;
    if (_fxCache.has(key)) return _fxCache.get(key);
    if (_fxFailures.has(key)) return null;
    try {
      // api.frankfurter.app now permanently 301-redirects to api.frankfurter.dev, and that
      // redirect response carries no Access-Control-Allow-Origin header — browsers abort the
      // whole fetch with "Failed to fetch" even though the final destination allows CORS
      // (server-side callers like Python's `requests`, which don't enforce CORS, don't see
      // this). Call the non-redirecting endpoint directly. Same response shape.
      const url = "https://api.frankfurter.dev/v1/" + dateStr + "?from=" + currency + "&to=EUR";
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const rate = data.rates.EUR;
      _fxCache.set(key, rate);
      return rate;
    } catch (e) {
      _fxFailures.add(key);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Rounding — Python round() is round-half-to-even (banker's); JS Math.round is
  // round-half-up. Foreign-currency rows can differ by a cent without this.
  // ---------------------------------------------------------------------------

  function roundHalfEven(value, decimals) {
    const factor = Math.pow(10, decimals);
    const shifted = value * factor;
    const floor = Math.floor(shifted);
    const diff = shifted - floor;
    if (Math.abs(diff - 0.5) < 1e-9) {
      return (floor % 2 === 0 ? floor : floor + 1) / factor;
    }
    return Math.round(shifted) / factor;
  }

  // ---------------------------------------------------------------------------
  // Category (revolut_clean.py:187)
  // ---------------------------------------------------------------------------

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
  }

  function assignCategory(tx) {
    const revolutCat = (tx.category || "").toLowerCase().trim();
    const merchant = tx.merchant || {};
    const merchantCat = (merchant.category || "").toLowerCase().trim();
    const merchantName = (merchant.name || "").trim();
    const description = tx.description || "";
    const txType = tx.type || "";

    // Outbound transfers to self / external transfers
    if (txType === "TRANSFER" && (tx.amount || 0) < 0) {
      if (SELF_TRANSFER_DESCRIPTIONS.has(description.toLowerCase().trim())) {
        const mapped = REVOLUT_CATEGORY_MAP[revolutCat];
        if (mapped) return mapped;
        return revolutCat ? capitalize(revolutCat) : "Cash";
      }
      const nameToCheck = (merchantName || description).toLowerCase();
      for (const [re, category] of NAME_RULES) {
        if (re.test(nameToCheck)) return category;
      }
      return "Cash";
    }

    // NAME_RULES take priority over Revolut's own category
    const nameToCheck = (merchantName || description).toLowerCase();
    for (const [re, category] of NAME_RULES) {
      if (re.test(nameToCheck)) return category;
    }

    // Fall back to Revolut's own category
    for (const key of [revolutCat, merchantCat]) {
      const mapped = REVOLUT_CATEGORY_MAP[key];
      if (mapped) return mapped;
    }

    return "General";
  }

  function overrideDescription(nameToCheck, amountEur) {
    for (const [pattern, requiredAmount, override] of DESCRIPTION_OVERRIDES) {
      if (requiredAmount !== null && roundHalfEven(amountEur, 2) !== requiredAmount) continue;
      if (pattern.test(nameToCheck)) return override;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Skip logic (revolut_clean.py:235)
  // ---------------------------------------------------------------------------

  function shouldSkip(tx) {
    if (SKIP_STATES.has(tx.state)) return { skip: true, reason: "state=" + tx.state };
    if ((tx.amount || 0) >= 0) return { skip: true, reason: "income/refund (amount >= 0)" };
    if (SKIP_TYPES.has(tx.type || "")) return { skip: true, reason: "type=" + tx.type };
    const description = tx.description || "";
    if (SKIP_DESC_REGEX.test(description)) return { skip: true, reason: "internal: " + description };
    return { skip: false, reason: "" };
  }

  // ---------------------------------------------------------------------------
  // Date helpers — UTC, to match Python's datetime.fromtimestamp(ts/1000, tz=utc)
  // ---------------------------------------------------------------------------

  function isoDateUTC(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function skipEntry(tx, reason) {
    const dateTs = tx.startedDate || tx.completedDate || tx.updatedDate;
    let dateStr;
    try { dateStr = isoDateUTC(dateTs); } catch (e) { dateStr = "????-??-??"; }
    const merchant = tx.merchant || {};
    const desc = (merchant.name || tx.description || "").trim();
    const currency = tx.currency || "EUR";
    const amount = (tx.amount || 0) / 100;
    const amountStr = (amount >= 0 ? "+" : "") + amount.toFixed(2) + " " + currency;
    return { date: dateStr, description: desc, amount_str: amountStr, reason };
  }

  // ---------------------------------------------------------------------------
  // JSON processing (revolut_clean.py:292)
  // ---------------------------------------------------------------------------

  async function buildRows(transactions) {
    // Dedupe by id — first occurrence wins (mirrors process_json_files' cross-file dedup).
    const dedup = new Map();
    for (const tx of transactions) {
      const id = tx && tx.id;
      if (id && !dedup.has(id)) dedup.set(id, tx);
    }
    const uniqueTxs = Array.from(dedup.values());

    const rows = [];
    const skippedDetail = [];
    const preYear = [];
    const fxDropped = [];

    for (const tx of uniqueTxs) {
      const { skip, reason } = shouldSkip(tx);
      if (skip) {
        skippedDetail.push(skipEntry(tx, reason));
        continue;
      }

      const currency = tx.currency || "EUR";
      const amountRaw = Math.abs(tx.amount || 0) / 100;
      const feeRaw = Math.abs(tx.fee || 0) / 100;

      // startedDate = when the transaction was made; completedDate = Visa settlement
      // (often a day later). We track when you spent, not when it cleared.
      const dateTs = tx.startedDate || tx.completedDate || tx.updatedDate;
      const dateStr = isoDateUTC(dateTs);

      const rate = await getEurRate(currency, dateStr);
      if (rate === null) {
        const merchant = tx.merchant || {};
        fxDropped.push({
          date: dateStr,
          description: (merchant.name || tx.description || "").trim(),
          currency,
          amountRaw,
        });
        continue;
      }

      const amountEur = roundHalfEven(amountRaw * rate, 2);
      const feeEur = feeRaw ? roundHalfEven(feeRaw * rate, 2) : 0.0;

      const merchant = tx.merchant || {};
      const merchantName = (merchant.name || "").trim();
      let description = merchantName || (tx.description || "").trim();
      const override = overrideDescription((merchantName || description).toLowerCase(), amountEur);
      if (override) description = override;

      rows.push({
        // Core / existing schema
        id:                 tx.id,
        date:                dateStr,
        ts:                  dateTs,
        description:         description,
        amount_eur:          amountEur,
        category:            assignCategory(tx),
        note:                (tx.comment || "").trim(),
        source:              "revolut",
        fun:                 0,
        person:              (tx.initiatedBy || {}).name || "",
        original_amount:     currency !== "EUR" ? amountRaw : "",
        original_currency:   currency !== "EUR" ? currency : "",
        deleted:             0,
        // New enrichment columns
        merchant_mcc:        merchant.mcc || "",
        merchant_city:       merchant.city || "",
        merchant_country:    merchant.country || "",
        merchant_logo:       merchant.logo || "",
        card_label:          (tx.card || {}).label || "",
        tx_type:             tx.type || "",
        e_commerce:          tx.eCommerce ? 1 : 0,
        fee_eur:             feeEur,
        revolut_category:    (tx.category || "").toLowerCase(),
      });
    }

    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Filter to current calendar year only — late-settling transactions from prior
    // year can bleed through since the API uses startedDate for pagination.
    const currentYear = String(new Date().getUTCFullYear());
    const kept = [];
    for (const r of rows) {
      if (r.date.slice(0, 4) === currentYear) kept.push(r);
      else preYear.push(r);
    }

    for (const r of preYear) {
      skippedDetail.push({
        date: r.date,
        description: r.description,
        amount_str: "€" + r.amount_eur.toFixed(2),
        reason: "prior year (before " + currentYear + ")",
      });
    }
    for (const r of fxDropped) {
      skippedDetail.push({
        date: r.date,
        description: r.description,
        amount_str: r.amountRaw.toFixed(2) + " " + r.currency,
        reason: "FX lookup failed (" + r.currency + ")",
      });
    }

    return { rows: kept, skipped: skippedDetail, parsed: uniqueTxs.length };
  }

  window.YRevolutImport = {
    REVOLUT_CATEGORY_MAP, NAME_RULES, DESCRIPTION_OVERRIDES,
    SKIP_DESCRIPTION_PATTERNS, SKIP_TYPES, SKIP_STATES, SELF_TRANSFER_DESCRIPTIONS,
    shouldSkip, assignCategory, overrideDescription, getEurRate, roundHalfEven, buildRows,
  };

})();
