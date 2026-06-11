# PWA, service worker & local dev

How the app installs/caches, and how to run + test it locally (including the Claude Code preview
sequence). The #1 everyday gotcha — **bump `CACHE_NAME` on every shell change** — is summarized in
CLAUDE.md; the full detail lives here.

## Running it

There is **no build, no package manager, no tests, no linter**. The app is a single static HTML
file that loads React + Babel from CDN and transpiles the `y/*.jsx` modules in the browser.

- Serve over HTTP and open `public/index.html`. Two valid approaches:
  - **From repo root:** `python -m http.server 8766` → visit `http://localhost:8766/public/`
    (preferred for Claude Code preview — see below)
  - **From `public/`:** `python -m http.server --directory public 8002` → visit
    `http://localhost:8002/`
  It will **not** work over `file://` — the `type="text/babel" src=` scripts require HTTP.
- State persists to `localStorage` under `yearly:store:v1`; on first load `buildSeed` creates a
  blank store (no transactions, no wishlist) with default year settings, people, and templates. To
  reset to a blank store, clear that key.
- Also hosted on GitHub Pages — `index.html` at the repo root serves as the PWA entry point.

### Local dev — no backend, no reload loop

The sync layer (`y/sync.jsx`) calls `/api/sync`, `/api/transactions`, and `/api/settings`. These
endpoints only exist on the production Cloudflare Worker. Running locally means every sync call gets
a 404 from the static file server. This is handled gracefully: `syncFetch` treats 404 as a silent
no-op (returns `null`) and never reloads the page — only 200-with-HTML (Cloudflare Access login
redirect) or 401/403 trigger a reload. Auth-expiry reloads are throttled to one per 30 s via
`safeReload()` (sessionStorage key `yearly:lastReload`) so a persistent transient error never
becomes a reload loop.

**If you see the app reloading every second** in the local preview, the likely cause is a stale
service worker whose precache contains an old `sync.jsx` that had the original `location.reload()`
on any non-JSON response. Fix:
1. DevTools → Application → Service Workers → "Unregister".
2. DevTools → Application → Cache Storage → delete all `yearly-v*` caches.
3. Hard-reload (`Ctrl+Shift+R` / `Cmd+Shift+R`).

The new SW (once installed) uses `{cache: 'no-cache'}` when precaching, so this should not recur
after a version bump.

**`yearly:bootstrapped` is absent on a fresh origin** (e.g. localhost vs production). On first load,
`bootstrap()` tries `/api/sync?since=0`, gets a 404, and returns without setting the key. The app
still renders fine — bootstrap just silently no-ops on every load. The localStorage keys only get
populated when the app runs against the real backend.

### Self-contained (no external dependencies)

The app is fully self-contained — **no `_ds/` directory is needed**. The original Aperture design
system dependency has been replaced by two local files:
- **`y/tokens.css`** — defines the complete Broadsheet token set. No legacy remaps remain; all
  screens use canonical names. Loaded in `index.html` before `y/app.css`.
- **`y/ds.jsx`** — an IIFE that sets `window.ApertureDesignSystem_72a4cd = { Button,
  SegmentedControl, Input, Chip }`, matching exactly the props the app passes to each. Loaded after
  `y/icons.jsx` and before `y/ui.jsx` / screens.

## PWA (offline + install)

- **`sw.js`** (repo root) — **network-first** service worker. On every fetch it tries the network;
  on success it writes the response to cache and returns it. On network failure it serves from
  cache. Precaches the full app shell on install (all `y/*.jsx`, `y/*.css`, `manifest.json`,
  `index.html`, and the three pinned CDN URLs for React/ReactDOM/Babel). The old cache is deleted on
  `activate`. `skipWaiting()` + `clients.claim()` ensure the new SW takes over immediately.
  **Install hardening:** the install handler uses individual `fetch({cache:'no-cache'}).catch()`
  calls instead of `cache.addAll` so a single URL failure does not abort the entire SW install, and
  `no-cache` ensures the install always fetches fresh files. Same `!response.redirected` guard
  applied in the install handler as in the fetch handler. **Logo caching:** merchant logo requests
  (`storage.googleapis.com/revolut-prod-apps_merchant-logo/…`) use a **cache-first** strategy with a
  dedicated `yearly-logos-v1` cache; once fetched a logo is never re-fetched, and this cache is
  intentionally NOT deleted on app version bumps (logos are stable per URL). All other requests
  remain network-first.

> **Cache-versioning rule:** bump `CACHE_NAME` in `sw.js` whenever the shell changes (new file in
> the precache list, CDN URL pinned to a new version, etc.). Current version: `yearly-v42` — keep it
> in lockstep with `APP_VERSION` in `settings.jsx`.

