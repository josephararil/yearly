import sys
import json
import re
from pathlib import Path

import pandas as pd
import requests

# ---------------------------------------------------------------------------
# CONFIG — edit these to match your names / accounts
# ---------------------------------------------------------------------------

SKIP_PATTERNS = [
    r"pocket withdrawal",
    r"transfer from joseph",
    r"transfer from martina",
    r"exchanged to"
]

# Category auto-assignment rules: (regex pattern, category)
# Applied in order — first match wins. Add your own at the top.
CATEGORY_RULES = [
    # Groceries
    (r"kaufland|aleks treyd|via trakia|t market|lidl|billa|fantastico|metro|carrefour|nak market|farma mol", "Groceries"),
    # Restaurants & Food
    (r"restaurant|cafe|coffee|kfc|mcdonald|burger|pizza|sushi|kapancheto|bonbon|west cafe"
     r"|gozba|amrest|rozhen|vm beykar|zlatna krusha|fusion|lagardere", "Restaurants"),
    # Health
    (r"pharmacy|apteka|eczanesi|dr\.|clinic|hospital|dental|medical|diagnostichno|vision farm|farma", "Health"),
    # Transport
    (r"omv|oil|vinetki|shell|lukoil|petrol|parking|uber|bolt|taxi|fuel", "Transport"),
    # Entertainment / Subscriptions
    (r"spotify|realdebrid|google|netflix|apple|google play|youtube|steam|disney|hbo|lik 2|prirodonauc", "Entertainment"),
    # Gym (Playbox Tennis Court shows as garbled Cyrillic — match on partial decode)
    (r"gym|toni k eood|royal santelo|sila|dekatlon|fitness|sport|pulse|playbox|\xd0\x9f\xd0\xbb\xd0\xb5\xd0\xb9", "Gym"),
    # Shopping
    (r"pepco|kik|denim 2019|nike|waikiki|aliexpress|mall|outlet|jumbo|kapancheto|zara|h&m|reserved|amazon|emag|deichmann|plovdiv plaza", "Shopping"),
    # Utilities & Bill payments
    (r"evn|toplofikacia|vivacom|Transfer to CHRISTO|a1|yettel|water|electric|internet|epay|epaygo", "Utilities"),
    # House
    (r"buildermart|partners|gospodinovi|ikea|mr bricolage|praktiker|jysk|gstroy", "House Stuff"),
    # Travel
    (r"airbnb|suites|booking|hotel|ryanair|wizz|lufthansa|airport|airways|finkbeiner", "Travel"),
    # Taxes
    (r"nap |noi |national revenue|tax |данък|osigurovki|epay", "Taxes"),
    # Services
    (r"be partnars|herts|yani|sofi 3012|noir nicol", "Services"),
    # Kindergarten
    (r"kindergarten|детска|gradina|sophie", "Sophie Kindergarten"),
]

RULES_FILE = Path("~/.yearly_rules.json").expanduser()

# ---------------------------------------------------------------------------
# FX conversion via Frankfurter (free, no API key)
# ---------------------------------------------------------------------------

_fx_cache: dict = {}

def get_eur_rate(currency: str, date: str) -> float:
    if currency == "EUR":
        return 1.0
    key = f"{currency}_{date}"
    if key in _fx_cache:
        return _fx_cache[key]
    try:
        url = f"https://api.frankfurter.app/{date}?from={currency}&to=EUR"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        rate = r.json()["rates"]["EUR"]
        _fx_cache[key] = rate
        print(f"  FX: 1 {currency} = {rate:.4f} EUR on {date}")
        return rate
    except Exception as e:
        print(f"  WARNING: FX lookup failed for {currency} on {date}: {e}")
        print(f"  Falling back to rate=1.0 — MANUALLY CORRECT THIS ROW IN THE CSV")
        return 1.0

# ---------------------------------------------------------------------------
# Category assignment
# ---------------------------------------------------------------------------

def load_learned_rules() -> list:
    if RULES_FILE.exists():
        try:
            data = json.loads(RULES_FILE.read_text())
            return [(r["pattern"], r["category"]) for r in data]
        except Exception:
            pass
    return []

def assign_category(description: str, tx_type: str, amount: float, learned: list) -> str:
    desc_lower = description.lower()

    for pattern, category in learned:
        if re.search(pattern, desc_lower, re.IGNORECASE):
            return category

    for pattern, category in CATEGORY_RULES:
        if re.search(pattern, desc_lower, re.IGNORECASE):
            return category

    # Outbound external transfer → Cash (the IBAN workaround rows)
    if tx_type == "Transfer" and amount < 0:
        return "Cash"

    return "General"

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def clean(input_path: str, output_path: str = None):
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"File not found: {input_path}")

    print(f"\nReading {p.name}...")
    df = pd.read_excel(p) if p.suffix.lower() == ".xlsx" else pd.read_csv(p)
    df.columns = [c.strip() for c in df.columns]
    print(f"  {len(df)} total rows")

    df = df[df["State"] == "COMPLETED"].copy()
    df = df[df["Amount"] < 0].copy()
    print(f"  {len(df)} expense rows (COMPLETED, negative amount)")

    skip_re = re.compile("|".join(SKIP_PATTERNS), re.IGNORECASE)
    mask_skip = df["Description"].str.contains(skip_re, na=False)
    n_skipped = mask_skip.sum()
    df = df[~mask_skip].copy()
    print(f"  {n_skipped} internal transfer rows skipped → {len(df)} rows remaining")

    learned = load_learned_rules()
    if learned:
        print(f"  {len(learned)} learned category rules loaded")

    fx_needed = df[df["Currency"] != "EUR"]
    if not fx_needed.empty:
        print(f"  {len(fx_needed)} foreign currency rows — fetching FX rates...")

    rows = []
    for _, row in df.iterrows():
        date_str = pd.to_datetime(row["Completed Date"]).strftime("%Y-%m-%d")
        currency = row["Currency"]
        amount_orig = abs(float(row["Amount"]))

        rate = get_eur_rate(currency, date_str)
        amount_eur = round(amount_orig * rate, 2)

        category = assign_category(
            str(row["Description"]), str(row["Type"]), float(row["Amount"]), learned
        )

        rows.append({
            "date": date_str,
            "description": str(row["Description"]).strip(),
            "amount_eur": amount_eur,
            "original_amount": amount_orig if currency != "EUR" else "",
            "original_currency": currency if currency != "EUR" else "",
            "category": category,
        })

    out_df = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)

    if output_path is None:
        stem = re.sub(r"account-statement_|_en-gb", "", p.stem)
        output_path = str(p.parent / f"yearly_{stem}.csv")

    out_df.to_csv(output_path, index=False)

    print(f"\nOutput: {output_path}")
    print(f"Rows: {len(out_df)}  |  Total spend: €{out_df['amount_eur'].sum():.2f}")
    print("\nBy category:")
    summary = out_df.groupby("category")["amount_eur"].sum().sort_values(ascending=False)
    for cat, total in summary.items():
        pct = total / out_df["amount_eur"].sum() * 100
        print(f"  {cat:<28} €{total:>8.2f}  ({pct:.0f}%)")

    general = out_df[out_df["category"] == "General"]
    if not general.empty:
        print(f"\n⚠️  {len(general)} rows landed in General — review before importing:")
        for _, r in general.sort_values(by='amount_eur', ascending=False).iterrows():
            print(f"  {r['date']}  {r['description']:<35}  €{r['amount_eur']:.2f}")

    print("\nEdit the CSV to fix any categories, then import into Yearly.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    clean(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)