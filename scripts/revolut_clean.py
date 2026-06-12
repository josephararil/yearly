#!/usr/bin/env python3
"""
revolut_clean.py — Convert Revolut JSON transaction batches to a clean CSV for Yearly.

Usage:
    # Output CSV (default):
    python revolut_clean.py batch1.json batch2.json batch3.json
    python revolut_clean.py ./batches/
    python revolut_clean.py ./batches/ output.csv

    # Output SQL for Wrangler D1 import:
    python revolut_clean.py ./batches/ --sql
    python revolut_clean.py ./batches/ --sql output.sql

    # Then run against D1:
    wrangler d1 execute YOUR_DB_NAME --file=output.sql

    # Legacy XLSX fallback:
    python revolut_clean.py export.xlsx

Output columns match the D1 schema exactly:
    id, date, description, amount_eur, category, note, source, fun,
    person, original_amount, original_currency, deleted, updated_at,
    merchant_mcc, merchant_city, merchant_country, merchant_logo,
    card_label, tx_type, e_commerce, fee_eur, revolut_category

Dependencies:
    pip install requests
    (pandas + openpyxl only needed for legacy XLSX mode)
"""

import sys
import json
import re
import csv
from pathlib import Path
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

REVOLUT_CATEGORY_MAP = {
    "groceries":        "Groceries",
    "restaurants":      "Restaurants",
    "eating_out":       "Restaurants",
    "cafe":             "Restaurants",
    "transport":        "Transport",
    "taxi":             "Transport",
    "shopping":         "Shopping",
    "clothes":          "Shopping",
    "electronics":      "Shopping",
    "health":           "Health",
    "medical":          "Health",
    "pharmacy":         "Health",
    "fitness":          "Gym",
    "sport":            "Gym",
    "entertainment":    "Entertainment",
    "travel":           "Travel",
    "hotels":           "Travel",
    "flights":          "Travel",
    "utilities":        "Utilities",
    "bills":            "Utilities",
    "education":        "Sophie Kindergarten",
    "services":         "Services",
    "gifts":            "Gift",
    "charity":          "Donation",
    "pets":             "Pets",
    "taxes":            "Taxes",
    "transfers":        "Cash",
    "general":          None,   # fall through to name-based rules
}

NAME_RULES = [
    # Groceries
    (r"kaufland|aleks treyd|via trakia|t market|lidl|billa|fantastico|metro|carrefour|nak market|farma mol|btsm", "Groceries"),
    # Restaurants & Food
    (r"restaurant|mole|bigstroimat|horeca|borukov|tsveti i tedi|cafe|coffee|kfc|mcdonald|burger|pizza|sushi|kapancheto|bonbon|west cafe"
     r"|gozba|amrest|rozhen|vm beykar|zlatna krusha|fusion|lagardere", "Restaurants"),
    # Health
    (r"pharmacy|apteka|eczanesi|dr\.|clinic|hospital|dental|medical|diagnostichno|vision farm|farma", "Health"),
    # Transport
    (r"omv|oil|vinetki|shell|lukoil|petrol|parking|uber|bolt|taxi|fuel", "Transport"),
    # Entertainment / Subscriptions
    (r"spotify|realdebrid|google|netflix|apple|google play|youtube|steam|disney|hbo|lik 2|prirodonauc", "Entertainment"),
    # Gym (Playbox Tennis Court shows as garbled Cyrillic — match on partial decode)
    (r"gym|toni k eood|royal santelo|sila|dekatlon|fitness|sport|pulse|playbox", "Gym"),
    # Shopping
    (r"pepco|itx bulgaria|penti|kik|denim 2019|nike|waikiki|aliexpress|mall|outlet|jumbo|zara|h&m|reserved|amazon|emag|deichmann|plovdiv plaza", "Shopping"),
    # Utilities & Bill payments
    (r"evn|toplofikacia|vivacom|to christo|a1|yettel|water|electric|internet|epay|epaygo", "Utilities"),
    # House
    (r"buildermart|partners|gospodinovi|ikea|mr bricolage|praktiker|jysk|gstroy", "House Stuff"),
    # Travel
    (r"airbnb|suites|booking|hotel|ryanair|wizz|lufthansa|airport|airways|finkbeiner", "Travel"),
    # Taxes
    (r"nap |noi |national revenue|tax |данък|osigurovki|epay", "Taxes"),
    # Services
    (r"be partnars|et dobrina|herts|yani|sofi 3012|noir nicol", "Services"),
    # Kindergarten
    (r"kindergarten|детска|gradina|sophie", "Sophie Kindergarten"),
]

