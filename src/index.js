export default {
     async fetch(request, env) {
       const url = new URL(request.url);

       // ── API ──────────────────────────────────────────────
       if (url.pathname.startsWith("/api/")) {
         if (request.method === "GET" && url.pathname === "/api/health") {
           // Prove we can reach the database. SELECT 1 needs no tables.
           const row = await env.DB.prepare("SELECT 1 AS ok").first();
           // Response.json sets the JSON content-type header for you.
           return Response.json({ ok: true, db: row?.ok === 1 });
         }
         return new Response("Not found", { status: 404 });
       }

       // ── Everything else: serve the static app ────────────
       // Reached only for non-/api/ paths that didn't match a file.
       return env.ASSETS.fetch(request);
     },
   };