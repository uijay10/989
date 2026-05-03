// Onchain data scrapers for /onchain page sections (route B: web scrape + LLM extract)
// All extractions run via callAiWithFallback(paidOnly=true) → DeepSeek.
// Results cached in DB table `onchain_cache` keyed by `kind`.

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { callAiWithFallback } from "./ai-provider";

// Use Jina Reader as a public scraping proxy — it bypasses Cloudflare/IP bot guards
// that block our container's outbound IP, and returns clean LLM-friendly markdown.
// Free tier: ~ generous public usage; no key required.
async function fetchHtmlText(url: string, maxChars = 30_000): Promise<string> {
  const proxied = `https://r.jina.ai/${url}`;
  const r = await fetch(proxied, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; web3hub-onchain-scraper/1.0)",
      "Accept": "text/plain, text/markdown, */*",
      "X-Return-Format": "markdown",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} via jina-reader for ${url}`);
  let text = (await r.text()).trim();
  if (text.length > maxChars) text = text.slice(0, maxChars);
  return text;
}

function parseJsonArrayLoose(raw: string): any[] {
  if (!raw) return [];
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function llmExtract(systemPrompt: string, pageContent: string, category: string): Promise<any[]> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: `Page content:\n\n${pageContent}\n\nReturn ONLY a raw JSON array.` },
  ];
  const out = await callAiWithFallback(messages, 4096, 0.1, false, category, true); // paidOnly → DeepSeek
  if (!out) {
    console.warn(`[onchain-scrape:${category}] LLM returned null`);
    return [];
  }
  return parseJsonArrayLoose(out);
}

// ── DB cache ─────────────────────────────────────────────────────────────────

export async function ensureOnchainCacheTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS onchain_cache (
      kind TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      source TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function readOnchainCache(kind: string): Promise<{ data: any; source: string; fetchedAt: Date; itemCount: number } | null> {
  try {
    const r = await db.execute(sql`SELECT data_json, source, fetched_at, item_count FROM onchain_cache WHERE kind = ${kind}`);
    const row = (r as { rows?: any[] }).rows?.[0];
    if (!row) return null;
    return {
      data: JSON.parse(row.data_json),
      source: String(row.source),
      fetchedAt: new Date(row.fetched_at),
      itemCount: Number(row.item_count) || 0,
    };
  } catch (e) {
    console.warn(`[onchain-cache] read ${kind} failed:`, e);
    return null;
  }
}

async function writeOnchainCache(kind: string, data: any, source: string): Promise<void> {
  const json = JSON.stringify(data);
  const itemCount = Array.isArray(data) ? data.length : (Array.isArray(data?.items) ? data.items.length : 0);
  await db.execute(sql`
    INSERT INTO onchain_cache (kind, data_json, source, item_count, fetched_at)
    VALUES (${kind}, ${json}, ${source}, ${itemCount}, NOW())
    ON CONFLICT (kind) DO UPDATE SET
      data_json = EXCLUDED.data_json,
      source = EXCLUDED.source,
      item_count = EXCLUDED.item_count,
      fetched_at = NOW()
  `);
}

// ── Scraper: ETF flows (Farside Investors) ───────────────────────────────────

const ETF_PROMPT = `You are a precise data extraction expert. Extract Bitcoin spot ETF data from the page text.

The page is from farside.co.uk — a tracker showing daily net flows (in millions USD) for spot BTC ETFs.

Return a JSON array with EXACTLY these objects (one per ETF, ~12 ETFs total):
[
  {
    "ticker": "IBIT",
    "issuer": "BlackRock",
    "flow1d": 248.5,
    "flowMtd": 1842.0,
    "flowYtd": 18420.0,
    "totalAum": 54500.0
  }
]

Rules:
- All numbers in millions USD
- flow1d = most recent day's net flow (negative for outflow)
- flowMtd = month-to-date cumulative net flow
- flowYtd = year-to-date or "Total" cumulative net flow
- totalAum = current AUM if visible; else null
- Tickers to look for: IBIT, FBTC, BITB, ARKB, BTCO, EZBC, BRRR, HODL, BTCW, GBTC, DEFI, BTC
- If a value isn't visible, use null. Never invent numbers.
- Return [] if the page has no usable ETF data.`;

export async function scrapeEtfFlows(): Promise<{ items: any[]; source: string }> {
  const url = "https://farside.co.uk/btc/";
  const text = await fetchHtmlText(url, 25_000);
  const items = await llmExtract(ETF_PROMPT, text, "onchain_etf");
  const cleaned = items
    .filter(x => x && typeof x.ticker === "string")
    .map(x => ({
      ticker: String(x.ticker).toUpperCase().trim(),
      issuer: String(x.issuer ?? "").trim(),
      flow1d: typeof x.flow1d === "number" ? x.flow1d : null,
      flowMtd: typeof x.flowMtd === "number" ? x.flowMtd : null,
      flowYtd: typeof x.flowYtd === "number" ? x.flowYtd : null,
      totalAum: typeof x.totalAum === "number" ? x.totalAum : null,
    }));
  return { items: cleaned, source: "Farside Investors" };
}

// ── Scraper: Upcoming launches (ICODrops) ────────────────────────────────────

const LAUNCH_PROMPT = `You are a precise data extraction expert. Extract upcoming token launch/IDO/TGE data from the ICODrops upcoming page.

