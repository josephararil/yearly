/**
 * Revolut mobile header sniffer — one-time diagnostic tool, NOT part of the regular import flow.
 *
 * scripts/bookmarklet.js sends a hardcoded x-device-id/x-browser-application/x-client-version
 * captured once from a desktop DevTools session. Revolut's backend appears to tie x-device-id to
 * the authenticated session (a request with a device id captured elsewhere is rejected with a 401
 * "Phone and/or passcode are incorrect" — treated as an untrusted/mismatched device rather than a
 * plain auth failure). This tool captures the REAL headers your phone's own browser sends to the
 * same transactions endpoint, so those values can be copied into bookmarklet.js for that device.
 *
 * Unlike bookmarklet.js, this does NOT show a full-screen overlay (that would block you from
 * scrolling the page to trigger new requests). It's a small panel pinned to the bottom of the
 * screen instead, so the transaction list above it is still usable.
 *
 * Usage:
 *   1. Install this as a bookmark (see docs/REVOLUT.md "Debugging" section for the javascript: URL).
 *   2. Open app.revolut.com, logged in, on the transactions/statement screen.
 *   3. Tap this bookmark FIRST (it patches fetch/XHR to watch for the transactions endpoint).
 *   4. Scroll the transaction list (triggers pagination) or pull-to-refresh — this fires a request
 *      to the same endpoint bookmarklet.js calls, which gets captured.
 *   5. The bottom panel shows the captured URL + headers. Tap Copy, then share them so
 *      bookmarklet.js's hardcoded headers can be updated for this device.
 */
(function () {
  const MATCH = "/api/retail/user/current/transactions";
  const seen = [];

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:45vh;overflow:auto;" +
    "background:#111;color:#0f0;font-family:monospace;font-size:11px;padding:8px;" +
    "box-sizing:border-box;border-top:2px solid #f80;white-space:pre-wrap;";
  const status = document.createElement("div");
  status.textContent = "Header sniffer active — scroll the transaction list or pull-to-refresh to trigger a request…";
  status.style.cssText = "margin-bottom:6px;color:#eee;";
  const pre = document.createElement("div");
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "margin-top:6px;display:flex;gap:8px;";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy captured headers";
  copyBtn.disabled = true;
  copyBtn.style.cssText = "flex:1;padding:10px;font-size:13px;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.cssText = "flex:1;padding:10px;font-size:13px;";
  btnRow.appendChild(copyBtn);
  btnRow.appendChild(closeBtn);
  panel.appendChild(status);
  panel.appendChild(pre);
  panel.appendChild(btnRow);
  document.body.appendChild(panel);

  closeBtn.onclick = () => panel.remove();
  copyBtn.onclick = async () => {
    const text = JSON.stringify(seen, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy captured headers"; }, 1500);
    } catch (err) {
      status.textContent = "Clipboard blocked — select the text below manually.";
      pre.style.userSelect = "text";
    }
  };

  function record(url, headers) {
    seen.push({ url, headers });
    status.textContent = `Captured ${seen.length} request(s) to the transactions endpoint:`;
    pre.textContent = JSON.stringify(seen, null, 2);
    copyBtn.disabled = false;
  }

  // Patch fetch — most SPAs use this.
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(MATCH) !== -1) {
        const headers = {};
        const h = (init && init.headers) || (input && input.headers);
        if (h) {
          if (typeof Headers !== "undefined" && h instanceof Headers) {
            h.forEach((v, k) => { headers[k] = v; });
          } else {
            Object.keys(h).forEach(k => { headers[k] = h[k]; });
          }
        }
        record(url, headers);
      }
    } catch (e) { /* never let sniffing break the real request */ }
    return origFetch.apply(this, arguments);
  };

  // Patch XMLHttpRequest too, in case the app uses it instead of fetch.
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__sniffUrl = url;
    this.__sniffHeaders = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__sniffHeaders) this.__sniffHeaders[k] = v;
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      if (this.__sniffUrl && this.__sniffUrl.indexOf(MATCH) !== -1) {
        record(this.__sniffUrl, this.__sniffHeaders);
      }
    } catch (e) { /* never let sniffing break the real request */ }
    return origSend.apply(this, arguments);
  };
})();
