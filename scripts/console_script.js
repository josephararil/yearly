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
  const STOP_BEFORE = new Date("2026-01-01").getTime();
  const all = [];
  let to = Date.now();
  while (true) {
    const url = `${BASE}?to=${to}&count=50&walletId=${WALLET}`;
    const res = await fetch(url, { headers, credentials: "include" });
    const batch = await res.json();
    if (!batch.length) { console.log("No more transactions."); break; }
    all.push(...batch);
    const lastDate = batch[batch.length - 1].startedDate;
    console.log(`Fetched ${all.length} transactions... last: ${new Date(lastDate).toISOString().slice(0,10)}`);
    if (lastDate < STOP_BEFORE) { console.log("Reached stop date."); break; }
    to = lastDate - 1;
    await new Promise(r => setTimeout(r, 300));
  }
  const unique = Object.values(Object.fromEntries(all.map(t => [t.id, t])));
  console.log(`Unique transactions: ${unique.length}`);
  const blob = new Blob([JSON.stringify(unique)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `revolut_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  console.log(`Done. ${unique.length} transactions downloaded.`);
})();