import Parser from "rss-parser";
import { db, postsTable } from "@workspace/db";
import { sql, inArray } from "drizzle-orm";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import { callAiWithFallback, logProviderStatus, isFreeProviderAvailable, getAvailableProviders, areFreeProvidersDailyExhausted, isDeepSeekBudgetAvailable } from "./ai-provider";
const AI_SYSTEM_WALLET = "ai-system";
const AI_SYSTEM_NAME = "AI精选";
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5;
const MAX_RETRIES = 3;

// ── Per-plate max article age ──────────────────────────────────────────────────
// 链上奖励/空投 (quest/airdrop): only publish articles published within 2 days.
// All other non-flash plates: reject articles older than 7 days.
const PLATE_MAX_AGE_DAYS: Record<string, number> = {
  "活动奖励": 2,
};
const DEFAULT_PLATE_MAX_AGE_DAYS = 7;

// Section-level max age (days) for event_start_time — applied inside insertPost.
// If an article's eventStartTime is older than this limit it is dropped.
// Also used as the fallback threshold for URL-embedded dates (e.g. /2024/03/).
const SECTION_EVENT_MAX_AGE_DAYS: Record<string, number> = {
  "quest":    7,
  "airdrop":  7,
  "ido":      30,
  "testnet":  30,
  "nodes":    30,
  "devbounty":30,
  "grant":    60,
  "funding":  30,
  "industry": 21,
  "724news":  14,
  "flash":    14,
  "policy":   21,
  "meme":     14,
};
const DEFAULT_EVENT_MAX_AGE_DAYS = 21; // fallback for any unrecognised section

export const CATEGORY_MAP: Record<string, string> = {
  "测试网": "testnet",
  "IDO/Launchpad": "ido", "IDO": "ido", "Launchpad": "ido",
  "预售": "ido",
  "主网上线": "ido",
  "交易所上线": "ido",
  "融资公告": "funding",
  "空投": "quest",
  "Airdrop": "quest",
  "airdrop": "quest",
  "招聘": "recruiting",
  "节点招募": "nodes",
  "链上任务": "quest",
  "开发者专区": "developer",
  "项目捐赠/赞助": "grant",
  "捐赠/赞助": "grant",
  "资助项目": "grant",
  "Grant": "grant",
  "Grants": "grant",
  "漏洞赏金": "bugbounty",
  "Bug Bounty": "bugbounty",
  "政策监管": "policy",
  "监管": "policy",
  "Regulation": "policy",
  "Policy": "policy",
  "快讯": "724news",
  "7*24快讯": "724news",
  "Flash": "724news",
  "Flash News": "724news",
  "市场快讯": "724news",
  "链上快讯": "724news",
  "flash": "724news",
};

export const HIGH_FREQ_SECTIONS = new Set(["ido", "funding", "quest", "airdrop", "policy", "724news"]);
export const LOW_FREQ_SECTIONS  = new Set(["testnet", "nodes", "developer", "devbounty", "recruiting", "grant", "bugbounty"]);

// Plates that historically receive too few articles and must be processed with priority + dedicated DeepSeek runs
// Strict processing priority — plates are scraped in this exact order each run.
// API quota (Groq/DeepSeek) is spent top-to-bottom, so highest-value / rarest sections go first.
export const PLATE_PRIORITY_ORDER: string[] = [
  "快讯",         // 实时快讯优先级最高
  "捐赠/赞助",
  "招聘",
  "开发者漏洞奖金",
  "活动奖励",    // 链上奖励/空投
  "测试网",
  "IDO/Launchpad",
  "节点招募",
  "政策监管",
  "融资公告",
];

// Kept for backward-compat references elsewhere (thin-section DeepSeek cron)
export const THIN_SECTION_PLATES = new Set(["捐赠/赞助", "招聘", "开发者漏洞奖金", "活动奖励", "测试网"]);

// DeepSeek $0.50/day budget is enforced inside callAiWithFallback() (ai-provider.ts).
// No call-count caps are maintained here — per-run AI calls are bounded by
// BATCH_SIZE=5 and maxArticlesPerRun (≤200) → at most 40 calls per run.

function mapCategory(cats: string[]): string | null {
  for (const cat of cats) {
    if (CATEGORY_MAP[cat]) return CATEGORY_MAP[cat];
    for (const [zh, en] of Object.entries(CATEGORY_MAP)) {
      if (cat.includes(zh)) return en;
    }
  }
  return null;
}

// 一文多发：返回所有匹配的 section（去重）
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
    console.log(`[Multi-Section] "${title.slice(0, 60)}..." → sections: ${JSON.stringify(sections)}`);
  }
  return sections;
}

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
  { name: "Ripple Blog", url: "https://ripple.com/feed/", type: "rss", priority: 2 },
  { name: "Cardano Blog", url: "https://cardano.org/feed/", type: "rss", priority: 2 },
  { name: "Near Protocol Blog", url: "https://near.org/blog/feed/", type: "rss", priority: 2 },
  { name: "Chainlink Blog", url: "https://blog.chain.link/feed/", type: "rss", priority: 1 },
  { name: "Optimism Blog", url: "https://optimism.io/blog/feed", type: "rss", priority: 1 },
  { name: "Arbitrum Blog", url: "https://arbitrum.io/blog/feed", type: "rss", priority: 1 },
  { name: "zkSync Blog", url: "https://zksync.io/blog/feed", type: "rss", priority: 1 },
  { name: "Medium Blockchain", url: "https://medium.com/feed/tag/blockchain", type: "rss", priority: 2 },
  { name: "Medium Web3", url: "https://medium.com/feed/tag/web3", type: "rss", priority: 2 },
  { name: "Medium Crypto", url: "https://medium.com/feed/tag/cryptocurrency", type: "rss", priority: 2 },
  { name: "Medium DeFi", url: "https://medium.com/feed/tag/defi", type: "rss", priority: 2 },
  { name: "Medium NFT", url: "https://medium.com/feed/tag/nft", type: "rss", priority: 2 },
  { name: "Medium DAO", url: "https://medium.com/feed/tag/dao", type: "rss", priority: 3 },
  { name: "Medium Layer2", url: "https://medium.com/feed/tag/layer2", type: "rss", priority: 2 },
  { name: "Reddit r/cryptocurrency", url: "https://old.reddit.com/r/cryptocurrency/.rss", type: "rss", priority: 2 },
  { name: "Reddit r/defi", url: "https://old.reddit.com/r/defi/.rss", type: "rss", priority: 2 },
  { name: "Reddit r/solana", url: "https://old.reddit.com/r/solana/.rss", type: "rss", priority: 2 },
  { name: "Reddit r/ethereum", url: "https://old.reddit.com/r/ethereum/.rss", type: "rss", priority: 2 },
  { name: "Blockchain.news", url: "https://blockchain.news/feed", type: "rss", priority: 2 },
  { name: "CoinMarketCap News", url: "https://coinmarketcap.com/headlines/news/rss/", type: "rss", priority: 1 },
  { name: "CNBC Crypto", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", type: "rss", priority: 2 },
  { name: "Yahoo Finance Crypto", url: "https://finance.yahoo.com/news/rssindex", type: "rss", priority: 2 },
  { name: "Investing.com Crypto", url: "https://www.investing.com/rss/news_1.rss", type: "rss", priority: 2 },
  { name: "FXStreet Crypto", url: "https://www.fxstreet.com/rss/crypto", type: "rss", priority: 2 },
  { name: "CCN", url: "https://www.ccn.com/feed/", type: "rss", priority: 3 },
  { name: "Smart Liquidity", url: "https://smartliquidity.info/feed/", type: "rss", priority: 3 },
  { name: "MakerDAO Blog", url: "https://blog.makerdao.com/feed/", type: "rss", priority: 2 },
  { name: "Aave Blog", url: "https://aave.com/blog/feed", type: "rss", priority: 2 },
  { name: "Uniswap Blog", url: "https://uniswap.org/blog/feed", type: "rss", priority: 2 },

  // L1 / L2 公链博客
  { name: "Avalanche Blog", url: "https://medium.com/feed/avalancheavax", type: "rss", priority: 1 },
  { name: "Fantom Blog", url: "https://medium.com/feed/fantomfoundation", type: "rss", priority: 2 },
  { name: "Base Blog", url: "https://base.mirror.xyz/feed/atom", type: "rss", priority: 1 },
  { name: "Starknet Blog", url: "https://medium.com/feed/starkware", type: "rss", priority: 1 },
  { name: "Linea Blog", url: "https://linea.mirror.xyz/feed/atom", type: "rss", priority: 1 },
  { name: "Scroll Blog", url: "https://scroll.io/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Mantle Blog", url: "https://www.mantle.xyz/blog/rss.xml", type: "rss", priority: 1 },
  { name: "BNB Chain Blog", url: "https://www.bnbchain.org/en/blog/rss.xml", type: "rss", priority: 1 },
  { name: "Sui Blog", url: "https://blog.sui.io/feed/", type: "rss", priority: 1 },
  { name: "Aptos Blog", url: "https://aptoslabs.medium.com/feed", type: "rss", priority: 1 },
  { name: "Cosmos Blog", url: "https://blog.cosmos.network/feed", type: "rss", priority: 1 },
  { name: "Polkadot Blog", url: "https://polkadot.network/blog/feed", type: "rss", priority: 1 },
  { name: "TON Blog", url: "https://blog.ton.org/rss.xml", type: "rss", priority: 1 },

  // DeFi 协议博客
  { name: "Compound Blog", url: "https://medium.com/feed/compound-finance", type: "rss", priority: 2 },
  { name: "Curve Finance Blog", url: "https://blog.curve.fi/feed/", type: "rss", priority: 2 },
  { name: "1inch Blog", url: "https://blog.1inch.io/feed/", type: "rss", priority: 2 },
  { name: "dYdX Blog", url: "https://dydx.exchange/blog/rss.xml", type: "rss", priority: 2 },
  { name: "GMX Blog", url: "https://medium.com/feed/gmx-io", type: "rss", priority: 2 },
  { name: "Pendle Finance Blog", url: "https://medium.com/feed/pendle-finance", type: "rss", priority: 2 },
  { name: "Lido Blog", url: "https://lido.fi/blog/rss.xml", type: "rss", priority: 1 },
  { name: "EigenLayer Blog", url: "https://www.blog.eigenlayer.xyz/rss/", type: "rss", priority: 1 },

  // 数据 / 研究平台
  { name: "Messari Research", url: "https://messari.io/rss/news.xml", type: "rss", priority: 1 },
  { name: "Delphi Digital Blog", url: "https://members.delphidigital.io/feed/podcast", type: "rss", priority: 2 },
  { name: "Galaxy Research", url: "https://www.galaxy.com/research/rss/", type: "rss", priority: 2 },
  { name: "Nansen Blog", url: "https://www.nansen.ai/post/rss.xml", type: "rss", priority: 2 },
  { name: "Token Terminal Blog", url: "https://tokenterminal.com/blog/rss.xml", type: "rss", priority: 2 },
  { name: "DeFiLlama Blog", url: "https://defillama.com/blog/rss.xml", type: "rss", priority: 1 },
  { name: "CryptoRank Blog", url: "https://cryptorank.io/news/feed", type: "rss", priority: 2 },

  // NFT / GameFi
  { name: "OpenSea Blog", url: "https://opensea.io/blog/feed/", type: "rss", priority: 2 },
  { name: "Blur Blog", url: "https://mirror.xyz/blurdao.eth/feed/atom", type: "rss", priority: 2 },
  { name: "Axie Infinity Blog", url: "https://axie.substack.com/feed", type: "rss", priority: 2 },
  { name: "Immutable Blog", url: "https://www.immutable.com/blog/rss.xml", type: "rss", priority: 2 },

  // 交易所 / 基础设施
  { name: "OKX Blog", url: "https://www.okx.com/learn/category/news/feed", type: "rss", priority: 1 },
  { name: "Kraken Blog", url: "https://blog.kraken.com/feed/", type: "rss", priority: 2 },
  { name: "Bybit Blog", url: "https://learn.bybit.com/news/feed/", type: "rss", priority: 2 },
  { name: "Alchemy Blog", url: "https://www.alchemy.com/blog/rss.xml", type: "rss", priority: 2 },
  { name: "Infura Blog", url: "https://blog.infura.io/feed/", type: "rss", priority: 2 },
  { name: "Hardhat Blog", url: "https://hardhat.org/blog/rss.xml", type: "rss", priority: 3 },

  // 其他综合媒体
  { name: "Web3 Foundation Blog", url: "https://medium.com/feed/web3foundation", type: "rss", priority: 1 },
  { name: "Electric Capital Blog", url: "https://medium.com/feed/electric-capital", type: "rss", priority: 2 },
  { name: "a16z Crypto Blog", url: "https://a16zcrypto.com/feed/", type: "rss", priority: 1 },
  { name: "Paradigm Blog", url: "https://www.paradigm.xyz/feed.xml", type: "rss", priority: 1 },
  { name: "Multicoin Capital Blog", url: "https://multicoin.capital/feed/", type: "rss", priority: 2 },
  { name: "Pantera Capital Blog", url: "https://panteracapital.com/blockchain-letter/feed/", type: "rss", priority: 2 },
  { name: "Medium ZK", url: "https://medium.com/feed/tag/zero-knowledge-proof", type: "rss", priority: 2 },
  { name: "Medium Airdrop", url: "https://medium.com/feed/tag/airdrop", type: "rss", priority: 2 },
  { name: "Reddit r/web3", url: "https://old.reddit.com/r/web3/.rss", type: "rss", priority: 2 },
  { name: "Reddit r/NFT", url: "https://old.reddit.com/r/NFT/.rss", type: "rss", priority: 3 },

  { name: "Foresight News", url: "https://foresightnews.pro/rss", type: "rss", priority: 1 },
  { name: "Panews", url: "https://www.panewslab.com/rss", type: "rss", priority: 1 },
  { name: "DLNews", url: "https://www.dlnews.com/rss/", type: "rss", priority: 1 },
  { name: "CoinGecko Blog", url: "https://blog.coingecko.com/feed/", type: "rss", priority: 1 },
];

