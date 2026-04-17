// VERSION: v2.0_migrated_2026
// Unified scraper: all 11 Groq + 1 DeepSeek instances
// Single flow: system keywords (DB scrape_keywords → DEFAULT_KEYWORDS) → AI classify → section + 7×24快讯 dual-publish
// All plate-specific scraping logic has been removed and replaced with this unified approach.

import Parser from "rss-parser";
import { db, postsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  callAiWithFallback,
  logProviderStatus,
  isFreeProviderAvailable,
  getAvailableProviders,
  areFreeProvidersDailyExhausted,
  isDeepSeekBudgetAvailable,
  isDeepSeekHourlyBudgetAvailable,
} from "./ai-provider";

const VERSION = "v2.0_migrated_2026";
console.log(`[auto-scraper] ${VERSION} loaded`);

const AI_SYSTEM_WALLET = "ai-system";
const AI_SYSTEM_NAME   = "AI精选";
const SIXTY_DAYS_MS    = 60 * 24 * 60 * 60 * 1000;
const BATCH_SIZE       = 5;
const MAX_RETRIES      = 3;

// ── Section max-age caps (days) ────────────────────────────────────────────────
const SECTION_EVENT_MAX_AGE_DAYS: Record<string, number> = {
  "quest":    7,
  "airdrop":  7,
  "ido":      30,
  "testnet":  30,
  "nodes":    30,
  "devbounty": 30,
  "grant":    60,
  "funding":  30,
  "industry": 21,
  "724news":  14,
  "flash":    14,
  "policy":   21,
  "meme":     14,
  "recruiting": 21,
};
const DEFAULT_EVENT_MAX_AGE_DAYS = 21;
const DEFAULT_ARTICLE_MAX_AGE_DAYS = 7;

// ── Category → section mapping ────────────────────────────────────────────────
export const CATEGORY_MAP: Record<string, string> = {
  "测试网": "testnet",
  "IDO/Launchpad": "ido", "IDO": "ido", "Launchpad": "ido",
  "预售": "ido", "主网上线": "ido", "交易所上线": "ido",
  "融资公告": "funding",
  "空投": "quest", "Airdrop": "quest", "airdrop": "quest",
  "招聘": "recruiting",
  "节点招募": "nodes",
  "链上任务": "quest",
  "开发者专区": "devbounty", "开发者漏洞奖金": "devbounty",
  "项目捐赠/赞助": "grant", "捐赠/赞助": "grant",
  "捐赠赞助": "grant", "Grant": "grant", "Grants": "grant",
  "漏洞赏金": "devbounty", "Bug Bounty": "devbounty",
  "Hackathon": "devbounty", "hackathon": "devbounty",
  "Meme热点": "meme", "Meme": "meme", "meme": "meme",
  "政策监管": "policy", "监管": "policy", "Regulation": "policy", "Policy": "policy",
  "快讯": "724news", "7*24快讯": "724news", "Flash": "724news",
  "Flash News": "724news", "市场快讯": "724news", "链上快讯": "724news", "flash": "724news",
  "行业动态": "industry", "Industry": "industry", "industry": "industry",
};

function mapAllCategories(cats: string[], title?: string): string[] {
  const result = new Set<string>();
  for (const cat of cats) {
    if (CATEGORY_MAP[cat]) { result.add(CATEGORY_MAP[cat]); continue; }
    for (const [zh, en] of Object.entries(CATEGORY_MAP)) {
      if (cat.includes(zh)) { result.add(en); break; }
    }
  }
  const sections = [...result];
  if (sections.length > 1 && title) {
    console.log(`[multi-section] "${title.slice(0, 60)}..." → ${JSON.stringify(sections)}`);
  }
  return sections;
}

