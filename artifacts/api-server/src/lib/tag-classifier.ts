export type ChainTag =
  | "Ethereum"
  | "Solana"
  | "BNB Chain"
  | "Arbitrum"
  | "Base"
  | "Sui"
  | "Aptos";

export type ExchangeTag = "Binance" | "OKX" | "Bybit" | "Coinbase" | "Kraken" | "Bitget";

/**
 * 公链 / 交易所：导航展示名 + 常用代币符号。
 * 短符号（≤4字符）走单词边界匹配；长词走 includes。
 * Base 不用裸词，避免普通英文词 "base" 误匹配。
 * Optimism 不用 "OP"，避免缩写误匹配。
 * BNB Chain 补充 BSC / Binance Smart Chain 等常见写法。
 */
export const CHAIN_KEYWORDS: Record<ChainTag, string[]> = {
  Ethereum: ["Ethereum", "ETH"],
  Solana: ["Solana", "SOL"],
  "BNB Chain": ["BNB Chain", "BNBChain", "Binance Smart Chain", "BSC", "BEP-20", "BEP20", "BNB"],
  Arbitrum: ["Arbitrum", "ARB"],
  Base: ["Base chain", "Base network", "Base mainnet", "Base testnet", "Base blockchain", "Base L2", "base.org", "Coinbase Base", "Base ecosystem", "Base protocol"],
  Sui: ["Sui", "SUI"],
  Aptos: ["Aptos", "APT"],
};

export const EXCHANGE_KEYWORDS: Record<ExchangeTag, string[]> = {
  Binance: ["Binance", "BNB"],
  OKX: ["OKX", "OKB"],
  Bybit: ["Bybit"],
  Coinbase: ["Coinbase"],
  Kraken: ["Kraken"],
  Bitget: ["Bitget", "BGB"],
};

function normalizeText(s: string) {
  return (s ?? "").toLowerCase();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordHit(haystackLower: string, keyword: string): boolean {
  const k = normalizeText(keyword).trim();
  if (!k) return false;

  // Short tickers / acronyms: match on word boundary to reduce false positives
  if (k.length <= 4 && /^[a-z0-9]+$/i.test(k)) {
    const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
    return re.test(haystackLower);
  }

  return haystackLower.includes(k);
}

export function classifyChainExchangeTags(input: { title?: string; description?: string }) {
  const text = normalizeText(`${input.title ?? ""}\n${input.description ?? ""}`);

  const chainTags: ChainTag[] = [];
  const exchangeTags: ExchangeTag[] = [];

  (Object.keys(CHAIN_KEYWORDS) as ChainTag[]).forEach((tag) => {
    const kws = CHAIN_KEYWORDS[tag];
    if (kws.some((kw) => keywordHit(text, kw))) chainTags.push(tag);
  });

  (Object.keys(EXCHANGE_KEYWORDS) as ExchangeTag[]).forEach((tag) => {
    const kws = EXCHANGE_KEYWORDS[tag];
    if (kws.some((kw) => keywordHit(text, kw))) exchangeTags.push(tag);
  });

  return {
    chainTags: Array.from(new Set(chainTags)),
    exchangeTags: Array.from(new Set(exchangeTags)),
  };
}
