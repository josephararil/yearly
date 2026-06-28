#!/usr/bin/env python3
"""
sync.py — Automate the Revolut → D1 sync pipeline.

Commands:
    python sync.py prepare   Generate console script (copied to clipboard) with
                             correct STOP_BEFORE based on last sync date.

    python sync.py push      Watch Downloads for new revolut_*.json, clean it,
                             generate SQL, push to D1, update state.

    python sync.py status    Show last sync date and transaction count.

Config: edit the CONFIG block below.
"""

import sys
import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# The preview uses → … Δ ✓ €, none guaranteed by the Windows console code page. Emit UTF-8
# so printing never raises UnicodeEncodeError regardless of where this runs.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------------------------------------------------------------------------
# CONFIG — edit these
# ---------------------------------------------------------------------------

# Your Wrangler D1 database name
D1_DATABASE = "yearly-db"

# Wallet ID from the Revolut network request
REVOLUT_WALLET = "b3badc0f-f575-43ec-8ca5-eac55929d857"

# Device ID from the Revolut network request
REVOLUT_DEVICE_ID = "AAAAAIXDDztSOzqJLJZaae2QShIgSMJa6PgaOQP86SD/0AfbuALYF356fkx+vwwOJF8D+L3rjdMW2EOWIAu5hdWzIK7hUCNDYPD6HEBBnBA9URP3rtLIhHoKhYymmrd9BY9dgA=="

# Safety buffer — pull this many extra days before last sync to catch late-settling txns.
# Pagination is keyed on startedDate, so a transaction that stays PENDING longer than this
# window falls behind it before completing and its finalised amount/date would be missed.
# 30 days covers realistic pending durations (holds, disputes). Safe to widen because the
# pipeline's upsert preserves user-owned fields on conflict (see revolut_clean.py
# PRESERVE_ON_CONFLICT) — re-pulling already-imported rows no longer reverts in-app edits.
BUFFER_DAYS = 30

# Where this script lives (also where revolut_clean.py lives)
SCRIPT_DIR = Path(__file__).parent

# State file — stores last sync metadata
STATE_FILE = SCRIPT_DIR / ".sync_state.json"

# Downloads folder — where browser saves files
DOWNLOADS_DIR = Path.home() / "Downloads"

# Where to put intermediate files (gitignored)
WORK_DIR = SCRIPT_DIR

# Where raw JSON downloads and console scripts are archived
BATCHES_DIR = SCRIPT_DIR / "batches"

# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_sync_date": None, "last_sync_ts": None, "total_transactions": 0}

def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ---------------------------------------------------------------------------
# prepare — generate console script
# ---------------------------------------------------------------------------

CONSOLE_TEMPLATE = """\
(async () => {{
  const headers = {{
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "x-browser-application": "WEB_CLIENT",
    "x-client-version": "100.0",
    "x-device-id": "{device_id}",
    "x-timezone": "Europe/Sofia"
  }};
  const BASE = "https://app.revolut.com/api/retail/user/current/transactions/last";
  const WALLET = "{wallet}";
  const STOP_BEFORE = new Date("{stop_before}").getTime();
  const all = [];
  let to = Date.now();
  while (true) {{
    const url = `${{BASE}}?to=${{to}}&count=50&walletId=${{WALLET}}`;
    const res = await fetch(url, {{ headers, credentials: "include" }});
    const batch = await res.json();
    if (!batch.length) {{ console.log("No more transactions."); break; }}
    all.push(...batch);
    const lastDate = batch[batch.length - 1].startedDate;
    console.log(`Fetched ${{all.length}} transactions... last: ${{new Date(lastDate).toISOString().slice(0,10)}}`);
    if (lastDate < STOP_BEFORE) {{ console.log("Reached stop date."); break; }}
    to = lastDate - 1;
    await new Promise(r => setTimeout(r, 300));
  }}
  const unique = Object.values(Object.fromEntries(all.map(t => [t.id, t])));
  console.log(`Unique transactions: ${{unique.length}}`);
  const blob = new Blob([JSON.stringify(unique)], {{ type: "application/json" }});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `revolut_${{new Date().toISOString().slice(0,10)}}.json`;
  a.click();
  console.log(`Done. ${{unique.length}} transactions downloaded.`);
}})();"""