// ── RSS Sources ────────────────────────────────────────────────────────────────
export const DEFAULT_SOURCES = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", type: "rss", priority: 1 },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", type: "rss", priority: 1 },
  { name: "Decrypt", url: "https://decrypt.co/feed", type: "rss", priority: 1 },
  { name: "U.Today", url: "https://u.today/rss", type: "rss", priority: 1 },
  { name: "BeInCrypto", url: "https://beincrypto.com/feed/", type: "rss", priority: 1 },
  { name: "CryptoSlate", url: "https://cryptoslate.com/feed/", type: "rss", priority: 1 },
  { name: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/feed", type: "rss", priority: 1 },
  { name: "CoinGape", url: "https://coingape.com/feed/", type: "rss", priority: 1 },
  { name: "CryptoPotato", url: "https://cryptopotato.com/feed/", type: "rss", priority: 1 },
  { name: "News.Bitcoin.com", url: "https://news.bitcoin.com/feed/", type: "rss", priority: 1 },
  { name: "Bitcoinist", url: "https://bitcoinist.com/feed/", type: "rss", priority: 2 },
  { name: "The Daily Hodl", url: "https://dailyhodl.com/feed/", type: "rss", priority: 2 },
  { name: "AMBCrypto", url: "https://ambcrypto.com/feed/", type: "rss", priority: 2 },
  { name: "Crypto Briefing", url: "https://cryptobriefing.com/feed/", type: "rss", priority: 2 },
  { name: "Blockworks", url: "https://blockworks.co/feed/", type: "rss", priority: 1 },
  { name: "The Defiant", url: "https://thedefiant.io/feed/", type: "rss", priority: 1 },
  { name: "CryptoNews", url: "https://cryptonews.com/news/feed/", type: "rss", priority: 2 },
  { name: "NewsBTC", url: "https://www.newsbtc.com/feed/", type: "rss", priority: 2 },
  { name: "Crypto Ninjas", url: "https://www.cryptoninjas.net/feed/", type: "rss", priority: 2 },
  { name: "CoinJournal", url: "https://coinjournal.net/feed/", type: "rss", priority: 2 },
  { name: "Finance Magnates Crypto", url: "https://www.financemagnates.com/feed/", type: "rss", priority: 2 },
  { name: "CoinGeek", url: "https://coingeek.com/feed/", type: "rss", priority: 2 },
  { name: "Crypto Daily", url: "https://cryptodaily.co.uk/feed", type: "rss", priority: 2 },
  { name: "Ledger Insights", url: "https://www.ledgerinsights.com/feed/", type: "rss", priority: 2 },
  { name: "Protos", url: "https://www.protos.com/feed/", type: "rss", priority: 2 },
  { name: "Unchained", url: "https://unchainedcrypto.com/feed/", type: "rss", priority: 2 },
  { name: "Bankless", url: "https://www.bankless.com/feed", type: "rss", priority: 1 },
  { name: "Solana Blog", url: "https://solana.com/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Ethereum Blog", url: "https://blog.ethereum.org/feed.xml", type: "rss", priority: 1 },
  { name: "Polygon Blog", url: "https://polygon.technology/blog/feed", type: "rss", priority: 1 },
  { name: "Binance Blog", url: "https://www.binance.com/en/blog/feed", type: "rss", priority: 1 },
  { name: "Coinbase Blog", url: "https://www.coinbase.com/blog/rss", type: "rss", priority: 1 },
  { name: "Chainlink Blog", url: "https://blog.chain.link/feed/", type: "rss", priority: 1 },
  { name: "Optimism Blog", url: "https://optimism.io/blog/feed", type: "rss", priority: 1 },
  { name: "Arbitrum Blog", url: "https://arbitrum.io/blog/feed", type: "rss", priority: 1 },
  { name: "zkSync Blog", url: "https://zksync.io/blog/feed", type: "rss", priority: 1 },
  { name: "Medium Blockchain", url: "https://medium.com/feed/tag/blockchain", type: "rss", priority: 2 },
  { name: "Medium Web3", url: "https://medium.com/feed/tag/web3", type: "rss", priority: 2 },
  { name: "Medium Crypto", url: "https://medium.com/feed/tag/cryptocurrency", type: "rss", priority: 2 },
  { name: "Medium DeFi", url: "https://medium.com/feed/tag/defi", type: "rss", priority: 2 },
  { name: "Medium NFT", url: "https://medium.com/feed/tag/nft", type: "rss", priority: 2 },
  { name: "Blockchain.news", url: "https://blockchain.news/feed", type: "rss", priority: 2 },
  { name: "CoinMarketCap News", url: "https://coinmarketcap.com/headlines/news/rss/", type: "rss", priority: 1 },
  { name: "MakerDAO Blog", url: "https://blog.makerdao.com/feed/", type: "rss", priority: 2 },
  { name: "Aave Blog", url: "https://aave.com/blog/feed", type: "rss", priority: 2 },
  { name: "Uniswap Blog", url: "https://uniswap.org/blog/feed", type: "rss", priority: 2 },
  { name: "Avalanche Blog", url: "https://medium.com/feed/avalancheavax", type: "rss", priority: 1 },
  { name: "Base Blog", url: "https://base.mirror.xyz/feed/atom", type: "rss", priority: 1 },
  { name: "Starknet Blog", url: "https://medium.com/feed/starkware", type: "rss", priority: 1 },
  { name: "Scroll Blog", url: "https://scroll.io/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Mantle Blog", url: "https://www.mantle.xyz/blog/rss.xml", type: "rss", priority: 1 },
  { name: "BNB Chain Blog", url: "https://www.bnbchain.org/en/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Sui Blog", url: "https://blog.sui.io/feed/", type: "rss", priority: 1 },
  { name: "Aptos Blog", url: "https://aptoslabs.medium.com/feed", type: "rss", priority: 1 },
  { name: "Cosmos Blog", url: "https://blog.cosmos.network/feed", type: "rss", priority: 1 },
  { name: "TON Blog", url: "https://blog.ton.org/rss.xml", type: "rss", priority: 1 },
  { name: "Lido Blog", url: "https://lido.fi/blog/rss.xml", type: "rss", priority: 1 },
  { name: "EigenLayer Blog", url: "https://www.blog.eigenlayer.xyz/rss/", type: "rss", priority: 1 },
  { name: "Messari Research", url: "https://messari.io/rss/news.xml", type: "rss", priority: 1 },
  { name: "DeFiLlama Blog", url: "https://defillama.com/blog/rss.xml", type: "rss", priority: 1 },
  { name: "OKX Blog", url: "https://www.okx.com/learn/category/news/feed", type: "rss", priority: 1 },
  { name: "Alchemy Blog", url: "https://www.alchemy.com/blog/rss.xml", type: "rss", priority: 2 },
  { name: "Foresight News", url: "https://foresightnews.pro/rss", type: "rss", priority: 1 },
  { name: "Panews", url: "https://www.panewslab.com/rss", type: "rss", priority: 1 },
  { name: "DLNews", url: "https://www.dlnews.com/rss/", type: "rss", priority: 1 },
  { name: "CoinGecko Blog", url: "https://blog.coingecko.com/feed/", type: "rss", priority: 1 },
  { name: "a16z Crypto Blog", url: "https://a16zcrypto.com/feed/", type: "rss", priority: 1 },
  { name: "Paradigm Blog", url: "https://www.paradigm.xyz/feed.xml", type: "rss", priority: 1 },
  { name: "Web3 Foundation Blog", url: "https://medium.com/feed/web3foundation", type: "rss", priority: 1 },
];

