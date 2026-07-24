// ── helpers ──────────────────────────────────────────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Convert a D1 row to a plain record (blob already parsed for settings).
// For transactions: keep all columns as-is (fun stays 0/1, deleted stays 0/1).
function rowToTx(row) {
  return {
    id:                row.id,
    date:              row.date,
    ts:                row.ts,
    description:       row.description,
    amount_eur:        row.amount_eur,
    category:          row.category,
    note:              row.note,
    source:            row.source,
    fun:               row.fun,
    person:            row.person,
    original_amount:   row.original_amount,
    original_currency: row.original_currency,
    deleted:           row.deleted,
    updated_at:        row.updated_at,
    revolut_category:  row.revolut_category,
    merchant_mcc:      row.merchant_mcc,
    merchant_city:     row.merchant_city,
    merchant_country:  row.merchant_country,
    merchant_logo:     row.merchant_logo,
    card_label:        row.card_label,
    tx_type:           row.tx_type,
    e_commerce:        row.e_commerce,
    fee_eur:           row.fee_eur,
    oneoff:            row.oneoff,
    travel:            row.travel,
    trip_id:           row.trip_id,
    amortize_months:   row.amortize_months,
    virtual:           row.virtual,
    fun_allocations:   row.fun_allocations,
  };
}

// Map a client tx record to D1 bind values for an upsert.
function txToBinds(tx, now) {
  return [
    tx.id,
    tx.date,
    tx.ts           ?? null,
    tx.description  ?? null,
    tx.amount_eur,
    tx.category,
    tx.note         ?? null,
    tx.source       ?? null,
    tx.fun          ? 1 : 0,
    tx.person       ?? null,
    tx.original_amount   ?? null,
    tx.original_currency ?? null,
    tx.deleted      ? 1 : 0,   // explicit coerce: absent/falsy → 0
    tx.revolut_category  ?? null,
    tx.merchant_mcc      ?? null,
    tx.merchant_city     ?? null,
    tx.merchant_country  ?? null,
    tx.merchant_logo     ?? null,
    tx.card_label        ?? null,
    tx.tx_type           ?? null,
    tx.e_commerce        ? 1 : 0,
    tx.fee_eur           ?? null,
    tx.oneoff       ? 1 : 0,
    tx.travel       ? 1 : 0,
    tx.trip_id      ?? null,
    tx.amortize_months ?? null,
    tx.virtual      ? 1 : 0,
    typeof tx.fun_allocations === "string" ? tx.fun_allocations : null,
    now,
  ];
}

