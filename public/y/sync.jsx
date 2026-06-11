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
      oneoff: tx.oneoff ? 1 : 0,
    };
  }

  // Unknown-category tracker: warns once per session per distinct raw value.
  const _warnedCategories = new Set();

  function rowToTx(row) {
    const nc = YData.normalizeCategory(row.category);
    if (nc === 'general' && String(row.category || '').toLowerCase() !== 'general') {
      const raw = row.category;
      if (!_warnedCategories.has(raw)) {
        _warnedCategories.add(raw);
        console.warn('Yearly: unknown category bucketed into General:', raw);
      }
    }
    const tx = {
      id: row.id,
      date: row.date,
      description: row.description,
      amount_eur: row.amount_eur,
      category: nc,
      source: row.source || 'manual',
    };
    if (row.note)              tx.note              = row.note;
    if (row.fun)               tx.fun               = true;
    if (row.person)            tx.person            = row.person;
    if (row.oneoff)            tx.oneoff            = true;
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
  // pull({ force: true }) ignores the cursor and refetches the entire dataset —
  // the user-facing escape hatch for "the app is missing rows I know are on the server"
  // (e.g. when a server-side write lands with a stale updated_at and skips the cursor).
  async function pull(opts) {
    const force = !!(opts && opts.force);
    await flush();
    const since = force ? 0 : getCursor();
    const result = await syncFetch(`/api/sync?since=${since}`);
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

  // ---- public: reconcile ----
  // Compares server aggregate (count + sum_eur_cents + settings_updated_at) against local store.
  // If they differ, triggers a force pull to recover. Runs on every app start after bootstrap+pull.
  // Catches the class of bug where rows land on the server with a stale/malformed updated_at
  // (e.g. seconds instead of milliseconds) and are permanently skipped by cursor-based sync.
  // Note: _getStore() reads storeRef which React updates after render; if pull() just applied
  // new rows the ref may be stale, producing a harmless spurious force-pull. The recovery
  // outcome is the same either way — the store ends up consistent with the server.
  async function reconcile() {
    const serverCheck = await syncFetch('/api/sync/check');
    if (!serverCheck) return { ok: true, recovered: false }; // offline — silent no-op

    const store = _getStore ? _getStore() : { transactions: [] };
    const txns  = (store.transactions || []).filter(t => !t.deleted);
    const localCount    = txns.length;
    const localSumCents = Math.round(txns.reduce((s, t) => s + t.amount_eur, 0) * 100);
    const localAppliedAt = getAppliedAt();

    const before = { tx_count: localCount, sum_eur_cents: localSumCents, settings_updated_at: localAppliedAt };

    const mismatch =
      localCount    !== serverCheck.tx_count ||
      localSumCents !== serverCheck.sum_eur_cents ||
      localAppliedAt !== serverCheck.settings_updated_at;

    if (!mismatch) return { ok: true, before, after: before, recovered: false };

    await pull({ force: true });

    // Verify once more — a still-mismatching second check indicates a deeper bug.
    const afterServer = await syncFetch('/api/sync/check');
    const store2 = _getStore ? _getStore() : { transactions: [] };
    const txns2  = (store2.transactions || []).filter(t => !t.deleted);
    const after  = {
      tx_count:            txns2.length,
      sum_eur_cents:       Math.round(txns2.reduce((s, t) => s + t.amount_eur, 0) * 100),
      settings_updated_at: getAppliedAt(),
    };

    if (afterServer &&
        (after.tx_count    !== afterServer.tx_count ||
         after.sum_eur_cents !== afterServer.sum_eur_cents)) {
      console.warn('Yearly: reconcile still mismatches after force-pull — possible deeper sync bug',
        { after, server: afterServer });
    }

    return { ok: false, before, after, recovered: true };
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

  window.YSync = { init, enqueueTx, markSettingsDirty, flush, pull, reconcile, bootstrap, start };
})();
