// VERSION: v2.0_migrated_2026
// Unified scraper: Groq (freeOnly) + DeepSeek (paidOnly) each run the same pipeline.
// Flow: keywords → RSS/Google News → AI classify → **always write 7×24 (`724news`) first**, then other matched plates (自动归纳).
// Groq quota: wait for next run/day reset; DeepSeek: own schedule; optional app cap via DEEPSEEK_HOURLY_BUDGET_USD (omit = no app cap).

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
  isDeepSeekBudgetAvailable,
  explainWhyPaidDeepSeekBlocked,
} from "./ai-provider";
import { classifyChainExchangeTags } from "./tag-classifier";

const VERSION = "v2.0_migrated_2026";
console.log(`[auto-scraper] ${VERSION} loaded`);

const AI_SYSTEM_WALLET = "ai-system";
const AI_SYSTEM_NAME   = "AI精选";
const SIXTY_DAYS_MS    = 60 * 24 * 60 * 60 * 1000;
const BATCH_SIZE       = 5;
const _aiRetriesRaw = Number(process.env.SCRAPE_AI_BATCH_RETRIES ?? "5");
const MAX_RETRIES = Number.isFinite(_aiRetriesRaw)
  ? Math.min(8, Math.max(3, Math.round(_aiRetriesRaw)))
  : 5;

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
  { name: "Coinbase Blog", url: "https://www.coinbase.com/blog/feed.xml", type: "rss", priority: 1 },
  { name: "Chainlink Blog", url: "https://blog.chain.link/feed/", type: "rss", priority: 1 },
  // Optimism blog does not currently expose a stable RSS endpoint; rely on Google News + other official sources.
  { name: "Arbitrum Blog", url: "https://blog.arbitrum.io/rss/", type: "rss", priority: 1 },
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
  // Base official publishing is on Mirror (Atom feed).
  { name: "Base Blog", url: "https://base.mirror.xyz/feed/atom", type: "rss", priority: 1 },
  { name: "Starknet Blog", url: "https://medium.com/feed/starkware", type: "rss", priority: 1 },
  { name: "Scroll Blog", url: "https://scroll.io/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Mantle Blog", url: "https://www.mantle.xyz/blog/rss.xml", type: "rss", priority: 1 },
  { name: "BNB Chain Blog", url: "https://www.bnbchain.org/en/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Sui Blog", url: "https://blog.sui.io/feed/", type: "rss", priority: 1 },
  { name: "Aptos Blog", url: "https://aptosnetwork.com/currents/category/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Kraken Blog", url: "https://blog.kraken.com/feed/", type: "rss", priority: 1 },
  // Bybit does not provide a stable public RSS URL for announcements; use official API endpoint.
  { name: "Bybit Announcements", url: "https://api.bybit.com/v5/announcements/index?locale=en-US&limit=50&page=1", type: "bybit-api", priority: 1 },
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
  // OKX / exchange-specific keywords (keep mechanism unchanged; only widen matching)
  "okx","okex","欧易","jumpstart","megadrop","new listing","spot trading","delisting",
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
- Return ONLY a raw JSON array at the top level. Do not wrap the array in an object (no "articles" / "data" wrapper) — no markdown, no code blocks
- Skip non-Web3 content silently (return nothing for that item)
- Return [] only if ALL articles are non-Web3
- Web3 articles MUST always be included — use 快讯 if no specific section fits
- For 快讯 (and other general market/protocol news): set start_time and end_time to null. Do NOT copy historical dates mentioned inside the article (e.g. \"ETF approved in 2024\") into start_time — those are narrative context, not this post's event window. Only set dates for real future/ongoing campaigns (TGE deadlines, claim windows, testnet windows).

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

async function fetchBybitAnnouncementsWithRetry(url: string, retries = MAX_RETRIES): Promise<RssArticleSlice[] | null> {
  const UA = "Mozilla/5.0 (compatible; Web3ReleaseBot/2.0; +https://web3release.com)";
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
          "Accept": "application/json, text/plain, */*",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const retryable = res.status === 429 || res.status === 408 || (res.status >= 500 && res.status <= 599);
        const msg = `HTTP ${res.status} ${res.statusText}`;
        if (!retryable || attempt === retries) {
          console.warn(`[unified-scrape] fetchBybit failed (${attempt}/${retries}): ${url} — ${msg}`);
          return null;
        }
        await sleep(backoffMs(attempt));
        continue;
      }

      const json = await res.json().catch(() => null) as any;
      const list: any[] = json?.result?.list ?? [];
      if (!Array.isArray(list) || list.length === 0) return [];

      return list.map((it) => ({
        title: String(it?.title ?? "").replace(/<[^>]+>/g, "").trim(),
        description: String(it?.description ?? "").replace(/<[^>]+>/g, "").slice(0, 800).trim(),
        link: String(it?.url ?? "").trim(),
        pubDate: it?.publishTime ? new Date(Number(it.publishTime)).toISOString() : undefined,
      })).filter((x) => x.title && x.link);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === retries) {
        console.warn(`[unified-scrape] fetchBybit failed (${retries} attempts): ${url} — ${msg}`);
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

type RssArticleSlice = { title: string; description: string; link: string; pubDate?: string };

/** Models often wrap the array in `{ "articles": [...] }` or add prose — we still paid for tokens, so extract aggressively. */
function extractJsonArrayFromModelOutput(raw: string): unknown[] {
  const stripped = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let root = tryParse(stripped);
  if (Array.isArray(root)) return root;
  if (root && typeof root === "object") {
    const o = root as Record<string, unknown>;
    for (const key of ["events", "articles", "data", "results", "items", "posts", "output", "records"]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
    }
  }
  const i0 = stripped.indexOf("[");
  const i1 = stripped.lastIndexOf("]");
  if (i0 >= 0 && i1 > i0) {
    root = tryParse(stripped.slice(i0, i1 + 1));
    if (Array.isArray(root)) return root;
  }
  return [];
}

function coerceParsedItem(row: unknown): ProcessedEvent | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;
  const catRaw = o.category;
  const category = Array.isArray(catRaw)
    ? catRaw.map((c) => String(c).trim()).filter(Boolean)
    : catRaw != null && String(catRaw).trim()
      ? [String(catRaw).trim()]
      : ["快讯"];
  const imp = o.importance;
  const importance: "high" | "medium" | "low" =
    imp === "high" || imp === "medium" || imp === "low" ? imp : "medium";
  let ac = typeof o.ai_confidence === "number" ? o.ai_confidence : Number(o.ai_confidence);
  if (!Number.isFinite(ac)) ac = 0.8;
  const su =
    (typeof o.source_url === "string" && o.source_url.trim()) ||
    (typeof o.url === "string" && o.url.trim()) ||
    (typeof o.link === "string" && o.link.trim()) ||
    "";
  return {
    title,
    project_name: typeof o.project_name === "string" ? o.project_name.trim() : "",
    description: typeof o.description === "string" ? o.description.trim() : "",
    category,
    start_time: typeof o.start_time === "string" ? o.start_time : null,
    end_time: typeof o.end_time === "string" ? o.end_time : null,
    source_url: su,
    importance,
    ai_confidence: Math.min(1, Math.max(0, ac)),
  };
}