Return a JSON array, up to 20 items:
[
  {
    "name": "Project Name",
    "symbol": "TICK",
    "type": "IDO",
    "platform": "Binance Launchpool",
    "date": "2026-05-15",
    "category": "AI",
    "raised": 12.5
  }
]

Rules:
- "type" must be one of: IDO, IEO, TGE, Launchpool, Mainnet, Airdrop
- "platform" = launchpad/exchange name if mentioned (Binance Launchpool, OKX Jumpstart, CoinList, KuCoin Spotlight, Bybit Launchpool, etc.)
- "date" in YYYY-MM-DD format if visible; null if not (do not invent)
- "category" = main narrative (AI, DeFi, GameFi, Layer2, RWA, DePIN, Meme, etc.)
- "raised" = funding raised in millions USD if visible; else null
- Skip projects with no name or symbol.
- Skip projects whose date is clearly in the past (before today).
- Return [] if no usable data.`;

export async function scrapeUpcomingLaunches(): Promise<{ items: any[]; source: string }> {
  const url = "https://icodrops.com/category/upcoming-ico/";
  const text = await fetchHtmlText(url, 28_000);
  const items = await llmExtract(LAUNCH_PROMPT, text, "onchain_launch");
  const cleaned = items
    .filter(x => x && typeof x.name === "string" && x.name.trim() && typeof x.symbol === "string")
    .map(x => ({
      name: String(x.name).trim(),
      symbol: String(x.symbol).toUpperCase().trim(),
      type: String(x.type ?? "TGE").trim(),
      platform: String(x.platform ?? "—").trim(),
      date: typeof x.date === "string" ? x.date : null,
      category: String(x.category ?? "—").trim(),
      raised: typeof x.raised === "number" ? x.raised : null,
      status: "upcoming" as const,
    }))
    .slice(0, 20);
  return { items: cleaned, source: "ICODrops" };
}

// ── Scraper: BTC whale holdings (BitInfoCharts) ──────────────────────────────

const WHALE_PROMPT = `You are a precise data extraction expert. Extract the top BTC addresses (whales/exchanges/ETFs) from BitInfoCharts.

Return a JSON array, up to 15 items, ranked by BTC balance (largest first):
[
  {
    "rank": 1,
    "label": "Binance Cold Wallet 1",
    "address": "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h",
    "btc": 248597.0,
    "usd": 23600000000.0,
    "pct": 1.18
  }
]

Rules:
- "label" = entity name if obvious (Binance, Coinbase, BlackRock IBIT, MicroStrategy, Bitfinex, Kraken, Satoshi, Mt. Gox, etc.); else "Unknown Whale"
- "address" = full BTC address as visible
- "btc" = BTC balance (whole BTC, not satoshis)
- "usd" = USD value if visible; else null
- "pct" = percent of total supply if visible; else null
- Only include addresses with btc >= 5000.
- Return [] if no usable data.`;

export async function scrapeWhaleHoldings(): Promise<{ items: any[]; source: string }> {
  const url = "https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html";
  const text = await fetchHtmlText(url, 22_000);
  const items = await llmExtract(WHALE_PROMPT, text, "onchain_whales");
  const cleaned = items
    .filter(x => x && typeof x.address === "string" && typeof x.btc === "number")
    .map((x, i) => ({
      rank: typeof x.rank === "number" ? x.rank : i + 1,
      label: String(x.label ?? "Unknown Whale").trim(),
      address: String(x.address).trim(),
      btc: x.btc,
      usd: typeof x.usd === "number" ? x.usd : null,
      pct: typeof x.pct === "number" ? x.pct : null,
      status: "active" as const,
      change30d: 0,
    }))
    .sort((a, b) => b.btc - a.btc)
    .slice(0, 15);
  return { items: cleaned, source: "BitInfoCharts" };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export type OnchainKind = "etf" | "launch" | "whales";

export async function runOnchainScrape(kind: OnchainKind): Promise<{ ok: boolean; itemCount: number; error?: string }> {
  await ensureOnchainCacheTable();
  try {
    let result: { items: any[]; source: string };
    if (kind === "etf") result = await scrapeEtfFlows();
    else if (kind === "launch") result = await scrapeUpcomingLaunches();
    else if (kind === "whales") result = await scrapeWhaleHoldings();
    else throw new Error(`unknown kind ${kind}`);

    if (result.items.length === 0) {
      console.warn(`[onchain-scrape:${kind}] no items extracted (cache not updated)`);
      return { ok: false, itemCount: 0, error: "no items extracted" };
    }
    await writeOnchainCache(kind, result.items, result.source);
    console.log(`[onchain-scrape:${kind}] saved ${result.items.length} items from ${result.source}`);
    return { ok: true, itemCount: result.items.length };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error(`[onchain-scrape:${kind}] failed:`, msg);
    return { ok: false, itemCount: 0, error: msg };
  }
}

let _running = new Set<OnchainKind>();
export function isOnchainScrapeRunning(kind: OnchainKind): boolean {
  return _running.has(kind);
}
export async function runOnchainScrapeGuarded(kind: OnchainKind): Promise<{ ok: boolean; itemCount: number; error?: string; skipped?: boolean }> {
  if (_running.has(kind)) return { ok: false, itemCount: 0, skipped: true };
  _running.add(kind);
  try {
    return await runOnchainScrape(kind);
  } finally {
    _running.delete(kind);
  }
}
