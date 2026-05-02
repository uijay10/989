import { useState, useEffect, useCallback, useRef } from "react";
import { useLang } from "@/lib/i18n";
import {
  TrendingUp, TrendingDown, RefreshCw, ExternalLink, Star, Search,
  BarChart2, Layers, Briefcase, Building2, Lock, Brain, Activity,
  ChevronUp, ChevronDown, Globe, Zap
} from "lucide-react";

// ── number formatters ────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return "$" + n.toFixed(4).replace(/\.?0+$/, "");
  return "$" + n.toFixed(6).replace(/\.?0+$/, "");
}
function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number, decimals = 2) {
  const s = n.toFixed(decimals);
  return n >= 0 ? `+${s}%` : `${s}%`;
}
function fmtAddr(s: string) { return s.slice(0, 6) + "…" + s.slice(-4); }

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded ${className}`} />;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ data, positive, w = 80, h = 32 }: { data: number[]; positive: boolean; w?: number; h?: number }) {
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const color = positive ? "#10b981" : "#ef4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Chain color ───────────────────────────────────────────────────────────────

const CHAIN_COLORS: Record<string, string> = {
  Ethereum: "#627EEA", BSC: "#F3BA2F", Solana: "#9945FF",
  Arbitrum: "#1D4ED8", Polygon: "#8247E5", Tron: "#EF4444",
  Avalanche: "#E84142", Base: "#0052FF", Sui: "#6FBCF0",
  Optimism: "#FF0420", Aptos: "#00B5AD",
};
const cc = (n: string) => CHAIN_COLORS[n] ?? "#94a3b8";

// ── Mock data ─────────────────────────────────────────────────────────────────

const ETF_DATA = [
  { name: "iShares Bitcoin Trust", ticker: "IBIT", issuer: "BlackRock",  aum: 54_800_000_000, flow1d: 312_000_000,  flow7d: 1_420_000_000,  btcHeld: 573_520 },
  { name: "Fidelity Wise Origin",  ticker: "FBTC", issuer: "Fidelity",   aum: 19_200_000_000, flow1d: 97_000_000,   flow7d: 540_000_000,   btcHeld: 201_350 },
  { name: "ARK 21Shares",          ticker: "ARKB", issuer: "ARK/21Sh",   aum:  4_100_000_000, flow1d: 18_000_000,   flow7d: -120_000_000,  btcHeld:  43_210 },
  { name: "Bitwise Bitcoin ETF",   ticker: "BITB", issuer: "Bitwise",    aum:  3_200_000_000, flow1d: 22_000_000,   flow7d: 88_000_000,    btcHeld:  33_580 },
  { name: "Grayscale Bitcoin Tr.", ticker: "GBTC", issuer: "Grayscale",  aum: 14_500_000_000, flow1d: -85_000_000,  flow7d: -620_000_000,  btcHeld: 152_110 },
  { name: "VanEck Bitcoin ETF",    ticker: "HODL", issuer: "VanEck",     aum:    980_000_000, flow1d: 4_200_000,    flow7d: 31_000_000,    btcHeld:  10_290 },
  { name: "Invesco Galaxy",        ticker: "BTCO", issuer: "Invesco",    aum:    720_000_000, flow1d: 1_800_000,    flow7d: 12_000_000,    btcHeld:   7_560 },
  { name: "WisdomTree Bitcoin",    ticker: "BTCW", issuer: "WisdomTree", aum:    290_000_000, flow1d: -3_200_000,   flow7d: -8_500_000,    btcHeld:   3_040 },
];

const STOCK_DATA = [
  { ticker: "MSTR", name: "MicroStrategy", price: 389.2,  change1d: 4.8,  change7d: 12.3,  btcHeld: 214_400, mktCap: 74_500_000_000 },
  { ticker: "COIN", name: "Coinbase",      price: 218.5,  change1d: 2.1,  change7d: 8.6,   btcHeld: 9_480,   mktCap: 55_200_000_000 },
  { ticker: "MARA", name: "Marathon Dig.", price: 15.3,   change1d: -1.2, change7d: 3.4,   btcHeld: 25_827,  mktCap:  4_100_000_000 },
  { ticker: "RIOT", name: "Riot Platforms",price: 9.8,    change1d: 0.6,  change7d: -2.1,  btcHeld: 18_221,  mktCap:  2_800_000_000 },
  { ticker: "CLSK", name: "CleanSpark",    price: 12.4,   change1d: 1.9,  change7d: 5.7,   btcHeld: 11_177,  mktCap:  2_200_000_000 },
  { ticker: "HUT",  name: "Hut 8 Mining", price: 17.6,   change1d: -0.8, change7d: 1.2,   btcHeld: 10_096,  mktCap:  3_100_000_000 },
  { ticker: "CIFR", name: "Cipher Mining", price: 4.2,   change1d: 2.4,  change7d: -4.3,  btcHeld: 1_063,   mktCap:    940_000_000 },
];

const UNLOCK_DATA = [
  { token: "SUI",  amount: 64_000_000,  usd: 73_000_000,  date: "2025-06-01", pctSupply: 4.2, risk: "high"   },
  { token: "APT",  amount: 11_300_000,  usd: 56_000_000,  date: "2025-06-05", pctSupply: 1.9, risk: "medium" },
  { token: "ARB",  amount: 92_000_000,  usd: 49_000_000,  date: "2025-06-08", pctSupply: 2.8, risk: "high"   },
  { token: "OP",   amount: 31_400_000,  usd: 28_000_000,  date: "2025-06-12", pctSupply: 1.5, risk: "medium" },
  { token: "BLUR", amount: 128_000_000, usd: 14_000_000,  date: "2025-06-15", pctSupply: 5.1, risk: "low"    },
  { token: "STRK", amount: 64_000_000,  usd: 19_200_000,  date: "2025-06-18", pctSupply: 2.3, risk: "medium" },
  { token: "IMX",  amount: 32_000_000,  usd: 12_800_000,  date: "2025-06-22", pctSupply: 1.1, risk: "low"    },
  { token: "ZK",   amount: 220_000_000, usd: 32_000_000,  date: "2025-06-25", pctSupply: 6.8, risk: "high"   },
];

const SMART_MONEY = [
  { wallet: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", label: "Binance 14",  flow:  8_420_000, token: "ETH", action: "accumulating", pct: 12.4, txns: 14 },
  { wallet: "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", label: "Binance 7",   flow:  5_710_000, token: "SOL", action: "accumulating", pct: 9.1,  txns: 8  },
  { wallet: "0x742d35Cc6634C0532925a3b8D4C9b4e5b0e7c1B5", label: "Whale 0x742", flow:  3_990_000, token: "ARB", action: "accumulating", pct: 22.6, txns: 5  },
  { wallet: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3", label: "Binance 8",   flow: -2_880_000, token: "BNB", action: "distributing", pct: -6.3, txns: 11 },
  { wallet: "0xF977814e90dA44bFA03b6295A0616a897441aceE", label: "Binance 6",   flow:  2_340_000, token: "SUI", action: "accumulating", pct: 31.5, txns: 3  },
  { wallet: "0x28C6c06298d514Db089934071355E5743bf21d60", label: "Binance 14b", flow: -1_920_000, token: "DOGE",action: "distributing", pct: -4.2, txns: 7  },
];

const INDEX_DATA = [
  { name: "加密恐慌贪婪指数", en: "Fear & Greed Index", value: 72, max: 100, label: "贪婪", color: "#10b981", change1d: 4 },
  { name: "BTC 市值占比",      en: "BTC Dominance",     value: 63.4, max: 100, label: "", color: "#F7931A", change1d: 0.3, suffix: "%" },
  { name: "ETH/BTC 汇率",      en: "ETH/BTC Ratio",     value: 0.0292, max: 0.1, label: "", color: "#627EEA", change1d: -0.0008, decimals: 4 },
  { name: "总市值",             en: "Total Mkt Cap",     value: 3.12, max: 5, label: "", color: "#8b5cf6", change1d: 0.08, suffix: "T", prefix: "$" },
  { name: "24h 总成交量",       en: "24h Volume",        value: 134.5, max: 500, label: "", color: "#0ea5e9", change1d: -12.3, suffix: "B", prefix: "$" },
  { name: "DeFi TVL",           en: "DeFi TVL",          value: 118.4, max: 300, label: "", color: "#ec4899", change1d: 2.1, suffix: "B", prefix: "$" },
  { name: "稳定币总量",         en: "Stablecoin Supply", value: 232.8, max: 400, label: "", color: "#64748b", change1d: 0.9, suffix: "B", prefix: "$" },
  { name: "NFT 7日交易量",      en: "NFT 7d Volume",     value: 312.4, max: 2000, label: "", color: "#f97316", change1d: -45.2, suffix: "M", prefix: "$" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Coin {
  id: string; symbol: string; name: string; image: string;
  current_price: number; market_cap: number; market_cap_rank: number;
  total_volume: number; price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h: number; price_change_percentage_7d_in_currency?: number;
  circulating_supply: number; sparkline_in_7d?: { price: number[] };
}

interface ChainRow { name: string; tvl: number; change_1d?: number; change_7d?: number; }
interface Protocol  { name: string; tvl: number; change_1d?: number; change_7d?: number; logo?: string; chain?: string; }

// ── Sidebar nav items ─────────────────────────────────────────────────────────

const NAV = [
  { key: "crypto",   zhLabel: "加密货币", enLabel: "Crypto",   icon: <BarChart2 className="w-4 h-4" /> },
  { key: "index",    zhLabel: "指数",     enLabel: "Indices",  icon: <Activity  className="w-4 h-4" /> },
  { key: "tvl",      zhLabel: "TVL",      enLabel: "TVL",      icon: <Layers    className="w-4 h-4" /> },
  { key: "etf",      zhLabel: "ETF",      enLabel: "ETF",      icon: <Briefcase className="w-4 h-4" /> },
  { key: "stocks",   zhLabel: "币股",     enLabel: "Stocks",   icon: <Building2 className="w-4 h-4" /> },
  { key: "unlocks",  zhLabel: "解锁",     enLabel: "Unlocks",  icon: <Lock      className="w-4 h-4" /> },
  { key: "smart",    zhLabel: "聪明钱",   enLabel: "Smart $",  icon: <Brain     className="w-4 h-4" /> },
] as const;

type NavKey = typeof NAV[number]["key"];

type SortDir = "asc" | "desc";

// ── Pct cell ─────────────────────────────────────────────────────────────────

function PctCell({ v, decimals = 2 }: { v?: number; decimals?: number }) {
  if (v === undefined || v === null) return <span className="text-muted-foreground">—</span>;
  const pos = v >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${pos ? "text-emerald-600" : "text-red-500"}`}>
      {pos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {Math.abs(v).toFixed(decimals)}%
    </span>
  );
}