def cmd_prepare():
    state = load_state()

    if state["last_sync_date"]:
        # Go back BUFFER_DAYS before last sync to catch late-settling transactions
        last = datetime.fromisoformat(state["last_sync_date"])
        stop = (last - timedelta(days=BUFFER_DAYS)).strftime("%Y-%m-%d")
        print(f"Last sync: {state['last_sync_date']}")
        print(f"Pulling from: {stop} (with {BUFFER_DAYS}-day buffer)")
    else:
        # First run — pull full current year
        stop = f"{datetime.now().year}-01-01"
        print(f"No previous sync found. Pulling from: {stop}")

    script = CONSOLE_TEMPLATE.format(
        device_id=REVOLUT_DEVICE_ID,
        wallet=REVOLUT_WALLET,
        stop_before=stop,
    )

    # Copy to clipboard
    copied = False
    try:
        import subprocess
        if sys.platform == "win32":
            subprocess.run("clip", input=script.encode(), check=True)
            copied = True
        elif sys.platform == "darwin":
            subprocess.run("pbcopy", input=script.encode(), check=True)
            copied = True
        else:
            subprocess.run(["xclip", "-selection", "clipboard"],
                           input=script.encode(), check=True)
            copied = True
    except Exception:
        pass

    # Also write to file as fallback
    BATCHES_DIR.mkdir(exist_ok=True)
    script_file = BATCHES_DIR / "console_script.js"
    script_file.write_text(script, encoding="utf-8")

    if copied:
        print("\n✓ Console script copied to clipboard.")
    else:
        print(f"\nCould not copy to clipboard. Script saved to: {script_file}")

    print("\nNext steps:")
    print("  1. Open app.revolut.com and log in")
    print("  2. Open DevTools console (F12)")
    print("  3. Paste and press Enter")
    print("  4. Wait for download to complete")
    print("  5. Run: python sync.py push")

# ---------------------------------------------------------------------------
# push — detect JSON, clean, push to D1
# ---------------------------------------------------------------------------

def find_new_json(since_ts: float, timeout: int = 120) -> Path | None:
    """Wait for a new revolut_*.json in Downloads, return its path."""
    print(f"Watching {DOWNLOADS_DIR} for revolut_*.json download...")
    deadline = time.time() + timeout
    seen = set(DOWNLOADS_DIR.glob("revolut_*.json"))

    while time.time() < deadline:
        current = set(DOWNLOADS_DIR.glob("revolut_*.json"))
        new = current - seen
        # Filter to files created after we started watching
        fresh = [p for p in new if p.stat().st_mtime >= since_ts]
        if fresh:
            p = sorted(fresh, key=lambda f: f.stat().st_mtime)[-1]
            print(f"  Found: {p.name}")
            return p
        time.sleep(1)

    return None

def _trunc(s: str, n: int) -> str:
    s = s or ""
    return s if len(s) <= n else s[: n - 1] + "…"

def query_d1_rows(min_date: str) -> tuple[dict | None, str]:
    """Read current D1 state for rows on/after min_date, keyed by id.
    Returns (results_dict, "") on success, or (None, error_message) on failure.
    Queried by date range to stay under shell command length limits on large batches."""
    cmd = (
        f'npx wrangler d1 execute {D1_DATABASE} --remote --json '
        f'--command "SELECT id, date, description, amount_eur, category, fun, person, note, deleted '
        f"FROM transactions WHERE date >= '{min_date}'\""
    )
    try:
        # Force UTF-8: wrangler's JSON contains Cyrillic merchant names and €; the Windows
        # default (cp1252) raises UnicodeDecodeError in the reader thread and loses output.
        result = subprocess.run(cmd, cwd=SCRIPT_DIR, shell=True, capture_output=True,
                                encoding="utf-8", errors="replace", timeout=60)
    except Exception as e:
        return None, f"Exception running wrangler: {e}"

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        parts = []
        if stderr:
            parts.append(f"stderr:\n{stderr}")
        if stdout:
            parts.append(f"stdout:\n{stdout}")
        if not parts:
            parts.append(f"wrangler exited with code {result.returncode} (no output)")
        return None, "\n".join(parts)

    out = result.stdout or ""
    try:
        data = json.loads(out)
    except Exception:
        # Tolerate any leading banner text wrangler may print before the JSON array.
        start, end = out.find("["), out.rfind("]")
        if start == -1 or end == -1:
            return None, f"Could not parse wrangler output as JSON:\n{out[:800]}"
        try:
            data = json.loads(out[start:end + 1])
        except Exception as e:
            return None, f"JSON parse error: {e}\nOutput:\n{out[:800]}"

    try:
        results = data[0]["results"]  # shape: [{ "results": [...], "success": true, ... }]
    except Exception as e:
        return None, f"Unexpected response shape: {e}\nData: {str(data)[:800]}"

    return {r["id"]: r for r in results}, ""