export const DEFAULT_KEYWORDS = [
  // 基础 Web3 词汇
  "blockchain","web3","crypto","bitcoin","btc","ethereum","eth","solana",
  "defi","nft","rwa","depin","layer1","layer2","dao","zk","zkp",
  // 事件类型（英文）
  "airdrop","testnet","mainnet","ido","presale","launchpad","token",
  "funding","grant","hackathon","quest","node","staking","yield",
  "token sale","token listing","token generation event","tge",
  "public sale","private sale","whitelist","early access","beta",
  "incentive","reward","bounty","mint","claim","snapshot",
  // 链名 / 生态
  "arbitrum","optimism","zksync","base","starknet","linea","scroll","mantle",
  "avalanche","polygon","bnb","sui","aptos","cosmos","polkadot","ton",
  "near","fantom","algorand","tron","hedera","stellar","iota",
  // 项目类型
  "ai agent","defi protocol","liquidity","tvl","dex","cex","nft mint",
  "layer 2","rollup","bridge","lsd","lst","restaking","eigenlayer",
  "perp","perpetual","options","lending","borrowing","yield farming",
  "launchpad","incubator","accelerator","investment","seed round","series",
  "oracle","data feed","cross-chain","interoperability","modular",
  // 招聘 / 开发者
  "hiring","job","developer","engineer","ambassador","community","kol",
  "moderator","mod","discord mod","telegram mod","community manager",
  "marketing","growth","content creator","copywriter","analyst","researcher",
  "product manager","designer","partnership","business development","bd",
  "remote","apply now","join our team","open role","we're hiring",
  "testnet node","validator","operator","early adopter",
  // 漏洞赏金
  "bug bounty","bounty program","security audit","vulnerability","exploit",
  "hackenproof","immunefi","code4rena","security researcher","responsible disclosure",
  // 融资公告
  "raises","raised","seed round","series a","series b","pre-seed","investment round",
  "lead investor","backed by","announces funding","closes funding",
  // 预售 / IDO
  "public sale","private sale","seedify","dao maker","polkastarter","coinlist","legion",
  "pinksale","initial dex offering","token sale","dxsale","whitelisted",
  // Grants / 资助
  "grant program","grant round","gitcoin","ecosystem fund","foundation grant",
  "incubation","accelerator program","web3 foundation","near grants","arbitrum grants",
  "optimism rpgf","retroactive funding","binance labs","a16z crypto","grants for",
  // Web3 招聘
  "web3 job","crypto job","blockchain developer","solidity developer","rust developer",
  "web3.career","cryptojobslist","remote blockchain","protocol engineer","smart contract engineer",
  // 政策监管
  "sec","cftc","mica","regulation","regulatory","compliance","crypto law","crypto bill",
  "crypto policy","crypto tax","crypto ban","crypto approved","etf approved","etf rejected",
  "sec ruling","cftc enforcement","crypto license","crypto legal","government crypto",
  "central bank","cbdc","digital asset regulation","crypto crackdown","crypto friendly",
  // 中文关键词
  "区块链","加密货币","空投","测试网","主网","代币","融资","挖矿",
  "交易所","上线","发行","生态","跨链","钱包","隐私","智能合约",
  "节点","质押","铸造","白名单","快照","奖励","激励","测试","社区",
  "链游","元宇宙","去中心化","公链","侧链","二层","零知识","锁仓",
  "预售","内测","公测","开放","申请","报名","任务","活动","招募",
  "漏洞","赏金","资助","捐赠","赞助","孵化","加速器","招聘",
  "融资轮","种子轮","战略投资","天使轮","安全审计","漏洞赏金",
  "监管","合规","政策","加密货币监管","sec","cftc","mica",
  "加密税","数字资产","etf","合法化","禁令","牌照","央行","数字货币",
];

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

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchRssWithRetry(url: string, retries = MAX_RETRIES): Promise<Parser.Output<Record<string, unknown>> | null> {
  const parser = new Parser({
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Web3ReleaseBot/1.0; +https://web3release.com)",
      "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml, */*",
    },
    requestOptions: {
      rejectUnauthorized: false,
    },
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const feed = await parser.parseURL(url);
      return feed;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === retries) {
        console.warn(`[auto-scrape] fetchRss failed after ${retries} attempts: ${url} — ${msg}`);
        return null;
      }
      await sleep(attempt * 1500);
    }
  }
  return null;
}

