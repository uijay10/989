export type ChainTag =
  | "Ethereum"
  | "Solana"
  | "BNB Chain"
  | "Arbitrum"
  | "Base"
  | "Optimism"
  | "Sui"
  | "Aptos";

export type ExchangeTag = "Binance" | "OKX" | "Bybit" | "Coinbase" | "Kraken";

/**
 * 公链 / 交易所：导航展示名 + 常用代币符号（如 Solana + SOL）。
 * 短符号走 keywordHit 的单词边界；Base 不附带 ETH，避免 L2 文普遍误标 Ethereum。
 * 其它业务板块（测试网、IDO、融资等）与此无关。
 */
export const CHAIN_KEYWORDS: Record<ChainTag, string[]> = {
  Ethereum: ["Ethereum", "ETH"],
  Solana: ["Solana", "SOL"],
  "BNB Chain": ["BNB Chain", "BNB"],
  Arbitrum: ["Arbitrum", "ARB"],
  Base: ["Base"],
  Optimism: ["Optimism", "OP"],
  Sui: ["Sui", "SUI"],
  Aptos: ["Aptos", "APT"],
};

export const EXCHANGE_KEYWORDS: Record<ExchangeTag, string[]> = {
  Binance: ["Binance", "BNB"],
  OKX: ["OKX", "OKB"],
  Bybit: ["Bybit"],
  Coinbase: ["Coinbase"],
  Kraken: ["Kraken"],
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

