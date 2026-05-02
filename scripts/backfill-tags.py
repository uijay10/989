#!/usr/bin/env python3
"""
backfill-tags.py
----------------
One-shot script to backfill missing chain_tags and exchange_tags
on all posts that currently lack them.

Run anytime after a data restore or migration:
  python3 scripts/backfill-tags.py

Uses keyword matching — free, instant, no AI calls needed.
"""

import os, re, sys
import psycopg2

# ── DB connection ────────────────────────────────────────────────────────────
db_url = os.environ.get("NEON_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not db_url:
    print("ERROR: NEON_DATABASE_URL or DATABASE_URL must be set.")
    sys.exit(1)

conn = psycopg2.connect(db_url, sslmode="require")
conn.autocommit = True
cur = conn.cursor()

# ── Keyword maps ─────────────────────────────────────────────────────────────

CHAIN_KEYWORDS: dict[str, list[str]] = {
    "Ethereum":  [r"\bethereum\b", r"\beth\b", r"\berc-?20\b", r"\berc-?721\b",
                  r"\berc-?1155\b", r"\bweth\b", r"\bvitalik\b"],
    "Solana":    [r"\bsolana\b", r"\bsol\b", r"\bspl token\b"],
    "BNB Chain": [r"\bbnb\b", r"\bbsc\b", r"\bbnb chain\b",
                  r"\bbinance smart chain\b", r"\bpancakeswap\b"],
    "Arbitrum":  [r"\barbitrum\b", r"\barb\b"],
    "Base":      [r"\bbase\b(?!\s*(rate|layer|level|price|value|case|fee|point|asset))"],
    "Optimism":  [r"\boptimism\b", r"\bop mainnet\b"],
    "Polygon":   [r"\bpolygon\b", r"\bmatic\b", r"\bpol\b"],
    "Avalanche": [r"\bavalanche\b", r"\bavax\b"],
    "Sui":       [r"\bsui\b(?!\s*(generis|table|case))", r"\bsui network\b"],
    "Aptos":     [r"\baptos\b", r"\bapt\b"],
    "NEAR":      [r"\bnear protocol\b", r"\bnear\b"],
    "Cosmos":    [r"\bcosmos\b", r"\batom\b", r"\bibc\b"],
    "Tron":      [r"\btron\b", r"\btrx\b", r"\btrc-?20\b"],
    "Cardano":   [r"\bcardano\b", r"\bada\b"],
    "Polkadot":  [r"\bpolkadot\b", r"\bdot\b", r"\bparachain\b"],
    "Starknet":  [r"\bstarknet\b", r"\bstark\b"],
    "zkSync":    [r"\bzksync\b", r"\bzk sync\b", r"\bzk era\b"],
    "Ton":       [r"\btoncoin\b", r"\bthe open network\b", r"\bton blockchain\b"],
    "Sei":       [r"\bsei\b(?!\s*(network of|ure|zure))", r"\bsei network\b"],
    "Monad":     [r"\bmonad\b"],
    "Berachain": [r"\bberachain\b", r"\bbera\b"],
    "Taiko":     [r"\btaiko\b"],
}

EXCHANGE_KEYWORDS: dict[str, list[str]] = {
    "Binance":  [r"\bbinance\b", r"\bbnb exchange\b"],
    "OKX":      [r"\bokx\b", r"\bok exchange\b"],
    "Bybit":    [r"\bbybit\b"],
    "Coinbase": [r"\bcoinbase\b"],
    "Kraken":   [r"\bkraken\b"],
    "KuCoin":   [r"\bkucoin\b"],
    "Bitget":   [r"\bbitget\b"],
    "Gate.io":  [r"\bgate\.io\b", r"\bgateio\b"],
    "MEXC":     [r"\bmexc\b"],
    "HTX":      [r"\bhtx\b", r"\bhuobi\b"],
    "Deribit":  [r"\bderibit\b"],
    "dYdX":     [r"\bdydx\b"],
    "Uniswap":  [r"\buniswap\b", r"\buni\b(?=\s*(v\d|swap|dex|pool))"],
    "Raydium":  [r"\braydium\b"],
    "Jupiter":  [r"\bjupiter\s*(exchange|dex|aggregator|swap)\b", r"\bjup\b(?=\s*(token|coin|dex))"],
}

def detect(text: str, keyword_map: dict[str, list[str]]) -> list[str]:
    if not text:
        return []
    found = []
    for label, patterns in keyword_map.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                found.append(label)
                break
    return found

# ── Fetch rows that need backfilling ─────────────────────────────────────────

cur.execute("""
    SELECT id, title, content
    FROM posts
    WHERE (chain_tags IS NULL     OR array_length(chain_tags, 1)     IS NULL)
       OR (exchange_tags IS NULL  OR array_length(exchange_tags, 1)  IS NULL)
""")
rows = cur.fetchall()
print(f"Posts needing backfill: {len(rows)}")

if not rows:
    print("Nothing to do — all posts already have tags.")
    conn.close()
    sys.exit(0)

# ── Backfill ─────────────────────────────────────────────────────────────────

chain_updated = 0
exchange_updated = 0
skipped = 0
chain_stats: dict[str, int] = {}
exchange_stats: dict[str, int] = {}

for i, (post_id, title, content) in enumerate(rows):
    text = (title or "") + " " + (content or "")
    chains   = detect(text, CHAIN_KEYWORDS)
    exchanges = detect(text, EXCHANGE_KEYWORDS)

    if chains:
        cur.execute("UPDATE posts SET chain_tags = %s WHERE id = %s", (chains, post_id))
        chain_updated += 1
        for c in chains:
            chain_stats[c] = chain_stats.get(c, 0) + 1

    if exchanges:
        cur.execute("UPDATE posts SET exchange_tags = %s WHERE id = %s", (exchanges, post_id))
        exchange_updated += 1
        for e in exchanges:
            exchange_stats[e] = exchange_stats.get(e, 0) + 1

    if not chains and not exchanges:
        skipped += 1

    if (i + 1) % 500 == 0:
        pct = round((i + 1) / len(rows) * 100)
        print(f"  {i+1}/{len(rows)} ({pct}%) — chains tagged: {chain_updated}, exchanges tagged: {exchange_updated}")

# ── Report ────────────────────────────────────────────────────────────────────

print(f"\n✅ Done!")
print(f"  chain_tags updated:    {chain_updated} posts")
print(f"  exchange_tags updated: {exchange_updated} posts")
print(f"  No match (left empty): {skipped} posts")

if chain_stats:
    print("\nChain breakdown:")
    for k, v in sorted(chain_stats.items(), key=lambda x: -x[1]):
        print(f"  {k}: +{v}")

if exchange_stats:
    print("\nExchange breakdown:")
    for k, v in sorted(exchange_stats.items(), key=lambda x: -x[1]):
        print(f"  {k}: +{v}")

# Final totals
cur.execute("""
    SELECT tag, COUNT(*) FROM (
        SELECT unnest(chain_tags) AS tag FROM posts WHERE chain_tags IS NOT NULL
    ) t GROUP BY tag ORDER BY COUNT(*) DESC LIMIT 20
""")
print("\nFinal chain_tags totals:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

cur.execute("""
    SELECT tag, COUNT(*) FROM (
        SELECT unnest(exchange_tags) AS tag FROM posts WHERE exchange_tags IS NOT NULL
    ) t GROUP BY tag ORDER BY COUNT(*) DESC LIMIT 20
""")
print("\nFinal exchange_tags totals:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

conn.close()
