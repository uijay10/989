import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { TrendingUp, TrendingDown, RefreshCw, ExternalLink, Zap, Activity, DollarSign, Users, Filter, ChevronDown } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(n: number) {
  const pos = n >= 0;
  return { pos, label: `${pos ? "+" : ""}${n.toFixed(2)}%` };
}

function fmtAddr(s: string) {
  return s.slice(0, 6) + "…" + s.slice(-4);
}

// ── Mini Sparkline ────────────────────────────────────────────────────────────

function Sparkline({ data, positive, w = 80, h = 32 }: { data: number[]; positive: boolean; w?: number; h?: number }) {
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const color = positive ? "#10b981" : "#ef4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Chain color map ───────────────────────────────────────────────────────────

const CHAIN_COLOR: Record<string, string> = {
  Ethereum: "#627EEA", BSC: "#F3BA2F", Solana: "#9945FF",
  Arbitrum: "#1D4ED8", Polygon: "#8247E5", Tron: "#EF4444",
  Avalanche: "#E84142", Base: "#0052FF", Sui: "#6FBCF0",
  Optimism: "#FF0420", Aptos: "#00B5AD", Blast: "#FCFC03",
  Fantom: "#1969FF", Mantle: "#60EE9A", Scroll: "#FFEEDA",
};

function chainColor(name: string) {
  return CHAIN_COLOR[name] ?? "#94a3b8";
}

// ── Smart money mock ──────────────────────────────────────────────────────────

const SMART_MONEY = [
  { wallet: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", label: "Binance 14", flow: 8_420_000, token: "ETH", action: "accumulating", change: 12.4 },
  { wallet: "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8", label: "Binance 7",  flow: 5_710_000, token: "SOL", action: "accumulating", change: 9.1 },
  { wallet: "0x742d35Cc6634C0532925a3b8D4C9b4e5b0e7c1B5", label: "Whale 0x742", flow: 3_990_000, token: "ARB", action: "accumulating", change: 22.6 },
  { wallet: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3", label: "Binance 8",  flow: -2_880_000, token: "BNB", action: "distributing", change: -6.3 },
  { wallet: "0xF977814e90dA44bFA03b6295A0616a897441aceE", label: "Binance 6",  flow: 2_340_000, token: "SUI", action: "accumulating", change: 31.5 },
];

// ── Unlock calendar mock ──────────────────────────────────────────────────────

const UNLOCKS = [
  { token: "SUI",   amount: 64_000_000,  usd: 73_000_000,  date: "2025-06-01", risk: "high"   },
  { token: "APT",   amount: 11_300_000,  usd: 56_000_000,  date: "2025-06-05", risk: "medium" },
  { token: "ARB",   amount: 92_000_000,  usd: 49_000_000,  date: "2025-06-08", risk: "high"   },
  { token: "OP",    amount: 31_400_000,  usd: 28_000_000,  date: "2025-06-12", risk: "medium" },
  { token: "BLUR",  amount: 128_000_000, usd: 14_000_000,  date: "2025-06-15", risk: "low"    },
  { token: "STRK",  amount: 64_000_000,  usd: 19_200_000,  date: "2025-06-18", risk: "medium" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChainTvl { name: string; tvl: number; change_1d?: number; change_7d?: number; }
interface Protocol  { name: string; tvl: number; change_1d?: number; change_7d?: number; logo?: string; chain?: string; tvlHistory?: number[]; }
interface GlobalStat { totalLiquidityUSD: number; }

// ── Sort options ──────────────────────────────────────────────────────────────

type SortKey = "tvl" | "1d" | "7d";

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnchainPage() {
  const { lang } = useLang();
  const zh = lang === "zh-CN";

  const [chains, setChains]       = useState<ChainTvl[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [globalTvl, setGlobalTvl] = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey]     = useState<SortKey>("tvl");
  const [filterChain, setFilterChain] = useState("All");
  const [activeTab, setActiveTab] = useState<"protocols" | "chains" | "smart" | "unlocks">("protocols");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [chainsRes, protocolsRes, globalRes] = await Promise.allSettled([
        fetch("https://api.llama.fi/v2/chains").then(r => r.json()),
        fetch("https://api.llama.fi/protocols").then(r => r.json()),
        fetch("https://api.llama.fi/v2/historicalChainTvl").then(r => r.json()),
      ]);

      if (chainsRes.status === "fulfilled" && Array.isArray(chainsRes.value)) {
        const sorted = (chainsRes.value as ChainTvl[])
          .filter(c => c.tvl > 0)
          .sort((a, b) => b.tvl - a.tvl)
          .slice(0, 20);
        setChains(sorted);
      }

      if (protocolsRes.status === "fulfilled" && Array.isArray(protocolsRes.value)) {
        const sorted = (protocolsRes.value as Protocol[])
          .filter(p => p.tvl > 1_000_000)
          .sort((a, b) => b.tvl - a.tvl)
          .slice(0, 50);
        setProtocols(sorted);
      }

      if (globalRes.status === "fulfilled" && Array.isArray(globalRes.value) && globalRes.value.length > 0) {
        const arr = globalRes.value as { totalLiquidityUSD: number }[];
        setGlobalTvl(arr[arr.length - 1]?.totalLiquidityUSD ?? null);
      }

      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalChainTvl = chains.reduce((s, c) => s + c.tvl, 0);
  const chain1dChange = chains.length
    ? chains.slice(0, 5).reduce((s, c) => s + (c.change_1d ?? 0), 0) / 5
    : 0;

  // Unique chains for filter
  const chainOptions = ["All", ...Array.from(new Set(protocols.map(p => p.chain ?? "").filter(Boolean))).slice(0, 12)];

  const sortedProtocols = [...protocols]
    .filter(p => filterChain === "All" || p.chain === filterChain)
    .sort((a, b) => {
      if (sortKey === "tvl") return b.tvl - a.tvl;
      if (sortKey === "1d")  return (b.change_1d ?? 0) - (a.change_1d ?? 0);
      return (b.change_7d ?? 0) - (a.change_7d ?? 0);
    })
    .slice(0, 24);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 pb-10 space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            {zh ? "链上数据中心" : "On-chain Data Hub"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {zh ? "实时更新 · 数据来源：DefiLlama" : "Live · Powered by DefiLlama"}
            {lastUpdated && (
              <span className="ml-2 text-xs">· {zh ? "更新于" : "Updated"} {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-white border border-border hover:bg-slate-50 text-muted-foreground transition-all disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <DollarSign className="w-5 h-5" />,
            label: zh ? "全链 TVL" : "Total TVL",
            value: loading ? null : fmt(globalTvl ?? totalChainTvl),
            change: chain1dChange,
            color: "from-blue-500 to-blue-600",
          },
          {
            icon: <Activity className="w-5 h-5" />,
            label: zh ? "TVL 24h 涨幅" : "TVL 24h Δ",
            value: loading ? null : `${chain1dChange >= 0 ? "+" : ""}${chain1dChange.toFixed(2)}%`,
            change: chain1dChange,
            color: chain1dChange >= 0 ? "from-emerald-500 to-emerald-600" : "from-red-500 to-red-600",
          },
          {
            icon: <TrendingUp className="w-5 h-5" />,
            label: zh ? "追踪公链数" : "Tracked Chains",
            value: loading ? null : `${chains.length}`,
            change: 0,
            color: "from-violet-500 to-violet-600",
          },
          {
            icon: <Zap className="w-5 h-5" />,
            label: zh ? "追踪协议数" : "Protocols",
            value: loading ? null : `${protocols.length}+`,
            change: 0,
            color: "from-amber-500 to-amber-600",
          },
        ].map((card, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl bg-white border border-border/60 shadow-sm p-4">
            <div className={`absolute inset-0 opacity-[0.06] bg-gradient-to-br ${card.color}`} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.color} text-white`}>
                  {card.icon}
                </div>
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              {card.value === null ? (
                <Skeleton className="h-7 w-24 mt-1" />
              ) : (
                <div className="text-xl font-extrabold text-foreground tracking-tight">{card.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 bg-slate-100/80 rounded-2xl p-1 w-fit">
        {([
          { key: "protocols", label: zh ? "🏛 协议 TVL" : "🏛 Protocol TVL" },
          { key: "chains",    label: zh ? "⛓ 公链排行" : "⛓ Chains" },
          { key: "smart",     label: zh ? "🧠 聪明钱" : "🧠 Smart Money" },
          { key: "unlocks",   label: zh ? "🔓 代币解锁" : "🔓 Unlocks" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Protocol TVL tab ── */}
      {activeTab === "protocols" && (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort */}
            <div className="flex items-center gap-1 bg-white border border-border rounded-xl p-1">
              {(["tvl", "1d", "7d"] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    sortKey === k ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "tvl" ? "TVL" : k === "1d" ? "24h %" : "7d %"}
                </button>
              ))}
            </div>
            {/* Chain filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chainOptions.slice(0, 8).map(c => (
                <button
                  key={c}
                  onClick={() => setFilterChain(c)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    filterChain === c
                      ? "bg-slate-800 text-white"
                      : "bg-white border border-border text-muted-foreground hover:border-slate-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Protocol grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedProtocols.map((p, i) => {
                const c1d = pct(p.change_1d ?? 0);
                const c7d = pct(p.change_7d ?? 0);
                const mockHistory = Array.from({ length: 14 }, (_, j) =>
                  p.tvl * (0.85 + Math.random() * 0.3 + j * 0.005)
                );
                return (
                  <div key={p.name}
                    className="relative bg-white border border-border/60 rounded-2xl p-4 hover:shadow-md hover:border-blue-200 transition-all group">
                    {/* Rank badge */}
                    <span className="absolute top-3 right-3 text-[10px] font-bold text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded-full">
                      #{i + 1}
                    </span>
                    <div className="flex items-start gap-3">
                      {p.logo ? (
                        <img src={p.logo} alt={p.name} className="w-8 h-8 rounded-full shrink-0 object-contain bg-slate-50 border border-border/40" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
                          style={{ background: chainColor(p.chain ?? "") }}>
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-foreground truncate">{p.name}</span>
                          {p.chain && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: chainColor(p.chain) + "22", color: chainColor(p.chain) }}>
                              {p.chain}
                            </span>
                          )}
                        </div>
                        <div className="text-lg font-extrabold text-foreground mt-0.5">{fmt(p.tvl)}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-xs font-semibold flex items-center gap-0.5 ${c1d.pos ? "text-emerald-600" : "text-red-500"}`}>
                            {c1d.pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {c1d.label}
                          </span>
                          <span className={`text-xs text-muted-foreground`}>
                            7d {c7d.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Sparkline data={mockHistory} positive={c1d.pos} w={200} h={36} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* DefiLlama attribution */}
          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
            <span>{zh ? "数据来源" : "Data from"}</span>
            <a href="https://defillama.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:underline font-medium">
              DefiLlama <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* ── Chain TVL tab ── */}
      {activeTab === "chains" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{zh ? "按 TVL 总量排序，Top 20 公链" : "Top 20 chains by TVL"}</p>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {chains.map((c, i) => {
                const c1d = pct(c.change_1d ?? 0);
                const barPct = (c.tvl / (chains[0]?.tvl || 1)) * 100;
                return (
                  <div key={c.name} className="bg-white border border-border/60 rounded-2xl p-4 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-xs font-bold text-muted-foreground text-right">#{i + 1}</span>
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: chainColor(c.name) }} />
                        <span className="font-bold text-sm text-foreground">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-sm text-foreground">{fmt(c.tvl)}</span>
                        <span className={`text-xs font-semibold ${c1d.pos ? "text-emerald-600" : "text-red-500"}`}>
                          {c1d.label}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${barPct}%`, background: chainColor(c.name) }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {((c.tvl / totalChainTvl) * 100).toFixed(1)}% {zh ? "市场占比" : "market share"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Smart Money tab ── */}
      {activeTab === "smart" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-semibold text-muted-foreground">{zh ? "24h 聪明钱流向 Top 5" : "Top 5 Smart Money Flows (24h)"}</span>
            <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">
              {zh ? "模拟数据 · 仅供参考" : "Demo data · Reference only"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SMART_MONEY.map((w, i) => {
              const pos = w.flow >= 0;
              return (
                <div key={i} className={`bg-white border rounded-2xl p-4 hover:shadow-md transition-all ${pos ? "border-emerald-200 hover:border-emerald-300" : "border-red-200 hover:border-red-300"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${pos ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="text-xs font-bold text-foreground">{w.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${pos ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                          {pos ? (zh ? "买入" : "Buy") : (zh ? "卖出" : "Sell")}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{fmtAddr(w.wallet)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-base font-extrabold ${pos ? "text-emerald-600" : "text-red-500"}`}>
                        {pos ? "+" : ""}{fmt(Math.abs(w.flow))}
                      </div>
                      <div className="text-xs text-muted-foreground">{w.token}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pos ? "bg-emerald-400" : "bg-red-400"}`}
                      style={{ width: `${Math.min(100, Math.abs(w.change) * 3)}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{w.action}</span>
                    <span className={`text-[10px] font-semibold ${pos ? "text-emerald-600" : "text-red-500"}`}>
                      {pos ? "+" : ""}{w.change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-700">
            <p className="font-semibold mb-1">💡 {zh ? "关于聪明钱数据" : "About Smart Money Data"}</p>
            <p className="text-xs leading-relaxed">
              {zh
                ? "接入 Arkham Intelligence 实时链上归因数据需要 API Key（付费）。以上为演示数据，展示真实产品形态。接入后可追踪交易所冷热钱包、标记 VC 地址、鲸鱼仓位变化等。"
                : "Real-time smart money data via Arkham Intelligence requires a paid API key. The above is demo data showing the intended product layout. With integration, you can track exchange wallets, labeled VC addresses, and whale position changes."}
            </p>
            <a href="https://platform.arkhamintelligence.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline">
              Arkham Intelligence <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* ── Token Unlocks tab ── */}
      {activeTab === "unlocks" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-semibold text-muted-foreground">{zh ? "未来 30 天大额解锁日历" : "Upcoming Major Token Unlocks (30d)"}</span>
            <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">
              {zh ? "模拟数据 · 仅供参考" : "Demo data · Reference only"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {UNLOCKS.map((u, i) => {
              const riskColor = u.risk === "high" ? { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-600", bar: "bg-red-400" }
                : u.risk === "medium" ? { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-600", bar: "bg-amber-400" }
                : { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-600", bar: "bg-emerald-400" };
              return (
                <div key={i} className={`${riskColor.bg} border ${riskColor.border} rounded-2xl p-4 hover:shadow-md transition-all`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-white border border-border/40 flex items-center justify-center text-sm font-extrabold text-foreground">
                        {u.token.charAt(0)}
                      </span>
                      <div>
                        <div className="font-bold text-sm text-foreground">{u.token}</div>
                        <div className="text-[10px] text-muted-foreground">{u.date}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-sm text-foreground">{fmt(u.usd)}</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${riskColor.badge}`}>
                        {u.risk === "high" ? (zh ? "高风险" : "High Risk") : u.risk === "medium" ? (zh ? "中等" : "Medium") : (zh ? "低风险" : "Low Risk")}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.amount.toLocaleString()} {u.token} · {fmt(u.usd)} {zh ? "等值" : "equivalent"}
                  </div>
                  <div className="mt-2 h-1 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${riskColor.bar}`} style={{ width: `${Math.min(100, (u.usd / 80_000_000) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl bg-blue-50 border border-blue-200 px-5 py-4 text-sm text-blue-700">
            <p className="font-semibold mb-1">💡 {zh ? "关于解锁数据" : "About Unlock Data"}</p>
            <p className="text-xs leading-relaxed">
              {zh
                ? "完整解锁日历数据来源：TokenUnlocks.app / Dune Analytics。接入后可实时推送大额解锁预警。"
                : "Full unlock calendar data from TokenUnlocks.app / Dune Analytics. Integration enables real-time unlock alerts."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
