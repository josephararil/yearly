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
- In production the app is served by the Cloudflare Worker (`src/index.js`), which serves `public/`
  as static assets; there is **no root `index.html`** — the entry point is `public/index.html`.

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

The app is fully self-contained — **no `_ds/` directory is needed**. Two local files provide the
design system:
- **`y/tokens.css`** — defines the complete Broadsheet token set. All screens use canonical names.
  Loaded in `index.html` before `y/app.css`.
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
> the precache list, CDN URL pinned to a new version, etc.). Current version: `yearly-v85` — keep it
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

## Dev-only sample data — `y/devseed.jsx`

The real store starts empty (`YData.buildSeed()` has no transactions), so a fresh local session has
nothing to render and changes are hard to verify. `public/y/devseed.jsx` seeds a realistic year of
spend — daily/weekly purchases, monthly bills, per-person fun spend, a one-off lump, plus a prior
year for YoY/`priorCum` — relative to *today* (current year lands modestly over its €25k ceiling, so
the pace / time-to-ceiling callouts fire).

**It is dev-only and never ships active:**
- `index.html` `document.write`s its `<script>` tag **only when `location.hostname` is a local host**
  (`localhost`/`127.0.0.1`/`0.0.0.0`/`::1`). In production the tag is never written, so the file is
  never requested, cached, or executed. It is **not** in `sw.js` `PRECACHE`.
- `devseed.jsx` re-checks the hostname itself (defence-in-depth) and **only writes when no store
  exists yet** — it never clobbers real data you pulled or edited locally. To re-trigger it, clear
  the `yearly:store:v1` key (Settings → clear, or devtools) and reload.
- It only touches `localStorage` — it never calls the API. The static dev server has no `/api`
  (every sync call 404s into a silent no-op), and against a real backend `YSync.bootstrap()` adopts
  server data instead of pushing, so the fixture can't reach D1.

The tag must load **before `app.jsx`** (which reads the store on mount) — that's why the loader sits
immediately above the `app.jsx` script in `index.html`.

## Claude Code preview — how to deploy locally for testing

The app lives inside `public/`, but the Python server must be started from the **repo root** (not
`--directory public`). This is the setup that reliably works. This section uses the current Browser
pane tool names (`mcp__Claude_Browser__*` — `preview_start`, `navigate`, `computer`, `read_page`,
`javascript_tool`, `preview_logs`, `preview_list`). If you see references elsewhere (or in your own
memory) to `preview_eval` / `preview_screenshot` / `preview_console_logs`, those are the old names —
map them to `javascript_tool` / `computer{action:"screenshot"}` / `read_console_messages`.

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
  can navigate to `/public/`.

### If port 8766 is already in use — do NOT chase a random port

`preview_start({name: "yearly"})` has `autoPort: true`: if 8766 is taken (very common — the user, or
another Claude Code session/tab, is usually already running the dev server there for this project),
it silently launches a **second** server on a random port (e.g. 58968) and hands you that port
instead. Do not follow it. That second server is a distinct, empty-cache process that nobody else is
looking at, it is not "the app" the user means when they say "check the preview," and repeatedly
retrying `preview_start`/navigating to whatever new random port it returns is exactly the loop that
wastes many turns for no gain.

**Do this instead:**
1. Check first whether 8766 is already serving: `Bash`/`PowerShell` → `netstat -ano | findstr :8766`
   (or just try navigating to it — it either loads or it doesn't).
2. If it's already up, skip `preview_start` entirely and go straight to
   `navigate({tabId, url: "http://localhost:8766/public/"})`. This is almost always the right move —
   the existing server reads the same files on disk, so your edits are already being served by it.
3. Only call `preview_start({name:"yearly"})` if 8766 is truly free (nothing else running this repo's
   dev server yet), or the user explicitly asks you to run your own isolated instance.
4. If `preview_start` still returns a different port because 8766 got taken between your check and
   the call, treat that as a signal to re-check for an existing server and prefer `8766` over the
   returned port — don't just accept whatever port comes back without asking whether 8766 is already
   good enough.

**Step-by-step sequence (fresh server case):**
```
1. netstat -ano | findstr :8766          → confirm nothing is already listening
2. preview_start({name:"yearly"})        → returns serverId + tabId + actual port
3. navigate({tabId, url:"http://localhost:<port>/"})   → expect a directory listing, not chrome-error
4. navigate({tabId, url:"http://localhost:<port>/public/"})
5. read_console_messages({tabId})        → React DevTools info + Babel warn are normal; any ERROR
                                            means something broke — fix before screenshots
6. computer({tabId, action:"screenshot"}) → verify the app renders
```

**Port conflicts:** Ports 8000, 8002, 8003, 8765 are often already in use for other projects. Port
8766 is this project's convention — always try it directly first (see above) before letting
`autoPort` pick something else.

### Verifying a code change actually shows up — hard-refresh first, every time

**A plain reload (`navigate` to the same URL, or `location.reload()`) is NOT reliable evidence that
your edit is live.** This app is double-cached — the service worker's Cache Storage *and* the
browser's own HTTP cache for `y/*.jsx` — and a normal reload can silently keep serving old bytes from
either layer even after you "unregister the SW and clear caches," because the SW's install-time
fetch can itself be satisfied from the stale HTTP cache. Symptoms: you edited a component, the
feature is verifiably in the file on disk, but the rendered UI/behavior doesn't change no matter how
many times you reload or re-run the unregister/clear-caches snippet below.

**The fix that reliably works:** a real hard refresh, not a script-driven reload:
```js
computer({ tabId, action: "key", text: "ctrl+shift+r" })
```
Do this *first*, before spending turns debugging the code itself, whenever a change doesn't appear
in the preview — per the general rule in CLAUDE.md ("assume stale cache first"). If you want to
confirm which layer was stale rather than guess, compare a no-store fetch against a normal one from
the console:
```js
Promise.all([
  fetch('/public/y/addflow.jsx').then(r => r.text()),
  fetch('/public/y/addflow.jsx', {cache: 'no-store'}).then(r => r.text()),
]).then(([cached, fresh]) => ({ same: cached === fresh, cachedLen: cached.length, freshLen: fresh.length }))
```
If `same` is `false`, the tab is serving stale bytes through normal `fetch`/`<script>` loads — hard
refresh (above) before doing anything else. Only after confirming fresh bytes are loading is it worth
debugging application logic.

The SW-unregister/clear-caches snippet is still useful for a full reset (e.g. clearing `yearly-v*`
caches, or diagnosing "reloads every second" per the section above) but is not itself sufficient to
guarantee fresh code — always follow it (or replace it) with the `ctrl+shift+r` key press:
```js
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
})()
```
then `computer({tabId, action:"key", text:"ctrl+shift+r"})`.

**chrome-error recovery:** if `navigate` or a `javascript_tool` eval shows `window.location.href` as
`"chrome-error://chromewebdata/"`, do NOT attempt further evals/navigation (they silently no-op). Use
`preview_stop` → `preview_start` for a fresh browser (or `tabs_create` for a fresh tab against the
same server), then repeat from the top.