/**
 * Align model output to RSS rows: fix missing/wrong `source_url`, and emit RSS-only 快讯 rows when the model
 * dropped items (common cause of “DeepSeek billed, zero inserts”).
 */
function mergeAiEventsWithSourceArticles(batch: RssArticleSlice[], rawEvents: ProcessedEvent[]): ProcessedEvent[] {
  const norm = normalizeSourceUrl;
  const matchedBatchIdx = new Set<number>();
  const out: ProcessedEvent[] = [];

  for (const ev of rawEvents) {
    if (!ev.title?.trim()) continue;
    let idx = -1;
    const nu = ev.source_url?.trim() ? norm(ev.source_url) : "";
    if (nu) {
      idx = batch.findIndex((b, i) => !matchedBatchIdx.has(i) && norm(b.link) === nu);
    }
    if (idx < 0) {
      const nt = ev.title.toLowerCase().replace(/\s+/g, " ").trim();
      idx = batch.findIndex((b, i) => {
        if (matchedBatchIdx.has(i)) return false;
        const bt = b.title.toLowerCase().replace(/\s+/g, " ").trim();
        if (bt === nt) return true;
        if (bt.length >= 28 && (nt.includes(bt.slice(0, 28)) || bt.includes(nt.slice(0, 28)))) return true;
        return false;
      });
    }
    if (idx >= 0) {
      matchedBatchIdx.add(idx);
      const b = batch[idx]!;
      out.push({
        ...ev,
        source_url: b.link,
        description: ev.description?.trim() ? ev.description : b.description,
      });
    } else if (ev.source_url?.trim()) {
      out.push(ev);
    } else {
      const uidx = batch.findIndex((_, i) => !matchedBatchIdx.has(i));
      if (uidx >= 0) {
        matchedBatchIdx.add(uidx);
        const b = batch[uidx]!;
        out.push({ ...ev, source_url: b.link, description: ev.description?.trim() ? ev.description : b.description });
      } else {
        console.warn(`[unified-scrape] drop AI row (no URL, no batch slot): ${ev.title.slice(0, 48)}`);
      }
    }
  }

  if (out.length === 0 && rawEvents.length === batch.length && rawEvents.every((e) => e.title?.trim())) {
    return batch.map((b, i) => ({
      ...rawEvents[i]!,
      source_url: b.link,
      description: rawEvents[i]!.description?.trim() ? rawEvents[i]!.description : b.description,
    }));
  }

  for (let bi = 0; bi < batch.length; bi++) {
    if (matchedBatchIdx.has(bi)) continue;
    const b = batch[bi]!;
    if (out.some((e) => norm(e.source_url) === norm(b.link))) continue;
    console.warn(`[unified-scrape] RSS fallback 快讯 (model omitted / unmatched): ${norm(b.link).slice(0, 96)}`);
    out.push({
      title: b.title.slice(0, 200),
      project_name: AI_SYSTEM_NAME,
      description: (b.description || b.title).slice(0, 2000),
      category: ["快讯"],
      start_time: null,
      end_time: null,
      source_url: b.link,
      importance: "medium",
      ai_confidence: 0.55,
    });
  }

  return out;
}