- **`manifest.json`** — includes `id`, `scope`, `start_url`, and an `icons` array with 192×192,
  512×512, and a maskable 512×512 variant (all SVG). SVG icons work in Chrome 91+ and modern
  WebKit/Firefox; for production Android/iOS you would swap in PNGs.
- **`icons/icon.svg`** — flat accent-blue (#0071e3) tile with white "Y." wordmark and iOS-style
  rounded corners (rx 115). Used for both 192 and 512 manifest entries.
- **`icons/icon-maskable.svg`** — same design, full bleed (no rx), content within the inner 80% safe
  zone so the OS mask never clips the wordmark. Used for the `"purpose": "maskable"` manifest entry.
- **`index.html`** registers the SW at the end of `<body>` with feature detection (`if
  ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')`). Also adds `<link
  rel="apple-touch-icon" href="icons/icon.svg">` for iOS home-screen icons.

> After any `sw.js` change: hard-refresh and confirm the new SW activated in DevTools → Application
> → Service Workers before investigating anything else.

## Regression test — `calc.test.html`

**Verify after any change to `y/calc.jsx` or `y/data.jsx`: open `/calc.test.html` — ALL rows must
PASS.**

`calc.test.html` (repo root) loads `y/data.jsx` + `y/calc.jsx` as plain `<script>` tags (no Babel
needed; neither file has JSX). Not precached by `sw.js` (dev artifact only).

**It lives at the repo root, not inside `public/`** — so the `--directory public` server cannot
reach it. Start a second server from the repo root:
```
python -m http.server 8003
# then open http://localhost:8003/calc.test.html
```

**Node.js shortcut (faster, no browser — preferred in CLI-only Claude Code sessions** where
`preview_*` tools don't exist): `calc.jsx`/`data.jsx` run in Node as-is with a two-line shim. Write
a temp script (delete after use):
```js
// _tmp_test.js
global.window = global;
global.crypto = { randomUUID: () => Math.random().toString(36).slice(2) };
const fs = require('fs');
eval(fs.readFileSync('./public/y/data.jsx', 'utf8'));
eval(fs.readFileSync('./public/y/calc.jsx', 'utf8'));
const s = YCalc.computeStats(YData.buildSeed(), 2026, new Date('2026-06-07T12:00:00Z'));
console.log(s.mainTarget === 21400 ? 'PASS' : 'FAIL');
```
```
node _tmp_test.js
```

## Claude Code preview — how to deploy locally for testing

The app lives inside `public/`, but the Python server must be started from the **repo root** (not
`--directory public`). This is the setup that reliably works.

**`.claude/launch.json` (already configured):**
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "yearly", "runtimeExecutable": "cmd",
      "runtimeArgs": ["/c", "python", "-m", "http.server", "8766"],
      "port": 8766, "autoPort": true }
  ]
}
```

**Why `cmd /c`?** On Windows, `python -m http.server` must be launched via `cmd /c` for
`preview_start` to detect it. Direct `python` as `runtimeExecutable` is unreliable.

**Why serve from repo root (not `--directory public`)?** The critical insight:
- Serving from `public/`: the browser auto-navigates to `http://localhost:PORT/` which loads
  `index.html` directly. If anything goes wrong it lands on `chrome-error://chromewebdata/`, and
  **from that error page `window.location` assignments are silently ignored** — the preview browser
  is permanently stuck, escapable only via `preview_stop` → `preview_start`. Costs many tokens.
- Serving from the **repo root**: the browser gets a valid directory-listing page, from which you
  CAN redirect to `/public/` via eval.

**Step-by-step sequence:**
```
1. preview_start("yearly")                 → returns serverId and actual port (e.g. 54321)
2. preview_eval: window.location.href      → should be "http://localhost:54321/" (if chrome-error,
                                              preview_stop + preview_start before proceeding)
3. preview_eval: window.location.href = 'http://localhost:54321/public/';
4. preview_console_logs (level: all)       → React DevTools info + Babel warn are normal; any ERROR
                                              means something broke — fix before screenshots
5. preview_screenshot                       → verify the app renders
```

**Port conflicts:** Ports 8000, 8002, 8003, 8765 are often already in use. Port 8766 tends to be
free; `autoPort: true` finds the next available one. Use the port returned by `preview_start`, not
the configured one, in step 3.

**After every code change** (PWA service worker — changes are NOT reflected on a simple reload):
bump `CACHE_NAME` in `public/sw.js` AND hard-refresh. In the preview browser:
```js
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  location.reload();
})()
```
If `navigator.serviceWorker` is unavailable in the eval context, just bump the cache version and
reload — the new SW activates on the next page load.

**chrome-error recovery:** if `preview_eval: window.location.href` returns
`"chrome-error://chromewebdata/"`, do NOT attempt further evals/navigation (they silently no-op).
Run `preview_stop` → `preview_start` for a fresh browser, then repeat from step 1.