// ── Worker ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── API ──────────────────────────────────────────────
    if (url.pathname.startsWith("/api/")) {

      // GET /api/health
      if (request.method === "GET" && url.pathname === "/api/health") {
        const row = await env.DB.prepare("SELECT 1 AS ok").first();
        return Response.json({ ok: true, db: row?.ok === 1 });
      }

      // GET /api/sync?since=<ms>
      if (request.method === "GET" && url.pathname === "/api/sync") {
        const since = parseInt(url.searchParams.get("since") ?? "0", 10) || 0;
        const now = Date.now();

        const txRows = await env.DB
          .prepare("SELECT * FROM transactions WHERE updated_at >= ?")
          .bind(since)
          .all();

        const settingsRow = await env.DB
          .prepare("SELECT blob, updated_at FROM settings WHERE id = 1 AND updated_at >= ?")
          .bind(since)
          .first();

        const settings = settingsRow
          ? { blob: JSON.parse(settingsRow.blob), updated_at: settingsRow.updated_at }
          : null;

        return json({ now, transactions: (txRows.results ?? []).map(rowToTx), settings });
      }

      // GET /api/sync/check — cheap aggregate the client uses to detect silent divergence
      if (request.method === "GET" && url.pathname === "/api/sync/check") {
        const txRow = await env.DB
          .prepare(`
            SELECT COUNT(*) AS tx_count,
                   CAST(ROUND(COALESCE(SUM(amount_eur), 0) * 100) AS INTEGER) AS sum_eur_cents
              FROM transactions
             WHERE deleted = 0
          `)
          .first();

        const settingsRow = await env.DB
          .prepare("SELECT updated_at FROM settings WHERE id = 1")
          .first();

        let metaRow = null;
        try {
          metaRow = await env.DB
            .prepare("SELECT value FROM meta WHERE key = 'last_revolut_sync_ts'")
            .first();
        } catch (_) {
          // meta table absent on old deployments — return null
        }

        return json({
          tx_count:              txRow?.tx_count       ?? 0,
          sum_eur_cents:         txRow?.sum_eur_cents  ?? 0,
          settings_updated_at:   settingsRow?.updated_at ?? 0,
          last_revolut_sync_ts:  metaRow?.value ?? null,
        });
      }

      // POST /api/transactions
      if (request.method === "POST" && url.pathname === "/api/transactions") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

        if (!Array.isArray(body)) return json({ error: "body must be an array" }, 400);
        for (const item of body) {
          if (!item || typeof item.id !== "string") {
            return json({ error: "each item must have a string id" }, 400);
          }
        }

        const now = Date.now();
        const UPSERT = `
          INSERT INTO transactions
            (id,date,ts,description,amount_eur,category,note,source,fun,person,
             original_amount,original_currency,deleted,
             revolut_category,merchant_mcc,merchant_city,merchant_country,
             merchant_logo,card_label,tx_type,e_commerce,fee_eur,
             oneoff,travel,trip_id,amortize_months,virtual,fun_allocations,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            date=excluded.date, ts=excluded.ts, description=excluded.description,
            amount_eur=excluded.amount_eur, category=excluded.category,
            note=excluded.note, source=excluded.source,
            fun=excluded.fun, person=excluded.person,
            original_amount=excluded.original_amount,
            original_currency=excluded.original_currency,
            deleted=excluded.deleted,
            revolut_category=excluded.revolut_category,
            merchant_mcc=excluded.merchant_mcc,
            merchant_city=excluded.merchant_city,
            merchant_country=excluded.merchant_country,
            merchant_logo=excluded.merchant_logo,
            card_label=excluded.card_label,
            tx_type=excluded.tx_type,
            e_commerce=excluded.e_commerce,
            fee_eur=excluded.fee_eur,
            oneoff=excluded.oneoff,
            travel=excluded.travel,
            trip_id=excluded.trip_id,
            amortize_months=excluded.amortize_months,
            virtual=excluded.virtual,
            fun_allocations=excluded.fun_allocations,
            updated_at=excluded.updated_at
        `;

        const stmts = body.map(tx =>
          env.DB.prepare(UPSERT).bind(...txToBinds(tx, now))
        );
        await env.DB.batch(stmts);

        return json({ now, count: stmts.length });
      }

      // POST /api/revolut/ingest — field-preserving upsert for the mobile Revolut
      // import pipeline. Unlike POST /api/transactions, this UPDATE SET excludes
      // user-owned columns (category, fun, person, note, deleted, oneoff, travel,
      // trip_id, amortize_months, virtual) so it never clobbers in-app edits,
      // mirroring revolut_clean.py's PRESERVE_ON_CONFLICT.
      if (request.method === "POST" && url.pathname === "/api/revolut/ingest") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

        if (!Array.isArray(body)) return json({ error: "body must be an array" }, 400);
        for (const item of body) {
          if (!item || typeof item.id !== "string") {
            return json({ error: "each item must have a string id" }, 400);
          }
        }

        const now = Date.now();
        const INGEST_UPSERT = `
          INSERT INTO transactions
            (id,date,ts,description,amount_eur,category,note,source,fun,person,
             original_amount,original_currency,deleted,
             revolut_category,merchant_mcc,merchant_city,merchant_country,
             merchant_logo,card_label,tx_type,e_commerce,fee_eur,
             oneoff,travel,trip_id,amortize_months,virtual,fun_allocations,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            date=excluded.date, ts=excluded.ts, description=excluded.description,
            amount_eur=excluded.amount_eur,
            source=excluded.source,
            original_amount=excluded.original_amount,
            original_currency=excluded.original_currency,
            revolut_category=excluded.revolut_category,
            merchant_mcc=excluded.merchant_mcc,
            merchant_city=excluded.merchant_city,
            merchant_country=excluded.merchant_country,
            merchant_logo=excluded.merchant_logo,
            card_label=excluded.card_label,
            tx_type=excluded.tx_type,
            e_commerce=excluded.e_commerce,
            fee_eur=excluded.fee_eur,
            updated_at=excluded.updated_at
        `;

        const stmts = body.map(tx =>
          env.DB.prepare(INGEST_UPSERT).bind(...txToBinds(tx, now))
        );
        stmts.push(
          env.DB.prepare(`
            INSERT INTO meta (key, value) VALUES ('last_revolut_sync_ts', ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value
          `).bind(now)
        );
        await env.DB.batch(stmts);

        return json({ now, count: body.length });
      }

      // GET /api/settings
      if (request.method === "GET" && url.pathname === "/api/settings") {
        const row = await env.DB
          .prepare("SELECT blob, updated_at FROM settings WHERE id = 1")
          .first();
        if (!row) return json({ blob: null });
        return json({ blob: JSON.parse(row.blob), updated_at: row.updated_at });
      }

      // PUT /api/settings
      if (request.method === "PUT" && url.pathname === "/api/settings") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

        // The settings row is settings-only. Transactions live in their own table;
        // travelWishlist is a removed feature. Strip both server-side so a stale client
        // can never re-contaminate the blob (a legacy client once wrote the full store here,
        // bloating the row ~120×). This endpoint is the authoritative gate.
        if (body && typeof body === "object") {
          delete body.transactions;
          delete body.travelWishlist;
        }

        const now = Date.now();
        await env.DB
          .prepare(`
            INSERT INTO settings (id, blob, updated_at) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at
          `)
          .bind(JSON.stringify(body), now)
          .run();

        return json({ now, updated_at: now });
      }

      // GET /api/export
      if (request.method === "GET" && url.pathname === "/api/export") {
        const exported_at = Date.now();
        const txRows = await env.DB.prepare("SELECT * FROM transactions").all();
        const settingsRow = await env.DB
          .prepare("SELECT blob, updated_at FROM settings WHERE id = 1")
          .first();
        const settings = settingsRow
          ? { blob: JSON.parse(settingsRow.blob), updated_at: settingsRow.updated_at }
          : { blob: null };

        return json({
          exported_at,
          transactions: (txRows.results ?? []).map(rowToTx),
          settings,
        });
      }

      return new Response("Not found", { status: 404 });
    }

    // ── Everything else: serve the static app ────────────
    return env.ASSETS.fetch(request);
  },
};
