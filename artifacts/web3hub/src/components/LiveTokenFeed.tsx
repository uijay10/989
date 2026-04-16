import { useState, useEffect } from "react";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "Base",
  arbitrum: "ARB",
  polygon: "MATIC",
  avalanche: "AVAX",
  multi: "多链",
};

const CHAIN_COLORS: Record<string, string> = {
  solana: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ethereum: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  bsc: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  base: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
  arbitrum: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  polygon: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  avalanche: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  multi: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

interface TokenCard {
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

function TokenItem({ token }: { token: TokenCard }) {
  const chainLabel = CHAIN_LABELS[token.chain] ?? token.chain.toUpperCase().slice(0, 4);
  const chainColor = CHAIN_COLORS[token.chain] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  const isPositive = (token.priceChange24h ?? 0) >= 0;
  const priceNum = token.priceUsd ? parseFloat(token.priceUsd) : null;

  function formatPrice(p: number) {
    if (p < 0.000001) return p.toExponential(2);
    if (p < 0.001) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  return (
    <a
      href={token.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm hover:bg-accent/30 transition-all group"
    >
      <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-muted border border-border/40 flex items-center justify-center">
        {token.icon ? (
          <img src={token.icon} alt={token.symbol} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">{token.symbol.slice(0, 2)}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate max-w-[120px]">{token.name}</span>
          <span className="text-xs text-muted-foreground font-mono">{token.symbol}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${chainColor}`}>{chainLabel}</span>
        </div>
        {token.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-[240px]">{token.description}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {priceNum !== null && (
          <span className="text-xs font-mono font-semibold text-foreground">${formatPrice(priceNum)}</span>
        )}
        {token.priceChange24h !== undefined && token.priceChange24h !== null && (
          <span className={`text-[11px] font-bold flex items-center gap-0.5 ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? "+" : ""}{token.priceChange24h.toFixed(2)}%
          </span>
        )}
        <ExternalLink className="w-3 h-3 text-muted-foreground/60 group-hover:text-primary/60 transition-colors" />
      </div>
    </a>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  meme: "🔥 实时 Meme 热点",
  ido: "🚀 最新代币上市",
};

const SOURCE_BADGE: Record<string, string> = {
  dexscreener: "DexScreener",
  coingecko: "CoinGecko",
};

interface LiveTokenFeedProps {
  feedType: "meme" | "ido";
}

export function LiveTokenFeed({ feedType }: LiveTokenFeedProps) {
  const [tokens, setTokens] = useState<TokenCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiBase()}/feeds/${feedType}`)
      .then(r => r.json())
      .then(d => setTokens(d.tokens ?? []))
      .catch(() => setTokens([]))
      .finally(() => setLoading(false));
  }, [feedType]);

  const displayed = showAll ? tokens : tokens.slice(0, 8);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-2">
        <div className="h-5 w-40 rounded-lg bg-muted animate-pulse mb-3" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (tokens.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-foreground">{SOURCE_LABEL[feedType]}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">
            实时数据 · 每5分钟更新
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {displayed.map(t => (
          <TokenItem key={t.id} token={t} />
        ))}
      </div>

      {tokens.length > 8 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
        >
          {showAll ? "收起 ▲" : `展开全部 ${tokens.length} 个 ▼`}
        </button>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border/30">
        <span className="text-[10px] text-muted-foreground/50">
          数据来源: {[...new Set(tokens.map(t => SOURCE_BADGE[t.source]))].join(" & ")}
        </span>
        <span className="text-[10px] text-muted-foreground/50">
          共 {tokens.length} 个代币
        </span>
      </div>
    </div>
  );
}
