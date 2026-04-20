export type ChainTag =
  | "Ethereum"
  | "Solana"
  | "BNB Chain"
  | "Arbitrum"
  | "Base"
  | "Optimism"
  | "Sui"
  | "Aptos";

export type ExchangeTag = "Binance" | "Bybit" | "Coinbase" | "Kraken";

export const CHAIN_KEYWORDS: Record<ChainTag, string[]> = {
  Ethereum: ["Ethereum", "ETH", "Layer 1", "Mainnet", "L2", "Rollup", "Dencun", "Cancun", "ESP", "Ethereum Foundation"],
  Solana: ["Solana", "SOL", "Saga", "Breakpoint", "Solana Testnet"],
  "BNB Chain": ["BNB Chain", "BSC", "BNB", "Binance Smart Chain", "Launchpool"],
  Arbitrum: ["Arbitrum", "ARB", "Orbit", "Nova"],
  Base: ["Base", "Coinbase L2", "Base Chain"],
  Optimism: ["Optimism", "OP", "OP Stack", "Superchain"],
  Sui: ["Sui"],
  Aptos: ["Aptos"],
};

export const EXCHANGE_KEYWORDS: Record<ExchangeTag, string[]> = {
  Binance: ["Binance", "Launchpad", "Launchpool", "IEO", "Binance Listing", "Announcement"],
  Bybit: ["Bybit", "Bybit Launchpad"],
  Coinbase: ["Coinbase", "Coinbase Listing", "Advanced Trade"],
  Kraken: ["Kraken", "Kraken Exchange", "Kraken Listing"],
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