// ── Base keywords (for RSS filter) ────────────────────────────────────────────
export const DEFAULT_KEYWORDS = [
  "blockchain","web3","crypto","bitcoin","btc","ethereum","eth","solana",
  "defi","nft","rwa","depin","layer1","layer2","dao","zk","zkp",
  "airdrop","testnet","mainnet","ido","presale","launchpad","token",
  "funding","grant","hackathon","quest","node","staking","yield",
  "token sale","token listing","token generation event","tge",
  "public sale","private sale","whitelist","early access","beta",
  "incentive","reward","bounty","mint","claim","snapshot",
  "arbitrum","optimism","zksync","base","starknet","linea","scroll","mantle",
  "avalanche","polygon","bnb","sui","aptos","cosmos","polkadot","ton",
  "near","fantom","algorand","tron","hedera","stellar","iota",
  "ai agent","defi protocol","liquidity","tvl","dex","cex","nft mint",
  "layer 2","rollup","bridge","lsd","lst","restaking","eigenlayer",
  "perp","perpetual","options","lending","borrowing","yield farming",
  "launchpad","incubator","accelerator","investment","seed round","series",
  "oracle","data feed","cross-chain","interoperability","modular",
  "hiring","job","developer","engineer","ambassador","community","kol",
  "moderator","mod","discord mod","telegram mod","community manager",
  "marketing","growth","content creator","copywriter","analyst","researcher",
  "product manager","designer","partnership","business development","bd",
  "remote","apply now","join our team","open role","we're hiring",
  "testnet node","validator","operator","early adopter",
  "bug bounty","bounty program","security audit","vulnerability","exploit",
  "hackenproof","immunefi","code4rena","security researcher","responsible disclosure",
  "raises","raised","seed round","series a","series b","pre-seed","investment round",
  "lead investor","backed by","announces funding","closes funding",
  "public sale","private sale","seedify","dao maker","polkastarter","coinlist","legion",
  "pinksale","initial dex offering","token sale","dxsale","whitelisted",
  "grant program","grant round","gitcoin","ecosystem fund","foundation grant",
  "incubation","accelerator program","web3 foundation","near grants","arbitrum grants",
  "optimism rpgf","retroactive funding","binance labs","a16z crypto","grants for",
  "web3 job","crypto job","blockchain developer","solidity developer","rust developer",
  "sec","cftc","mica","regulation","regulatory","compliance","crypto law","crypto bill",
  "crypto policy","crypto tax","crypto ban","crypto approved","etf approved","etf rejected",
  "rwa tokenization","real world assets tokenization","asset tokenization","tokenized",
  "bitcoin etf","ethereum etf","crypto etf","spot bitcoin etf","spot ethereum etf",
  "stablecoin bill","stablecoin regulation","stablecoin reserve","cbdc",
  "central bank digital currency","institutional adoption","institutional bitcoin",
  "corporate bitcoin","enterprise blockchain","on-chain finance",
  "区块链","加密货币","空投","测试网","主网","代币","融资","挖矿",
  "交易所","上线","发行","生态","跨链","钱包","隐私","智能合约",
  "节点","质押","铸造","白名单","快照","奖励","激励","测试","社区",
  "链游","元宇宙","去中心化","公链","侧链","二层","零知识","锁仓",
  "预售","内测","公测","开放","申请","报名","任务","活动","招募",
  "漏洞","赏金","资助","捐赠","赞助","孵化","加速器","招聘",
  "融资轮","种子轮","战略投资","天使轮","安全审计","漏洞赏金",
  "监管","合规","政策","加密货币监管","数字资产","etf","合法化","禁令","牌照","央行",
  "RWA代币化","机构采购","比特币储备","稳定币","银行区块链","加密ETF",
];

// v2.0_migrated_2026 requirement: use ONLY the system keyword list.
// Source order: DB scrape_keywords (enabled=true) → DEFAULT_KEYWORDS fallback.

// ── Scrape config ──────────────────────────────────────────────────────────────
export const SCRAPE_CONFIG = {
  VERSION,
  maxArticlesPerGroqRun:     100,
  maxArticlesPerDeepSeekRun: 50,
  maxDailyArticles:          5000,
  normalTimeWindowHours:     10,
  firstRunTimeWindowDays:    30,
  googleNewsKeywordChunk:    8,   // keywords per Google News URL
  maxGoogleNewsUrlsPerRun:   40,  // cap on Google News queries per run
};

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ScrapeSource {
  id?: number;
  name: string;
  url: string;
  type: string;
  priority: number;
  enabled: boolean;
}

export interface ScrapeLogEntry {
  id?: number;
  runId: string;
  sourceName: string;
  sourceUrl: string;
  status: "ok" | "error" | "skip";
  itemsFound: number;
  itemsSaved: number;
  errorMsg?: string | null;
  createdAt?: Date;
}

export interface ScrapeRunSummary {
  runId: string;
  totalSources: number;
  totalItemsFound: number;
  totalItemsSaved: number;
  errors: number;
  durationMs: number;
}

interface ProcessedEvent {
  title: string;
  project_name: string;
  description: string;
  category: string[];
  start_time: string | null;
  end_time: string | null;
  source_url: string;
  importance: "high" | "medium" | "low";
  ai_confidence: number;
}