def _print_skipped(skipped: list):
    if not skipped:
        return
    from collections import defaultdict
    groups: dict[str, list] = defaultdict(list)
    for s in skipped:
        groups[s["reason"]].append(s)
    print(f"\n  SKIPPED ({len(skipped)}) — excluded by pipeline rules, not pushed")
    for reason, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        print(f"    {reason} — {len(items)}")
        for s in sorted(items, key=lambda x: x["date"]):
            print(f"      {s['date']}  {_trunc(s['description'], 30):<30}  {s['amount_str']}")

def _print_category_summary(rows: list, label: str):
    if not rows:
        return
    from collections import defaultdict
    by_cat: dict[str, float] = defaultdict(float)
    for r in rows:
        by_cat[r["category"]] += r["amount_eur"]
    total = sum(by_cat.values())
    print(f"\n  {label} by category (€{total:.2f}):")
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"    {cat:<22} €{amt:>8.2f}")

def preview_changes(report: dict | None, json_path: Path):
    """Print exactly what pushing will add / change / leave alone (diffed against live D1),
    plus what was excluded and why. The whole point of the preview."""
    try:
        age_min = (time.time() - json_path.stat().st_mtime) / 60
        age = f"{int(age_min)}m ago" if age_min < 60 else f"{age_min / 60:.1f}h ago"
    except Exception:
        age = "?"
    state = load_state()

    print("\n" + "=" * 64)
    print("  REVOLUT SYNC — PUSH PREVIEW")
    print("=" * 64)
    print(f"  Source    : {json_path.name} (downloaded {age})")
    if state.get("last_sync_date"):
        print(f"  Last sync : {state['last_sync_date']}")

    if not report:
        print("\n  (No report produced — cannot preview. Inspect latest.sql manually.)")
        return

    rows = report.get("rows", [])
    skipped = report.get("skipped", [])
    print(f"  Parsed    : {report.get('parsed', '?')} transactions → "
          f"{len(rows)} to import after filters")

    d1_error: str | None = None  # None = not attempted; "" = success; non-empty = error
    db = None
    if rows:
        min_date = min(r["date"] for r in rows)
        print(f"\n  Reading live D1 ({D1_DATABASE}) to diff…")
        db, d1_error = query_d1_rows(min_date)

    if d1_error is not None and db is None:
        print("\n  ✗ D1 query failed — cannot show diff.")
        for line in d1_error.splitlines():
            print(f"    {line}")
        auth_keywords = ("login", "auth", "unauthorized", "403", "unauthenticated", "token", "oauth")
        if any(k in d1_error.lower() for k in auth_keywords):
            print("\n  Looks like an auth issue. Re-authenticate with:")
            print("    npx wrangler login")
            print("  Then re-run: python sync.py push")
        _print_category_summary(rows, "Push set (no diff — D1 unreadable)")
        _print_skipped(skipped)
        answer = input("\n  Continue push without D1 diff? [y/N] ").strip().lower()
        if answer != "y":
            sys.exit("Aborted. Fix the D1 connection and retry.")
        return

    if db is None:
        # rows was empty — nothing to diff
        _print_category_summary(rows, "Push set")
        _print_skipped(skipped)
        return

    # Compare only pipeline-authoritative, user-visible fields. `updated_at` is excluded
    # (it always changes). category/fun/person/note/deleted are excluded because the upsert
    # PRESERVES them on conflict — they never change in D1, so flagging them would be a lie.
    COMPARE = ("date", "description", "amount_eur")
    new, changed, unchanged, deleted_hits = [], [], [], 0
    for r in rows:
        d = db.get(r["id"])
        if d is None:
            new.append(r)
            continue
        if int(d.get("deleted") or 0) == 1:
            deleted_hits += 1
        diffs = []
        for f in COMPARE:
            old, newv = d.get(f), r.get(f)
            if f == "amount_eur":
                if round(float(old or 0), 2) != round(float(newv or 0), 2):
                    diffs.append((f, old, newv))
            elif (old or "") != (newv or ""):
                diffs.append((f, old, newv))
        if diffs:
            changed.append((r, diffs))
        else:
            unchanged.append(r)

    print(f"\n  CHANGES TO PUSH (vs live D1)")
    print(f"    + {len(new):>3} new")
    print(f"    ~ {len(changed):>3} changed")
    print(f"    = {len(unchanged):>3} unchanged (no-op)")

    if new:
        print(f"\n  NEW ({len(new)}) — will be inserted")
        for r in sorted(new, key=lambda x: x["date"]):
            print(f"    {r['date']}  {_trunc(r['description'], 30):<30}  "
                  f"€{r['amount_eur']:>8.2f}  {r['category']}")
    if changed:
        print(f"\n  CHANGED ({len(changed)}) — pipeline fields updated; "
              f"your category/fun/note/deleted are preserved")
        for r, diffs in sorted(changed, key=lambda x: x[0]["date"]):
            print(f"    {r['date']}  {_trunc(r['description'], 30)}")
            for f, old, newv in diffs:
                if f == "amount_eur":
                    delta = float(newv or 0) - float(old or 0)
                    print(f"        amount   €{float(old or 0):.2f} → "
                          f"€{float(newv or 0):.2f}  (Δ {delta:+.2f})")
                else:
                    print(f"        {f:<8} {old or ''!r} → {newv or ''!r}")
    if deleted_hits:
        print(f"\n  Note: {deleted_hits} row(s) in this batch are deleted in D1 — "
              f"push keeps them deleted (won't resurrect).")

    added = sum(r["amount_eur"] for r in new)
    delta = sum(
        float(newv or 0) - float(old or 0)
        for _, diffs in changed for f, old, newv in diffs if f == "amount_eur"
    )
    print(f"\n  NET IMPACT ON TOTAL: €{added + delta:+.2f}  "
          f"(new €{added:+.2f}, changed Δ €{delta:+.2f})")

    _print_category_summary(new, "New spend")
    _print_skipped(skipped)