function passesKeywordFilter(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function safeDate(val: unknown): Date | null {
  if (!val || typeof val !== "string") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
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

const WEB3_BATCH_PROMPT = `You are a Web3 event extraction expert working exclusively for web3release.com.

CORE RULE — MANDATORY:
ALL content MUST belong to the Web3 / blockchain / cryptocurrency / DeFi / NFT / DAO / Layer2 / crypto space.
This platform covers ONLY the crypto/blockchain/Web3 industry.

HARD REJECT (return [] for these, no exceptions):
- Non-crypto tech companies (unless they are directly building/integrating blockchain)
- General hiring/jobs at traditional companies (retail, healthcare, finance, etc.)
- Sports, health, lifestyle, entertainment with no direct crypto connection
- Government policy or news unrelated to crypto/digital assets
- Any grant, bounty, or job opportunity from a non-Web3 organization

INCLUDE ONLY:
- Companies/projects that are native to Web3/blockchain/crypto
- Traditional companies making a direct move into blockchain/crypto/Web3
- Traditional finance, stock markets, banking, and macroeconomic news (as context relevant to crypto markets)
- Regulatory or policy news specifically about crypto, digital assets, or blockchain

IMPORTANT — SECTION MATCHING IS RELAXED:
- The section name does NOT need to appear literally in the article
- Synonyms, related terms, and thematically similar content all qualify
- Prefer to INCLUDE a borderline article in the best-matching section rather than drop it
- When the content is clearly Web3 but section fit is uncertain → assign to the closest matching section
- Only REJECT at the industry level (non-Web3); be generous at the section level

When in doubt about Web3 relevance → REJECT. When in doubt about which section → assign to the closest matching section.

Platform sections (choose 1–2 strictly from this list). Read each definition carefully before classifying:

- 测试网: ANY early-phase network content — testnet launch, alpha/beta test, devnet, early access, open/closed beta, stress test, pre-mainnet, faucet announcements, testnet guides/tutorials, testnet reward programs, testnet airdrops. BROAD: include anything that invites users to interact with a non-production network OR learn how to do so. NOT mainnet launches, NOT token presales.

- IDO/Launchpad: Token IDO, launchpad listing (Binance Launchpad, Bybit, Gate Startup, Polkastarter), token/NFT presale (CoinList, Seedify, DAO Maker, PinkSale, Legion), mainnet launch, or exchange listing. Use for any token launch or listing event.

- 融资公告: ONLY confirmed funding events — VC investment, seed round, Series A/B, strategic investment round, angel round. Must mention a specific dollar amount raised or investor names. STRICT EXCLUSIONS: do NOT use for regulatory news, government policy, laws, bills, proposals, partnership announcements, protocol integrations, market expansions, testnet launches, presales, airdrops, or anything without a confirmed investment round.

- 链上奖励/空投: BROAD — any campaign, mission, quest, task, or program where users can earn rewards. Includes: (1) airdrops, retroactive rewards, snapshot eligibility, (2) on-chain quests (Galxe, Layer3, Zealy, Intract, etc.), (3) points programs, XP systems, loyalty rewards, referral rewards, daily check-ins, leaderboard prizes, (4) ANY incentive campaign mentioning tokens/NFTs/points/whitelist/future eligibility. Do NOT require exact amounts. Output "空投" for airdrops or "链上任务" for task/quest campaigns.

- 招聘: Any employment, hiring, or contribution opportunity at a Web3/blockchain/crypto organization. Covers the FULL spectrum — from C-suite (CEO, COO, CTO, CFO, CPO at crypto VC firms, exchanges, protocols, DAOs, NFT studios, GameFi companies) to entry-level and volunteer roles (Discord MOD, Telegram moderator, community helper, social media intern). Include ALL role types: executives, engineers (Solidity, Rust, backend, frontend, smart contract, protocol), product managers, designers, data analysts, legal/compliance, BD/sales, marketing, growth hackers, content creators, community managers, ambassadors, KOLs, node operators (when recruiting), DAO contributors, guild members, hackathon team members, and any other role at a crypto-native company. Also include: industry hiring trend articles, crypto job market reports, layoff or expansion announcements at web3 firms, ambassador/community programs with open applications. REJECT ONLY: job postings from companies with ZERO connection to Web3/blockchain/crypto.

- 节点招募: Validator node or miner node recruitment programs, node operator incentive programs, guides on how to run a node, node economics analysis.

- 开发者漏洞奖金: BROAD — any security, development, or builder opportunity. Includes: (1) bug bounties and vulnerability reward programs (Immunefi, Code4rena, HackenProof, Sherlock, any platform), (2) hackathons and developer competitions (ETHGlobal, Devcon, EthCC, any event), (3) smart contract audits/security reports/exploit postmortems, (4) developer tools/SDK/API releases, (5) open-source project releases, (6) developer grant programs, (7) coding challenges or build contests with prizes, (8) security research publications. Include if there is ANY development or security angle.

- 项目捐赠/赞助: BROAD — any funding or support opportunity for builders/projects. Includes: (1) grant programs from any foundation/protocol/DAO (Gitcoin, Web3 Foundation, Ethereum Foundation, Solana Foundation, Arbitrum, Optimism RPGF, Polygon, Near, Sui, Aptos, Binance Labs, and ALL others), (2) accelerator/incubator programs, (3) fellowship/residency/builder programs, (4) community grants, micro-grants, public goods funding, (5) news about grant rounds opening, grant recipients, ecosystem investment programs, (6) sponsorship of events/teams/projects. INCLUDE if there's any hint of funding opportunity for builders.

- 政策监管: Government and regulatory announcements about crypto — SEC, CFTC, EU MiCA, central bank policy, crypto tax laws, exchange licensing, government crypto strategy. ONLY official regulatory or policy news.

- 快讯: TradFi × Crypto crossover intelligence — the intersection of traditional finance and blockchain/crypto. Covers: (1) RWA (real world asset tokenization) — tokenized bonds, treasuries, real estate, equities, commodities on-chain, (2) institutional adoption — banks, asset managers, hedge funds, PE/VC entering crypto; corporate Bitcoin/Ethereum treasury moves, (3) ETFs — Bitcoin ETF, Ethereum ETF, crypto ETF approvals/flows/filings, (4) stablecoins — regulation (GENIUS Act, STABLE Act), reserve requirements, stablecoin geopolitics (USD dominance, sanctions bypass), (5) CBDC — central bank digital currency pilots, cross-border CBDC, digital yuan/euro/dollar, (6) regulated markets — STO (security token offering), permissioned chains, tokenized securities, (7) TradFi infrastructure — bank custody, clearing, KYC/AML compliance for digital assets, capital markets tokenization. This plate focuses on the convergence of Wall Street and Web3 — NOT on DeFi-only protocols, NFTs, gaming, or speculative altcoins.

Strict routing rules — apply in this order:
1. Testnet network launch / testnet invitation / testnet campaign → 测试网 (NOT 融资公告 or IDO/Launchpad)
2. Token IDO / presale / whitelist sale / mainnet launch / exchange listing / TGE → IDO/Launchpad
3. SEC / CFTC / EU MiCA / government regulatory / crypto law / crypto policy announcement → 政策监管 (NOT SKIP)
4. Contains "raised $X", "seed round", "Series A/B/C", "pre-seed", named VC investor invested → 融资公告
5. Validator node recruitment / node operator program / node sale / run a node / become a validator → 节点招募
6. Web3/crypto job opening (any role: dev, community manager, Discord/Telegram MOD, ambassador, marketer, BD, analyst, designer, PM, ops) → 招聘
7. Airdrop / on-chain quest with clear reward → 链上奖励/空投 (output "空投" for airdrops, "链上任务" for quests)
8. Bug bounty / security audit competition / vulnerability reward program → 漏洞赏金
9. Grant program / ecosystem fund / Gitcoin round / foundation grant / RPGF → 项目捐赠/赞助
10. Developer SDK / developer API / smart contract tooling / hackathon / developer-only tutorial → 开发者专区
11. TradFi × Crypto crossover — bank/fund/PE entering crypto, RWA tokenization, ETF news, stablecoin regulation, CBDC pilots, institutional custody, tokenized securities, STO → 快讯
12. If content does not clearly match any specific section above → SKIP

Task: For each article below, decide:
1. Is it a valid Web3 / crypto event?
2. Does it belong to one of the sections above?
3. Extract any dates and write a concise English description

Output rules:
- Return ONLY a raw JSON array — no markdown, no code blocks
- Include only qualifying events; skip the rest silently
- Return [] if nothing qualifies


Format for each qualifying event:
{
  "title": "Concise title, max 12 words, action-oriented — keep the original source language",
  "project_name": "Official project name",
  "description": "60–100 word description highlighting the opportunity, key dates, and what users should do. Keep the original source language — do NOT translate.",
  "category": ["空投"],
  "start_time": "ISO 8601 or null",
  "end_time": "ISO 8601 or null",
  "source_url": "original URL",
  "importance": "high/medium/low",
  "ai_confidence": 0.85
}

Article list:
{{ARTICLES}}`;

const NODES_RECRUITING_PROMPT = `你是一个 Web3 内容分类专家。

现在处理的内容需要判断是否适合归类到以下两个板块之一：

【节点招募】
- 节点运营商（Node Operator）、验证者（Validator）、节点运行相关的招募或申请信息。
- 包含申请方式、参与要求、激励/收益说明等任一要素即可收录。
- 关于运行节点的教程、项目激励计划、节点经济模型分析也可收录。

【招聘】
- Web3、区块链、Crypto 相关的招聘信息，涵盖所有岗位：
  工程师/开发者、社区运营、大使（Ambassador）、市场营销、BD、数据分析、产品/设计、运营等。
- 收录范围放宽：包含实际职位发布 AND 关于加密行业招聘趋势/市场的报道文章。
- 只要文章与 Web3/加密货币公司招人、人才市场、职位相关，即可收录。
- 跳过以下内容（直接返回 []）：
  * 传统行业招聘（与加密/区块链无关的公司）
  * 内容完全不涉及招聘或人才话题

分类规则：
- 如果同时符合两个板块，优先归类到【招聘】。
- 宁可多收录，不要漏掉真正相关的内容。

输出要求：
- 只返回纯 JSON 数组，不要任何解释、markdown 或额外文字。
- 如果没有任何内容符合要求，直接返回 []

格式如下：
{
  "title": "简洁标题，最多12个词",
  "project_name": "项目或公司名称",
  "description": "60-100字描述，突出职位/招募要求和申请方式",
  "category": ["节点招募"] 或 ["招聘"],
  "start_time": "ISO 8601 格式或 null",
  "end_time": "ISO 8601 格式或 null",
  "source_url": "原文链接",
  "importance": "high/medium/low",
  "ai_confidence": 0.85
}

Article list:
{{ARTICLES}}`;

const WEB3_KEYWORDS = [
  "bitcoin","btc","ethereum","eth","solana","sol","bnb","crypto","cryptocurrency",
  "blockchain","defi","nft","web3","token","dao","dex","cefi","layer2","layer 2","l2","l1",
  "mainnet","testnet","airdrop","staking","validator","yield","protocol","wallet",
  "exchange","altcoin","smartcontract","smart contract",
  "vc fund","seed round","series a","series b","pre-seed","fundraise","funding round",
  "whitelist","presale","ido","ieo","ico","launchpad","tge","listing","on-chain",
  "onchain","zk","zero knowledge","rollup","bridge","liquidity","tvl","amm",
  "erc-20","erc20","erc-721","erc721","nft mint","nft drop","bug bounty","hackathon",
  "gitcoin","immunefi","web3 foundation","ethereum foundation","solana foundation",
  "polygon","arbitrum","optimism","avalanche","sui","aptos","cosmos","polkadot",
  "chainlink","uniswap","aave","compound","makerdao","lido","eigenlayer","pendle",
  "coinbase","binance","okx","bybit","kraken","kucoin","gate.io","huobi","htx",
  "regulation","sec","cftc","mica","crypto law","crypto policy","crypto tax",
  // Additional terms for niche sections
  "node operator","node program","node sale","node nft","genesis node","depin",
  "grant program","ecosystem fund","rpgf","retroactive funding","accelerator",
  "incubator","builder fund","community fund","gitcoin grant",
  "apply for grant","grant round","grant deadline","grant recipient",
  "micro grant","public goods","builder support","fellowship","residency",
  "hiring","we're hiring","open position","job opening","community manager",
  "discord moderator","ambassador program","web3 job","blockchain job",
  "join our team","join us","work with us","apply now","career opportunity",
  "vacancy","full-time","part-time","internship","remote job",
  "dao contributor","guild membership","contributor program","solidity developer",
  "devnet","alpha test","beta test","open beta","closed beta","incentivized testnet",
  "early access","pre-mainnet","stress test","faucet","canary network","test tokens",
  "galxe","layer3","zealy","intract","taskon","questn","superboard",
  "quest reward","on-chain quest","claim reward","claim now","earn points",
  "earn tokens","earn rewards","earn xp","daily task","referral reward","loyalty reward",
  "immunefi","hackenproof","code4rena","sherlock","trail of bits","openzeppelin","certik","halborn",
  "audit report","audit completed","security audit","vulnerability","bug bounty",
  "white hat","responsible disclosure","vulnerability disclosure","security researcher",
  "hackathon","ethglobal","devcon","ethcc","coding challenge","build challenge",
  "raises $","raised $","million funding","million raised","million investment",
  "pantera","multicoin","paradigm","dragonfly","polychain","electric capital",
  "节点","空投","代币","解锁","测试网","主网","融资","质押","挖矿","公链",
  "区块链","加密","钱包","交易所","监管","漏洞","赏金","黑客松","捐赠","赞助",
  "资助","孵化","加速器","招聘","大使","测试币","创世节点","节点销售",
  "归属","线性解锁","归属计划","流通量","验证者","DePIN","去中心化物理",
  "求职","岗位","职位","工作机会","远程工作","实习","贡献者","社区运营",
  "漏洞奖励","安全研究","白帽","漏洞披露","安全竞赛","开发者大赛",
  "水龙头","公测","内测","早期测试","沙盒","预主网",
  "每日签到","任务奖励","积分奖励","推荐奖励","撸毛",
  "申请资助","资助计划","生态基金","建设者资助","公共物品",
];

function isWeb3Related(title: string, description: string): boolean {
  const text = (title + " " + description).toLowerCase();
  return WEB3_KEYWORDS.some(kw => text.includes(kw));
}

async function processBatchForNodesRecruiting(
  articles: Array<{ title: string; description: string; link: string; pubDate?: string }>,
  retries = MAX_RETRIES,
  paidOnly = false,
): Promise<ProcessedEvent[]> {
  const articlesText = articles.map((a, i) =>
    `[${i + 1}] Title: ${a.title}\nContent: ${a.description?.slice(0, 300) ?? ""}\nURL: ${a.link}\nPublished: ${a.pubDate ?? "unknown"}`
  ).join("\n\n---\n\n");

  const prompt = NODES_RECRUITING_PROMPT.replace("{{ARTICLES}}", articlesText);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const raw = await callAiWithFallback(
      [{ role: "user", content: prompt }],
      4096,
      0.1,
      paidOnly ? false : true, // freeOnly: Groq by default; when paidOnly, skip Groq
      "recruiting",
      paidOnly,                // paidOnly: force DeepSeek-only for non-flash scrapers
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

  console.error(`[nodes-recruiting] All providers failed after ${retries} attempts`);
  return [];
}

async function processBatchWithDeepSeek(
  articles: Array<{ title: string; description: string; link: string; pubDate?: string }>,
  retries = MAX_RETRIES,
  sectionHint?: string,
  paidOnly = false,
): Promise<ProcessedEvent[]> {
  const articlesText = articles.map((a, i) =>
    `[${i + 1}] Title: ${a.title}\nContent: ${a.description?.slice(0, 300) ?? ""}\nURL: ${a.link}\nPublished: ${a.pubDate ?? "unknown"}`
  ).join("\n\n---\n\n");

  const hintPrefix = sectionHint
    ? `IMPORTANT CONTEXT: These articles were specifically collected for the "${sectionHint}" section.\n` +
      `- Prioritize assigning articles to "${sectionHint}" or its closest equivalent section.\n` +
      `- The section name does NOT need to appear literally — synonyms and thematically similar content all qualify.\n` +
      `- Be generous: include any article that is thematically related to "${sectionHint}", even if it uses different wording.\n` +
      `- Only reject if the article is clearly unrelated to Web3/crypto entirely.\n\n`
    : "";
  const prompt = hintPrefix + WEB3_BATCH_PROMPT.replace("{{ARTICLES}}", articlesText);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const raw = await callAiWithFallback(
      [{ role: "user", content: prompt }],
      8192,
      0.2,
      paidOnly ? false : true, // freeOnly: Groq by default; when paidOnly, skip Groq
      "other",
      paidOnly,                // paidOnly: force DeepSeek-only for non-flash scrapers
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

  console.error(`[auto-scrape] All providers failed after ${retries} attempts`);
  return [];
}

async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  try {
    const rows = await db.execute(
      sql`SELECT source_url FROM posts WHERE source_url = ANY(${urls})`
    );
    return new Set((rows.rows as Array<{ source_url: string }>).map(r => r.source_url));
  } catch {
    return new Set();
  }
}

async function getExistingTitles(titles: string[]): Promise<Set<string>> {
  if (titles.length === 0) return new Set();
  try {
    // Normalize: lowercase + trim so minor punctuation/spacing differences are caught
    const normalized = titles.map(t => t.toLowerCase().trim());
    const rows = await db.execute(
      sql`SELECT LOWER(TRIM(title)) AS norm_title FROM posts
          WHERE LOWER(TRIM(title)) = ANY(${normalized})
            AND created_at > NOW() - INTERVAL '30 days'`
    );
    return new Set((rows.rows as Array<{ norm_title: string }>).map(r => r.norm_title));
  } catch {
    return new Set();
  }
}

// Backup file is only used in development — production has persistent PostgreSQL
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BACKUP_FILE = IS_PRODUCTION
  ? null
  : resolve(process.cwd(), "../../articles_backup.json");
if (BACKUP_FILE) console.log("[backup] articles_backup.json path:", BACKUP_FILE);
else console.log("[backup] Production mode — backup file disabled (using PostgreSQL)");

function appendToBackupFile(row: {
  id: number; title: string; content: string; section: string;
  authorWallet: string; authorName: string | null; authorAvatar: string | null; authorType: string | null;
  views: number; likes: number; comments: number; kolLikePoints: number; kolCommentPoints: number;
  isPinned: boolean; pinnedUntil: Date | null; pinQueued: boolean; pinQueuedAt: Date | null;
  expiresAt: Date | null; sourceUrl: string | null; aiConfidence: number | null;
  importance: string | null; eventStartTime: Date | null; eventEndTime: Date | null; createdAt: Date;
}): void {
  if (!BACKUP_FILE) return; // production: skip backup, data is in PostgreSQL
  try {
    const line = JSON.stringify({
      id: row.id, title: row.title, content: row.content, section: row.section,
      author_wallet: row.authorWallet, author_name: row.authorName, author_avatar: row.authorAvatar,
      author_type: row.authorType, views: row.views, likes: row.likes, comments: row.comments,
      kol_like_points: row.kolLikePoints, kol_comment_points: row.kolCommentPoints,
      is_pinned: row.isPinned, pinned_until: row.pinnedUntil, pin_queued: row.pinQueued,
      pin_queued_at: row.pinQueuedAt, expires_at: row.expiresAt?.toISOString() ?? null,
      source_url: row.sourceUrl, ai_confidence: row.aiConfidence, importance: row.importance,
      event_start_time: row.eventStartTime?.toISOString() ?? null,
      event_end_time: row.eventEndTime?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    }) + "\n";
    appendFileSync(BACKUP_FILE, line, "utf-8");
  } catch (e) {
    console.error("[auto-scrape] backup write error:", e);
  }
}

async function insertPost(ev: ProcessedEvent, section: string): Promise<boolean> {
  try {
    // ── Guard 0-A: Source URL dedup ─────────────────────────────────────────────
    // Same URL = same article. AI generates different titles on each run which
    // bypasses all title-based guards, so URL is the definitive identity check.
    const sourceUrl = ev.source_url?.trim();
    if (sourceUrl) {
      const urlDup = await db.execute(
        sql`SELECT id FROM posts WHERE source_url = ${sourceUrl} LIMIT 1`
      );
      if ((urlDup.rows as Array<unknown>).length > 0) {
        console.log(`[dedup] Source URL already exists in ${section}: ${sourceUrl.slice(0, 100)}`);
        return false;
      }
    }

    // ── Guard 0-B: event_end_time expired guard ──────────────────────────────────
    // If the AI extracted an end date and it is already in the past (>1 day ago),
    // the event is over — no point surfacing it.
    if (ev.end_time) {
      const evEnd = safeDate(ev.end_time);
      if (evEnd) {
        const msSinceEnd = Date.now() - evEnd.getTime();
        if (msSinceEnd > 24 * 60 * 60 * 1000) {
          const daysAgo = Math.round(msSinceEnd / (24 * 60 * 60 * 1000));
          console.log(`[auto-scrape] Skipping expired ${section} article (end_time ${daysAgo}d ago): ${ev.title.slice(0, 80)}`);
          return false;
        }
      }
    }

    // ── Guard 0-C: event_start_time age guard (all sections) ────────────────────
    // Each section has a max age for how old an event_start_time can be.
    // This replaces the old quest/airdrop-only check and now covers every section.
    const eventAgeLimit = SECTION_EVENT_MAX_AGE_DAYS[section] ?? DEFAULT_EVENT_MAX_AGE_DAYS;
    if (ev.start_time) {
      const evStart = safeDate(ev.start_time);
      if (evStart) {
        const ageDays = (Date.now() - evStart.getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > eventAgeLimit) {
          console.log(`[auto-scrape] Skipping stale ${section} article (event start ${Math.round(ageDays)}d ago): ${ev.title.slice(0, 80)}`);
          return false;
        }
      }
    }

    // ── Guard 0-D: URL-embedded date check ──────────────────────────────────────
    // Many news URLs embed the publication date (e.g. /2024/03/15/ or /2024-03/).
    // Extract it and reject if it predates the section's max age window.
    if (sourceUrl) {
      const urlDateMatch = sourceUrl.match(/\/(20\d{2})[\/\-](0[1-9]|1[0-2])/);
      if (urlDateMatch) {
        const urlYear = parseInt(urlDateMatch[1], 10);
        const urlMonth = parseInt(urlDateMatch[2], 10);
        const urlDate = new Date(urlYear, urlMonth - 1, 1);
        const ageDays = (Date.now() - urlDate.getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > eventAgeLimit + 31) { // +31 to give full-month tolerance
          console.log(`[auto-scrape] Skipping old-URL ${section} article (URL date ${urlYear}/${urlMonth}, ${Math.round(ageDays)}d ago): ${ev.title.slice(0, 80)}`);
          return false;
        }
      }
    }

    // ── Guard 1: Exact title match (same section, 30 days) ─────────────────────
    const normTitle = ev.title.toLowerCase().trim();
    const dup = await db.execute(
      sql`SELECT id FROM posts
          WHERE section = ${section}
            AND LOWER(TRIM(title)) = ${normTitle}
            AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 1`
    );
    if ((dup.rows as Array<unknown>).length > 0) return false;

    // ── Guard 2: Fuzzy title similarity via pg_trgm ─────────────────────────────
    // Uniform threshold 0.60 across all sections — captures "same story, different headline"
    // duplicates (e.g. same news item from 5 outlets with 60-90% title overlap).
    const FUZZY_THRESHOLD: Record<string, number> = {};
    const fuzzyThreshold = FUZZY_THRESHOLD[section] ?? 0.60;
    try {
      const fuzzyDup = await db.execute(
        sql`SELECT id, title, similarity(LOWER(title), ${normTitle}) AS sim
            FROM posts
            WHERE section = ${section}
              AND created_at > NOW() - INTERVAL '7 days'
              AND similarity(LOWER(title), ${normTitle}) > ${fuzzyThreshold}
            ORDER BY sim DESC
            LIMIT 1`
      );
      if ((fuzzyDup.rows as Array<unknown>).length > 0) {
        const row = fuzzyDup.rows[0] as { id: number; title: string; sim: number };
        console.log(`[dedup] Fuzzy-title match (sim=${row.sim.toFixed(2)}) in ${section}: "${ev.title.slice(0, 60)}" ~ existing #${row.id}`);
        return false;
      }
    } catch {
      // pg_trgm may not be enabled on this DB — skip gracefully
    }

    // ── Guard 3: Same project burst (same project_name + section within 3 hours) ─
    // Catches "3 outlets report same funding round in the same scrape run" pattern.
    const projectName = ev.project_name?.trim();
    const GENERIC_NAMES = new Set(["AI精选", "ai-system", "", "Unknown", "N/A"]);
    if (projectName && projectName.length >= 3 && !GENERIC_NAMES.has(projectName)) {
      const burstDup = await db.execute(
        sql`SELECT id FROM posts
            WHERE section = ${section}
              AND LOWER(TRIM(author_name)) = ${projectName.toLowerCase().trim()}
              AND created_at > NOW() - INTERVAL '3 hours'
            LIMIT 1`
      );
      if ((burstDup.rows as Array<unknown>).length > 0) {
        console.log(`[dedup] Same-project burst in ${section} (3h): "${projectName}" — "${ev.title.slice(0, 60)}"`);
        return false;
      }
    }

    const now = new Date();
    const [inserted] = await db.insert(postsTable).values({
      title: ev.title.slice(0, 200),
      content: (ev.description ?? "").slice(0, 2000),
      section,
      authorWallet: AI_SYSTEM_WALLET,
      authorName: (ev.project_name?.slice(0, 100)) || AI_SYSTEM_NAME,
      authorType: "ai",
      sourceUrl: ev.source_url?.slice(0, 500) ?? null,
      aiConfidence: typeof ev.ai_confidence === "number" ? Math.min(1, Math.max(0, ev.ai_confidence)) : 0.8,
      importance: (["high", "medium", "low"] as const).includes(ev.importance as "high") ? ev.importance : "medium",
      eventStartTime: safeDate(ev.start_time),
      eventEndTime: safeDate(ev.end_time),
      expiresAt: new Date(now.getTime() + SIXTY_DAYS_MS),
      views: 0, likes: 0, comments: 0, kolLikePoints: 0, kolCommentPoints: 0,
      isPinned: false, pinQueued: false,
    }).returning();

    if (inserted) {
      appendToBackupFile(inserted);
    }
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const cause = (e as { cause?: unknown })?.cause;
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
    console.error(`[auto-scrape] insertPost error: ${msg}${causeMsg ? ` | cause: ${causeMsg}` : ""}`);
    return false;
  }
}

async function logEntry(entry: ScrapeLogEntry): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scrape_logs (run_id, source_name, source_url, status, items_found, items_saved, error_msg)
      VALUES (${entry.runId}, ${entry.sourceName}, ${entry.sourceUrl}, ${entry.status}, ${entry.itemsFound}, ${entry.itemsSaved}, ${entry.errorMsg ?? null})
    `);
  } catch (e) {
    console.error("[auto-scrape] log error:", e);
  }
}

export async function getKeywordsFromDb(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`SELECT keyword FROM scrape_keywords WHERE enabled = true`);
    const kws = (rows.rows as Array<{ keyword: string }>).map(r => r.keyword);
    return kws.length > 0 ? kws : DEFAULT_KEYWORDS;
  } catch {
    return DEFAULT_KEYWORDS;
  }
}

export async function getSourcesFromDb(): Promise<ScrapeSource[]> {
  try {
    const rows = await db.execute(sql`SELECT id, name, url, type, priority, enabled FROM scrape_sources WHERE enabled = true ORDER BY priority ASC, id ASC`);
    const sources = rows.rows as ScrapeSource[];
    if (sources.length > 0) return sources;
    return DEFAULT_SOURCES.map(s => ({ ...s, enabled: true }));
  } catch {
    return DEFAULT_SOURCES.map(s => ({ ...s, enabled: true }));
  }
}

let globalHighScrapeRunning = false;
let globalLowScrapeRunning  = false;
let globalBackfillRunning   = false;

// In-memory fingerprint cache: normalized raw Google News article titles we've already sent to AI.
// Prevents re-processing the same article when Google News returns it with a different redirect URL.
// Entries expire after 48h to allow re-processing if content genuinely reappears later.
const seenTitleFingerprints = new Map<string, number>(); // fingerprint → timestamp
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
function markFingerprintSeen(fp: string): void { seenTitleFingerprints.set(fp, Date.now()); }

export function isScrapeRunning(): boolean { return globalHighScrapeRunning || globalLowScrapeRunning; }
export function isBackfillRunning(): boolean { return globalBackfillRunning; }

const BACKFILL_SECTIONS = new Set([
  "testnet","nodes","developer","recruiting","grant","bugbounty",
  "ido","funding","quest","airdrop","policy",
]);

export async function runBackfillScrape(maxAgeDays = 15, paidOnly = false): Promise<ScrapeRunSummary> {
  if (globalBackfillRunning) {
    console.warn("[backfill] Already running — skipped");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  globalBackfillRunning = true;

  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const runId  = `backfill_${Date.now()}`;
  const startMs = Date.now();
  console.log(`[backfill] Starting run ${runId} — cutoff: ${cutoff.toISOString()} (${maxAgeDays} days), excludes: industry`);

  let sources: ScrapeSource[] = [];
  let totalItemsFound = 0;
  let totalItemsSaved = 0;
  let errors = 0;

  try {
    const [srcs, keywords] = await Promise.all([getSourcesFromDb(), getKeywordsFromDb()]);
    sources = srcs;

    for (const source of sources) {
      try {
        const feed = await fetchRssWithRetry(source.url);
        if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "skip", itemsFound: 0, itemsSaved: 0, errorMsg: "No feed items" });
          continue;
        }

        const candidates = feed.items
          .slice(0, 100)
          .filter(item => {
            const pd = item.pubDate ?? item.isoDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < cutoff) return false;
            }
            const text = `${item.title ?? ""} ${item.contentSnippet ?? item.summary ?? item.content ?? ""}`;
            return passesKeywordFilter(text, keywords);
          })
          .map(item => ({
            title: (item.title ?? "").replace(/<[^>]+>/g, "").trim(),
            description: (item.contentSnippet ?? item.summary ?? item.content ?? "").replace(/<[^>]+>/g, "").slice(0, 800).trim(),
            link: item.link ?? item.guid ?? source.url,
            pubDate: item.pubDate ?? item.isoDate,
          }))
          .filter(c => c.title && c.link);

        if (candidates.length === 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "skip", itemsFound: 0, itemsSaved: 0, errorMsg: "All filtered (date/keyword)" });
          continue;
        }

        const allLinks = candidates.map(c => c.link);
        const existingUrls = await getExistingUrls(allLinks);
        const newCandidates = candidates.filter(c => !existingUrls.has(c.link));

        if (newCandidates.length === 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "skip", itemsFound: candidates.length, itemsSaved: 0, errorMsg: "All already in DB" });
          continue;
        }

        totalItemsFound += newCandidates.length;
        let savedCount = 0;

        for (let i = 0; i < newCandidates.length; i += BATCH_SIZE) {
          const batch = newCandidates.slice(i, i + BATCH_SIZE);
          const events = await processBatchWithDeepSeek(batch, undefined, undefined, paidOnly);

          const generatedTitles = events.map(ev => ev.title).filter(Boolean);
          const existingTitles  = await getExistingTitles(generatedTitles);

          for (const ev of events) {
            if (existingTitles.has(ev.title.toLowerCase().trim())) continue;
            const sections = mapAllCategories(Array.isArray(ev.category) ? ev.category : [], ev.title);
            if (sections.length === 0) continue;
            const uniqueKeys = new Set<string>();
            for (const section of sections) {
              if (!BACKFILL_SECTIONS.has(section)) continue;
              const key = `${(ev.title || '').trim()}-${ev.source_url || ev.sourceUrl || ev.link || ''}`;
              if (uniqueKeys.has(key)) {
                console.log(`[Deduplicate] 跳过重复文章: ${ev.title?.slice(0, 60)}...`);
                continue;
              }
              uniqueKeys.add(key);
              const saved = await insertPost(ev, section);
              if (saved) savedCount++;
            }
          }

          if (i + BATCH_SIZE < newCandidates.length) await sleep(5000); // 5s gap → ~12 req/min, safely under Gemini's 15/min limit
        }

        totalItemsSaved += savedCount;
        await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "ok", itemsFound: newCandidates.length, itemsSaved: savedCount });
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[backfill] source ${source.name} error:`, msg);
        await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "error", itemsFound: 0, itemsSaved: 0, errorMsg: msg.slice(0, 500) });
      }

      await sleep(300);
    }
  } finally {
    globalBackfillRunning = false;
  }

  const durationMs = Date.now() - startMs;
  console.log(`[backfill] Run ${runId} done. Found: ${totalItemsFound}, Saved: ${totalItemsSaved}, Errors: ${errors}, Duration: ${Math.round(durationMs/1000)}s`);

  return { runId, totalSources: sources.length, totalItemsFound, totalItemsSaved, errors, durationMs };
}