// ── AI batch processor (unified for all sections) ─────────────────────────────
async function processBatch(
  articles: RssArticleSlice[],
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
      const arr = extractJsonArrayFromModelOutput(raw);
      const coerced = arr.map(coerceParsedItem).filter((x): x is ProcessedEvent => x !== null);
      if (coerced.length !== articles.length) {
        console.warn(
          `[unified-scrape] AI row count ${coerced.length} vs batch ${articles.length} — merge / RSS fallback will run`,
        );
      }
      return mergeAiEventsWithSourceArticles(articles, coerced);
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

/** Merge DB keywords with code DEFAULT_KEYWORDS (dedupe). If DB has any rows but only supplements new plates, we still keep the full base list — previously we returned ONLY DB rows and dropped DEFAULT_KEYWORDS. */
function mergeKeywordLists(base: string[], extra: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...base, ...extra]) {
    const t = String(k ?? "").trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out;
}

export async function getKeywordsFromDb(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`SELECT keyword FROM scrape_keywords WHERE enabled = true`);
    const kws = (rows.rows as Array<{ keyword: string }> | undefined)?.map(r => r.keyword) ?? [];
    // IMPORTANT: empty → [] would drop all RSS; use DEFAULT only.
    if (kws.length === 0) {
      console.warn("[unified-scrape] scrape_keywords has 0 enabled rows — using DEFAULT_KEYWORDS only");
      return [...DEFAULT_KEYWORDS];
    }
    const merged = mergeKeywordLists(DEFAULT_KEYWORDS, kws);
    if (merged.length > kws.length) {
      console.log(
        `[unified-scrape] merged DEFAULT_KEYWORDS (${DEFAULT_KEYWORDS.length} base) + scrape_keywords from DB (${kws.length}) → ${merged.length} unique`
      );
    }
    return merged;
  } catch {
    return [...DEFAULT_KEYWORDS];
  }
}

function normalizeSourceUrl(url: string): string {
  return String(url).trim().toLowerCase().replace(/\/+$/, "");
}