// ── AI Prompt (v2.0) — 快讯 is catch-all for web3 content without specific section ──
const WEB3_BATCH_PROMPT = `You are a Web3 event extraction expert for web3release.com. VERSION: v2.0_migrated_2026

CORE RULE:
ALL content MUST belong to Web3 / blockchain / cryptocurrency / DeFi / NFT / DAO / Layer2 / crypto space.
Reject non-crypto content entirely.

Platform sections (choose 1–2 from this exact list):

- 测试网: Testnet launch, alpha/beta test, devnet, early access, open/closed beta, testnet reward programs, testnet airdrops.
- IDO/Launchpad: Token IDO, launchpad listing, token/NFT presale, mainnet launch, exchange listing, TGE.
- 融资公告: ONLY confirmed VC funding with specific dollar amount AND investor names OR round type (seed, Series A/B).
- 空投/链上任务: Use "空投" for airdrop campaigns; use "链上任务" for on-chain quests with rewards (Galxe, Layer3, Zealy, Intract, points programs, XP systems, loyalty campaigns).
- 招聘: Web3/crypto/DeFi job postings — any role at any crypto-native organization.
- 节点招募: Validator node or miner node recruitment, node operator programs, guides on running a node.
- 开发者漏洞奖金: Bug bounties (Immunefi, Code4rena, HackenProof), hackathons (ETHGlobal), security audits, developer grants, SDK/API releases.
- 项目捐赠/赞助: Grant programs (Gitcoin, Ethereum/Solana/Arbitrum/Optimism Foundation), ecosystem funds, accelerators, incubators.
- 政策监管: Government/regulatory announcements — SEC, CFTC, EU MiCA, crypto tax laws, exchange licensing, ETF approvals.
- 快讯: (A) TradFi × Crypto crossover: RWA tokenization, institutional adoption, ETFs, stablecoin regulation, CBDC, tokenized securities. (B) Any clearly Web3/crypto article that does not fit the above sections — use 快讯 as the catch-all for general crypto news, market updates, protocol news, ecosystem updates, or any other crypto content.

Routing priority (apply in order):
1. Testnet network content → 测试网
2. Token IDO / presale / mainnet / exchange listing → IDO/Launchpad
3. Confirmed funding with amount + investor → 融资公告
4. Airdrop campaign → 空投 | On-chain quest with reward → 链上任务
5. Node operator recruitment → 节点招募
6. Job posting at crypto org → 招聘
7. Bug bounty / hackathon / security audit / developer tool → 开发者漏洞奖金
8. Grant / ecosystem fund / accelerator → 项目捐赠/赞助
9. Regulatory / government crypto policy → 政策监管
10. TradFi×Crypto crossover (RWA, ETF, institutional, CBDC, stablecoin regulation) → 快讯
11. Any other clearly Web3/crypto content → 快讯 (catch-all)
12. NOT Web3/crypto at all → return [] (reject)

Task: For each article decide: (a) Is it Web3/crypto? (b) Which section fits best? (c) Extract dates.

Output rules:
- Return ONLY a raw JSON array — no markdown, no code blocks
- Skip non-Web3 content silently (return nothing for that item)
- Return [] only if ALL articles are non-Web3
- Web3 articles MUST always be included — use 快讯 if no specific section fits

Format:
{
  "title": "Concise title, max 12 words, keep original language",
  "project_name": "Official project name",
  "description": "60–100 word description highlighting the key information. Keep original language.",
  "category": ["空投"],
  "start_time": "ISO 8601 or null",
  "end_time": "ISO 8601 or null",
  "source_url": "original URL",
  "importance": "high/medium/low",
  "ai_confidence": 0.85
}

Article list:
{{ARTICLES}}`;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function safeDate(val: unknown): Date | null {
  if (!val || typeof val !== "string") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function passesKeywordFilter(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

async function fetchRssWithRetry(url: string, retries = MAX_RETRIES): Promise<Parser.Output<Record<string, unknown>> | null> {
  const UA = "Mozilla/5.0 (compatible; Web3ReleaseBot/2.0; +https://web3release.com)";

  const parser = new Parser({
    timeout: 20000,
    headers: {
      "User-Agent": UA,
      "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml, */*",
    },
    requestOptions: { rejectUnauthorized: false },
  });

  const backoffMs = (attempt: number) => {
    const base = Math.min(15000, 700 * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 350);
    return base + jitter;
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml, */*",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const retryable = res.status === 429 || res.status === 408 || (res.status >= 500 && res.status <= 599);
        const msg = `HTTP ${res.status} ${res.statusText}`;
        if (!retryable || attempt === retries) {
          console.warn(`[unified-scrape] fetchRss failed (${attempt}/${retries}): ${url} — ${msg}`);
          return null;
        }
        await sleep(backoffMs(attempt));
        continue;
      }

      const xml = await res.text();
      return await parser.parseString(xml);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === retries) {
        console.warn(`[unified-scrape] fetchRss failed (${retries} attempts): ${url} — ${msg}`);
        return null;
      }
      await sleep(backoffMs(attempt));
    }
  }
  return null;
}

// ── In-memory fingerprint cache (48h TTL) ─────────────────────────────────────
const seenTitleFingerprints = new Map<string, number>();
const FINGERPRINT_TTL_MS = 48 * 60 * 60 * 1000;

function makeTitleFingerprint(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function isFingerprintSeen(fp: string): boolean {
  const ts = seenTitleFingerprints.get(fp);
  if (!ts) return false;
  if (Date.now() - ts > FINGERPRINT_TTL_MS) { seenTitleFingerprints.delete(fp); return false; }
  return true;
}

function markFingerprintSeen(fp: string): void {
  seenTitleFingerprints.set(fp, Date.now());
}

// ── AI batch processor (unified for all sections) ─────────────────────────────
async function processBatch(
  articles: Array<{ title: string; description: string; link: string; pubDate?: string }>,
  paidOnly = false,
  retries = MAX_RETRIES,
): Promise<ProcessedEvent[]> {
  const articlesText = articles.map((a, i) =>
    `[${i + 1}] Title: ${a.title}\nContent: ${a.description?.slice(0, 400) ?? ""}\nURL: ${a.link}\nPublished: ${a.pubDate ?? "unknown"}`
  ).join("\n\n---\n\n");

  const prompt = WEB3_BATCH_PROMPT.replace("{{ARTICLES}}", articlesText);
  const freeOnly = !paidOnly;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const raw = await callAiWithFallback(
      [{ role: "user", content: prompt }],
      8192,
      0.2,
      freeOnly,
      "unified",
      paidOnly,
    );
    if (raw) {
      const cleaned = raw.trim()
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
      let parsed: ProcessedEvent[];
      try {
        parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) parsed = [];
      } catch {
        parsed = [];
      }
      return parsed.filter(ev => ev && typeof ev.title === "string" && ev.title.trim());
    }
    if (attempt < retries) await sleep(attempt * 2000);
  }
  console.warn(`[unified-scrape] All providers failed after ${retries} attempts`);
  return [];
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  try {
    const rows = await db.execute(sql`SELECT source_url FROM posts WHERE source_url = ANY(${urls})`);
    return new Set((rows.rows as Array<{ source_url: string }>).map(r => r.source_url));
  } catch { return new Set(); }
}

async function getExistingTitles(titles: string[]): Promise<Set<string>> {
  if (titles.length === 0) return new Set();
  try {
    const normalized = titles.map(t => t.toLowerCase().trim());
    const rows = await db.execute(
      sql`SELECT LOWER(TRIM(title)) AS norm_title FROM posts
          WHERE LOWER(TRIM(title)) = ANY(${normalized})
            AND created_at > NOW() - INTERVAL '30 days'`
    );
    return new Set((rows.rows as Array<{ norm_title: string }>).map(r => r.norm_title));
  } catch { return new Set(); }
}

export async function getKeywordsFromDb(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`SELECT keyword FROM scrape_keywords WHERE enabled = true`);
    const kws = (rows.rows as Array<{ keyword: string }>).map(r => r.keyword);
    return kws.length > 0 ? kws : DEFAULT_KEYWORDS;
  } catch { return DEFAULT_KEYWORDS; }
}

export async function getSourcesFromDb(): Promise<ScrapeSource[]> {
  try {
    const rows = await db.execute(sql`SELECT id, name, url, type, priority, enabled FROM scrape_sources WHERE enabled = true ORDER BY priority ASC, id ASC`);
    const sources = rows.rows as ScrapeSource[];
    if (sources.length > 0) return sources;
    return DEFAULT_SOURCES.map(s => ({ ...s, enabled: true }));
  } catch { return DEFAULT_SOURCES.map(s => ({ ...s, enabled: true })); }
}

// ── Backup file (dev only) ─────────────────────────────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BACKUP_FILE = IS_PRODUCTION
  ? null
  : resolve(process.cwd(), "../../articles_backup.json");
if (BACKUP_FILE) console.log("[backup] articles_backup.json path:", BACKUP_FILE);
else console.log("[backup] Production mode — backup disabled (using PostgreSQL)");

function appendToBackupFile(row: Record<string, unknown>): void {
  if (!BACKUP_FILE) return;
  try {
    appendFileSync(BACKUP_FILE, JSON.stringify(row) + "\n", "utf-8");
  } catch (e) {
    console.error("[unified-scrape] backup write error:", e);
  }
}

// ── Post insert (single section) ──────────────────────────────────────────────
async function insertPost(ev: ProcessedEvent, section: string): Promise<boolean> {
  try {
    const sourceUrl = ev.source_url?.trim();

    // Guard 0-A: URL dedup (global, any section)
    if (sourceUrl) {
      const urlDup = await db.execute(
        sql`SELECT id FROM posts WHERE source_url = ${sourceUrl} AND section = ${section} LIMIT 1`
      );
      if ((urlDup.rows as Array<unknown>).length > 0) return false;
    }

    // Guard 0-B: event_end_time expired
    if (ev.end_time) {
      const evEnd = safeDate(ev.end_time);
      if (evEnd && Date.now() - evEnd.getTime() > 24 * 60 * 60 * 1000) {
        return false;
      }
    }

    // Guard 0-C: event_start_time age
    const eventAgeLimit = SECTION_EVENT_MAX_AGE_DAYS[section] ?? DEFAULT_EVENT_MAX_AGE_DAYS;
    if (ev.start_time) {
      const evStart = safeDate(ev.start_time);
      if (evStart) {
        const ageDays = (Date.now() - evStart.getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > eventAgeLimit) return false;
      }
    }

    // Guard 0-D: URL-embedded date
    if (sourceUrl) {
      const urlDateMatch = sourceUrl.match(/\/(20\d{2})[\/\-](0[1-9]|1[0-2])/);
      if (urlDateMatch) {
        const urlDate = new Date(parseInt(urlDateMatch[1], 10), parseInt(urlDateMatch[2], 10) - 1, 1);
        const ageDays = (Date.now() - urlDate.getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > eventAgeLimit + 31) return false;
      }
    }

    // Guard 1: exact title match (same section, 30 days)
    const normTitle = ev.title.toLowerCase().trim();
    const dup = await db.execute(
      sql`SELECT id FROM posts WHERE section = ${section} AND LOWER(TRIM(title)) = ${normTitle}
          AND created_at > NOW() - INTERVAL '30 days' LIMIT 1`
    );
    if ((dup.rows as Array<unknown>).length > 0) return false;

    // Guard 2: fuzzy title similarity
    try {
      const fuzzyDup = await db.execute(
        sql`SELECT id FROM posts WHERE section = ${section}
            AND created_at > NOW() - INTERVAL '7 days'
            AND similarity(LOWER(title), ${normTitle}) > 0.60 LIMIT 1`
      );
      if ((fuzzyDup.rows as Array<unknown>).length > 0) return false;
    } catch { /* pg_trgm not available */ }

    // Guard 3: same project burst (3h)
    const projectName = ev.project_name?.trim();
    const GENERIC_NAMES = new Set(["AI精选", "ai-system", "", "Unknown", "N/A"]);
    if (projectName && projectName.length >= 3 && !GENERIC_NAMES.has(projectName)) {
      const burstDup = await db.execute(
        sql`SELECT id FROM posts WHERE section = ${section}
            AND LOWER(TRIM(author_name)) = ${projectName.toLowerCase().trim()}
            AND created_at > NOW() - INTERVAL '3 hours' LIMIT 1`
      );
      if ((burstDup.rows as Array<unknown>).length > 0) return false;
    }

    const now = new Date();
    const [inserted] = await db.insert(postsTable).values({
      title: ev.title.slice(0, 200),
      content: (ev.description ?? "").slice(0, 2000),
      section,
      authorWallet: AI_SYSTEM_WALLET,
      authorName: (ev.project_name?.slice(0, 100)) || AI_SYSTEM_NAME,
      authorType: "ai",
      sourceUrl: sourceUrl?.slice(0, 500) ?? null,
      aiConfidence: typeof ev.ai_confidence === "number" ? Math.min(1, Math.max(0, ev.ai_confidence)) : 0.8,
      importance: (["high", "medium", "low"] as const).includes(ev.importance as "high") ? ev.importance : "medium",
      eventStartTime: safeDate(ev.start_time),
      eventEndTime: safeDate(ev.end_time),
      expiresAt: new Date(now.getTime() + SIXTY_DAYS_MS),
      views: 0, likes: 0, comments: 0, kolLikePoints: 0, kolCommentPoints: 0,
      isPinned: false, pinQueued: false,
    }).returning();

    if (inserted) appendToBackupFile(inserted as unknown as Record<string, unknown>);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[unified-scrape] insertPost(${section}) error: ${msg}`);
    return false;
  }
}

// ── Dual-publish: section(s) + always 724news ─────────────────────────────────
// v2.0 rule: every article that passes AI review is published to 7×24快讯.
// Additionally published to any specific matched section.
async function dualPublish(ev: ProcessedEvent): Promise<number> {
  const aiCategories = Array.isArray(ev.category) ? ev.category : [];
  const matchedSections = mapAllCategories(aiCategories, ev.title);

  // Build final section set: matched sections + always 724news
  const sectionsToPublish = new Set<string>(matchedSections);
  sectionsToPublish.add("724news");

  // Remove 724news from matched before logging (to avoid double-logging)
  const specificSections = matchedSections.filter(s => s !== "724news");
  if (specificSections.length > 0) {
    console.log(`[unified-scrape] Dual-publish "${ev.title.slice(0, 60)}" → [${specificSections.join(", ")}] + 724news`);
  }

  let saved = 0;
  for (const section of sectionsToPublish) {
    const ok = await insertPost(ev, section);
    if (ok) saved++;
  }
  return saved;
}

// ── Scrape log ─────────────────────────────────────────────────────────────────
async function logEntry(entry: ScrapeLogEntry): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scrape_logs (run_id, source_name, source_url, status, items_found, items_saved, error_msg)
      VALUES (${entry.runId}, ${entry.sourceName}, ${entry.sourceUrl}, ${entry.status}, ${entry.itemsFound}, ${entry.itemsSaved}, ${entry.errorMsg ?? null})
    `);
  } catch (e) { console.error("[unified-scrape] log error:", e); }
}