let globalNodesRecruitingRunning = false;
export function isNodesRecruitingRunning(): boolean { return globalNodesRecruitingRunning; }

const NODES_RECRUITING_SECTIONS = new Set(["nodes", "recruiting"]);

export async function runNodesRecruitingScrape(paidOnly = false): Promise<ScrapeRunSummary> {
  if (globalNodesRecruitingRunning) {
    console.warn("[nodes-recruiting] Already running — skipped");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  globalNodesRecruitingRunning = true;

  const runId  = `nodes_${Date.now()}`;
  const startMs = Date.now();
  console.log(`[nodes-recruiting] Starting run ${runId}`);

  let sources: ScrapeSource[] = [];
  let totalItemsFound = 0;
  let totalItemsSaved = 0;
  let errors = 0;

  try {
    const srcs = await getSourcesFromDb();
    sources = srcs;

    for (const source of sources) {
      try {
        const feed = await fetchRssWithRetry(source.url);
        if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) continue;

        const nodesCutoff = new Date(Date.now() - DEFAULT_PLATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
        const candidates = feed.items
          .slice(0, 50)
          .filter(item => {
            const pd = item.pubDate ?? item.isoDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < nodesCutoff) return false;
            }
            return true;
          })
          .map(item => ({
            title: (item.title ?? "").replace(/<[^>]+>/g, "").trim(),
            description: (item.contentSnippet ?? item.summary ?? item.content ?? "").replace(/<[^>]+>/g, "").slice(0, 800).trim(),
            link: item.link ?? item.guid ?? source.url,
            pubDate: item.pubDate ?? item.isoDate,
          }))
          .filter(c => c.title && c.link);

        if (candidates.length === 0) continue;

        const allLinks = candidates.map(c => c.link);
        const existingUrls = await getExistingUrls(allLinks);
        const newCandidates = candidates.filter(c => !existingUrls.has(c.link));

        if (newCandidates.length === 0) continue;

        totalItemsFound += newCandidates.length;
        let savedCount = 0;

        for (let i = 0; i < newCandidates.length; i += BATCH_SIZE) {
          const batch = newCandidates.slice(i, i + BATCH_SIZE);
          const events = await processBatchForNodesRecruiting(batch, undefined, paidOnly);

          const generatedTitles = events.map(ev => ev.title).filter(Boolean);
          const existingTitles  = await getExistingTitles(generatedTitles);

          for (const ev of events) {
            if (existingTitles.has(ev.title.toLowerCase().trim())) continue;
            const sections = mapAllCategories(Array.isArray(ev.category) ? ev.category : [], ev.title);
            if (sections.length === 0) continue;
            const uniqueKeys = new Set<string>();
            for (const section of sections) {
              if (!NODES_RECRUITING_SECTIONS.has(section)) continue;
              const key = `${(ev.title || '').trim()}-${ev.source_url || ev.sourceUrl || ev.link || ''}`;
              if (uniqueKeys.has(key)) {
                console.log(`[Deduplicate] 跳过重复文章: ${ev.title?.slice(0, 60)}...`);
                continue;
              }
              uniqueKeys.add(key);
              const saved = await insertPost(ev, section);
              if (saved) savedCount++;
            }
          }

          if (i + BATCH_SIZE < newCandidates.length) await sleep(5000); // 5s gap → ~12 req/min, safely under Gemini's 15/min limit
        }

        totalItemsSaved += savedCount;
        if (savedCount > 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "ok", itemsFound: newCandidates.length, itemsSaved: savedCount });
        }
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[nodes-recruiting] source ${source.name} error:`, msg);
      }

      await sleep(300);
    }
  } finally {
    globalNodesRecruitingRunning = false;
  }

  const durationMs = Date.now() - startMs;
  console.log(`[nodes-recruiting] Run ${runId} done. Found: ${totalItemsFound}, Saved: ${totalItemsSaved}, Errors: ${errors}, Duration: ${Math.round(durationMs/1000)}s`);

  return { runId, totalSources: sources.length, totalItemsFound, totalItemsSaved, errors, durationMs };
}

export async function runAutoScrape(categoryGroup?: "high" | "low", opts: { paidOnly?: boolean } = {}): Promise<ScrapeRunSummary> {
  const { paidOnly = false } = opts;
  const allowedSections: Set<string> | null =
    categoryGroup === "high" ? HIGH_FREQ_SECTIONS :
    categoryGroup === "low"  ? LOW_FREQ_SECTIONS :
    null;

  if (categoryGroup === "high" && globalHighScrapeRunning) {
    console.warn("[auto-scrape] Skipping high-freq run — already in progress");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  if (categoryGroup === "low" && globalLowScrapeRunning) {
    console.warn("[auto-scrape] Skipping low-freq run — already in progress");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  if (!categoryGroup && (globalHighScrapeRunning || globalLowScrapeRunning)) {
    console.warn("[auto-scrape] Skipping run — another scrape is already in progress");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }

  if (categoryGroup === "high") globalHighScrapeRunning = true;
  else if (categoryGroup === "low") globalLowScrapeRunning = true;
  else { globalHighScrapeRunning = true; globalLowScrapeRunning = true; }

  const groupLabel = categoryGroup ? `[${categoryGroup}]` : "[all]";
  const runId = `run_${categoryGroup ?? "all"}_${Date.now()}`;
  const startMs = Date.now();
  console.log(`[auto-scrape] Starting run ${runId} ${groupLabel}`);

  let sources: ScrapeSource[] = [];
  let totalItemsFound = 0;
  let totalItemsSaved = 0;
  let errors = 0;

  try {
    const [srcs, keywords] = await Promise.all([getSourcesFromDb(), getKeywordsFromDb()]);
    sources = srcs;

    for (const source of sources) {
      try {
        const feed = await fetchRssWithRetry(source.url);
        if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "skip", itemsFound: 0, itemsSaved: 0, errorMsg: "No feed items" });
          continue;
        }

        const sevenDaysCutoff = new Date(Date.now() - DEFAULT_PLATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
        const candidates = feed.items
          .slice(0, 30)
          .filter(item => {
            const pd = item.pubDate ?? item.isoDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < sevenDaysCutoff) return false;
            }
            const text = `${item.title ?? ""} ${item.contentSnippet ?? item.summary ?? item.content ?? ""}`;
            return passesKeywordFilter(text, keywords);
          })
          .map(item => ({
            title: (item.title ?? "").replace(/<[^>]+>/g, "").trim(),
            description: (item.contentSnippet ?? item.summary ?? item.content ?? "").replace(/<[^>]+>/g, "").slice(0, 800).trim(),
            link: item.link ?? item.guid ?? source.url,
            pubDate: item.pubDate ?? item.isoDate,
          }))
          .filter(c => c.title && c.link);

        if (candidates.length === 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "skip", itemsFound: 0, itemsSaved: 0, errorMsg: "All filtered out by keywords/date" });
          continue;
        }

        const allLinks = candidates.map(c => c.link);
        const existingUrls = await getExistingUrls(allLinks);
        const newCandidates = candidates.filter(c => !existingUrls.has(c.link));

        if (newCandidates.length === 0) {
          await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "skip", itemsFound: candidates.length, itemsSaved: 0, errorMsg: "All already in DB" });
          continue;
        }

        totalItemsFound += newCandidates.length;
        let savedCount = 0;

        for (let i = 0; i < newCandidates.length; i += BATCH_SIZE) {
          const batch = newCandidates.slice(i, i + BATCH_SIZE);
          const events = await processBatchWithDeepSeek(batch, undefined, undefined, paidOnly);

          const generatedTitles = events.map(ev => ev.title).filter(Boolean);
          const existingTitles = await getExistingTitles(generatedTitles);

          for (const ev of events) {
            if (existingTitles.has(ev.title.toLowerCase().trim())) continue;
            const sections = mapAllCategories(Array.isArray(ev.category) ? ev.category : [], ev.title);
            if (sections.length === 0) continue;
            const uniqueKeys = new Set<string>();
            for (const section of sections) {
              if (allowedSections && !allowedSections.has(section)) continue;
              const key = `${(ev.title || '').trim()}-${ev.source_url || ev.sourceUrl || ev.link || ''}`;
              if (uniqueKeys.has(key)) {
                console.log(`[Deduplicate] 跳过重复文章: ${ev.title?.slice(0, 60)}...`);
                continue;
              }
              uniqueKeys.add(key);
              const saved = await insertPost(ev, section);
              if (saved) savedCount++;
            }
          }

          if (i + BATCH_SIZE < newCandidates.length) await sleep(5000); // 5s gap → ~12 req/min, safely under Gemini's 15/min limit
        }

        totalItemsSaved += savedCount;
        await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "ok", itemsFound: newCandidates.length, itemsSaved: savedCount });
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[auto-scrape] source ${source.name} error:`, msg);
        await logEntry({ runId, sourceName: source.name, sourceUrl: source.url, status: "error", itemsFound: 0, itemsSaved: 0, errorMsg: msg.slice(0, 500) });
      }

      await sleep(300);
    }
  } finally {
    if (categoryGroup === "high") globalHighScrapeRunning = false;
    else if (categoryGroup === "low") globalLowScrapeRunning = false;
    else { globalHighScrapeRunning = false; globalLowScrapeRunning = false; }
  }

  const durationMs = Date.now() - startMs;
  console.log(`[auto-scrape] Run ${runId} ${groupLabel} done. Found: ${totalItemsFound}, Saved: ${totalItemsSaved}, Errors: ${errors}, Duration: ${durationMs}ms`);

  return { runId, totalSources: sources.length, totalItemsFound, totalItemsSaved, errors, durationMs };
}