SKIP_DESCRIPTION_PATTERNS = [
    r"^transfer from joseph",
    r"^transfer from martina",
    r"^transfer to joseph",
    r"^transfer to martina",
    r"pocket withdrawal",
]

SKIP_TYPES = {"TOPUP", "EXCHANGE"}

# ---------------------------------------------------------------------------
# FX
# ---------------------------------------------------------------------------

_fx_cache: dict = {}
# Tracks (currency, date) pairs that failed FX lookup, so callers can skip those rows
# instead of silently falling back to rate=1.0 (which would massively misstate spending
# for high-rate currencies like TRY).
_fx_failures: set = set()

def get_eur_rate(currency: str, date_str: str):
    """Return EUR rate, or None if the lookup failed. Callers must drop rows with None."""
    if currency == "EUR":
        return 1.0
    key = f"{currency}_{date_str}"
    if key in _fx_cache:
        return _fx_cache[key]
    if key in _fx_failures:
        return None
    try:
        url = f"https://api.frankfurter.app/{date_str}?from={currency}&to=EUR"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        rate = r.json()["rates"]["EUR"]
        _fx_cache[key] = rate
        print(f"  FX: 1 {currency} = {rate:.4f} EUR on {date_str}")
        return rate
    except Exception as e:
        _fx_failures.add(key)
        msg = f"  WARNING: FX lookup failed for {currency} on {date_str}: {e}"
        if currency == "TRY":
            msg += "\n  NOTE: Frankfurter dropped TRY in 2018 — row will be SKIPPED."
        else:
            msg += "\n  Row will be SKIPPED. Add manually in the app after looking up the rate."
        print(msg)
        return None

# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

def assign_category(tx: dict) -> str:
    revolut_cat = (tx.get("category") or "").lower().strip()
    merchant_cat = ((tx.get("merchant") or {}).get("category") or "").lower().strip()
    merchant_name = ((tx.get("merchant") or {}).get("name") or "").strip()
    description = tx.get("description", "")
    tx_type = tx.get("type", "")

    # Outbound transfers to self (the old cash-tracking IBAN hack):
    # use Revolut's own category instead of defaulting to Cash,
    # since the user manually set the category on these transfers at the time.
    SELF_TRANSFER_DESCRIPTIONS = {
        "to joseph harari laniado",
        "to джоузеф харари ланиадо",
    }
    if tx_type == "TRANSFER" and tx.get("amount", 0) < 0:
        if description.lower().strip() in SELF_TRANSFER_DESCRIPTIONS:
            # Self-transfer: use Revolut's manually-set category
            mapped = REVOLUT_CATEGORY_MAP.get(revolut_cat)
            return mapped if mapped else revolut_cat.capitalize() if revolut_cat else "Cash"
        # External transfer: check name rules before defaulting to Cash
        name_to_check = (merchant_name or description).lower()
        for pattern, category in NAME_RULES:
            if re.search(pattern, name_to_check, re.IGNORECASE):
                return category
        return "Cash"

    # NAME_RULES take priority over Revolut's own category —
    # this lets you override Revolut's categorisation per merchant
    # (e.g. Dekatlon tagged as "shopping" by Revolut but "Gym" by your rules)
    name_to_check = (merchant_name or description).lower()
    for pattern, category in NAME_RULES:
        if re.search(pattern, name_to_check, re.IGNORECASE):
            return category

    # Fall back to Revolut's own category
    for key in [revolut_cat, merchant_cat]:
        mapped = REVOLUT_CATEGORY_MAP.get(key)
        if mapped:
            return mapped

    return "General"

# ---------------------------------------------------------------------------
# Skip logic
# ---------------------------------------------------------------------------

SKIP_STATES = {"REVERTED", "DECLINED", "FAILED"}

