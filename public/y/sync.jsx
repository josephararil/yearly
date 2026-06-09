// sync.jsx — client sync layer: outbox, pull/flush, bootstrap.
// Attaches window.YSync. Depends on window.YData (for migrateStore).
(function () {
  const CURSOR_KEY  = 'yearly:sync:cursor';
  const OUTBOX_KEY  = 'yearly:outbox:v1';
  const DIRTY_KEY   = 'yearly:settings:dirty';
  const BOOT_KEY    = 'yearly:bootstrapped';
  const APPLIED_KEY = 'yearly:settings:appliedAt';
  const CHUNK       = 75;

  let _getStore    = null;
  let _applyServer = null;

  // ---- localStorage helpers ----
  function getCursor()   { return parseInt(localStorage.getItem(CURSOR_KEY)  || '0', 10); }
  function setCursor(v)  { localStorage.setItem(CURSOR_KEY,  String(v)); }
  function getAppliedAt(){ return parseInt(localStorage.getItem(APPLIED_KEY) || '0', 10); }
  function setAppliedAt(v){ localStorage.setItem(APPLIED_KEY, String(v)); }

  function getOutbox() {
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; }
  }
  function setOutbox(arr) { localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr)); }

  // ---- shape mappers ----
  function txToRow(tx) {
    return {
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount_eur: tx.amount_eur,
      category: tx.category,
      note: tx.note || null,
      source: tx.source || 'manual',
      fun: tx.fun ? 1 : 0,
      person: tx.person || null,
      original_amount: tx.original_amount != null ? tx.original_amount : null,
      original_currency: tx.original_currency || null,
      deleted: tx.deleted ? 1 : 0,
    };
  }

  function rowToTx(row) {
    const tx = {
      id: row.id,
      date: row.date,
      description: row.description,
      amount_eur: row.amount_eur,
      category: YData.normalizeCategory(row.category),
      source: row.source || 'manual',
    };
    if (row.note)              tx.note              = row.note;
    if (row.fun)               tx.fun               = true;
    if (row.person)            tx.person            = row.person;
    if (row.original_amount  != null) tx.original_amount  = row.original_amount;
    if (row.original_currency)        tx.original_currency = row.original_currency;
    if (row.merchant_logo)            tx.merchant_logo     = row.merchant_logo;
    if (row.merchant_city)            tx.merchant_city     = row.merchant_city;
    return tx;
  }

  // ---- fetch wrapper: distinguishes offline vs auth-expiry ----
  async function syncFetch(url, opts) {
    let response;
    try {
      response = await fetch(url, opts);
    } catch (_e) {
      // fetch threw — could be offline OR cross-origin 302 (Access expiry) CORS block
      if (!navigator.onLine) return null; // offline — keep outbox, retry on reconnect
      location.reload();                  // online + threw = expired Access session
      return null;
    }
    const ct = response.headers.get('content-type') || '';
    if (!response.ok || !ct.includes('application/json')) {
      // Only reload for auth-expiry: 200 with HTML (Cloudflare Access login redirect)
      // or explicit 401/403. Silent-fail on 404/5xx — those are backend or local-dev issues.
      if (navigator.onLine) {
        const isAuthExpiry = (response.ok && !ct.includes('application/json'))
          || response.status === 401 || response.status === 403;
        if (isAuthExpiry) location.reload();
      }
      return null;
    }
    return response.json();
  }

  // ---- public: init ----
  function init({ getStore, applyServer }) {
    _getStore    = getStore;
    _applyServer = applyServer;
  }

  // ---- public: enqueueTx ----
  function enqueueTx(record) {
    const outbox = getOutbox();
    const idx    = outbox.findIndex(x => x.id === record.id);
    if (idx >= 0) outbox[idx] = record;
    else          outbox.push(record);
    setOutbox(outbox);
    scheduleFlush();
  }

  // ---- public: markSettingsDirty ----
  function markSettingsDirty() {
    localStorage.setItem(DIRTY_KEY, '1');
    scheduleFlush();
  }

  // ---- public: flush ----
  async function flush() {
    // 1. Flush transaction outbox
    const outbox = getOutbox();
    if (outbox.length > 0) {
      const sentIds = new Set(outbox.map(x => x.id));
      const rows    = outbox.map(txToRow);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk  = rows.slice(i, i + CHUNK);
        const result = await syncFetch('/api/transactions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(chunk),
        });
        if (!result) return; // offline or reload triggered
        if (result.now) setCursor(result.now);
      }
      // Remove only the ids we captured — new mutations added during the POST survive
      setOutbox(getOutbox().filter(x => !sentIds.has(x.id)));
    }

    // 2. Flush settings (capture-then-clear so an edit mid-flight isn't lost)
    const isDirty = localStorage.getItem(DIRTY_KEY) === '1';
    if (isDirty && _getStore) {
      localStorage.removeItem(DIRTY_KEY);
      const { transactions: _t, ...settings } = _getStore();
      const result = await syncFetch('/api/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(settings),
      });
      if (!result) {
        localStorage.setItem(DIRTY_KEY, '1'); // restore on failure
        return;
      }
      if (result.updated_at) setAppliedAt(result.updated_at);
      if (result.now)        setCursor(result.now);
    }
  }

  // ---- public: pull ----
  async function pull() {
    await flush();
    const result = await syncFetch(`/api/sync?since=${getCursor()}`);
    if (!result || !_applyServer) return;

    // Pre-compute settings merge outside the state updater (no side-effects inside updater)
    const appliedAt = getAppliedAt();
    const incomingSettings = result.settings;
    let settingsPatch = null;
    let newAppliedAt  = null;
    if (incomingSettings && incomingSettings.updated_at > appliedAt) {
      const migrated = window.YData.migrateStore(incomingSettings.blob);
      const { transactions: _t, ...rest } = migrated;
      settingsPatch = rest;
      newAppliedAt  = incomingSettings.updated_at;
    }

    _applyServer(prev => {
      const txMap = Object.fromEntries(prev.transactions.map(x => [x.id, x]));
      for (const row of (result.transactions || [])) {
        if (row.deleted) delete txMap[row.id];
        else             txMap[row.id] = rowToTx(row);
      }
      let next = { ...prev, transactions: Object.values(txMap) };
      if (settingsPatch) next = { ...next, ...settingsPatch };
      return next;
    });

    if (newAppliedAt) setAppliedAt(newAppliedAt);
    setCursor(result.now);
  }

  // ---- public: bootstrap ----
  async function bootstrap() {
    if (localStorage.getItem(BOOT_KEY)) return;

    const result = await syncFetch('/api/sync?since=0');
    if (!result) return; // offline — will retry on next trigger

    if (result.transactions && result.transactions.length > 0) {
      // Server has data → adopt it (second-device path)
      if (_applyServer) {
        const incomingSettings = result.settings;
        let settingsPatch = null;
        let newAppliedAt  = null;
        if (incomingSettings && incomingSettings.updated_at > 0) {
          const migrated = window.YData.migrateStore(incomingSettings.blob);
          const { transactions: _t, ...rest } = migrated;
          settingsPatch = rest;
          newAppliedAt  = incomingSettings.updated_at;
        }
        _applyServer(_prev => {
          const txMap = {};
          for (const row of result.transactions) {
            if (!row.deleted) txMap[row.id] = rowToTx(row);
          }
          let next = { ..._prev, transactions: Object.values(txMap) };
          if (settingsPatch) next = { ...next, ...settingsPatch };
          return next;
        });
        if (newAppliedAt) setAppliedAt(newAppliedAt);
      }
      setCursor(result.now);
    } else {
      // Server is empty → seed it (first-device path)
      if (!_getStore) return;
      const store = _getStore();
      const txns  = store.transactions;
      for (let i = 0; i < txns.length; i += CHUNK) {
        const chunk  = txns.slice(i, i + CHUNK).map(txToRow);
        const r      = await syncFetch('/api/transactions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(chunk),
        });
        if (!r) return;
        if (r.now) setCursor(r.now);
      }
      const { transactions: _t, ...settings } = store;
      const sr = await syncFetch('/api/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(settings),
      });
      if (!sr) return;
      if (sr.updated_at) setAppliedAt(sr.updated_at);
      if (sr.now)        setCursor(sr.now);
    }

    localStorage.setItem(BOOT_KEY, '1');
  }

  // ---- public: start ----
  let _flushTimer = null;
  function scheduleFlush() {
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(flush, 1500);
  }

  function start() {
    window.addEventListener('online',            () => flush());
    window.addEventListener('focus',             () => flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pull();
    });
  }

  window.YSync = { init, enqueueTx, markSettingsDirty, flush, pull, bootstrap, start };
})();