// ── Daily article budget from DB ───────────────────────────────────────────────
async function getTodayArticlesProcessed(): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(items_saved), 0) AS total
      FROM scrape_logs
      WHERE run_id LIKE ${"unified_%"}
        AND created_at >= CURRENT_DATE
    `);
    return Number((result.rows[0] as { total: string }).total);
  } catch { return 0; }
}

async function checkIsFirstRun(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM scrape_logs WHERE run_id LIKE ${"unified_%"}`
    );
    return Number((result.rows[0] as { count: string }).count) === 0;
  } catch { return true; }
}

// ── Google News URL builder ────────────────────────────────────────────────────
function buildGoogleNewsUrls(keywords: string[], chunkSize = 8, maxUrls = 40): string[] {
  const WEB3_ANCHOR_EN = '(web3 OR crypto OR blockchain OR DeFi OR NFT OR cryptocurrency)';
  const WEB3_ANCHOR_CN = '(区块链 OR 加密货币 OR Web3 OR DeFi OR NFT OR 加密)';
  const isChinese = (s: string) => /[\u4e00-\u9fff]/.test(s);

  const engKws = keywords.filter(k => !isChinese(k));
  const chnKws = keywords.filter(k => isChinese(k));

  const urls: string[] = [];

  const buildChunk = (chunk: string[], locale: string, anchor: string) => {
    const terms = chunk.map(k => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
    const query = `(${terms}) ${anchor}`;
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`;
  };

  for (let i = 0; i < engKws.length && urls.length < maxUrls; i += chunkSize) {
    urls.push(buildChunk(engKws.slice(i, i + chunkSize), "hl=en-US&gl=US&ceid=US:en", WEB3_ANCHOR_EN));
  }
  for (let i = 0; i < chnKws.length && urls.length < maxUrls; i += chunkSize) {
    urls.push(buildChunk(chnKws.slice(i, i + chunkSize), "hl=zh-CN&gl=CN&ceid=CN:zh-Hans", WEB3_ANCHOR_CN));
  }

  return urls;
}

// ── Provider availability ──────────────────────────────────────────────────────
function hasUsableProvider(paidOnly: boolean, freeOnly: boolean): boolean {
  if (paidOnly) {
    return getAvailableProviders().some(p => p.name === "deepseek") &&
           isDeepSeekBudgetAvailable() &&
           isDeepSeekHourlyBudgetAvailable();
  }
  if (freeOnly) {
    if (isFreeProviderAvailable()) return true;
    // If no free Groq provider is configured/available, allow DeepSeek to take over
    // (still subject to the independent $0.50/day and hourly budget).
    return getAvailableProviders().some(p => p.name === "deepseek") &&
           isDeepSeekBudgetAvailable() &&
           isDeepSeekHourlyBudgetAvailable();
  }
  return getAvailableProviders().length > 0;
}

// ── Run state ──────────────────────────────────────────────────────────────────
let globalGroqRunning  = false;
let globalDsRunning    = false;

export function isScrapeRunning(): boolean { return globalGroqRunning || globalDsRunning; }
// Alias for routes backward compat
export function isKeywordScrapeRunning(): boolean { return isScrapeRunning(); }

// ── runUnifiedScrape — main entry point (v2.0) ────────────────────────────────
export interface UnifiedScrapeOptions {
  paidOnly?: boolean;
  freeOnly?: boolean;
  maxArticlesPerRun?: number;
  overrideWindowHours?: number;
  ignoreDailyLimit?: boolean;
}

export async function runUnifiedScrape(opts: UnifiedScrapeOptions = {}): Promise<ScrapeRunSummary> {
  const {
    paidOnly = false,
    freeOnly = !paidOnly,
    maxArticlesPerRun = paidOnly ? SCRAPE_CONFIG.maxArticlesPerDeepSeekRun : SCRAPE_CONFIG.maxArticlesPerGroqRun,
    overrideWindowHours,
    ignoreDailyLimit = false,
  } = opts;

  const lockKey = paidOnly ? "ds" : "groq";
  if (paidOnly && globalDsRunning) {
    console.warn("[unified-scrape:ds] Already running — skipped");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  if (!paidOnly && globalGroqRunning) {
    console.warn("[unified-scrape:groq] Already running — skipped");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }

  if (paidOnly) globalDsRunning = true;
  else globalGroqRunning = true;

  const runId   = `unified_${lockKey}_${Date.now()}`;
  const startMs = Date.now();
  const modeLabel = paidOnly ? "deepseek-only" : "groq-first";

  const isFirstRun = await checkIsFirstRun();
  const windowHours = overrideWindowHours ?? (
    isFirstRun ? SCRAPE_CONFIG.firstRunTimeWindowDays * 24 : SCRAPE_CONFIG.normalTimeWindowHours
  );
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  console.log(`[unified-scrape] Starting ${runId} — mode: ${modeLabel}, window: ${windowHours}h${isFirstRun ? " (FIRST RUN)" : ""}, max: ${maxArticlesPerRun}`);
  logProviderStatus();

  let totalItemsFound = 0;
  let totalItemsSaved = 0;
  let errors = 0;
  let globalCount = 0;
  const allSeenLinks = new Set<string>();

  try {
    // ── Daily cap check ──
    if (!ignoreDailyLimit) {
      const todayProcessed = await getTodayArticlesProcessed();
      if (todayProcessed >= SCRAPE_CONFIG.maxDailyArticles) {
        console.log(`[unified-scrape] Daily limit reached (${todayProcessed}/${SCRAPE_CONFIG.maxDailyArticles}). Skipping.`);
        return { runId, totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: Date.now() - startMs };
      }
    }

    // ── DeepSeek hourly budget gate ──
    if (paidOnly && !isDeepSeekHourlyBudgetAvailable()) {
      console.log(`[unified-scrape:ds] Hourly DeepSeek budget exhausted — skipping this run`);
      return { runId, totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: Date.now() - startMs };
    }

    const combinedKws = await getKeywordsFromDb();

    // ════════════════════════════════════════════════════════════
    // PART 1: RSS sources
    // ════════════════════════════════════════════════════════════
    const rssSources = await getSourcesFromDb();

    for (const source of rssSources) {
      if (globalCount >= maxArticlesPerRun) break;
      if (!hasUsableProvider(paidOnly, freeOnly)) {
        console.log("[unified-scrape] No usable provider — stopping RSS phase");
        break;
      }

      try {
        const feed = await fetchRssWithRetry(source.url);
        if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) continue;

        const candidates = feed.items
          .slice(0, 30)
          .filter(item => {
            const pd = item.pubDate ?? item.isoDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < cutoff) return false;
            }
            const text = `${item.title ?? ""} ${item.contentSnippet ?? item.summary ?? item.content ?? ""}`;
            return passesKeywordFilter(text, combinedKws);
          })
          .map(item => ({
            title: (item.title ?? "").replace(/<[^>]+>/g, "").trim(),
            description: (item.contentSnippet ?? item.summary ?? item.content ?? "").replace(/<[^>]+>/g, "").slice(0, 800).trim(),
            link: item.link ?? item.guid ?? source.url,
            pubDate: item.pubDate ?? item.isoDate,
          }))
          .filter(c => c.title && c.link && !allSeenLinks.has(c.link));

        if (candidates.length === 0) continue;

        const existingUrls = await getExistingUrls(candidates.map(c => c.link));
        const newArticles = candidates.filter(c => !existingUrls.has(c.link));

        if (newArticles.length === 0) continue;

        candidates.forEach(c => allSeenLinks.add(c.link));
        totalItemsFound += newArticles.length;
        globalCount += newArticles.length;

        let savedCount = 0;
        for (let i = 0; i < newArticles.length; i += BATCH_SIZE) {
          if (!hasUsableProvider(paidOnly, freeOnly)) break;
          const batch = newArticles.slice(i, i + BATCH_SIZE).filter(a => {
            const fp = makeTitleFingerprint(a.title);
            if (isFingerprintSeen(fp)) return false;
            markFingerprintSeen(fp);
            return true;
          });
          if (batch.length === 0) continue;

          const events = await processBatch(batch, paidOnly);
          const existingTitles = await getExistingTitles(events.map(ev => ev.title).filter(Boolean));
          for (const ev of events) {
            if (existingTitles.has(ev.title.toLowerCase().trim())) continue;
            savedCount += await dualPublish(ev);
          }
          if (i + BATCH_SIZE < newArticles.length) await sleep(3000);
        }

        totalItemsSaved += savedCount;
        await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "ok", itemsFound: newArticles.length, itemsSaved: savedCount });
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[unified-scrape] RSS source ${source.name} error:`, msg);
        await logEntry({
          runId,
          sourceName: source.name,
          sourceUrl: source.url,
          status: "error",
          itemsFound: 0,
          itemsSaved: 0,
          errorMsg: msg.slice(0, 900),
        });
      }
      await sleep(200);
    }

    // ════════════════════════════════════════════════════════════
    // PART 2: Google News — combined keywords
    // ════════════════════════════════════════════════════════════
    if (globalCount < maxArticlesPerRun && hasUsableProvider(paidOnly, freeOnly)) {
      const gnUrls = buildGoogleNewsUrls(
        combinedKws,
        SCRAPE_CONFIG.googleNewsKeywordChunk,
        SCRAPE_CONFIG.maxGoogleNewsUrlsPerRun,
      );

      const gnArticles = new Map<string, { title: string; description: string; link: string; pubDate?: string }>();
      let gnFetchErrors = 0;

      for (const gnUrl of gnUrls) {
        try {
          const feed = await fetchRssWithRetry(gnUrl);
          if (!feed || !Array.isArray(feed.items)) continue;

          for (const item of feed.items) {
            const pd = item.pubDate ?? item.isoDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < cutoff) continue;
            }
            const link = item.link ?? item.guid ?? gnUrl;
            if (!link || gnArticles.has(link) || allSeenLinks.has(link)) continue;
            const title = (item.title ?? "").replace(/<[^>]+>/g, "").trim();
            if (!title) continue;
            const description = (item.contentSnippet ?? item.summary ?? item.content ?? "")
              .replace(/<[^>]+>/g, "").slice(0, 800).trim();
            gnArticles.set(link, { title, description, link, pubDate: pd ?? undefined });
          }
        } catch (e) {
          errors++;
          gnFetchErrors++;
          console.warn(`[unified-scrape] Google News fetch error:`, e instanceof Error ? e.message : e);
        }
        await sleep(400);
      }

      const gnList = Array.from(gnArticles.values());
      if (gnList.length > 0) {
        const existingUrls = await getExistingUrls(gnList.map(a => a.link));
        const newGnArticles = gnList.filter(a => !existingUrls.has(a.link)).slice(0, maxArticlesPerRun - globalCount);

        totalItemsFound += newGnArticles.length;
        globalCount += newGnArticles.length;
        newGnArticles.forEach(a => allSeenLinks.add(a.link));

        let savedCount = 0;
        for (let i = 0; i < newGnArticles.length; i += BATCH_SIZE) {
          if (!hasUsableProvider(paidOnly, freeOnly)) {
            console.log("[unified-scrape] Provider unavailable mid Google News phase — stopping");
            break;
          }
          const batch = newGnArticles.slice(i, i + BATCH_SIZE).filter(a => {
            const fp = makeTitleFingerprint(a.title);
            if (isFingerprintSeen(fp)) return false;
            markFingerprintSeen(fp);
            return true;
          });
          if (batch.length === 0) continue;

          const events = await processBatch(batch, paidOnly);
          const existingTitles = await getExistingTitles(events.map(ev => ev.title).filter(Boolean));
          for (const ev of events) {
            if (existingTitles.has(ev.title.toLowerCase().trim())) continue;
            savedCount += await dualPublish(ev);
          }
          if (i + BATCH_SIZE < newGnArticles.length) await sleep(3000);
        }

        totalItemsSaved += savedCount;
        await logEntry({
          runId,
          sourceName: "[google-news] all-keywords",
          sourceUrl: gnUrls[0] ?? "",
          status: gnFetchErrors > 0 && savedCount === 0 ? "error" : "ok",
          itemsFound: newGnArticles.length,
          itemsSaved: savedCount,
          errorMsg: gnFetchErrors > 0 ? `google-news feed errors: ${gnFetchErrors}/${gnUrls.length}` : null,
        });
      } else if (gnFetchErrors > 0) {
        await logEntry({
          runId,
          sourceName: "[google-news] all-keywords",
          sourceUrl: gnUrls[0] ?? "",
          status: "error",
          itemsFound: 0,
          itemsSaved: 0,
          errorMsg: `google-news feed errors: ${gnFetchErrors}/${gnUrls.length}`,
        });
      }
    }

  } catch (e: unknown) {
    errors++;
    console.error("[unified-scrape] Fatal error:", e);
  } finally {
    if (paidOnly) globalDsRunning = false;
    else globalGroqRunning = false;
  }

  const durationMs = Date.now() - startMs;
  console.log(`[unified-scrape] ${runId} done. Found: ${totalItemsFound}, Saved: ${totalItemsSaved}, Errors: ${errors}, Duration: ${Math.round(durationMs / 1000)}s`);
  return { runId, totalSources: rssSources?.length ?? 0, totalItemsFound, totalItemsSaved, errors, durationMs };
}

// ── Legacy alias for routes compatibility ─────────────────────────────────────
export async function runKeywordScrape(opts: UnifiedScrapeOptions & { plates?: string[] } = {}): Promise<ScrapeRunSummary> {
  const { plates: _plates, ...rest } = opts;
  return runUnifiedScrape(rest);
}

// ── Minimal KEYWORD_GRAB_CONFIG stub for routes backward compat ───────────────
export const KEYWORD_GRAB_CONFIG = {
  VERSION,
  enabled: true,
  maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerGroqRun,
  maxArticlesPerRunDeepSeek: SCRAPE_CONFIG.maxArticlesPerDeepSeekRun,
  maxDailyArticles: SCRAPE_CONFIG.maxDailyArticles,
  normalTimeWindowHours: SCRAPE_CONFIG.normalTimeWindowHours,
  plates: {} as Record<string, { keywords: string[]; maxPerPlate: number }>,
};

export type { UnifiedScrapeOptions as KeywordScrapeOptions };

// Expose rssSources count helper for status routes
let rssSources: ScrapeSource[] = [];
getSourcesFromDb().then(s => { rssSources = s; }).catch(() => {});