def should_skip(tx: dict) -> tuple[bool, str]:
    if tx.get("state") in SKIP_STATES:
        return True, f"state={tx.get('state')}"
    if tx.get("amount", 0) >= 0:
        return True, "income/refund (amount >= 0)"
    if tx.get("type", "") in SKIP_TYPES:
        return True, f"type={tx.get('type')}"
    description = tx.get("description", "")
    skip_re = re.compile("|".join(SKIP_DESCRIPTION_PATTERNS), re.IGNORECASE)
    if skip_re.search(description):
        return True, f"internal: {description}"
    return False, ""

# ---------------------------------------------------------------------------
# JSON processing
# ---------------------------------------------------------------------------

def process_json_files(paths: list[Path]) -> list[dict]:
    all_txs: dict[str, dict] = {}
    for p in paths:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  ERROR reading {p.name}: {e}")
            continue
        if isinstance(data, dict):
            data = [data]
        loaded = 0
        for tx in data:
            tx_id = tx.get("id")
            if tx_id and tx_id not in all_txs:
                all_txs[tx_id] = tx
                loaded += 1
        print(f"  {p.name}: {loaded} new transactions")
    print(f"  Total unique transactions: {len(all_txs)}")
    return list(all_txs.values())

def build_rows(transactions: list[dict]) -> list[dict]:
    rows = []
    skipped: dict[str, int] = {}
    fx_dropped: list[dict] = []
    # updated_at is the sync cursor used by /api/sync — must be MILLISECONDS to match
    # Date.now() in the worker and client. Writing seconds here causes the worker query
    # `WHERE updated_at >= ?` to exclude pipeline rows forever (the cursor lives in ms).
    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)

    fx_needed = [tx for tx in transactions
                 if tx.get("amount", 0) < 0
                 and tx.get("currency", "EUR") != "EUR"]
    if fx_needed:
        print(f"  {len(fx_needed)} foreign currency transactions — fetching FX rates...")

    for tx in transactions:
        skip, reason = should_skip(tx)
        if skip:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue

        currency = tx.get("currency", "EUR")
        amount_raw = abs(tx.get("amount", 0)) / 100
        fee_raw = abs(tx.get("fee", 0)) / 100

        date_ts = tx.get("completedDate") or tx.get("updatedDate") or tx.get("startedDate")
        date_str = datetime.fromtimestamp(date_ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

        rate = get_eur_rate(currency, date_str)
        if rate is None:
            fx_dropped.append({
                "id": tx.get("id"),
                "date": date_str,
                "description": ((tx.get("merchant") or {}).get("name") or tx.get("description", "")).strip(),
                "currency": currency,
                "amount_raw": amount_raw,
            })
            continue
        amount_eur = round(amount_raw * rate, 2)
        fee_eur = round(fee_raw * rate, 2) if fee_raw else 0.0

        merchant = tx.get("merchant") or {}
        merchant_name = merchant.get("name", "").strip()
        description = merchant_name or tx.get("description", "").strip()

        rows.append({
            # Core / existing schema
            "id":                   tx["id"],
            "date":                 date_str,
            "description":          description,
            "amount_eur":           amount_eur,
            "category":             assign_category(tx),
            "note":                 (tx.get("comment") or "").strip(),
            "source":               "revolut",
            "fun":                  0,
            "person":               (tx.get("initiatedBy") or {}).get("name", ""),
            "original_amount":      amount_raw if currency != "EUR" else "",
            "original_currency":    currency if currency != "EUR" else "",
            "deleted":              0,
            "updated_at":           now_ts,
            # New enrichment columns
            "merchant_mcc":         merchant.get("mcc", ""),
            "merchant_city":        merchant.get("city", ""),
            "merchant_country":     merchant.get("country", ""),
            "merchant_logo":        merchant.get("logo", ""),
            "card_label":           (tx.get("card") or {}).get("label", ""),
            "tx_type":              tx.get("type", ""),
            "e_commerce":           1 if tx.get("eCommerce") else 0,
            "fee_eur":              fee_eur,
            "revolut_category":     (tx.get("category") or "").lower(),
        })

    rows.sort(key=lambda r: r["date"])

    # Filter to current year only — late-settling transactions from prior year
    # can bleed through since the API uses startedDate for pagination
    current_year = str(datetime.now(timezone.utc).year)
    pre_year  = [r for r in rows if not r["date"].startswith(current_year)]
    rows      = [r for r in rows if r["date"].startswith(current_year)]

    print(f"\n  Skipped:")
    for reason, count in skipped.items():
        if count:
            print(f"    {reason}: {count}")
    if pre_year:
        print(f"    prior year (completedDate before {current_year}): {len(pre_year)}")
        for r in pre_year:
            print(f"      {r['date']}  {r['description']:<35}  €{r['amount_eur']:.2f}")
    if fx_dropped:
        print(f"\n  ⚠️  {len(fx_dropped)} row(s) DROPPED because FX lookup failed — add manually in the app:")
        for r in fx_dropped:
            print(f"      {r['date']}  {r['description']:<35}  {r['amount_raw']:.2f} {r['currency']}")

    return rows

# ---------------------------------------------------------------------------
# XLSX legacy fallback (no enrichment columns — bare minimum)
# ---------------------------------------------------------------------------

def process_xlsx(path: Path) -> list[dict]:
    try:
        import pandas as pd
    except ImportError:
        sys.exit("pandas required for XLSX: pip install pandas openpyxl")

    import hashlib

    print(f"  Legacy XLSX mode — no enrichment columns available")
    df = pd.read_excel(path)
    df.columns = [c.strip() for c in df.columns]
    df = df[df["State"] == "COMPLETED"]
    df = df[df["Amount"] < 0]
    if "Type" in df.columns:
        df = df[~df["Type"].isin(SKIP_TYPES)]
    skip_re = re.compile("|".join(SKIP_DESCRIPTION_PATTERNS), re.IGNORECASE)
    df = df[~df["Description"].str.contains(skip_re, na=False)]

    # ms to match Date.now() in the worker / client cursor — same reason as build_rows().
    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    rows = []
    fx_dropped: list[dict] = []
    for _, row in df.iterrows():
        date_str = pd.to_datetime(row["Completed Date"]).strftime("%Y-%m-%d")
        currency = row["Currency"]
        amount_orig = abs(float(row["Amount"]))
        description = str(row["Description"]).strip()
        rate = get_eur_rate(currency, date_str)
        if rate is None:
            fx_dropped.append({
                "date": date_str, "description": description,
                "currency": currency, "amount_raw": amount_orig,
            })
            continue
        # Hash date+amount+description so two same-day same-amount rows don't collide.
        id_key = f"{row.get('Started Date', '')}|{amount_orig}|{description}"
        row_id = f"xlsx-{hashlib.md5(id_key.encode('utf-8')).hexdigest()[:16]}"
        rows.append({
            "id":                   row_id,
            "date":                 date_str,
            "description":          description,
            "amount_eur":           round(amount_orig * rate, 2),
            "category":             "General",
            "note":                 "",
            "source":               "revolut_xlsx",
            "fun":                  0,
            "person":               "",
            "original_amount":      amount_orig if currency != "EUR" else "",
            "original_currency":    currency if currency != "EUR" else "",
            "deleted":              0,
            "updated_at":           now_ts,
            "merchant_mcc":         "",
            "merchant_city":        "",
            "merchant_country":     "",
            "merchant_logo":        "",
            "card_label":           "",
            "tx_type":              str(row.get("Type", "")),
            "e_commerce":           0,
            "fee_eur":              abs(float(row.get("Fee", 0))),
            "revolut_category":     "",
        })
    return sorted(rows, key=lambda r: r["date"])

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

FIELDS = [
    "id", "date", "description", "amount_eur", "category", "note",
    "source", "fun", "person", "original_amount", "original_currency",
    "deleted", "updated_at",
    "merchant_mcc", "merchant_city", "merchant_country",
    "merchant_logo", "card_label", "tx_type", "e_commerce", "fee_eur",
    "revolut_category",
]


def write_csv(rows: list[dict], output_path: str):
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

# Fields the user owns and edits in the app — these are PRESERVED on re-sync, never
# clobbered by the pipeline. (`oneoff` lives in D1 but isn't in FIELDS; omitting it from
# the UPDATE SET below preserves it too.) Everything else is pipeline-authoritative and
# updated on conflict, so a row first captured while PENDING finalises its amount/date
# when it later completes and is re-pulled within BUFFER_DAYS.
PRESERVE_ON_CONFLICT = {"id", "category", "fun", "person", "note", "deleted"}

def write_sql(rows: list[dict], output_path: str):
    def esc(v) -> str:
        if v is None or v == "":
            return "NULL"
        if isinstance(v, bool):
            return "1" if v else "0"
        if isinstance(v, int):
            return str(v)
        if isinstance(v, float):
            return str(v)
        return "'" + str(v).replace("'", "''") + "'"

    columns = ", ".join(FIELDS)
    # Upsert that preserves user-owned columns on conflict instead of INSERT OR REPLACE
    # (which deletes + reinserts, reverting in-app edits and resetting unlisted columns
    # like `oneoff`). See PRESERVE_ON_CONFLICT and docs/REVOLUT.md.
    update_set = ", ".join(
        f"{f}=excluded.{f}" for f in FIELDS if f not in PRESERVE_ON_CONFLICT
    )
    lines = [
        "-- Generated by revolut_clean.py",
        f"-- {len(rows)} transactions",
        "-- Run with: wrangler d1 execute YOUR_DB_NAME --remote --file=this_file.sql",
        "",
    ]
    for row in rows:
        values = ", ".join(esc(row.get(f)) for f in FIELDS)
        lines.append(
            f"INSERT INTO transactions ({columns}) VALUES ({values}) "
            f"ON CONFLICT(id) DO UPDATE SET {update_set};"
        )
    lines += [""]
    Path(output_path).write_text("\n".join(lines), encoding="utf-8")

def print_summary(rows: list[dict]):
    total = sum(r["amount_eur"] for r in rows)
    print(f"\nRows: {len(rows)}  |  Total spend: €{total:.2f}")

    from collections import defaultdict
    print("\nBy category:")
    by_cat: dict[str, float] = defaultdict(float)
    for r in rows:
        by_cat[r["category"]] += r["amount_eur"]
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat:<28} €{amt:>8.2f}  ({amt/total*100:.0f}%)")

    by_person: dict[str, float] = defaultdict(float)
    for r in rows:
        by_person[r["person"] or "Unknown"] += r["amount_eur"]
    if len(by_person) > 1:
        print("\nBy person:")
        for name, amt in sorted(by_person.items(), key=lambda x: -x[1]):
            print(f"  {name:<20} €{amt:.2f}")

    general = [r for r in rows if r["category"] == "General"]
    if general:
        print(f"\n⚠️  {len(general)} rows in General — review before importing:")
        for r in general:
            print(f"  {r['date']}  {r['description']:<35}  €{r['amount_eur']:.2f}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    args = sys.argv[1:]

    # Flags
    sql_mode = "--sql" in args
    args = [a for a in args if a != "--sql"]

    # Output path: last arg if it ends in .csv or .sql
    if args and (args[-1].endswith(".csv") or args[-1].endswith(".sql")):
        output_path = args[-1]
        inputs = args[:-1]
    else:
        output_path = None
        inputs = args

    # Collect input files
    json_files, xlsx_file = [], None
    for inp in inputs:
        p = Path(inp)
        if p.is_dir():
            found = sorted(p.glob("*.json"))
            print(f"Folder {p}: {len(found)} JSON files found")
            json_files.extend(found)
        elif p.suffix.lower() == ".json":
            json_files.append(p)
        elif p.suffix.lower() == ".xlsx":
            xlsx_file = p
        else:
            print(f"Skipping: {p}")

    if not json_files and not xlsx_file:
        sys.exit("No JSON or XLSX files found.")

    print(f"\nLoading transactions...")
    rows = build_rows(process_json_files(json_files)) if json_files else process_xlsx(xlsx_file)

    if not rows:
        sys.exit("No expense rows after filtering.")

    # Default output filename
    if not output_path:
        dates = [r["date"] for r in rows]
        stem = f"yearly_{min(dates)[:7]}_to_{max(dates)[:7]}"
        output_path = f"{stem}.sql" if sql_mode else f"{stem}.csv"

    if sql_mode or output_path.endswith(".sql"):
        write_sql(rows, output_path)
        print(f"\nOutput: {output_path}")
        print_summary(rows)
        print(f"\nTo import into D1:")
        print(f"  wrangler d1 execute YOUR_DB_NAME --file={output_path}")
    else:
        write_csv(rows, output_path)
        print(f"\nOutput: {output_path}")
        print_summary(rows)
        print("\nReview General rows if any, then import into Yearly.")

if __name__ == "__main__":
    main()