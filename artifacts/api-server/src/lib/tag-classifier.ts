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

export const CHAIN_KEYWORDS: Record<ChainTag, string[]> = {
  // NOTE: keep these keywords fairly strict to avoid "everything matches everything".
  // If a chain isn't explicitly mentioned, it should NOT be tagged.
  Ethereum: ["Ethereum", "ETH", "Ether", "Ethereum Foundation", "Dencun", "Cancun"],
  Solana: ["Solana", "SOL", "Solana Foundation", "Breakpoint", "Saga"],
  "BNB Chain": ["BNB Chain", "BSC", "Binance Smart Chain"],
  Arbitrum: ["Arbitrum", "ARB", "Arbitrum Orbit", "Arbitrum Nova"],
  Base: ["Base", "Base Chain", "Coinbase L2"],
  Optimism: ["Optimism", "OP", "OP Stack", "Superchain"],
  Sui: ["Sui"],
  Aptos: ["Aptos"],
};

export const EXCHANGE_KEYWORDS: Record<ExchangeTag, string[]> = {
  // Exchange keywords must be brand-specific; generic words like "Announcement" or "Listing"
  // will make nearly all posts match and destroy filter quality.
  Binance: ["Binance", "Binance Launchpad", "Binance Launchpool", "Binance Listing"],
  OKX: [
    "OKX", "OKX Exchange", "OKEx", "欧易",
    "OKX Jumpstart", "OKX Megadrop",
    "OKX to list", "OKX will list", "OKX will launch",
    "欧易上市", "OKX 上市",
  ],
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