/** DEFAULT_SOURCES plus DB rows (same URL in DB overrides name/priority). Avoids DB-only partial list replacing the entire built-in RSS set. */
function mergeSourceLists(
  base: Array<{ name: string; url: string; type: string; priority: number }>,
  dbRows: ScrapeSource[],
): ScrapeSource[] {
  const map = new Map<string, ScrapeSource>();
  for (const s of base) {
    const u = normalizeSourceUrl(s.url);
    if (!u) continue;
    map.set(u, { name: s.name, url: s.url.trim(), type: s.type, priority: s.priority, enabled: true });
  }
  for (const s of dbRows) {
    const u = normalizeSourceUrl(s.url);
    if (!u) continue;
    map.set(u, {
      id: s.id,
      name: s.name,
      url: s.url.trim(),
      type: s.type,
      priority: s.priority,
      enabled: true,
    });
  }
  return [...map.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export async function getSourcesFromDb(): Promise<ScrapeSource[]> {
  try {
    const rows = await db.execute(sql`SELECT id, name, url, type, priority, enabled FROM scrape_sources WHERE enabled = true ORDER BY priority ASC, id ASC`);
    const sources = (rows.rows as ScrapeSource[]) ?? [];
    if (sources.length === 0) {
      return DEFAULT_SOURCES.map(s => ({ ...s, enabled: true }));
    }
    const merged = mergeSourceLists(DEFAULT_SOURCES, sources);
    if (merged.length > sources.length) {
      console.log(
        `[unified-scrape] merged DEFAULT_SOURCES (${DEFAULT_SOURCES.length}) + scrape_sources from DB (${sources.length}) → ${merged.length} RSS feeds`,
      );
    }
    return merged;
  } catch {
    return DEFAULT_SOURCES.map(s => ({ ...s, enabled: true }));
  }
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

/** Feeds where rows are timeline headlines: AI often fills historical story dates into start_time → insert guards / startup cleanup then drop valid items. We keep event dates on secondary sections (ido, quest, …) only. */
const NEWS_TIMELINE_SECTIONS = new Set<string>(["724news", "flash", "meme"]);

// ── Strong dedup helpers (timeline sections only) ─────────────────────────────
function normalizeTextLite(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Semantic title key: strips dates/digits/punct + common stopwords, keeps first 8 distinct tokens.
 * Used for stronger dedup in 7×24-like timeline feeds where many outlets repost the same story
 * with slightly different titles.
 */
function semanticTitleKeyLite(raw: string): string {
  const t = normalizeTextLite(raw || "")
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ");

  const stop = new Set([
    "a","an","and","are","as","at","be","by","for","from","has","have","in","into","is","it","its","of","on","or","s","says","to","the","this","that","these","those","with","will","vs","via",
    "best","top","latest","update","news","revealed","reveals","lead","leads","goes","live","launch","launched","crosses","cross","potential","deadline","act","committee","senate","us","u","u.s",
    "今日","最新","快讯","速报","公告","消息","更新","曝光","透露","宣布",
  ]);

  const parts = t.split(/[\s-]+/g).filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    if (p.length <= 2) continue;
    if (stop.has(p)) continue;
    if (!kept.includes(p)) kept.push(p);
    if (kept.length >= 8) break;
  }
  return kept.join("-");
}

function processEventForSection(raw: ProcessedEvent, section: string): ProcessedEvent {
  if (!NEWS_TIMELINE_SECTIONS.has(section)) return raw;
  return { ...raw, start_time: null, end_time: null };
}

// ── Post insert (single section) ──────────────────────────────────────────────
async function insertPost(ev: ProcessedEvent, section: string): Promise<boolean> {
  try {
    ev = processEventForSection(ev, section);
    const sourceUrl = ev.source_url?.trim();
    const eventAgeLimit = SECTION_EVENT_MAX_AGE_DAYS[section] ?? DEFAULT_EVENT_MAX_AGE_DAYS;

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
    if (ev.start_time) {
      const evStart = safeDate(ev.start_time);
      if (evStart) {
        const ageDays = (Date.now() - evStart.getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > eventAgeLimit) return false;
      }
    }

    // Guard 0-D: URL-embedded date — skip for timeline sections (path often reflects story month, not publish time)
    if (!NEWS_TIMELINE_SECTIONS.has(section) && sourceUrl) {
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

    // Guard 2.5: semantic-key dedup (timeline sections, cross-outlet)
    if (NEWS_TIMELINE_SECTIONS.has(section)) {
      const sem = semanticTitleKeyLite(ev.title);
      if (sem) {
        const recent = await db.execute(
          sql`SELECT title FROM posts
              WHERE section = ${section}
                AND created_at > NOW() - INTERVAL '14 days'
              ORDER BY created_at DESC
              LIMIT 400`
        );
        const titles = (recent.rows as Array<{ title?: string | null }>).map(r => String(r.title ?? ""));
        for (const t of titles) {
          if (semanticTitleKeyLite(t) === sem) return false;
        }
      }
    }

    // Guard 3: same project burst (3h) — not for 724 timeline (many headlines share project tickers)
    const projectName = ev.project_name?.trim();
    const GENERIC_NAMES = new Set(["AI精选", "ai-system", "", "Unknown", "N/A"]);
    if (
      !NEWS_TIMELINE_SECTIONS.has(section) &&
      projectName &&
      projectName.length >= 3 &&
      !GENERIC_NAMES.has(projectName)
    ) {
      const burstDup = await db.execute(
        sql`SELECT id FROM posts WHERE section = ${section}
            AND LOWER(TRIM(author_name)) = ${projectName.toLowerCase().trim()}
            AND created_at > NOW() - INTERVAL '3 hours' LIMIT 1`
      );
      if ((burstDup.rows as Array<unknown>).length > 0) return false;
    }

    const now = new Date();
    const tags = classifyChainExchangeTags({ title: ev.title, description: ev.description ?? "" });

    // Insert with tags (preferred). If DB hasn't been migrated yet, retry without tag columns.
    const insertValues: any = {
      title: ev.title.slice(0, 200),
      content: (ev.description ?? "").slice(0, 2000),
      section,
      authorWallet: AI_SYSTEM_WALLET,
      authorName: (ev.project_name?.slice(0, 100)) || AI_SYSTEM_NAME,
      authorType: "ai",
      chainTags: tags.chainTags,
      exchangeTags: tags.exchangeTags,
      sourceUrl: sourceUrl?.slice(0, 500) ?? null,
      aiConfidence: typeof ev.ai_confidence === "number" ? Math.min(1, Math.max(0, ev.ai_confidence)) : 0.8,
      importance: (["high", "medium", "low"] as const).includes(ev.importance as "high") ? ev.importance : "medium",
      eventStartTime: safeDate(ev.start_time),
      eventEndTime: safeDate(ev.end_time),
      expiresAt: new Date(now.getTime() + SIXTY_DAYS_MS),
      views: 0, likes: 0, comments: 0, kolLikePoints: 0, kolCommentPoints: 0,
      isPinned: false, pinQueued: false,
    };

    let inserted: any;
    try {
      [inserted] = await db.insert(postsTable).values(insertValues).returning();
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/chain_tags|exchange_tags/i.test(msg)) {
        delete insertValues.chainTags;
        delete insertValues.exchangeTags;
        [inserted] = await db.insert(postsTable).values(insertValues).returning();
      } else {
        throw e;
      }
    }

    if (inserted) appendToBackupFile(inserted as unknown as Record<string, unknown>);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[unified-scrape] insertPost(${section}) error: ${msg}`);
    return false;
  }
}

// ── Dual-publish: 7×24 first, then other plates (自动归纳) ────────────────────
// Design: unified pipeline publishes into **724news** as the primary stream; additional rows for ido/funding/etc. when AI maps categories.
// Insert order is guaranteed: **724news before** any secondary section (same logical story as “快讯为主、其它为归纳”).
const PRIMARY_724_SECTION = "724news";

function normalizePlateSection(s: string): string {
  return s === "flash" ? PRIMARY_724_SECTION : s;
}

async function dualPublish(ev: ProcessedEvent): Promise<number> {
  const rawCat = ev.category as unknown;
  const aiCategories = Array.isArray(rawCat)
    ? rawCat.map((c) => String(c).trim()).filter(Boolean)
    : rawCat != null && String(rawCat).trim()
      ? [String(rawCat).trim()]
      : [];
  const matchedSections = mapAllCategories(aiCategories, ev.title);

  const plates = new Set<string>();
  for (const s of matchedSections) {
    plates.add(normalizePlateSection(s));
  }
  plates.add(PRIMARY_724_SECTION);

  const secondary = [...plates].filter((s) => s !== PRIMARY_724_SECTION).sort();
  const ordered: string[] = [PRIMARY_724_SECTION, ...secondary];

  if (secondary.length > 0) {
    console.log(
      `[unified-scrape] "${ev.title.slice(0, 60)}…" → ${PRIMARY_724_SECTION} first, then [${secondary.join(", ")}]`,
    );
  }

  let saved = 0;
  for (const section of ordered) {
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

/** Persist why a full unified run exited early (so /healthz/scrape lastScrapeLog is not stuck on an old row). */
async function logPipelineSkip(runId: string, message: string): Promise<void> {
  await logEntry({
    runId,
    sourceName: "[unified-pipeline]",
    sourceUrl: "",
    status: "skip",
    itemsFound: 0,
    itemsSaved: 0,
    errorMsg: message.slice(0, 900),
  });
}

// ── Daily article budget from DB ───────────────────────────────────────────────
/** Exported for /healthz/scrape diagnostics */
export async function getTodayArticlesProcessed(): Promise<number> {
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
           isDeepSeekBudgetAvailable();
  }
  if (freeOnly) {
    // Groq cron only — DeepSeek is never used here (paid DeepSeek has its own cron).
    return isFreeProviderAvailable();
  }
  return getAvailableProviders().length > 0;
}

// ── Run state ──────────────────────────────────────────────────────────────────
let globalGroqRunning  = false;
let globalDsRunning    = false;

export function isScrapeRunning(): boolean { return globalGroqRunning || globalDsRunning; }
// Alias for routes backward compat
export function isKeywordScrapeRunning(): boolean { return isScrapeRunning(); }

/** True while the Groq (`freeOnly`) unified scrape is in progress. */
export function isGroqScrapeRunning(): boolean { return globalGroqRunning; }
/** True while the DeepSeek (`paidOnly`) unified scrape is in progress. */
export function isDeepSeekScrapeRunning(): boolean { return globalDsRunning; }

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
        await logPipelineSkip(
          runId,
          `daily_cap: saved_in_logs_today=${todayProcessed} max=${SCRAPE_CONFIG.maxDailyArticles}`,
        );
        return { runId, totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: Date.now() - startMs };
      }
    }

    // ── DeepSeek UTC hourly USD cap (optional; unset env = no cap in ai-provider) ──
    if (paidOnly && !isDeepSeekBudgetAvailable()) {
      const why = explainWhyPaidDeepSeekBlocked() ?? "unknown";
      console.warn(`[unified-scrape:ds] DeepSeek run skipped — ${why}`);
      await logPipelineSkip(runId, `deepseek_skip: ${why}`);
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
        const candidates: RssArticleSlice[] = (() => {
          if (source.type === "bybit-api") return [];
          return [];
        })();
        // Placeholder to satisfy TS control-flow; real candidates filled below.
        void candidates;

        let rawArticles: RssArticleSlice[] = [];
        if (source.type === "bybit-api") {
          const items = await fetchBybitAnnouncementsWithRetry(source.url);
          if (!items || items.length === 0) continue;
          rawArticles = items.slice(0, 50);
        } else {
          const feed = await fetchRssWithRetry(source.url);
          if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) continue;
          rawArticles = feed.items.slice(0, 30).map((item: any) => ({
            title: (item.title ?? "").replace(/<[^>]+>/g, "").trim(),
            description: (item.contentSnippet ?? item.summary ?? item.content ?? "").replace(/<[^>]+>/g, "").slice(0, 800).trim(),
            link: item.link ?? item.guid ?? source.url,
            pubDate: item.pubDate ?? item.isoDate,
          }));
        }

        const filtered = rawArticles
          .filter((a) => {
            const pd = a.pubDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < cutoff) return false;
            }
            const text = `${a.title ?? ""} ${a.description ?? ""}`;
            return passesKeywordFilter(text, combinedKws);
          })
          .filter((a) => a.title && a.link && !allSeenLinks.has(a.link));

        const candidates2 = filtered;

        if (candidates2.length === 0) continue;

        const existingUrls = await getExistingUrls(candidates2.map(c => c.link));
        const newArticles = candidates2.filter(c => !existingUrls.has(c.link));

        if (newArticles.length === 0) continue;

        candidates2.forEach(c => allSeenLinks.add(c.link));
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