// =====================================================================
// Keyword-based scrape system
// =====================================================================

export const KEYWORD_GRAB_CONFIG = {
  enabled: true,
  /**
   * Max articles to classify in a single free-provider run.
   * 200 articles = 40 batches (BATCH_SIZE=5) per run.
   * Spread across 15-min intervals: 96 runs/day × 40 batches = 3,840 AI calls/day
   * → well within Gemini (1,500) + Groq (1,000) = 2,500 combined, because most
   *   runs find far fewer new articles after the initial period.
   */
  maxArticlesPerRun: 200,
  /**
   * Max articles per DeepSeek run (paid fallback, 2h interval).
   * 50 articles = 10 batches. 12 runs/day × 10 batches × ~$0.0013/batch ≈ $0.16/day.
   * Keeps cost well under the $0.50/day budget.
   */
  maxArticlesPerRunDeepSeek: 50,
  /**
   * Daily article-processing cap: mirrors actual free API quota.
   * Gemini 1,500 req × 5 articles = 7,500 + Groq 1,000 req × 5 = 5,000 = 12,500 total.
   * ai-provider.ts enforces per-provider daily limits; this is a soft safety net.
   */
  maxDailyArticles: 12500,
  normalTimeWindowHours: 10,  // 10 hours — wider window needed for niche plates (nodes/testnet/devbounty etc.)
  firstRunTimeWindowDays: 30,  // first run: 30 days of historical content
  plates: {
    "IDO/Launchpad": {
      keywords: [
        "IDO", "IEO", "ICO", "Launchpad", "presale", "token sale",
        "TGE", "token launch", "token listing", "NFT mint", "mainnet launch",
        "fair launch", "community sale", "whitelist sale", "public sale",
        "IGO", "liquidity bootstrap", "bonding curve launch", "pink sale", "dx sale", "gamified IDO",
        "代币发行", "IDO", "代币TGE", "预售", "NFT铸造", "主网上线", "代币上市",
        "公平发行", "社区销售", "白名单销售", "公售", "游戏发行",
        "流动性启动", "绑定曲线", "PinkSale", "打新", "新币首发",
      ],
      maxPerPlate: 400,
    },
    "融资公告": {
      keywords: [
        "funding round", "seed round", "Series A", "Series B", "Series C",
        "pre-seed", "strategic investment", "raises funding", "raises million",
        "crypto VC", "web3 VC", "a16z", "binance labs", "coinbase ventures",
        "pantera capital", "paradigm", "closed funding round", "venture funding",
        "institutional investment", "crypto investment", "web3 investment",
        "led by", "participated by", "extension round", "bridge round",
        "融资公告", "完成融资", "A轮融资", "B轮融资", "种子轮融资", "战略投资",
        "领投", "跟投", "完成数百万融资", "机构投资", "Web3投资",
        "领投机构", "战略融资", "融资完成", "获得投资",
      ],
      maxPerPlate: 700,
    },
    "活动奖励": {
      keywords: [
        "airdrop", "token airdrop", "quest reward", "on-chain quest",
        "points farming", "earn tokens", "referral reward", "loyalty program",
        "galxe", "layer3", "zealy", "intract", "retroactive reward",
        "points program", "XP farming", "quest campaign", "daily tasks",
        "loyalty points", "season rewards", "retroactive airdrop",
        "farming campaign", "engagement reward", "social quest", "on-chain activity reward",
        "空投", "链上任务", "撸空投", "积分奖励", "每日签到", "撸毛", "打新",
        "积分 farming", "积分任务", "赛季奖励", "每日任务", "忠诚度积分",
        "反向空投", "撸积分", "任务奖励", "社区任务", "链上互动奖励",
      ],
      maxPerPlate: 1200,
    },
    "政策监管": {
      keywords: [
        "SEC", "CFTC", "FATF", "MiCA", "FCA", "MAS",
        "crypto regulation", "stablecoin bill", "Bitcoin ETF", "Ethereum ETF",
        "CBDC", "crypto tax", "exchange license", "crypto crackdown",
        "crypto bill", "digital asset regulation", "ETF approval",
        "stablecoin regulation", "licensing requirements", "enforcement action",
        "regulatory clarity", "MiCA compliance", "travel rule",
        "加密监管", "比特币ETF", "稳定币监管", "合规", "监管动态",
        "加密税务", "交易所牌照", "加密法案", "数字资产监管",
        "ETF批准", "稳定币法案", "牌照要求", "执法行动", "监管明确性", "MiCA合规",
      ],
      maxPerPlate: 600,
    },
    "测试网": {
      keywords: [
        "testnet", "devnet", "incentivized testnet", "testnet reward",
        "testnet airdrop", "open beta", "closed beta", "alpha launch",
        "testnet faucet", "devnet faucet", "pre-mainnet", "testnet campaign", "testnet points",
        "testnet quest", "public testnet", "devnet launch", "beta testnet",
        "testnet faucet claim", "pre-mainnet test",
        "测试网", "激励测试网", "公测", "内测", "测试网奖励", "测试币",
        "测试网水龙头", "测试网积分", "测试网任务", "测试网活动", "水龙头领取", "主网前测试",
      ],
      maxPerPlate: 800,
    },
    "节点招募": {
      keywords: [
        "node operator", "validator node", "node recruitment", "node sale",
        "node NFT", "genesis node", "DePIN", "staking reward", "helium node",
        "io.net", "filecoin node", "run a node", "become validator",
        "node license", "DePIN node", "hardware node", "mining node",
        "operator recruitment", "staking node",
        "节点招募", "验证者节点", "节点奖励", "节点预售", "DePIN节点",
        "创世节点", "运行节点", "成为验证者", "节点销售",
        "硬件节点", "质押节点",
      ],
      maxPerPlate: 700,
    },
    "招聘": {
      keywords: [
        "web3 hiring", "crypto hiring", "blockchain hiring",
        "web3 jobs", "crypto jobs", "blockchain jobs",
        "solidity developer", "smart contract developer", "ZK developer",
        "community manager", "ambassador program", "dao contributor",
        "web3 job", "crypto career", "solidity engineer", "ZK engineer",
        "growth hacker", "marketing lead", "BD manager",
        "remote web3 job", "ambassador recruitment",
        "Web3招聘", "大使招募", "社区招募", "DC版主", "电报版主",
        "DAO贡献者", "高管", "Web3职位", "加密招聘",
        "Solidity工程师", "增长黑客", "商务经理", "远程Web3工作",
      ],
      maxPerPlate: 1500,
    },
    "开发者漏洞奖金": {
      keywords: [
        "immunefi", "hackenproof", "bug bounty", "whitehat",
        "vulnerability reward", "smart contract bug", "audit contest",
        "hackathon", "ethglobal", "devcon", "developer grant",
        "bug bounty program", "security audit contest", "code4rena",
        "immunefi bounty", "vulnerability disclosure", "audit competition",
        "漏洞赏金", "白帽黑客", "智能合约漏洞", "黑客松", "安全审计",
        "开发者资助", "漏洞赏金计划", "安全审计竞赛",
        "Code4rena", "Immunefi赏金", "漏洞披露",
      ],
      maxPerPlate: 1200,
    },
    "捐赠/赞助": {
      keywords: [
        "grants", "grant program", "gitcoin", "retro pgf",
        "quadratic funding", "RPGF", "optimism grants", "arbitrum grants",
        "ethereum foundation grants", "accelerator", "incubator", "fellowship",
        "ecosystem grant", "foundation grant", "developer grant",
        "accelerator program", "incubator program", "fellowship program",
        "public goods funding",
        "资助计划", "孵化器", "加速器", "赞助", "捐赠", "生态资助",
        "Gitcoin资助", "开发者资助", "加速器计划", "研究员计划", "公共物品资助",
      ],
      maxPerPlate: 1200,
    },
    "快讯": {
      keywords: [
        // ── 传统金融 × 区块链 (TradFi × Crypto) ──────────────────────────────
        "银行区块链", "银行数字资产", "银行稳定币", "银行代币化",
        "投行加密", "投行数字资产", "高盛区块链", "摩根区块链",
        "资本市场代币化", "资本市场区块链",
        "资管加密", "资管数字资产", "基金代币化",
        "PE区块链", "VC加密", "对冲基金加密", "对冲基金比特币",
        "债券代币化", "债券上链", "国债代币化", "企业债上链",
        "衍生品加密", "衍生品区块链",
        "KYC区块链", "AML加密", "合规加密", "监管科技",

        // ── 关键交叉赛道 English ──────────────────────────────────────────────
        "RWA tokenization", "real world assets tokenization",
        "asset tokenization", "tokenized assets", "tokenized bonds",
        "tokenized securities", "tokenized treasury", "tokenized real estate",
        "tokenized fund", "tokenized equity",
        "BTC ETF", "Bitcoin ETF", "Ethereum ETF", "crypto ETF",
        "spot Bitcoin ETF", "spot Ethereum ETF", "ETF approval crypto",
        "stablecoin regulation", "stablecoin legislation", "stablecoin bill",
        "stablecoin reserve", "stablecoin backing", "USDT regulation", "USDC regulation",
        "crypto custody", "institutional crypto custody", "digital asset custody",
        "institutional adoption crypto", "institutional Bitcoin", "institutional Ethereum",
        "corporate crypto", "corporate Bitcoin", "enterprise blockchain",
        "on-chain finance", "hybrid finance", "TradFi DeFi",
        "CBDC", "central bank digital currency", "digital dollar", "digital euro",
        "digital yuan", "CBDC cross-border", "CBDC interoperability", "CBDC pilot",
        "STO security token", "security token offering",
        "permissioned blockchain", "private blockchain", "enterprise blockchain",

        // ── 稳定币地缘政治 ────────────────────────────────────────────────────
        "stablecoin geopolitics", "USD stablecoin dominance",
        "stablecoin sanctions", "stablecoin sanctions bypass",
        "dollar stablecoin hegemony", "stablecoin sovereignty",
        "GENIUS Act", "STABLE Act", "stablecoin law",

        // ── 中文关键词 ─────────────────────────────────────────────────────────
        "现实世界资产", "资产代币化", "资产上链",
        "债券代币化", "国债代币化", "证券代币化", "房地产代币化",
        "黄金代币化", "股权代币化",
        "央行数字货币", "数字人民币", "数字欧元", "数字美元",
        "CBDC跨境", "CBDC试点", "CBDC互操作",
        "稳定币监管", "稳定币立法", "稳定币法案",
        "美元稳定币", "稳定币储备", "稳定币制裁", "稳定币地缘",
        "GENIUS法案", "稳定币霸权",
        "机构加密", "机构入场", "机构比特币", "机构托管",
        "企业比特币", "上市公司买币",
        "传统金融加密", "华尔街区块链", "银行入场",

        // ── 新增：机构与华尔街深度参与（2026高频） ───────────────────────
        "institutional crypto adoption", "pension fund bitcoin", "sovereign wealth fund crypto",
        "endowment fund crypto", "family office bitcoin", "401k crypto",
        "wall street crypto", "goldman sachs crypto", "jpmorgan crypto", "bofa crypto",
        "morgan stanley crypto", "citi crypto", "barclays blockchain",
        "华尔街入场加密", "养老金比特币", "主权基金加密", "家族办公室比特币",

        // ── 新增：Web3 基础设施与 TradFi 融合 ─────────────────────────────
        "layer 2 tradfi", "L2 settlement", "onchain treasury", "onchain capital markets",
        "blockchain settlement", "DVP blockchain", "delivery versus payment blockchain",
        "atomic settlement", "T+0 settlement blockchain", "real-time settlement DLT",
        "post-trade blockchain", "clearing blockchain", "depository blockchain",
        "区块链结算", "原子结算", "T+0区块链", "后交易区块链",

        // ── 新增：监管与政策（广义） ───────────────────────────────────────
        "crypto regulation bill", "digital asset regulation", "crypto market structure",
        "crypto licensing", "virtual asset service provider", "VASP regulation",
        "travel rule crypto", "FATF crypto", "crypto tax ruling", "crypto tax policy",
        "crypto ban lift", "crypto legalization",
        "加密监管法案", "虚拟资产监管", "加密税收政策",

        // ── 新增：地缘政治与国际博弈（2026核心） ─────────────────────────
        "crypto geopolitics", "bitcoin diplomacy", "crypto sanctions evasion",
        "US crypto policy", "EU crypto regulation", "UK crypto regulation",
        "China crypto policy", "Hong Kong web3 hub", "Singapore crypto hub",
        "crypto strategic reserve", "bitcoin strategic reserve", "national bitcoin reserve",
        "BRICS crypto", "BRICS blockchain", "de-dollarization crypto",
        "比特币外交", "加密制裁绕过", "国家比特币储备", "战略比特币储备",
        "香港Web3", "新加坡加密枢纽",

        // ── 新增：重大事件与市场驱动（2026最新） ─────────────────────────
        "bitcoin halving", "ethereum upgrade", "ethereum Pectra", "solana etf filing",
        "xrp etf", "crypto etf inflow", "crypto etf outflow", "bitcoin reserve bill",
        "crypto super PAC", "crypto lobbying", "trump bitcoin", "trump crypto policy",
        "特朗普加密", "加密游说",
      ],
      maxPerPlate: 600,
    },
  } as Record<string, { keywords: string[]; maxPerPlate: number }>,
};

