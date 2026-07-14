/**
 * Revolut mobile capture bookmarklet — source.
 *
 * Adapted from CONSOLE_TEMPLATE in scripts/sync.py (same BASE, WALLET, x-device-id, headers,
 * and pagination). Run this from a bookmark while logged into app.revolut.com (works on mobile).
 * Instead of downloading a file, it renders the fetched JSON into a full-screen overlay with a
 * "Copy" button so the clipboard write happens on a real button-tap user gesture — required for
 * navigator.clipboard.writeText to work on mobile browsers, since the fetch/pagination itself is
 * async and doesn't count as a user gesture.
 *
 * STOP_BEFORE is stateless (always Jan 1 of the current year — full YTD), unlike sync.py's
 * BUFFER_DAYS-based incremental window, because there is no local state file on a phone.
 * Over-fetching is harmless: the app's import flow filters to the current year and the ingest
 * endpoint's upsert is idempotent + field-preserving.
 *
 * To install: see docs/REVOLUT.md "Mobile path" for the ready-to-paste javascript: URL, or run
 * `node scripts/build_bookmarklet.js` equivalent manually — minify this file's IIFE body to a
 * single line, URI-encode it, and prefix with "javascript:".
 */
(async () => {
  const headers = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "x-browser-application": "WEB_CLIENT",
    "x-client-version": "100.0",
    "x-device-id": "AAAAAIXDDztSOzqJLJZaae2QShIgSMJa6PgaOQP86SD/0AfbuALYF356fkx+vwwOJF8D+L3rjdMW2EOWIAu5hdWzIK7hUCNDYPD6HEBBnBA9URP3rtLIhHoKhYymmrd9BY9dgA==",
    "x-timezone": "Europe/Sofia"
  };
  const BASE = "https://app.revolut.com/api/retail/user/current/transactions/last";
  const WALLET = "b3badc0f-f575-43ec-8ca5-eac55929d857";
  const STOP_BEFORE = new Date(`${new Date().getFullYear()}-01-01`).getTime();

  // --- overlay UI ---------------------------------------------------------
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#111;color:#eee;" +
    "display:flex;flex-direction:column;padding:12px;box-sizing:border-box;" +
    "font-family:monospace;font-size:13px;";
  const status = document.createElement("div");
  status.textContent = "Fetching transactions…";
  status.style.cssText = "margin-bottom:8px;white-space:pre-wrap;";
  const textarea = document.createElement("textarea");
  textarea.readOnly = true;
  textarea.style.cssText =
    "flex:1;width:100%;box-sizing:border-box;background:#000;color:#0f0;" +
    "font-family:monospace;font-size:12px;padding:8px;border:1px solid #444;";
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "margin-top:8px;display:flex;gap:8px;";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy JSON";
  copyBtn.disabled = true;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  [copyBtn, closeBtn].forEach(b => {
    b.style.cssText = "flex:1;padding:12px;font-size:15px;";
  });
  btnRow.appendChild(copyBtn);
  btnRow.appendChild(closeBtn);
  overlay.appendChild(status);
  overlay.appendChild(textarea);
  overlay.appendChild(btnRow);
  document.body.appendChild(overlay);

  closeBtn.onclick = () => overlay.remove();

  // Clipboard write happens ONLY here, inside the click handler — a fresh user
  // gesture — so it's allowed on mobile even though the fetch above was async.
  copyBtn.onclick = async () => {
    const text = textarea.value;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy JSON"; }, 1500);
    } catch (err) {
      // Fallback: select the textarea so the user can copy manually.
      textarea.focus();
      textarea.select();
      status.textContent += "\nClipboard API blocked — text selected, use your browser's copy.";
    }
  };

  // --- fetch/paginate ------------------------------------------------------
  try {
    const all = [];
    let to = Date.now();
    while (true) {
      const url = `${BASE}?to=${to}&count=50&walletId=${WALLET}`;
      const res = await fetch(url, { headers, credentials: "include" });
      const batch = await res.json();
      if (!batch.length) { status.textContent = "No more transactions."; break; }
      all.push(...batch);
      const lastDate = batch[batch.length - 1].startedDate;
      status.textContent = `Fetched ${all.length} transactions... last: ${new Date(lastDate).toISOString().slice(0, 10)}`;
      if (lastDate < STOP_BEFORE) { status.textContent += "\nReached stop date."; break; }
      to = lastDate - 1;
      await new Promise(r => setTimeout(r, 300));
    }
    const unique = Object.values(Object.fromEntries(all.map(t => [t.id, t])));
    textarea.value = JSON.stringify(unique);
    status.textContent = `Done. ${unique.length} unique transactions ready to copy.`;
    copyBtn.disabled = false;
  } catch (err) {
    status.textContent = `Error: ${err.message}. Are you logged into app.revolut.com?`;
  }
})();