def cmd_push(json_path: Path | None = None):
    watch_start = time.time()

    if json_path is None:
        # Check if there's already a revolut_*.json sitting in Downloads
        existing = sorted(
            DOWNLOADS_DIR.glob("revolut_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if existing:
            newest = existing[0]
            age_mins = (time.time() - newest.stat().st_mtime) / 60
            age_str = f"{int(age_mins)}m ago" if age_mins < 60 else f"{age_mins/60:.1f}h ago"
            answer = input(f"Found {newest.name} ({age_str}). Use this file? [Y/n] ").strip().lower()
            if answer != "n":
                json_path = newest

    if json_path is None:
        print("Watching Downloads for a new revolut_*.json file (120s timeout)...")
        json_path = find_new_json(since_ts=watch_start - 30, timeout=120)
        if json_path is None:
            sys.exit("Timed out waiting for download. Run 'python sync.py push' after downloading.")

    # Copy to work dir
    work_json = WORK_DIR / "revolut_latest.json"
    shutil.copy(json_path, work_json)
    print(f"Copied to {work_json}")

    # Run revolut_clean.py ONCE to generate SQL + CSV + a machine-readable report.
    # (One run, not two — FX rates are fetched once. --quiet so we own the console output.)
    sql_file = WORK_DIR / "batches/latest.sql"
    csv_file = WORK_DIR / "batches/latest.csv"
    report_file = WORK_DIR / "batches/latest.report.json"
    clean_script = SCRIPT_DIR / "revolut_clean.py"

    print("\nCleaning transactions...")
    result = subprocess.run(
        [sys.executable, str(clean_script), str(work_json),
         "--sql", str(sql_file), "--csv", str(csv_file),
         "--report", str(report_file), "--quiet"],
        capture_output=False,
    )
    if result.returncode != 0:
        sys.exit("revolut_clean.py failed. Aborting.")

    if not sql_file.exists() or sql_file.stat().st_size == 0:
        sys.exit("SQL file not generated. Aborting.")

    try:
        report = json.loads(report_file.read_text(encoding="utf-8"))
    except Exception:
        report = None

    # Show exactly what this push will add / change / leave alone (diffed against live D1),
    # plus what was excluded and why — the whole point of the preview.
    preview_changes(report, json_path)

    answer = input("\nPush to D1? [Y/n] ").strip().lower()
    if answer == "n":
        print(f"Aborted. SQL file kept at {sql_file}")
        return

    # Stamp pipeline run time and append freshness marker atomically with the tx batch
    now_ms = int(time.time() * 1000)
    with open(sql_file, "a", encoding="utf-8") as _f:
        _f.write(
            f"\nINSERT INTO meta(key,value) VALUES('last_revolut_sync_ts', {now_ms})"
            " ON CONFLICT(key) DO UPDATE SET value=excluded.value;\n"
        )

    # Push to D1
    print(f"\nPushing to D1 ({D1_DATABASE})...")
    result = subprocess.run(
        f'npx wrangler d1 execute {D1_DATABASE} --remote "--file={sql_file}"',
        cwd=SCRIPT_DIR,
        shell=True,
    )
    if result.returncode != 0:
        sys.exit("Wrangler push failed. SQL file kept for retry.")

    # Update state
    data = json.loads(work_json.read_text(encoding="utf-8"))
    if isinstance(data, list) and data:
        dates = [
            datetime.fromtimestamp(
                (tx.get("startedDate") or tx.get("completedDate") or 0) / 1000,
                tz=timezone.utc
            ).strftime("%Y-%m-%d")
            for tx in data
        ]
        latest_date = max(dates)
        state = load_state()
        state["last_sync_date"] = latest_date
        state["last_sync_ts"] = now_ms // 1000
        state["total_transactions"] = state.get("total_transactions", 0) + len(data)
        save_state(state)
        print(f"\n✓ State updated. Latest transaction date: {latest_date}")

# Archive raw JSON and CSV to batches/, clean up working files
    BATCHES_DIR.mkdir(exist_ok=True)
    date_stem = datetime.now().strftime("%Y-%m-%d")
    archive_json = BATCHES_DIR / json_path.name
    archive_csv  = BATCHES_DIR / f"revolut_{date_stem}.csv"
    
    shutil.move(str(json_path), archive_json)
    
    if csv_file.exists():
        while True:
            try:
                shutil.move(str(csv_file), archive_csv)
                print(f"✓ CSV archived to batches/revolut_{date_stem}.csv")
                break  # Exit the retry loop on success
            except PermissionError:
                # Prompt the user and wait for Enter before looping again
                input(f"⚠️ Permission denied. Please close '{csv_file.name}' (e.g., in Excel) and press Enter to retry...")

    work_json.unlink(missing_ok=True)
    sql_file.unlink(missing_ok=True)
    report_file.unlink(missing_ok=True)
    print(f"✓ Raw JSON archived to batches/{json_path.name}")
    print("✓ Done.")

    # Commit and push the updated sync state
    repo_root = SCRIPT_DIR.parent
    state_rel = STATE_FILE.relative_to(repo_root).as_posix()
    print("\nCommitting sync state...")
    for git_cmd in [
        ["git", "add", state_rel],
        ["git", "commit", "-m", "chore: bump sync state"],
        ["git", "push"],
    ]:
        r = subprocess.run(git_cmd, cwd=repo_root)
        if r.returncode != 0:
            print(f"  Warning: '{' '.join(git_cmd)}' failed (exit {r.returncode}). Skipping remaining git steps.")
            break
    else:
        print("✓ Sync state committed and pushed.")

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

def cmd_status():
    state = load_state()
    if not state["last_sync_date"]:
        print("No sync has been run yet.")
        return
    ts = state.get("last_sync_ts")
    synced_at = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else "unknown"
    print(f"Last sync date (latest transaction): {state['last_sync_date']}")
    print(f"Last sync run at:                   {synced_at}")
    print(f"Total transactions pushed:          {state.get('total_transactions', '?')}")
    next_stop = (datetime.fromisoformat(state["last_sync_date"]) - timedelta(days=BUFFER_DAYS)).strftime("%Y-%m-%d")
    print(f"Next sync will pull from:           {next_stop}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "prepare":
        cmd_prepare()
    elif cmd == "push":
        # Optionally accept a path directly: python sync.py push myfile.json
        json_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
        cmd_push(json_path)
    elif cmd == "status":
        cmd_status()
    else:
        print(__doc__)

if __name__ == "__main__":
    main()