const PLATE_SECTION_MAP: Record<string, string[]> = {
  "快讯":           ["724news"],
  "IDO/Launchpad": ["ido"],
  "融资公告":       ["funding"],
  "活动奖励":       ["quest", "airdrop"],
  "政策监管":       ["policy"],
  "测试网":         ["testnet"],
  "节点招募":       ["nodes"],
  "招聘":           ["recruiting"],
  "开发者漏洞奖金": ["devbounty"],
  "捐赠/赞助":     ["grant"],
};

async function getTodayKeywordArticlesProcessed(): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(items_saved), 0) AS total
      FROM scrape_logs
      WHERE run_id LIKE ${"keyword_%"}
        AND created_at >= CURRENT_DATE
    `);
    return Number((result.rows[0] as { total: string }).total);
  } catch {
    return 0;
  }
}

async function checkIsKeywordFirstRun(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM scrape_logs WHERE run_id LIKE ${"keyword_%"}`
    );
    return Number((result.rows[0] as { count: string }).count) === 0;
  } catch {
    return true;
  }
}

/** Returns how many articles were saved per plate in the most recent completed keyword run. */
async function getLastRunPerPlateStats(): Promise<Record<string, number>> {
  try {
    const lastRun = await db.execute(sql`
      SELECT run_id FROM scrape_logs
      WHERE run_id LIKE ${"keyword_all_%"} AND status = 'ok'
      ORDER BY created_at DESC LIMIT 1
    `);
    if (!lastRun.rows.length) return {};
    const runId = (lastRun.rows[0] as { run_id: string }).run_id;
    const stats = await db.execute(sql`
      SELECT source_name, COALESCE(SUM(items_saved), 0)::int AS saved
      FROM scrape_logs
      WHERE run_id = ${runId} AND source_name LIKE ${"[keyword] %"}
      GROUP BY source_name
    `);
    const result: Record<string, number> = {};
    for (const row of stats.rows as Array<{ source_name: string; saved: number }>) {
      const name = row.source_name.replace("[keyword] ", "");
      result[name] = row.saved;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Compute an adaptive per-plate article cap.
 * Plates that got more than the average last run receive a smaller cap this run,
 * and vice-versa — so every plate stays roughly balanced over time.
 */
function computeAdaptiveMax(
  plateName: string,
  baseCap: number,
  lastRunStats: Record<string, number>,
  numPlates: number,
): number {
  const keys = Object.keys(lastRunStats);
  if (keys.length === 0) return baseCap; // first run: no history yet

  const totalLast = Object.values(lastRunStats).reduce((a, b) => a + b, 0);
  if (totalLast === 0) return baseCap; // last run saved nothing: keep base

  const avgPerPlate = totalLast / numPlates;
  const plateLast = lastRunStats[plateName] ?? 0;

  // scale = 1.5 if plate got nothing last run, 0.5 if plate got 2× average, clamped to [0.3, 1.8]
  const scale = Math.max(0.3, Math.min(1.8, 1 + (1 - plateLast / avgPerPlate) * 0.5));
  return Math.max(5, Math.round(baseCap * scale));
}

// Two separate locks: main cron (non-flash plates) and flash cron (快讯 only).
// Keeping them separate allows 快讯 flash scraper to run concurrently with the
// main 2h cron without blocking each other — they process entirely different plates.
let globalKeywordScrapeRunningNonFlash = false;
let globalKeywordScrapeRunningFlash    = false;
export function isKeywordScrapeRunning(): boolean { return globalKeywordScrapeRunningNonFlash || globalKeywordScrapeRunningFlash; }

export interface KeywordScrapeOptions {
  /** When true: skip all free (Groq) providers; use DeepSeek only. Reserves Groq for flash scraper. */
  paidOnly?: boolean;
  /** Override the lookback window in hours */
  overrideWindowHours?: number;
  /**
   * Override max articles per run (ignores KEYWORD_GRAB_CONFIG.maxArticlesPerRun).
   * Used by DeepSeek mode to apply a tighter budget limit.
   */
  maxArticlesPerRun?: number;
  /**
   * When true: use only free providers (Gemini/Groq).
   *   - rate-limit cooldown → skip batch
   *   - daily exhausted     → fall through to DeepSeek
   * When false: use any available provider (DeepSeek included freely).
   */
  freeOnly?: boolean;
  /**
   * Optional whitelist of plate names to scrape.
   * When provided, only these sections are processed (all others are skipped).
   * Useful for one-time backfill runs targeting specific thin sections.
   */
  plates?: string[];
  /**
   * When true: skip the daily article budget check (maxDailyArticles).
   * Intended for one-time backfill runs where normal daily limits should not apply.
   */
  ignoreDailyLimit?: boolean;
}

export async function runKeywordScrape(
  opts: KeywordScrapeOptions | number = {},
): Promise<ScrapeRunSummary> {
  // Back-compat: allow passing a bare number as overrideWindowHours
  if (typeof opts === "number") opts = { overrideWindowHours: opts };

  const {
    paidOnly = false,           // When true: DeepSeek only, reserve Groq for flash
    overrideWindowHours,
    maxArticlesPerRun: maxPerRunOverride,
    freeOnly = !paidOnly,       // default: freeOnly=true (Groq first); paidOnly overrides to false
    plates: platesFilter,
    ignoreDailyLimit = false,
  } = opts;

  if (!KEYWORD_GRAB_CONFIG.enabled) {
    return { runId: "disabled", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  // Determine which lock to use: flash (快讯 only) vs non-flash (main cron plates).
  // The two groups process entirely different plates and can safely run concurrently.
  const isFlashRun = Array.isArray(platesFilter) && platesFilter.length > 0 &&
    platesFilter.every(p => p === "快讯");
  const lockRef = isFlashRun ? "flash" : "nonFlash";

  if (isFlashRun && globalKeywordScrapeRunningFlash) {
    console.warn("[keyword-scrape:flash] Already running — skipped");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }
  if (!isFlashRun && globalKeywordScrapeRunningNonFlash) {
    console.warn("[keyword-scrape:nonFlash] Already running — skipped");
    return { runId: "skipped", totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: 0 };
  }

  if (isFlashRun) globalKeywordScrapeRunningFlash    = true;
  else            globalKeywordScrapeRunningNonFlash = true;

  const effectiveMaxPerRun = maxPerRunOverride ?? KEYWORD_GRAB_CONFIG.maxArticlesPerRun;

  const isFirstRun = await checkIsKeywordFirstRun();
  const windowHours = overrideWindowHours ?? (
    isFirstRun
      ? KEYWORD_GRAB_CONFIG.firstRunTimeWindowDays * 24
      : KEYWORD_GRAB_CONFIG.normalTimeWindowHours
  );
  const cutoff  = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const runId   = `keyword_all_${Date.now()}`;
  const startMs = Date.now();

  const modeLabel = freeOnly ? "free-only" : "deepseek-fallback";
  const platesLabel = platesFilter ? platesFilter.join(", ") : "ALL";
  console.log(`[keyword-scrape] Starting ${runId} — window: ${windowHours}h (${isFirstRun ? "FIRST RUN" : "normal"}), mode: ${modeLabel}, maxPerRun: ${effectiveMaxPerRun}, plates: ${platesLabel}`);
  logProviderStatus();

  let sources: ScrapeSource[] = [];
  let totalItemsFound = 0;
  let totalItemsSaved = 0;
  let errors = 0;

  const allPlates = Object.entries(KEYWORD_GRAB_CONFIG.plates);
  const activePlates = platesFilter && platesFilter.length > 0
    ? allPlates.filter(([name]) => platesFilter.includes(name))
    : allPlates;

  // Load last run's per-plate stats for adaptive balancing
  const lastRunStats = await getLastRunPerPlateStats();
  const logParts = Object.keys(lastRunStats).map(k => `${k}:${lastRunStats[k]}`).join(", ");
  if (logParts) console.log(`[keyword-scrape] Last run stats: ${logParts}`);

  type Article = { title: string; description: string; link: string; pubDate?: string };

  // Build Google News RSS search URLs — both English (US) and Chinese (CN)
  // IMPORTANT: Every query is anchored with a Web3 context term to ensure
  // only crypto/blockchain/Web3 content is fetched — no other industries.
  // Exception: 快讯 plate skips the anchor because its keywords (Bitcoin ETF, CBDC,
  // tokenized bonds, institutional Bitcoin, etc.) are already highly specific to
  // TradFi×Crypto — mainstream financial sources writing about these topics often
  // don't use "web3/DeFi/NFT" terminology, so the anchor would silently drop them.
  const WEB3_ANCHOR_EN = '(web3 OR crypto OR blockchain OR DeFi OR NFT OR cryptocurrency)';
  const WEB3_ANCHOR_CN = '(区块链 OR 加密货币 OR Web3 OR DeFi OR NFT OR 加密)';

  function buildGoogleNewsUrls(keywords: string[], noAnchor = false): string[] {
    const chunkSize = 5;
    const urls: string[] = [];

    const isChinese = (s: string) => /[\u4e00-\u9fff]/.test(s);
    const engKeywords = keywords.filter(k => !isChinese(k));
    const chnKeywords = keywords.filter(k => isChinese(k));

    const buildChunk = (chunk: string[], locale: string, anchor: string) => {
      const terms = chunk.map(k => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
      // Require at least one web3 anchor term so generic keywords stay scoped to crypto.
      // Skipped for plates whose keywords are already domain-specific (e.g. 快讯).
      const query = noAnchor ? `(${terms})` : `(${terms}) ${anchor}`;
      return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`;
    };

    for (let i = 0; i < engKeywords.length; i += chunkSize)
      urls.push(buildChunk(engKeywords.slice(i, i + chunkSize), "hl=en-US&gl=US&ceid=US:en", WEB3_ANCHOR_EN));

    for (let i = 0; i < chnKeywords.length; i += chunkSize)
      urls.push(buildChunk(chnKeywords.slice(i, i + chunkSize), "hl=zh-CN&gl=CN&ceid=CN:zh-Hans", WEB3_ANCHOR_CN));

    return urls;
  }

  try {
    // ── Check daily cap (unified across all plates) ──
    const todayProcessed = await getTodayKeywordArticlesProcessed();
    const dailyLimit = KEYWORD_GRAB_CONFIG.maxDailyArticles;
    if (!ignoreDailyLimit && todayProcessed >= dailyLimit) {
      console.log(`[keyword-scrape] Daily limit reached: ${todayProcessed}/${dailyLimit}. Skipping run.`);
      return { runId, totalSources: 0, totalItemsFound: 0, totalItemsSaved: 0, errors: 0, durationMs: Date.now() - startMs };
    }
    if (ignoreDailyLimit && todayProcessed >= dailyLimit) {
      console.log(`[keyword-scrape] Daily limit bypassed for backfill: ${todayProcessed}/${dailyLimit}`);
    } else {
      console.log(`[keyword-scrape] Daily budget: ${todayProcessed}/${dailyLimit} used so far today`);
    }

    // ── Per plate: search Google News → dedup → AI → save ──
    let globalCount = 0;
    // When ignoreDailyLimit is set (backfill), remaining budget = the run's own cap
    let dailyRemaining = ignoreDailyLimit
      ? effectiveMaxPerRun
      : dailyLimit - todayProcessed;
    const allSeenLinks = new Set<string>(); // dedup across plates within same run

    // Real DeepSeek budget guard ($0.50/day) is enforced inside callAiWithFallback().
    // No call-count gate needed here — at BATCH_SIZE=5 and maxArticlesPerRun≤200,
    // a single run can issue at most 40 AI calls, far below any meaningful cap.

    // Sort plates by the user-defined priority order (PLATE_PRIORITY_ORDER).
    // Plates not in the list (shouldn't happen) are appended at the end.
    const plateIndexMap = new Map(PLATE_PRIORITY_ORDER.map((name, i) => [name, i]));
    const sortedActivePlates = [...activePlates].sort(([a], [b]) => {
      const ia = plateIndexMap.has(a) ? plateIndexMap.get(a)! : 999;
      const ib = plateIndexMap.has(b) ? plateIndexMap.get(b)! : 999;
      return ia - ib;
    });

    for (const [plateName, plateConfig] of sortedActivePlates) {
      if (globalCount >= effectiveMaxPerRun) break;
      if (dailyRemaining <= 0) {
        console.log(`[keyword-scrape] Daily limit of ${dailyLimit} reached mid-run, stopping`);
        break;
      }


      const targetSections = PLATE_SECTION_MAP[plateName] ?? [];
      if (targetSections.length === 0) continue;

      // Per-plate effective cutoff: stricter of global window cutoff vs plate max-age cap
      const plateMaxAgeDays = PLATE_MAX_AGE_DAYS[plateName] ?? DEFAULT_PLATE_MAX_AGE_DAYS;
      const plateMaxCutoff = new Date(Date.now() - plateMaxAgeDays * 24 * 60 * 60 * 1000);
      const plateCutoff = cutoff > plateMaxCutoff ? cutoff : plateMaxCutoff; // most-recent wins

      // Fetch from Google News for each keyword chunk.
      // 快讯 skips the Web3 anchor: its keywords are already TradFi×Crypto specific,
      // and mainstream financial sources often omit "web3/DeFi/NFT" terminology.
      const gnUrls = buildGoogleNewsUrls(plateConfig.keywords, plateName === "快讯");
      const plateArticles = new Map<string, Article>();

      for (const gnUrl of gnUrls) {
        try {
          const feed = await fetchRssWithRetry(gnUrl);
          if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) continue;

          for (const item of feed.items) {
            const pd = item.pubDate ?? item.isoDate;
            if (pd) {
              const d = new Date(pd);
              if (!isNaN(d.getTime()) && d < plateCutoff) continue;
            }
            const link = item.link ?? item.guid ?? gnUrl;
            if (!link || plateArticles.has(link) || allSeenLinks.has(link)) continue;
            const title = (item.title ?? "").replace(/<[^>]+>/g, "").trim();
            if (!title) continue;
            const description = (item.contentSnippet ?? item.summary ?? item.content ?? "")
              .replace(/<[^>]+>/g, "").slice(0, 800).trim();
            plateArticles.set(link, { title, description, link, pubDate: pd ?? undefined });
          }
        } catch (e) {
          errors++;
          console.warn(`[keyword-scrape] Google News fetch error for plate "${plateName}":`, e instanceof Error ? e.message : e);
        }
        await sleep(500); // be polite between requests
      }

      sources.push({ name: `GoogleNews:${plateName}`, url: gnUrls[0] ?? "", type: "rss", priority: 1, enabled: true });

      if (plateArticles.size === 0) {
        console.log(`[keyword-scrape] Plate "${plateName}": 0 articles from Google News (window: ${windowHours}h)`);
        continue;
      }

      // Dedup against DB
      const articleList = Array.from(plateArticles.values());
      const existingUrls = await getExistingUrls(articleList.map(a => a.link));
      const adaptiveCap = computeAdaptiveMax(plateName, plateConfig.maxPerPlate, lastRunStats, activePlates.length);
      const plateMax = Math.min(adaptiveCap, dailyRemaining);
      const newArticles = articleList
        .filter(a => !existingUrls.has(a.link))
        .slice(0, plateMax);

      // Mark links as seen across plates
      articleList.forEach(a => allSeenLinks.add(a.link));

      if (newArticles.length === 0) {
        console.log(`[keyword-scrape] Plate "${plateName}": ${plateArticles.size} fetched, all already in DB`);
        continue;
      }

      const web3Articles = newArticles.filter(a => isWeb3Related(a.title, a.description ?? ""));
      const skipped = newArticles.length - web3Articles.length;
      if (skipped > 0) console.log(`[keyword-scrape] Plate "${plateName}": pre-filter removed ${skipped} non-Web3 articles`);

      if (web3Articles.length === 0) {
        console.log(`[keyword-scrape] Plate "${plateName}": all articles filtered out by Web3 pre-filter`);
        continue;
      }

      // Skip entire plate immediately if no usable provider is available.
      // IMPORTANT: This check must happen BEFORE fingerprint marking so that articles
      // are not permanently blocked by the cache when the provider was temporarily unavailable.
      //
      // isFlashRun=true  (Groq flash, 快讯 only):
      //   → Groq available              → use Groq
      //   → Groq rate-limited/exhausted → skip plate, NO fingerprinting; DS flash covers it
      // isFlashRun=false (main cron keyword):
      //   → Groq available              → use Groq
      //   → Groq ALL daily-exhausted    → DeepSeek fallback (but only if DS budget not spent)
      //   → Groq rate-limited           → skip plate (temporary cooldown)
      // freeOnly=false (DS flash, paidOnly=true):
      //   → DeepSeek available AND budget not spent → proceed; else skip (no fingerprinting)
      //
      // NOTE: getAvailableProviders() does NOT check the $0.50/day DS budget — it only checks
      // rate-limit and daily-call-count (DS has dailyCallLimit=0 so never "daily-exhausted").
      // We must call isDeepSeekBudgetAvailable() explicitly wherever DS is the only option,
      // to prevent fingerprinting articles that will ultimately fail the AI call.
      const hasUsableProvider = () => {
        if (freeOnly && isFlashRun) {
          // Groq flash: Groq only — if unavailable for any reason, skip (DS flash covers it)
          return isFreeProviderAvailable();
        }
        if (freeOnly) {
          // Main cron keyword: Groq first; DeepSeek when all Groq daily-exhausted
          if (isFreeProviderAvailable()) return true;
          if (areFreeProvidersDailyExhausted()) {
            // DS fallback — only proceed if DS has remaining $0.50/day budget
            return getAvailableProviders().length > 0 && isDeepSeekBudgetAvailable();
          }
          return false; // temporary rate-limit — skip, retry next cycle
        }
        // DS flash (paidOnly=true → freeOnly=false): DeepSeek only
        // Verify DS is not rate-limited AND has remaining daily budget
        return getAvailableProviders().some(p => p.name === "deepseek") && isDeepSeekBudgetAvailable();
      };
      if (!hasUsableProvider()) {
        const reason = isFlashRun ? "no Groq available, skipping — DS flash will cover" : "providers unavailable, skipping plate";
        console.log(`[keyword-scrape] Plate "${plateName}": ${reason}`);
        continue;
      }

      // Fingerprint dedup: skip articles whose raw title we've already sent to AI this session.
      // (Google News returns same articles with different redirect URLs each fetch)
      // NOTE: We only CHECK fingerprints here (not mark them). Fingerprints are marked per-batch
      // right before each AI call, so that if the provider fails mid-plate, only the articles
      // already sent to AI have their fingerprints set. Articles in skipped batches remain
      // un-fingerprinted and can be picked up by the DS flash in the next cycle.
      const fingerprintFiltered = web3Articles.filter(a => !isFingerprintSeen(makeTitleFingerprint(a.title)));
      const fpSkipped = web3Articles.length - fingerprintFiltered.length;
      if (fpSkipped > 0) console.log(`[keyword-scrape] Plate "${plateName}": fingerprint cache skipped ${fpSkipped} already-processed articles`);

      if (fingerprintFiltered.length === 0) {
        console.log(`[keyword-scrape] Plate "${plateName}": all articles already processed (fingerprint cache)`);
        continue;
      }

      console.log(`[keyword-scrape] Plate "${plateName}": ${fingerprintFiltered.length} new articles → AI (cap: ${plateMax}, daily remaining: ${dailyRemaining})`);
      totalItemsFound += fingerprintFiltered.length;
      globalCount += fingerprintFiltered.length;
      dailyRemaining -= fingerprintFiltered.length;
      let savedCount = 0;

      for (let i = 0; i < fingerprintFiltered.length; i += BATCH_SIZE) {
        // Re-check before each batch — stop if providers went on cooldown mid-plate
        if (!hasUsableProvider()) {
          console.log(`[keyword-scrape] Plate "${plateName}": providers went on cooldown mid-plate, stopping — resuming next cycle`);
          break;
        }
        // Mark fingerprints for THIS batch only, right before the AI call.
        // This way, if the AI call fails or the next batch is skipped due to provider cooldown,
        // those articles remain un-fingerprinted and will be retried in the next scrape cycle.
        const batch = fingerprintFiltered.slice(i, i + BATCH_SIZE).filter(a => {
          const fp = makeTitleFingerprint(a.title);
          if (isFingerprintSeen(fp)) return false; // concurrent run already marked it
          markFingerprintSeen(fp);
          return true;
        });
        if (batch.length === 0) continue;
        const events = await processBatchWithDeepSeek(batch, undefined, plateName, paidOnly);

        const generatedTitles = events.map(ev => ev.title).filter(Boolean);
        const existingTitles = await getExistingTitles(generatedTitles);

        for (const ev of events) {
          if (existingTitles.has(ev.title)) continue;
          // 一文多发：收集 AI 识别的所有 section，并始终保证写入目标板块
          const aiSections = mapAllCategories(Array.isArray(ev.category) ? ev.category : [], ev.title);
          const allSections = new Set<string>([...aiSections, targetSections[0]]);
          const uniqueKeys = new Set<string>();
          for (const section of allSections) {
            const key = `${(ev.title || '').trim()}-${ev.source_url || ev.sourceUrl || ev.link || ''}`;
            if (uniqueKeys.has(key)) {
              console.log(`[Deduplicate] 跳过重复文章: ${ev.title?.slice(0, 60)}...`);
              continue;
            }
            uniqueKeys.add(key);
            const saved = await insertPost(ev, section);
            if (saved) savedCount++;
          }
        }

        if (i + BATCH_SIZE < fingerprintFiltered.length) await sleep(5000); // 5s gap → ~12 req/min, safely under Gemini's 15/min limit
      }

      totalItemsSaved += savedCount;
      await logEntry({
        runId,
        sourceName: `[keyword] ${plateName}`,
        sourceUrl: gnUrls[0] ?? plateName,
        status: "ok",
        itemsFound: newArticles.length,
        itemsSaved: savedCount,
      });
    }
  } catch (e: unknown) {
    errors++;
    console.error("[keyword-scrape] Fatal error:", e);
  } finally {
    if (isFlashRun) globalKeywordScrapeRunningFlash    = false;
    else            globalKeywordScrapeRunningNonFlash = false;
    void lockRef; // suppress "unused variable" lint warning
  }

  const durationMs = Date.now() - startMs;
  console.log(
    `[keyword-scrape] Run ${runId} done. Found: ${totalItemsFound}, Saved: ${totalItemsSaved}, ` +
    `Errors: ${errors}, Duration: ${Math.round(durationMs / 1000)}s`
  );
  return { runId, totalSources: sources.length, totalItemsFound, totalItemsSaved, errors, durationMs };
}
