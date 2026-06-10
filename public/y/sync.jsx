// sync.jsx — client sync layer: outbox, pull/flush, bootstrap.
// Attaches window.YSync. Depends on window.YData (for migrateStore).
(function () {
  const CURSOR_KEY  = 'yearly:sync:cursor';
  const OUTBOX_KEY  = 'yearly:outbox:v1';
  const DIRTY_KEY   = 'yearly:settings:dirty';
  const BOOT_KEY    = 'yearly:bootstrapped';
  const APPLIED_KEY = 'yearly:settings:appliedAt';
  const SEQ_KEY     = 'yearly:outbox:seq';
  const CHUNK       = 75;

  // Monotonically-increasing sequence counter — persisted so restarts don't reset it.
  // Each outbox entry is stamped with __seq on enqueue; flush captures (id → __seq) pairs
  // so an entry updated mid-flight (same id, higher __seq) survives the post-flush filter.
  let _seq = parseInt(localStorage.getItem(SEQ_KEY) || '0', 10);
  function nextSeq() { _seq += 1; localStorage.setItem(SEQ_KEY, String(_seq)); return _seq; }

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

  // ---- reload throttle: max one auth-expiry reload per 30s ----
  // navigator.onLine lies (captive portals, DNS failures) so a transient error
  // must not trigger a reload loop. sessionStorage resets on tab close.
  function safeReload() {
    const last = parseInt(sessionStorage.getItem('yearly:lastReload') || '0', 10);
    if (Date.now() - last < 30000) return;
    sessionStorage.setItem('yearly:lastReload', String(Date.now()));
    location.reload();
  }

  // ---- fetch wrapper: distinguishes offline vs auth-expiry ----
  async function syncFetch(url, opts) {
    let response;
    try {
      response = await fetch(url, opts);
    } catch (_e) {
      // fetch threw — could be offline OR cross-origin 302 (Access expiry) CORS block
      if (!navigator.onLine) return null; // offline — keep outbox, retry on reconnect
      safeReload();                       // online + threw = expired Access session
      return null;
    }
    const ct = response.headers.get('content-type') || '';
    if (!response.ok || !ct.includes('application/json')) {
      // Only reload for auth-expiry: 200 with HTML (Cloudflare Access login redirect)
      // or explicit 401/403. Silent-fail on 404/5xx — those are backend or local-dev issues.
      if (navigator.onLine) {
        const isAuthExpiry = (response.ok && !ct.includes('application/json'))
          || response.status === 401 || response.status === 403;
        if (isAuthExpiry) safeReload();
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
    const outbox  = getOutbox();
    const idx     = outbox.findIndex(x => x.id === record.id);
    const stamped = { ...record, __seq: nextSeq() };
    if (idx >= 0) outbox[idx] = stamped;
    else          outbox.push(stamped);
    setOutbox(outbox);
    scheduleFlush();
  }

  // ---- public: markSettingsDirty ----
  function markSettingsDirty() {
    localStorage.setItem(DIRTY_KEY, '1');
    scheduleFlush();
  }

  // ---- flush internals ----
  async function _flush() {
    // 1. Flush transaction outbox
    const outbox = getOutbox();
    if (outbox.length > 0) {
      // Capture (id → __seq) so a mid-flight update (same id, higher __seq) survives the filter.
      // Entries written before this change have __seq === undefined; undefined === undefined
      // removes them after send, matching the previous Set-based behavior.
      const sent = new Map(outbox.map(x => [x.id, x.__seq]));
      const rows = outbox.map(txToRow);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk  = rows.slice(i, i + CHUNK);
        const result = await syncFetch('/api/transactions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(chunk),
        });
        if (!result) return; // offline or reload triggered
      }
      // Keep any entry whose __seq advanced mid-flight — its newer version was never sent.
      setOutbox(getOutbox().filter(x => sent.get(x.id) !== x.__seq));
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
    }
  }

  // ---- public: flush (reentrancy latch) ----
  // Timer, 'online', 'focus', and pull() can all call flush() concurrently.
  // The latch collapses concurrent calls into one shared promise.
  let _flushing = null;
  function flush() {
    if (_flushing) return _flushing;
    _flushing = _flush().finally(() => { _flushing = null; });
    return _flushing;
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
    // Flush outbox first so offline-created transactions reach the server before
    // the since=0 pull decides whether the server "has data" (adopt vs seed path).
    await flush();

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
      }
      const { transactions: _t, ...settings } = store;
      const sr = await syncFetch('/api/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(settings),
      });
      if (!sr) return;
      if (sr.updated_at) setAppliedAt(sr.updated_at);
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