// ── Section: Crypto list ──────────────────────────────────────────────────────

function CryptoSection({ zh }: { zh: boolean }) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFav, setShowFav] = useState(false);
  const [sortCol, setSortCol] = useState<string>("market_cap_rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const PER = 50;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=true&price_change_percentage=1h,24h,7d`
      );
      if (!res.ok) throw new Error("rate_limit");
      const data: Coin[] = await res.json();
      setCoins(data);
    } catch (e: any) {
      setError(e.message === "rate_limit" ? "rate_limit" : "network");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = [...coins]
    .filter(c => {
      if (showFav && !favorites.has(c.id)) return false;
      if (!search) return true;
      return c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      let av: number, bv: number;
      switch (sortCol) {
        case "price":     av = a.current_price; bv = b.current_price; break;
        case "1h":        av = a.price_change_percentage_1h_in_currency ?? 0; bv = b.price_change_percentage_1h_in_currency ?? 0; break;
        case "24h":       av = a.price_change_percentage_24h; bv = b.price_change_percentage_24h; break;
        case "7d":        av = a.price_change_percentage_7d_in_currency ?? 0; bv = b.price_change_percentage_7d_in_currency ?? 0; break;
        case "market_cap":av = a.market_cap; bv = b.market_cap; break;
        case "volume":    av = a.total_volume; bv = b.total_volume; break;
        default:          av = a.market_cap_rank; bv = b.market_cap_rank;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const paged = sorted.slice((page - 1) * PER, page * PER);
  const totalPages = Math.ceil(sorted.length / PER);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "market_cap_rank" ? "asc" : "desc"); }
  }

  function SortTh({ col, children }: { col: string; children: React.ReactNode }) {
    const active = sortCol === col;
    return (
      <th className={`px-3 py-2 text-right text-xs font-semibold cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors ${active ? "text-blue-600" : "text-muted-foreground"}`}
        onClick={() => toggleSort(col)}>
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
        </span>
      </th>
    );
  }

  if (error === "rate_limit") return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="text-4xl">⏱</div>
      <p className="font-semibold text-foreground">{zh ? "CoinGecko 接口限速中" : "CoinGecko Rate Limited"}</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        {zh ? "免费 API 短暂限速，请 1 分钟后刷新重试。" : "Free API rate limit reached. Please wait ~1 min and refresh."}
      </p>
      <button onClick={load} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
        {zh ? "重试" : "Retry"}
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={zh ? "搜索币种..." : "Search..."}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40" />
        </div>
        <button onClick={() => setShowFav(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all ${showFav ? "bg-amber-50 border-amber-300 text-amber-600 font-semibold" : "border-border bg-white text-muted-foreground hover:border-slate-400"}`}>
          <Star className="w-3.5 h-3.5" /> {zh ? "自选" : "Watchlist"}
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          {zh ? "数据来源：" : "Source: "}
          <a href="https://coingecko.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
            CoinGecko <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
              <th className="px-2 py-2 w-8" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("market_cap_rank")}>
                {zh ? "币种" : "Asset"}
              </th>
              <SortTh col="price">{zh ? "价格" : "Price"}</SortTh>
              <SortTh col="1h">1h %</SortTh>
              <SortTh col="24h">24h %</SortTh>
              <SortTh col="7d">7d %</SortTh>
              <SortTh col="market_cap">{zh ? "市值" : "Mkt Cap"}</SortTh>
              <SortTh col="volume">{zh ? "24h 量" : "24h Vol"}</SortTh>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                {zh ? "7日走势" : "7d Chart"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {loading
              ? Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-3"><Sk className="h-4 w-6" /></td>
                    <td className="px-2 py-3"><Sk className="h-4 w-4 rounded-full" /></td>
                    <td className="px-3 py-3"><div className="flex items-center gap-2"><Sk className="w-7 h-7 rounded-full" /><Sk className="h-4 w-24" /></div></td>
                    {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-3 py-3 text-right"><Sk className="h-4 w-16 ml-auto" /></td>)}
                    <td className="px-3 py-3 hidden xl:table-cell"><Sk className="h-8 w-20 ml-auto" /></td>
                  </tr>
                ))
              : paged.map((c, i) => {
                  const isFav = favorites.has(c.id);
                  const spk = c.sparkline_in_7d?.price ?? [];
                  const p24 = c.price_change_percentage_24h;
                  return (
                    <tr key={c.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums font-mono">{c.market_cap_rank}</td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => setFavorites(s => { const ns = new Set(s); if (ns.has(c.id)) ns.delete(c.id); else ns.add(c.id); return ns; })}>
                          <Star className={`w-3.5 h-3.5 transition-colors ${isFav ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-400"}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <img src={c.image} alt={c.name} className="w-7 h-7 rounded-full shrink-0 bg-slate-50" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div>
                            <span className="font-bold text-foreground">{c.symbol.toUpperCase()}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground hidden sm:inline">{c.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtPrice(c.current_price)}</td>
                      <td className="px-3 py-2.5 text-right"><PctCell v={c.price_change_percentage_1h_in_currency} /></td>
                      <td className="px-3 py-2.5 text-right"><PctCell v={c.price_change_percentage_24h} /></td>
                      <td className="px-3 py-2.5 text-right"><PctCell v={c.price_change_percentage_7d_in_currency} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtLarge(c.market_cap)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtLarge(c.total_volume)}</td>
                      <td className="px-3 py-2.5 text-right hidden xl:table-cell">
                        <Sparkline data={spk.slice(-28)} positive={p24 >= 0} w={80} h={32} />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-slate-50 disabled:opacity-40">
            {zh ? "上一页" : "Prev"}
          </button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-slate-50 disabled:opacity-40">
            {zh ? "下一页" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Section: Index ────────────────────────────────────────────────────────────

function IndexSection({ zh }: { zh: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {INDEX_DATA.map((idx, i) => {
        const barPct = Math.min(100, (idx.value / idx.max) * 100);
        const pos = idx.change1d >= 0;
        const displayVal = idx.prefix ? `${idx.prefix}${(idx.decimals ? idx.value : idx.value.toFixed(0))}${idx.suffix ?? ""}` : `${idx.value}${idx.suffix ?? ""}`;
        return (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-sm text-foreground">{zh ? idx.name : idx.en}</div>
                <div className="text-2xl font-extrabold text-foreground mt-1 tabular-nums">{displayVal}</div>
              </div>
              <div className={`text-right`}>
                <PctCell v={idx.change1d} />
                {idx.label && (
                  <div className="mt-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: idx.color + "22", color: idx.color }}>
                    {idx.label}
                  </div>
                )}
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: idx.color }} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 text-right">{barPct.toFixed(0)}% of range</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Section: TVL ──────────────────────────────────────────────────────────────

function TvlSection({ zh }: { zh: boolean }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [chains, setChains]       = useState<ChainRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"protocols" | "chains">("protocols");
  const [sortCol, setSortCol]     = useState("tvl");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");

  useEffect(() => {
    (async () => {
      const [pr, cr] = await Promise.allSettled([
        fetch("https://api.llama.fi/protocols").then(r => r.json()),
        fetch("https://api.llama.fi/v2/chains").then(r => r.json()),
      ]);
      if (pr.status === "fulfilled" && Array.isArray(pr.value))
        setProtocols(pr.value.filter((p: Protocol) => p.tvl > 1_000_000).slice(0, 100));
      if (cr.status === "fulfilled" && Array.isArray(cr.value))
        setChains(cr.value.filter((c: ChainRow) => c.tvl > 0).sort((a, b) => b.tvl - a.tvl).slice(0, 30));
      setLoading(false);
    })();
  }, []);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function SortTh({ col, children }: { col: string; children: React.ReactNode }) {
    const active = sortCol === col;
    return (
      <th className={`px-3 py-2 text-right text-xs font-semibold cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors ${active ? "text-blue-600" : "text-muted-foreground"}`}
        onClick={() => toggleSort(col)}>
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
        </span>
      </th>
    );
  }

  const totalChainTvl = chains.reduce((s, c) => s + c.tvl, 0);

  const sortedProtocols = [...protocols].sort((a, b) => {
    const av = sortCol === "1d" ? (a.change_1d ?? 0) : sortCol === "7d" ? (a.change_7d ?? 0) : a.tvl;
    const bv = sortCol === "1d" ? (b.change_1d ?? 0) : sortCol === "7d" ? (b.change_7d ?? 0) : b.tvl;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const sortedChains = [...chains].sort((a, b) => {
    const av = sortCol === "1d" ? (a.change_1d ?? 0) : sortCol === "7d" ? (a.change_7d ?? 0) : a.tvl;
    const bv = sortCol === "1d" ? (b.change_1d ?? 0) : sortCol === "7d" ? (b.change_7d ?? 0) : b.tvl;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["protocols", "chains"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all ${view === v ? "bg-slate-800 text-white border-slate-800" : "border-border bg-white text-muted-foreground hover:border-slate-400"}`}>
            {v === "protocols" ? (zh ? "协议" : "Protocols") : (zh ? "公链" : "Chains")}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          <a href="https://defillama.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
            DefiLlama <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                {view === "protocols" ? (zh ? "协议" : "Protocol") : (zh ? "公链" : "Chain")}
              </th>
              <SortTh col="tvl">TVL</SortTh>
              <SortTh col="1d">24h %</SortTh>
              <SortTh col="7d">7d %</SortTh>
              {view === "chains" && (
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{zh ? "占比" : "Share"}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {loading
              ? Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i}><td className="px-3 py-3"><Sk className="h-4 w-6" /></td><td className="px-3 py-3"><Sk className="h-5 w-32" /></td>{Array.from({length:3}).map((_,j)=><td key={j} className="px-3 py-3 text-right"><Sk className="h-4 w-20 ml-auto" /></td>)}</tr>
                ))
              : view === "protocols"
              ? sortedProtocols.map((p, i) => (
                  <tr key={p.name} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {p.logo
                          ? <img src={p.logo} alt={p.name} className="w-6 h-6 rounded-full bg-slate-50 border border-border/30" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: cc(p.chain ?? "") }}>{p.name.charAt(0)}</div>
                        }
                        <span className="font-semibold text-foreground">{p.name}</span>
                        {p.chain && <span className="text-[10px] px-1.5 py-0.5 rounded-full hidden sm:inline" style={{ background: cc(p.chain) + "22", color: cc(p.chain) }}>{p.chain}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtLarge(p.tvl)}</td>
                    <td className="px-3 py-2.5 text-right"><PctCell v={p.change_1d} /></td>
                    <td className="px-3 py-2.5 text-right"><PctCell v={p.change_7d} /></td>
                  </tr>
                ))
              : sortedChains.map((c, i) => (
                  <tr key={c.name} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cc(c.name) }} />
                        <span className="font-semibold text-foreground">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtLarge(c.tvl)}</td>
                    <td className="px-3 py-2.5 text-right"><PctCell v={c.change_1d} /></td>
                    <td className="px-3 py-2.5 text-right"><PctCell v={c.change_7d} /></td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums text-xs">
                      {((c.tvl / totalChainTvl) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: ETF ──────────────────────────────────────────────────────────────

function EtfSection({ zh }: { zh: boolean }) {
  const totalAum   = ETF_DATA.reduce((s, e) => s + e.aum, 0);
  const totalFlow  = ETF_DATA.reduce((s, e) => s + e.flow1d, 0);
  const totalBtc   = ETF_DATA.reduce((s, e) => s + e.btcHeld, 0);

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: zh ? "总管理规模" : "Total AUM", value: fmtLarge(totalAum), color: "#3b82f6" },
          { label: zh ? "今日净流入" : "Today Net Flow", value: `${totalFlow >= 0 ? "+" : ""}${fmtLarge(Math.abs(totalFlow))}`, color: totalFlow >= 0 ? "#10b981" : "#ef4444" },
          { label: zh ? "总 BTC 持有量" : "Total BTC Held", value: totalBtc.toLocaleString(), color: "#F7931A" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className="text-xl font-extrabold tabular-nums" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              {[zh ? "基金" : "Fund", zh ? "代码" : "Ticker", zh ? "发行方" : "Issuer", "AUM", zh ? "今日流量" : "Today Flow", zh ? "7日流量" : "7d Flow", zh ? "BTC持有" : "BTC Held"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i < 3 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {ETF_DATA.map((e, i) => (
              <tr key={e.ticker} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-3 py-2.5 font-semibold text-foreground">{e.name}</td>
                <td className="px-3 py-2.5"><span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">{e.ticker}</span></td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.issuer}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmtLarge(e.aum)}</td>
                <td className="px-3 py-2.5 text-right"><span className={`font-semibold tabular-nums ${e.flow1d >= 0 ? "text-emerald-600" : "text-red-500"}`}>{e.flow1d >= 0 ? "+" : ""}{fmtLarge(Math.abs(e.flow1d))}</span></td>
                <td className="px-3 py-2.5 text-right"><span className={`font-semibold tabular-nums ${e.flow7d >= 0 ? "text-emerald-600" : "text-red-500"}`}>{e.flow7d >= 0 ? "+" : ""}{fmtLarge(Math.abs(e.flow7d))}</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{e.btcHeld.toLocaleString()} ₿</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground px-1">{zh ? "⚠️ 模拟数据，仅供产品展示。实际数据接入需对接 Bloomberg / Farside Investors 等渠道。" : "⚠️ Demo data for product display only. Real data requires Bloomberg / Farside Investors integration."}</p>
    </div>
  );
}

// ── Section: Stocks ───────────────────────────────────────────────────────────

function StocksSection({ zh }: { zh: boolean }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              {["#", zh ? "股票" : "Stock", zh ? "当前价" : "Price", "24h %", "7d %", zh ? "市值" : "Mkt Cap", zh ? "BTC 持仓" : "BTC Held"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {STOCK_DATA.map((s, i) => (
              <tr key={s.ticker} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-extrabold text-white shrink-0">{s.ticker.slice(0, 2)}</div>
                    <div>
                      <div className="font-bold text-foreground">{s.ticker}</div>
                      <div className="text-xs text-muted-foreground">{s.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">${s.price.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right"><PctCell v={s.change1d} /></td>
                <td className="px-3 py-2.5 text-right"><PctCell v={s.change7d} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtLarge(s.mktCap)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{s.btcHeld > 0 ? s.btcHeld.toLocaleString() + " ₿" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground px-1">{zh ? "⚠️ 模拟数据，仅供产品展示。" : "⚠️ Demo data for product display only."}</p>
    </div>
  );
}

// ── Section: Unlocks ──────────────────────────────────────────────────────────

function UnlocksSection({ zh }: { zh: boolean }) {
  const totalUsd = UNLOCK_DATA.reduce((s, u) => s + u.usd, 0);
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700">
        {zh ? `📅 未来 30 天合计解锁：${fmtLarge(totalUsd)}（模拟数据）` : `📅 Next 30d total unlocks: ${fmtLarge(totalUsd)} (Demo data)`}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              {[zh ? "代币" : "Token", zh ? "解锁日期" : "Date", zh ? "解锁数量" : "Amount", zh ? "等值 USD" : "USD Value", zh ? "占流通比" : "% Supply", zh ? "风险" : "Risk"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {UNLOCK_DATA.map((u, i) => {
              const rc = u.risk === "high" ? "text-red-500 bg-red-50" : u.risk === "medium" ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50";
              const rl = u.risk === "high" ? (zh ? "高风险" : "High") : u.risk === "medium" ? (zh ? "中等" : "Med") : (zh ? "低" : "Low");
              return (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-bold text-foreground">{u.token}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{u.date}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{u.amount.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmtLarge(u.usd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{u.pctSupply}%</td>
                  <td className="px-3 py-2.5 text-right"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rc}`}>{rl}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Smart Money ──────────────────────────────────────────────────────

function SmartSection({ zh }: { zh: boolean }) {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-xs text-amber-700">
        {zh ? "⚠️ 以下为演示数据。接入 Arkham Intelligence 实时链上归因 API（付费）后可获取真实数据。" : "⚠️ Demo data. Real data requires Arkham Intelligence API (paid)."}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              {[zh ? "标签" : "Label", zh ? "地址" : "Address", zh ? "代币" : "Token", zh ? "行为" : "Action", zh ? "24h 流量" : "24h Flow", zh ? "变化%" : "Chg%", zh ? "交易笔数" : "Txns"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {SMART_MONEY.map((w, i) => {
              const pos = w.flow >= 0;
              return (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-foreground">{w.label}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{fmtAddr(w.wallet)}</td>
                  <td className="px-3 py-2.5 text-right"><span className="font-mono font-bold text-xs bg-slate-100 px-1.5 py-0.5 rounded">{w.token}</span></td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pos ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                      {pos ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${pos ? "text-emerald-600" : "text-red-500"}`}>
                    {pos ? "+" : ""}{fmtLarge(Math.abs(w.flow))}
                  </td>
                  <td className="px-3 py-2.5 text-right"><PctCell v={w.pct} /></td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{w.txns}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnchainPage() {
  const { lang } = useLang();
  const zh = lang === "zh-CN";
  const [active, setActive] = useState<NavKey>("crypto");

  const current = NAV.find(n => n.key === active)!;

  return (
    <div className="flex gap-0 min-h-[calc(100vh-140px)] -mx-4 sm:-mx-6 lg:-mx-8">

      {/* ── Left sidebar ── */}
      <aside className="w-14 sm:w-44 shrink-0 border-r border-border/60 bg-white">
        <div className="sticky top-0 pt-4 pb-6">
          {/* Header */}
          <div className="hidden sm:block px-4 mb-4">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              {zh ? "链上数据中心" : "On-chain Hub"}
            </p>
          </div>

          <nav className="space-y-0.5 px-2">
            {NAV.map(item => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`w-full flex items-center gap-3 px-2 sm:px-3 py-2.5 rounded-xl text-sm transition-all font-medium ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="hidden sm:inline truncate">{zh ? item.zhLabel : item.enLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-4 space-y-4">
        {/* Section title + refresh */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">
              {zh ? current.zhLabel : current.enLabel}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {active === "crypto"  && (zh ? "实时行情 · CoinGecko" : "Live prices · CoinGecko")}
              {active === "index"   && (zh ? "市场情绪与关键指数" : "Market sentiment & key indices")}
              {active === "tvl"     && (zh ? "链上流动性 · DefiLlama" : "On-chain liquidity · DefiLlama")}
              {active === "etf"     && (zh ? "现货 BTC ETF 资金流向" : "Spot BTC ETF fund flows")}
              {active === "stocks"  && (zh ? "加密相关上市公司" : "Crypto-related public companies")}
              {active === "unlocks" && (zh ? "大额代币解锁预警" : "Major token unlock alerts")}
              {active === "smart"   && (zh ? "巨鲸链上动向追踪" : "On-chain whale activity")}
            </p>
          </div>
        </div>

        {/* Section content */}
        {active === "crypto"  && <CryptoSection  zh={zh} />}
        {active === "index"   && <IndexSection   zh={zh} />}
        {active === "tvl"     && <TvlSection     zh={zh} />}
        {active === "etf"     && <EtfSection     zh={zh} />}
        {active === "stocks"  && <StocksSection  zh={zh} />}
        {active === "unlocks" && <UnlocksSection zh={zh} />}
        {active === "smart"   && <SmartSection   zh={zh} />}
      </main>
    </div>
  );
}
