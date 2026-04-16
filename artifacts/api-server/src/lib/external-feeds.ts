interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;
  return null;
}
function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function safeFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Web3Hub/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface TokenCard {
  id: string;
  name: string;
  symbol: string;
  chain: string;
  icon?: string;
  description?: string;
  url: string;
  priceUsd?: string;
  priceChange24h?: number;
  source: "dexscreener" | "coingecko";
}

interface DexPair {
  baseToken?: { name: string; symbol: string; address?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  pairCreatedAt?: number;
}

async function lookupDexTokensByChain(
  byChain: Record<string, string[]>
): Promise<Map<string, DexPair>> {
  const pairMap = new Map<string, DexPair>();
  await Promise.allSettled(
    Object.entries(byChain).map(async ([chainId, addrs]) => {
      const chunk = addrs.slice(0, 30).join(",");
      try {
        const data = await safeFetch(
          `https://api.dexscreener.com/tokens/v1/${chainId}/${chunk}`
        ) as Array<DexPair & { baseToken?: { address?: string } }>;
        if (Array.isArray(data)) {
          for (const pair of data) {
            const addr = pair.baseToken?.address?.toLowerCase();
            if (addr && !pairMap.has(addr)) pairMap.set(addr, pair);
          }
        }
      } catch {
      }
    })
  );
  return pairMap;
}

export async function fetchMemeTokens(): Promise<TokenCard[]> {
  const cached = getCache<TokenCard[]>("meme");
  if (cached) return cached;

  const results: TokenCard[] = [];

  try {
    const boosts = await safeFetch("https://api.dexscreener.com/token-boosts/latest/v1") as Array<{
      tokenAddress: string;
      chainId: string;
      url: string;
      icon?: string;
      description?: string;
    }>;

    const slice = boosts.slice(0, 24);
    const byChain: Record<string, string[]> = {};
    for (const b of slice) {
      if (!byChain[b.chainId]) byChain[b.chainId] = [];
      byChain[b.chainId].push(b.tokenAddress);
    }

    const pairMap = await lookupDexTokensByChain(byChain);

    for (const b of slice) {
      const pair = pairMap.get(b.tokenAddress.toLowerCase());
      const name = pair?.baseToken?.name ?? b.tokenAddress.slice(0, 6) + "…";
      const symbol = pair?.baseToken?.symbol ?? "?";
      results.push({
        id: b.tokenAddress,
        name,
        symbol,
        chain: b.chainId,
        icon: b.icon,
        description: b.description,
        url: b.url,
        priceUsd: pair?.priceUsd,
        priceChange24h: pair?.priceChange?.h24,
        source: "dexscreener",
      });
    }
  } catch (e) {
    console.error("[external-feeds] DexScreener boosts error:", e);
  }

  try {
    const trending = await safeFetch("https://api.coingecko.com/api/v3/search/trending") as {
      coins?: Array<{ item: { id: string; name: string; symbol: string; thumb: string; data?: { price_change_percentage_24h?: { usd?: number } } } }>;
    };
    for (const { item } of (trending.coins ?? []).slice(0, 10)) {
      if (results.find(r => r.name.toLowerCase() === item.name.toLowerCase())) continue;
      results.push({
        id: `cg-${item.id}`,
        name: item.name,
        symbol: item.symbol.toUpperCase(),
        chain: "multi",
        icon: item.thumb,
        url: `https://www.coingecko.com/en/coins/${item.id}`,
        priceChange24h: item.data?.price_change_percentage_24h?.usd,
        source: "coingecko",
      });
    }
  } catch (e) {
    console.error("[external-feeds] CoinGecko trending error:", e);
  }

  setCache("meme", results);
  return results;
}

export async function fetchIdoTokens(): Promise<TokenCard[]> {
  const cached = getCache<TokenCard[]>("ido");
  if (cached) return cached;

  const results: TokenCard[] = [];

  try {
    const profiles = await safeFetch("https://api.dexscreener.com/token-profiles/latest/v1") as Array<{
      tokenAddress: string;
      chainId: string;
      url: string;
      icon?: string;
      description?: string;
    }>;

    const slice = profiles.slice(0, 24);
    const byChain: Record<string, string[]> = {};
    for (const p of slice) {
      if (!byChain[p.chainId]) byChain[p.chainId] = [];
      byChain[p.chainId].push(p.tokenAddress);
    }

    const pairMap = await lookupDexTokensByChain(byChain);

    for (const prof of slice) {
      const pair = pairMap.get(prof.tokenAddress.toLowerCase());
      const name = pair?.baseToken?.name ?? prof.tokenAddress.slice(0, 6) + "…";
      const symbol = pair?.baseToken?.symbol ?? "?";
      results.push({
        id: prof.tokenAddress,
        name,
        symbol,
        chain: prof.chainId,
        icon: prof.icon,
        description: prof.description,
        url: prof.url,
        priceUsd: pair?.priceUsd,
        priceChange24h: pair?.priceChange?.h24,
        source: "dexscreener",
      });
    }
  } catch (e) {
    console.error("[external-feeds] DexScreener profiles error:", e);
  }

  setCache("ido", results);
  return results;
}

export async function fetchTrendingCoins(): Promise<TokenCard[]> {
  const cached = getCache<TokenCard[]>("trending");
  if (cached) return cached;

  const results: TokenCard[] = [];
  try {
    const trending = await safeFetch("https://api.coingecko.com/api/v3/search/trending") as {
      coins?: Array<{ item: { id: string; name: string; symbol: string; thumb: string; data?: { price_change_percentage_24h?: { usd?: number } } } }>;
    };
    for (const { item } of (trending.coins ?? [])) {
      results.push({
        id: `cg-${item.id}`,
        name: item.name,
        symbol: item.symbol.toUpperCase(),
        chain: "multi",
        icon: item.thumb,
        url: `https://www.coingecko.com/en/coins/${item.id}`,
        priceChange24h: item.data?.price_change_percentage_24h?.usd,
        source: "coingecko",
      });
    }
  } catch (e) {
    console.error("[external-feeds] CoinGecko trending error:", e);
  }
  setCache("trending", results);
  return results;
}
