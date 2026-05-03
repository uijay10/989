import { useState, useEffect, useCallback, useRef } from "react";
import { useLang } from "@/lib/i18n";
import { useSearch } from "wouter";
import {
  TrendingUp, TrendingDown, RefreshCw, ExternalLink, Star, Search,
  BarChart2, Layers, Briefcase, Building2, Lock, Brain, Activity,
  ChevronUp, ChevronDown, Globe, Zap, Timer, ArrowLeftRight, AlertTriangle,
  ShieldAlert, Flame, CircleDot, Gauge, Anchor, Link2, Rocket,
  LayoutGrid, Cpu, Server, History, Tag, Trophy
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

// 解锁数据：覆盖市值≥5亿美元主流代币，未来30天滚动窗口（动态日期）
const _unlockDate = (daysFromToday: number): string => {
  const d = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const UNLOCK_DATA = [
  // ── L1 / L2 主流（市值 $1B+）─────────────────────────────────────────────────
  { token: "SUI",     mcap: 12_400_000_000, amount:  64_000_000, usd: 240_000_000, date: _unlockDate( 1), pctSupply: 1.42, risk: "high"   as const },
  { token: "APT",     mcap:  4_800_000_000, amount:  11_300_000, usd:  98_000_000, date: _unlockDate( 2), pctSupply: 1.74, risk: "high"   as const },
  { token: "TIA",     mcap:  2_100_000_000, amount:  17_900_000, usd: 138_000_000, date: _unlockDate( 3), pctSupply: 4.79, risk: "high"   as const },
  { token: "ARB",     mcap:  4_200_000_000, amount:  92_700_000, usd:  92_000_000, date: _unlockDate( 4), pctSupply: 2.10, risk: "high"   as const },
  { token: "AVAX",    mcap: 13_800_000_000, amount:   9_540_000, usd: 286_000_000, date: _unlockDate( 5), pctSupply: 0.69, risk: "medium" as const },
  { token: "OP",      mcap:  3_100_000_000, amount:  31_400_000, usd:  78_000_000, date: _unlockDate( 6), pctSupply: 2.51, risk: "high"   as const },
  { token: "SEI",     mcap:  2_400_000_000, amount:  62_000_000, usd:  46_000_000, date: _unlockDate( 7), pctSupply: 2.40, risk: "medium" as const },
  { token: "INJ",     mcap:  2_800_000_000, amount:   3_680_000, usd: 102_000_000, date: _unlockDate( 8), pctSupply: 3.65, risk: "high"   as const },
  { token: "ONDO",    mcap:  2_900_000_000, amount: 134_000_000, usd: 172_000_000, date: _unlockDate( 9), pctSupply: 8.50, risk: "high"   as const },
  { token: "JUP",     mcap:  1_900_000_000, amount: 128_000_000, usd:  82_000_000, date: _unlockDate(10), pctSupply: 4.40, risk: "high"   as const },
  // ── 主流 DeFi / Infra（$1B+）──────────────────────────────────────────────────
  { token: "ENA",     mcap:  1_700_000_000, amount: 171_000_000, usd:  87_000_000, date: _unlockDate(11), pctSupply: 5.70, risk: "high"   as const },
  { token: "PYTH",    mcap:  1_600_000_000, amount: 213_000_000, usd:  93_000_000, date: _unlockDate(12), pctSupply: 5.91, risk: "high"   as const },
  { token: "JTO",     mcap:  1_300_000_000, amount:  18_500_000, usd:  46_000_000, date: _unlockDate(13), pctSupply: 1.85, risk: "medium" as const },
  { token: "FIL",     mcap:  2_700_000_000, amount:   3_240_000, usd:  14_000_000, date: _unlockDate(14), pctSupply: 0.49, risk: "low"    as const },
  { token: "NEAR",    mcap:  4_600_000_000, amount:  10_240_000, usd:  44_000_000, date: _unlockDate(15), pctSupply: 0.85, risk: "low"    as const },
  { token: "STRK",    mcap:    920_000_000, amount:  64_000_000, usd:  22_000_000, date: _unlockDate(16), pctSupply: 2.31, risk: "medium" as const },
  { token: "IMX",     mcap:  1_400_000_000, amount:  24_900_000, usd:  29_000_000, date: _unlockDate(17), pctSupply: 1.42, risk: "medium" as const },
  { token: "LDO",     mcap:  1_800_000_000, amount:   3_400_000, usd:   7_800_000, date: _unlockDate(18), pctSupply: 0.34, risk: "low"    as const },
  { token: "AAVE",    mcap:  2_100_000_000, amount:     280_000, usd:  41_000_000, date: _unlockDate(19), pctSupply: 0.18, risk: "low"    as const },
  // ── 后起之秀 & L2（$500M+）────────────────────────────────────────────────────
  { token: "ZK",      mcap:    680_000_000, amount: 220_000_000, usd:  32_000_000, date: _unlockDate(20), pctSupply: 5.51, risk: "high"   as const },
  { token: "W",       mcap:    810_000_000, amount: 174_500_000, usd:  48_000_000, date: _unlockDate(21), pctSupply: 5.82, risk: "high"   as const },
  { token: "DYM",     mcap:    560_000_000, amount:  17_400_000, usd:  18_000_000, date: _unlockDate(22), pctSupply: 5.77, risk: "high"   as const },
  { token: "ALT",     mcap:    520_000_000, amount:  62_500_000, usd:  14_600_000, date: _unlockDate(23), pctSupply: 5.75, risk: "high"   as const },
  { token: "MANTA",   mcap:    580_000_000, amount:  25_400_000, usd:  16_200_000, date: _unlockDate(24), pctSupply: 6.10, risk: "medium" as const },
  { token: "ZRO",     mcap:    920_000_000, amount:   8_240_000, usd:  31_000_000, date: _unlockDate(25), pctSupply: 1.78, risk: "medium" as const },
  { token: "IO",      mcap:    540_000_000, amount:   4_960_000, usd:  12_000_000, date: _unlockDate(26), pctSupply: 4.00, risk: "medium" as const },
  { token: "BLUR",    mcap:    620_000_000, amount: 102_000_000, usd:  18_300_000, date: _unlockDate(27), pctSupply: 3.40, risk: "medium" as const },
  { token: "CYBER",   mcap:    510_000_000, amount:   2_400_000, usd:   8_400_000, date: _unlockDate(28), pctSupply: 4.80, risk: "medium" as const },
  { token: "ETHFI",   mcap:    690_000_000, amount:   8_600_000, usd:  21_000_000, date: _unlockDate(29), pctSupply: 2.69, risk: "medium" as const },
  { token: "REZ",     mcap:    540_000_000, amount:  43_500_000, usd:  17_400_000, date: _unlockDate(30), pctSupply: 4.35, risk: "medium" as const },
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

const GAS_DATA = {
  eth: { slow: 8, normal: 13, fast: 21, baseFee: 9.4, priority: 2.1 },
  btc: { slow: 3, normal: 8, fast: 18, mempoolMB: 142, nextBlockMin: 7, feeUsdLow: 0.42, feeUsdMid: 1.12, feeUsdHigh: 2.52 },
  l2: [
    { chain: "Arbitrum",  fee: 0.008, feeUsd: 0.02, color: "#1D4ED8", change: -12 },
    { chain: "Optimism",  fee: 0.012, feeUsd: 0.03, color: "#FF0420", change: -8  },
    { chain: "Base",      fee: 0.006, feeUsd: 0.01, color: "#0052FF", change: -15 },
    { chain: "Polygon",   fee: 28,    feeUsd: 0.08, color: "#8247E5", change: 4   },
    { chain: "zkSync",    fee: 0.009, feeUsd: 0.02, color: "#6E56CA", change: -6  },
    { chain: "Starknet",  fee: 0.004, feeUsd: 0.01, color: "#EC796B", change: -22 },
    { chain: "Scroll",    fee: 0.010, feeUsd: 0.03, color: "#FFCB4A", change: -9  },
  ],
  hourly: [12,14,11,9,8,9,14,18,24,28,26,22,19,17,18,20,19,22,25,22,18,16,14,13],
  bestWindow: "02:00–05:00 UTC",
  bestDays: ["Tue","Wed","Thu"],
};

const WHALE_DATA = [
  { rank: 1, label: "Satoshi (est.)",    address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf", btc: 1_100_000, usd: 104_500_000_000, change30d:        0, pct: 5.24, status: "dormant"  },
  { rank: 2, label: "BlackRock IBIT",    address: "ETF Custody",                      btc:   573_520, usd:  54_500_000_000, change30d:   28_000, pct: 2.73, status: "active"   },
  { rank: 3, label: "MicroStrategy",     address: "Multi-wallet",                     btc:   214_400, usd:  20_400_000_000, change30d:   22_000, pct: 1.02, status: "buying"   },
  { rank: 4, label: "Binance Cold",      address: "34xp4vRoCGJym3xR",                btc:   248_597, usd:  23_600_000_000, change30d:  -12_400, pct: 1.18, status: "selling"  },
  { rank: 5, label: "Fidelity FBTC",     address: "ETF Custody",                      btc:   201_350, usd:  19_100_000_000, change30d:    8_400, pct: 0.96, status: "buying"   },
  { rank: 6, label: "Coinbase Custody",  address: "Multi-wallet",                     btc:   152_000, usd:  14_400_000_000, change30d:   -5_200, pct: 0.72, status: "selling"  },
  { rank: 7, label: "Bitfinex",          address: "bc1qazcm7…",                       btc:   177_848, usd:  16_900_000_000, change30d:    3_200, pct: 0.85, status: "active"   },
  { rank: 8, label: "Kraken",            address: "Multi-wallet",                     btc:   108_000, usd:  10_300_000_000, change30d:    1_200, pct: 0.51, status: "active"   },
];

const DERIV_DATA = {
  futures: [
    { exchange: "Binance",     oi: 12_800_000_000, oiChange: 4.2,   funding: 0.0103,  vol24h: 28_400_000_000, liqLong: 124_000_000, liqShort: 58_000_000  },
    { exchange: "Bybit",       oi:  8_200_000_000, oiChange: 2.8,   funding: 0.0091,  vol24h: 15_200_000_000, liqLong:  87_000_000, liqShort: 42_000_000  },
    { exchange: "OKX",         oi:  5_600_000_000, oiChange: -1.4,  funding: 0.0088,  vol24h:  9_800_000_000, liqLong:  45_000_000, liqShort: 31_000_000  },
    { exchange: "Hyperliquid", oi:  2_800_000_000, oiChange: 12.4,  funding: 0.0115,  vol24h:  4_200_000_000, liqLong:  23_000_000, liqShort: 15_000_000  },
    { exchange: "dYdX",        oi:  1_200_000_000, oiChange: 6.1,   funding: 0.0102,  vol24h:  2_100_000_000, liqLong:  12_000_000, liqShort:  8_000_000  },
  ],
  options: { putCall: 0.68, maxPain: 93_000, iv: 58.4, totalOI: 18_400_000_000 },
};

const BRIDGE_DATA = {
  bridges: [
    { name: "Wormhole",    vol24h: 312_000_000, txns: 9_240,  topRoute: "ETH → SOL",  change: 34.2, color: "#9333ea" },
    { name: "Stargate",    vol24h: 284_000_000, txns: 4_821,  topRoute: "ETH → ARB",  change: 12.4, color: "#0ea5e9" },
    { name: "Across",      vol24h: 198_000_000, txns: 3_240,  topRoute: "ETH → Base", change: 8.1,  color: "#10b981" },
    { name: "Orbiter",     vol24h:  89_000_000, txns: 7_840,  topRoute: "ETH → ZkS",  change: 22.6, color: "#f59e0b" },
    { name: "Hop",         vol24h: 124_000_000, txns: 2_180,  topRoute: "ETH → OP",   change: -3.2, color: "#ec4899" },
    { name: "Synapse",     vol24h:  67_000_000, txns: 1_290,  topRoute: "ETH → POL",  change: -8.4, color: "#64748b" },
  ],
  recent: [
    { from: "Ethereum", to: "Solana",   amount: 24_800_000, token: "USDC", bridge: "Wormhole", time: "8m ago"  },
    { from: "Ethereum", to: "Arbitrum", amount: 18_400_000, token: "ETH",  bridge: "Stargate", time: "14m ago" },
    { from: "Polygon",  to: "Ethereum", amount: 12_200_000, token: "USDT", bridge: "Hop",      time: "23m ago" },
    { from: "Solana",   to: "Ethereum", amount:  9_800_000, token: "SOL",  bridge: "Wormhole", time: "31m ago" },
  ],
};

const TRENDING_DATA = [
  { rank: 1, symbol: "TRUMP",   name: "Official Trump",      price: 12.40,     change24h: 24.8,  vol24h: 1_840_000_000, mentions: 48_200, category: "Meme",   hot: true  },
  { rank: 2, symbol: "PEPE",    name: "Pepe",                price: 0.0000142, change24h: 18.2,  vol24h:   980_000_000, mentions: 32_100, category: "Meme",   hot: true  },
  { rank: 3, symbol: "VIRTUAL", name: "Virtuals Protocol",   price: 1.84,      change24h: 14.6,  vol24h:   420_000_000, mentions: 21_400, category: "AI",     hot: true  },
  { rank: 4, symbol: "WIF",     name: "dogwifhat",           price: 1.12,      change24h: 12.1,  vol24h:   380_000_000, mentions: 18_900, category: "Meme",   hot: false },
  { rank: 5, symbol: "FET",     name: "Fetch.ai",            price: 0.94,      change24h: 9.8,   vol24h:   248_000_000, mentions: 14_200, category: "AI",     hot: false },
  { rank: 6, symbol: "ONDO",    name: "Ondo Finance",        price: 1.28,      change24h: 8.4,   vol24h:   184_000_000, mentions: 12_800, category: "RWA",    hot: false },
  { rank: 7, symbol: "RENDER",  name: "Render",              price: 4.82,      change24h: 7.2,   vol24h:   142_000_000, mentions:  9_800, category: "DePIN",  hot: false },
  { rank: 8, symbol: "PENDLE",  name: "Pendle",              price: 3.64,      change24h: 6.8,   vol24h:   128_000_000, mentions:  8_400, category: "DeFi",   hot: false },
  { rank: 9, symbol: "ENA",     name: "Ethena",              price: 0.48,      change24h: 5.9,   vol24h:    98_000_000, mentions:  7_200, category: "DeFi",   hot: false },
  { rank: 10,symbol: "LINK",    name: "Chainlink",           price: 14.20,     change24h: 4.6,   vol24h:   412_000_000, mentions:  6_800, category: "Oracle", hot: false },
];

// 动态日期：基于当前时间生成"距今N天"，避免硬编码过期
const _today = new Date();
const _daysFromNow = (year: number, month: number, day: number): { date: string; daysLeft: number } => {
  const target = new Date(year, month - 1, day);
  const diffMs = target.getTime() - _today.getTime();
  const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return { date, daysLeft };
};

const LAUNCH_DATA = [
  // 即将上线（未来 1-3 个月内）
  { name: "Plasma",         symbol: "XPL",    type: "TGE",     ..._daysFromNow(2026, 5, 14), raise:  50_000_000, platform: "Binance Launchpad",   status: "upcoming" as const, perf: null },
  { name: "MegaETH",        symbol: "MEGA",   type: "TGE",     ..._daysFromNow(2026, 5, 22), raise:  20_000_000, platform: "Echo / 多平台",        status: "upcoming" as const, perf: null },
  { name: "Monad",          symbol: "MON",    type: "TGE",     ..._daysFromNow(2026, 6,  3), raise: 225_000_000, platform: "Coinbase / Binance",   status: "upcoming" as const, perf: null },
  { name: "Linea",          symbol: "LINEA",  type: "Airdrop", ..._daysFromNow(2026, 6, 12), raise: 725_000_000, platform: "ConsenSys",            status: "upcoming" as const, perf: null },
  { name: "Berachain V2",   symbol: "BERA2",  type: "IDO",     ..._daysFromNow(2026, 6, 25), raise:  69_000_000, platform: "Camelot / Binance",    status: "upcoming" as const, perf: null },
  { name: "Sonic Labs",     symbol: "S",      type: "TGE",     ..._daysFromNow(2026, 7,  8), raise:  10_000_000, platform: "Bybit Launchpad",      status: "upcoming" as const, perf: null },
  // 近期上线表现（过去 1-3 个月内）
  { name: "Hyperliquid V2", symbol: "HYPE2",  type: "Airdrop", ..._daysFromNow(2026, 4, 18), raise:  85_000_000, platform: "自有",                  status: "done" as const,     perf:  142 },
  { name: "Plume Network",  symbol: "PLUME",  type: "TGE",     ..._daysFromNow(2026, 4,  6), raise:  18_000_000, platform: "OKX Jumpstart",        status: "done" as const,     perf:   28 },
  { name: "Story Protocol", symbol: "IP",     type: "TGE",     ..._daysFromNow(2026, 3, 25), raise:  80_000_000, platform: "Binance",              status: "done" as const,     perf:  -18 },
  { name: "Kaito AI",       symbol: "KAITO",  type: "TGE",     ..._daysFromNow(2026, 2, 20), raise:  24_000_000, platform: "Binance Launchpool",   status: "done" as const,     perf:   84 },
  { name: "Berachain",      symbol: "BERA",   type: "IDO",     ..._daysFromNow(2026, 2,  6), raise:  42_000_000, platform: "Camelot",              status: "done" as const,     perf:  -36 },
];

const SECTORS_DATA = [
  { name: "Meme",       en: "Meme",        change7d: 32.6, change30d:  84.2, mcap: 62_000_000_000,  top: ["DOGE","SHIB","PEPE"],    color: "#f59e0b" },
  { name: "AI Agent",   en: "AI Agent",    change7d: 24.8, change30d:  68.2, mcap: 18_400_000_000,  top: ["VIRTUAL","FET","AIXBT"], color: "#6366f1" },
  { name: "RWA",        en: "RWA",         change7d: 18.4, change30d:  42.1, mcap: 12_800_000_000,  top: ["ONDO","MKR","CFG"],      color: "#0ea5e9" },
  { name: "DePIN",      en: "DePIN",       change7d: 14.2, change30d:  38.6, mcap:  9_200_000_000,  top: ["RENDER","HNT","MOBILE"], color: "#10b981" },
  { name: "DeFi",       en: "DeFi",        change7d: 11.4, change30d:  28.2, mcap: 48_000_000_000,  top: ["AAVE","UNI","PENDLE"],   color: "#14b8a6" },
  { name: "Layer2",     en: "Layer2",      change7d:  6.2, change30d:  18.8, mcap: 28_400_000_000,  top: ["ARB","OP","MATIC"],      color: "#8b5cf6" },
  { name: "公链",        en: "L1 Chain",    change7d:  9.8, change30d:  24.6, mcap: 184_000_000_000, top: ["ETH","SOL","BNB"],       color: "#F7931A" },
  { name: "GameFi",     en: "GameFi",      change7d:  8.4, change30d:  22.4, mcap:  6_800_000_000,  top: ["AXS","SAND","IMX"],      color: "#ec4899" },
  { name: "稳定币",      en: "Stablecoin",  change7d:  0.1, change30d:   0.4, mcap: 232_000_000_000, top: ["USDT","USDC","DAI"],     color: "#94a3b8" },
  { name: "NFT",        en: "NFT",         change7d: -4.2, change30d:  -8.6, mcap:  4_200_000_000,  top: ["BLUR","APE","LOOKS"],    color: "#64748b" },
];

const MEV_DATA = [
  { type: "sandwich",   profit: 48_200,  txHash: "0x4f8c…a2d1", block: 22_184_021, pair: "ETH/USDC",  time: "2m ago",  bot: "0x000…dead" },
  { type: "arbitrage",  profit: 32_800,  txHash: "0x9a1b…f3e2", block: 22_184_018, pair: "WBTC/ETH",  time: "4m ago",  bot: "0x111…beef" },
  { type: "liquidation",profit: 124_000, txHash: "0x2d7e…b9c3", block: 22_184_010, pair: "AAVE/ETH",  time: "9m ago",  bot: "0x222…cafe" },
  { type: "sandwich",   profit:  8_900,  txHash: "0x6b3a…e4f1", block: 22_184_008, pair: "PEPE/ETH",  time: "12m ago", bot: "0x333…face" },
  { type: "arbitrage",  profit: 18_400,  txHash: "0x1c9d…a7b2", block: 22_184_002, pair: "ARB/USDC",  time: "18m ago", bot: "0x444…babe" },
  { type: "backrun",    profit:  6_200,  txHash: "0x8e2f…c5d3", block: 22_183_998, pair: "SOL/ETH",   time: "24m ago", bot: "0x555…code" },
  { type: "liquidation",profit: 88_400,  txHash: "0x3a5d…f1c8", block: 22_183_990, pair: "COMP/ETH",  time: "31m ago", bot: "0x666…feed" },
];

const STAKING_DATA = [
  { chain: "Ethereum",  symbol: "ETH",  staked: 34_800_000,  stakedUsd: 112_800_000_000, apr: 3.8,  validators: 1_082_000, change7d:  142_000, color: "#627EEA" },
  { chain: "Solana",    symbol: "SOL",  staked: 404_000_000, stakedUsd:  71_900_000_000, apr: 8.2,  validators: 1_924,     change7d: 2_800_000, color: "#9945FF" },
  { chain: "BNB Chain", symbol: "BNB",  staked:  18_200_000, stakedUsd:  12_400_000_000, apr: 4.2,  validators: 21,        change7d:   84_000, color: "#F3BA2F" },
  { chain: "Avalanche", symbol: "AVAX", staked: 248_000_000, stakedUsd:   8_200_000_000, apr: 8.6,  validators: 1_248,     change7d: 1_200_000, color: "#E84142" },
  { chain: "Cosmos",    symbol: "ATOM", staked: 381_000_000, stakedUsd:   2_900_000_000, apr: 14.8, validators: 180,       change7d: 2_100_000, color: "#6F7390" },
  { chain: "Polkadot",  symbol: "DOT",  staked: 784_000_000, stakedUsd:   6_100_000_000, apr: 12.4, validators: 297,       change7d: 4_200_000, color: "#E6007A" },
  { chain: "Tron",      symbol: "TRX",  staked: 88_000_000_000, stakedUsd: 14_200_000_000, apr: 4.6, validators: 27,      change7d: 480_000_000, color: "#EF4444" },
];

const HISTORY_EVENTS = [
  { date: "2025-05-22", zh: "BTC突破10万美元",      en: "BTC breaks $100K",       type: "bull",   btcImpact: "+8.4% (3d)", category: "price"    },
  { date: "2024-04-19", zh: "BTC第四次减半",         en: "BTC 4th Halving",        type: "event",  btcImpact: "+61% (90d)", category: "protocol" },
  { date: "2023-03-10", zh: "硅谷银行暴雷",          en: "Silicon Valley Bank Run", type: "bear",   btcImpact: "+40% (30d)", category: "macro"    },
  { date: "2022-11-11", zh: "FTX宣告破产",           en: "FTX Bankruptcy",         type: "bear",   btcImpact: "-28% (2d)",  category: "exchange" },
  { date: "2022-05-09", zh: "Terra/LUNA崩盘",        en: "Terra/LUNA Collapse",    type: "bear",   btcImpact: "-55% (7d)",  category: "defi"     },
  { date: "2021-11-10", zh: "BTC历史高位 $69K",      en: "BTC ATH $69K",           type: "bull",   btcImpact: "ATH",        category: "price"    },
  { date: "2020-03-13", zh: "312大跌 -50%",          en: "Black Thursday −50%",    type: "bear",   btcImpact: "-50% (1d)",  category: "macro"    },
  { date: "2020-05-11", zh: "BTC第三次减半",         en: "BTC 3rd Halving",        type: "event",  btcImpact: "+559% (1yr)",category: "protocol" },
  { date: "2017-12-17", zh: "BTC历史高位 $19.8K",   en: "BTC ATH $19.8K (2017)",  type: "bull",   btcImpact: "+18x (1yr)", category: "price"    },
  { date: "2013-11-29", zh: "BTC首破 $1000",         en: "BTC first breaks $1000", type: "bull",   btcImpact: "+5000%",     category: "price"    },
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

// ── Section: Gas Fee ──────────────────────────────────────────────────────────

function GasSection({ zh }: { zh: boolean }) {
  const g = GAS_DATA;
  const minH = Math.min(...g.hourly), maxH = Math.max(...g.hourly);
  const pts = g.hourly.map((v, i) => {
    const x = (i / 23) * 280;
    const y = 60 - ((v - minH) / (maxH - minH)) * 52;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="space-y-4">
      {/* ETH gas cards */}
      <div>
        <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#627EEA]" />
          {zh?"以太坊 Gas (gwei)":"Ethereum Gas (gwei)"}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: zh?"慢速":"Slow",   val: g.eth.slow,   unit:"gwei", color:"#10b981", emoji:"🐢" },
            { label: zh?"正常":"Normal", val: g.eth.normal, unit:"gwei", color:"#f59e0b", emoji:"⚡" },
            { label: zh?"快速":"Fast",   val: g.eth.fast,   unit:"gwei", color:"#ef4444", emoji:"🚀" },
          ].map((c,i) => (
            <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
              <div className="text-lg mb-1">{c.emoji}</div>
              <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: c.color }}>{c.val}</div>
              <div className="text-[10px] text-muted-foreground">{c.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* BTC gas cards */}
      <div>
        <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#F7931A]" />
          {zh?"比特币 Gas (sat/vB)":"Bitcoin Gas (sat/vB)"}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: zh?"低优先":"Low",     val: g.btc.slow,   usd: g.btc.feeUsdLow,  color:"#10b981", emoji:"🐢" },
            { label: zh?"中优先":"Medium",  val: g.btc.normal, usd: g.btc.feeUsdMid,  color:"#f59e0b", emoji:"⚡" },
            { label: zh?"高优先":"High",    val: g.btc.fast,   usd: g.btc.feeUsdHigh, color:"#ef4444", emoji:"🚀" },
          ].map((c,i) => (
            <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
              <div className="text-lg mb-1">{c.emoji}</div>
              <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: c.color }}>{c.val}</div>
              <div className="text-[10px] text-muted-foreground">sat/vB · ≈${c.usd.toFixed(2)}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-white border border-border/60 rounded-2xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{zh?"内存池":"Mempool"}</div>
            <div className="text-lg font-extrabold text-orange-600">{g.btc.mempoolMB} MB</div>
          </div>
          <div className="bg-white border border-border/60 rounded-2xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{zh?"下个区块":"Next Block"}</div>
            <div className="text-lg font-extrabold text-orange-600">~{g.btc.nextBlockMin} {zh?"分钟":"min"}</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-border/60 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">{zh?"基础费用":"Base Fee"}</div>
          <div className="text-lg font-extrabold text-blue-600">{g.eth.baseFee} gwei</div>
        </div>
        <div className="bg-white border border-border/60 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">{zh?"推荐优先费":"Priority Fee"}</div>
          <div className="text-lg font-extrabold text-purple-600">{g.eth.priority} gwei</div>
        </div>
      </div>

      {/* 24h gas heatmap */}
      <div className="bg-white border border-border/60 rounded-2xl p-4">
        <div className="text-sm font-bold text-foreground mb-3">{zh?"ETH Gas 24小时走势":"ETH Gas 24h Trend"}</div>
        <svg viewBox="0 0 280 70" className="w-full h-16">
          <defs>
            <linearGradient id="gasGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
        <div className="mt-2 text-xs text-emerald-600 font-semibold">
          ✅ {zh?"最优交易窗口":"Best window"}: {g.bestWindow} ({g.bestDays.join(" / ")})
        </div>
      </div>

      {/* L2 gas table */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"Layer2 实时 Gas":"Layer2 Real-time Gas"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"网络":"Network", "Gas", zh?"≈USD":"≈USD", zh?"24h变化":"24h Change"].map((h,i) => (
              <th key={i} className={`px-4 py-2 text-xs font-semibold text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {g.l2.map((l,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                    <span className="font-semibold text-foreground text-sm">{l.chain}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{l.fee} gwei</td>
                <td className="px-4 py-2.5 text-right font-semibold text-foreground">${l.feeUsd.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`text-sm font-bold ${l.change < 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {l.change > 0 ? "+" : ""}{l.change}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Whale Holdings ────────────────────────────────────────────────────

function WhaleSection({ zh }: { zh: boolean }) {
  const statusColor: Record<string, string> = { buying: "#10b981", selling: "#ef4444", active: "#f59e0b", dormant: "#94a3b8" };
  const statusLabel = (s: string) => ({ buying: zh?"买入":"Buying", selling: zh?"卖出":"Selling", active: zh?"活跃":"Active", dormant: zh?"休眠":"Dormant" }[s] ?? s);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: zh?"鲸鱼总持仓(BTC)":"Whale BTC Holdings", val: "3.47M",   color: "#F7931A" },
          { label: zh?"占总供应量":"% of Supply",             val: "16.5%",   color: "#8b5cf6" },
          { label: zh?"30日净流入":"30d Net Flow",            val: "+47,200", color: "#10b981" },
        ].map((c,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-extrabold tabular-nums" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"鲸鱼地址排行 (BTC)":"Top Whale Addresses (BTC)"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {["#", zh?"标签":"Label", zh?"持仓(BTC)":"BTC Holdings", zh?"持仓(USD)":"USD Value", zh?"30日变化":"30d Change", zh?"占比":"% Supply", zh?"状态":"Status"].map((h,i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i<=1?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {WHALE_DATA.map(w => (
              <tr key={w.rank} className="hover:bg-slate-50/60">
                <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{w.rank}</td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-foreground text-sm">{w.label}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{w.address.slice(0,16)}…</div>
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-amber-600">{w.btc.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">${(w.usd/1e9).toFixed(1)}B</td>
                <td className="px-3 py-2.5 text-right font-semibold text-sm">
                  <span className={w.change30d > 0 ? "text-emerald-600" : w.change30d < 0 ? "text-red-500" : "text-muted-foreground"}>
                    {w.change30d > 0 ? "+" : ""}{w.change30d.toLocaleString()}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{w.pct}%</td>
                <td className="px-3 py-2.5 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: statusColor[w.status] }}>
                    {statusLabel(w.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Derivatives ───────────────────────────────────────────────────────

function DerivSection({ zh }: { zh: boolean }) {
  const d = DERIV_DATA;
  const totalOI = d.futures.reduce((s, f) => s + f.oi, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: zh?"期货总OI":"Futures Total OI",      val: fmtLarge(totalOI),      color: "#6366f1" },
          { label: zh?"期权总OI":"Options Total OI",      val: fmtLarge(d.options.totalOI), color: "#8b5cf6" },
          { label: zh?"Put/Call 比率":"Put/Call Ratio",   val: d.options.putCall.toFixed(2), color: d.options.putCall < 0.8 ? "#10b981" : "#ef4444" },
          { label: zh?"Max Pain":"Max Pain",               val: `$${d.options.maxPain.toLocaleString()}`, color: "#f59e0b" },
        ].map((c,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-extrabold" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"各交易所期货数据":"Futures by Exchange"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"交易所":"Exchange", zh?"持仓量(OI)":"Open Interest", zh?"OI变化":"OI Δ", zh?"资金费率":"Funding", zh?"24h成交":"24h Vol", zh?"多头清算":"Liq Long", zh?"空头清算":"Liq Short"].map((h,i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {d.futures.map((f,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-3 py-2.5 font-bold text-foreground">{f.exchange}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">{fmtLarge(f.oi)}</td>
                <td className="px-3 py-2.5 text-right"><PctCell v={f.oiChange} /></td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-bold text-sm ${f.funding > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {f.funding > 0 ? "+" : ""}{(f.funding * 100).toFixed(4)}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmtLarge(f.vol24h)}</td>
                <td className="px-3 py-2.5 text-right text-red-500 font-semibold text-xs">{fmtLarge(f.liqLong)}</td>
                <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold text-xs">{fmtLarge(f.liqShort)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-border/60 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">{zh?"隐含波动率 (IV)":"Implied Volatility"}</div>
          <div className="text-2xl font-extrabold text-purple-600">{d.options.iv}%</div>
          <div className="text-xs text-muted-foreground mt-1">{zh?"7日平均":"7d avg"}</div>
        </div>
        <div className="bg-white border border-border/60 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">{zh?"市场情绪":"Market Sentiment"}</div>
          <div className="text-2xl font-extrabold text-amber-500">{zh?"偏多":"Bullish"}</div>
          <div className="text-xs text-muted-foreground mt-1">P/C {d.options.putCall} &lt; 1 → {zh?"多头主导":"Long-biased"}</div>
        </div>
      </div>
    </div>
  );
}

// ── Section: Bridge ────────────────────────────────────────────────────────────

function BridgeSection({ zh }: { zh: boolean }) {
  const b = BRIDGE_DATA;
  const totalVol = b.bridges.reduce((s, x) => s + x.vol24h, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: zh?"跨链总量(24h)":"Total Bridge Vol 24h", val: fmtLarge(totalVol), color: "#6366f1" },
          { label: zh?"活跃桥数":"Active Bridges",            val: b.bridges.length,   color: "#0ea5e9" },
          { label: zh?"最大单笔":"Largest Single",            val: "$24.8M",            color: "#10b981" },
        ].map((c,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-extrabold" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"桥接量排行 (24h)":"Bridge Volume Ranking (24h)"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"桥名":"Bridge", zh?"24h量":"24h Vol", zh?"交易笔数":"Txns", zh?"最热路由":"Top Route", zh?"变化":"Change"].map((h,i) => (
              <th key={i} className={`px-4 py-2 text-xs font-semibold text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {b.bridges.map((br,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: br.color }} />
                    <span className="font-bold text-foreground">{br.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-foreground">{fmtLarge(br.vol24h)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{br.txns.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono text-muted-foreground">{br.topRoute}</td>
                <td className="px-4 py-2.5 text-right"><PctCell v={br.change} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"近期大额跨链":"Recent Large Cross-chain"}</span>
        </div>
        <div className="divide-y divide-border/20">
          {b.recent.map((r,i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/60">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">{r.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold text-foreground">{r.to}</span>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-muted-foreground">{r.bridge}</span>
              </div>
              <div className="text-right">
                <div className="font-bold text-foreground">${(r.amount/1e6).toFixed(1)}M <span className="text-muted-foreground font-normal">{r.token}</span></div>
                <div className="text-xs text-muted-foreground">{r.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Section: Trending ──────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  Meme:"#f59e0b", AI:"#6366f1", RWA:"#0ea5e9", DePIN:"#10b981",
  DeFi:"#14b8a6", Oracle:"#8b5cf6", NFT:"#ec4899",
};

function TrendingSection({ zh }: { zh: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: zh?"最热板块":"Hottest Sector",   val: "Meme",      color: "#f59e0b" },
          { label: zh?"最热代币":"Top Token",        val: "TRUMP",     color: "#ef4444" },
          { label: zh?"社交提及增幅":"Social Spike", val: "+284%",     color: "#6366f1" },
          { label: zh?"新叙事":"New Narrative",      val: "AI Agent",  color: "#10b981" },
        ].map((c,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-extrabold" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"热门代币排行 (24h)":"Trending Tokens (24h)"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {["#", zh?"代币":"Token", zh?"价格":"Price", zh?"24h涨跌":"24h %", zh?"成交量":"Volume", zh?"社交热度":"Social", zh?"板块":"Sector"].map((h,i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i<=1?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {TRENDING_DATA.map(t => (
              <tr key={t.rank} className="hover:bg-slate-50/60">
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {t.hot ? <Flame className="w-4 h-4 text-orange-500 inline" /> : t.rank}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-bold text-foreground">{t.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">{t.name}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtPrice(t.price)}</td>
                <td className="px-3 py-2.5 text-right"><PctCell v={t.change24h} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmtLarge(t.vol24h)}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${Math.min(40, t.mentions/1500)}px` }} />
                    <span className="text-xs tabular-nums text-muted-foreground">{(t.mentions/1000).toFixed(1)}k</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: CAT_COLORS[t.category] ?? "#94a3b8" }}>{t.category}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Launch ────────────────────────────────────────────────────────────

function LaunchSection({ zh }: { zh: boolean }) {
  const upcoming = LAUNCH_DATA.filter(l => l.status === "upcoming");
  const done = LAUNCH_DATA.filter(l => l.status === "done");
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50 flex items-center gap-2">
          <Rocket className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-bold">{zh?"即将上线":"Upcoming Launches"}</span>
        </div>
        <div className="divide-y divide-border/20">
          {upcoming.map((l,i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/60">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{l.name}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{l.symbol}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">{l.type}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{l.platform} · {l.date}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{zh?"融资":"Raise"}: {fmtLarge(l.raise)}</div>
                <div className="font-extrabold text-blue-600 text-sm">{l.daysLeft}{zh?"天后":"d left"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"近期上线表现":"Recent Launch Performance"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"项目":"Project", zh?"代号":"Symbol", zh?"类型":"Type", zh?"日期":"Date", zh?"融资额":"Raise", zh?"当前表现":"Performance"].map((h,i) => (
              <th key={i} className={`px-4 py-2 text-xs font-semibold text-muted-foreground ${i<=1?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {done.map((l,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-bold text-foreground">{l.name}</td>
                <td className="px-4 py-2.5"><span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{l.symbol}</span></td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{l.type}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{l.date}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmtLarge(l.raise)}</td>
                <td className="px-4 py-2.5 text-right">
                  {l.perf !== null && (
                    <span className={`font-extrabold text-sm ${l.perf! > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {l.perf! > 0 ? "+" : ""}{l.perf}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Sectors ───────────────────────────────────────────────────────────

function SectorsSection({ zh }: { zh: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {SECTORS_DATA.map((s,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 hover:shadow-sm transition-shadow cursor-pointer"
            style={{ borderLeft: `3px solid ${s.color}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-foreground text-sm">{zh ? s.name : s.en}</span>
              <span className={`text-xs font-extrabold ${s.change7d >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {s.change7d >= 0 ? "+" : ""}{s.change7d}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground mb-1">{zh?"市值":"MCap"}: {fmtLarge(s.mcap)}</div>
            <div className="text-xs text-muted-foreground mb-2">{zh?"30日":"30d"}: <span className={s.change30d >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>{s.change30d >= 0 ? "+" : ""}{s.change30d}%</span></div>
            <div className="flex gap-1 flex-wrap">
              {s.top.map((t,j) => (
                <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white" style={{ background: s.color + "cc" }}>{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"板块热力图":"Sector Performance Table"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"板块":"Sector", zh?"总市值":"Market Cap", zh?"7日":"7d %", zh?"30日":"30d %", zh?"代表币":"Top Tokens"].map((h,i) => (
              <th key={i} className={`px-4 py-2 text-xs font-semibold text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {[...SECTORS_DATA].sort((a,b) => b.change7d - a.change7d).map((s,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="font-bold text-foreground">{zh ? s.name : s.en}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtLarge(s.mcap)}</td>
                <td className="px-4 py-2.5 text-right"><PctCell v={s.change7d} /></td>
                <td className="px-4 py-2.5 text-right"><PctCell v={s.change30d} /></td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{s.top.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: MEV ──────────────────────────────────────────────────────────────

function MevSection({ zh }: { zh: boolean }) {
  const typeColor: Record<string, string> = { sandwich:"#ef4444", arbitrage:"#10b981", liquidation:"#f59e0b", backrun:"#6366f1" };
  const typeLabel = (t: string) => ({ sandwich: zh?"三明治":"Sandwich", arbitrage: zh?"套利":"Arbitrage", liquidation: zh?"清算":"Liquidation", backrun: zh?"抢跑":"Backrun" }[t] ?? t);
  const totalProfit = MEV_DATA.reduce((s, m) => s + m.profit, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: zh?"今日MEV总收益":"Today MEV Profit",   val: fmtLarge(totalProfit * 144), color: "#10b981" },
          { label: zh?"三明治攻击":"Sandwich Attacks",      val: "1,284",                       color: "#ef4444" },
          { label: zh?"套利次数":"Arbitrage Ops",           val: "3,842",                       color: "#6366f1" },
          { label: zh?"清算次数":"Liquidations",            val: "124",                         color: "#f59e0b" },
        ].map((c,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-extrabold" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"最近MEV交易":"Recent MEV Transactions"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"类型":"Type", zh?"利润":"Profit", zh?"交易对":"Pair", zh?"区块":"Block", zh?"机器人":"Bot", zh?"时间":"Time"].map((h,i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {MEV_DATA.map((m,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: typeColor[m.type] }}>
                    {typeLabel(m.type)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-emerald-600">${m.profit.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right text-xs font-mono text-muted-foreground">{m.pair}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">{m.block.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{m.bot}</td>
                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{m.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Staking ───────────────────────────────────────────────────────────

function StakingSection({ zh }: { zh: boolean }) {
  const totalUsd = STAKING_DATA.reduce((s, x) => s + x.stakedUsd, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: zh?"质押总价值":"Total Staked Value", val: fmtLarge(totalUsd), color: "#6366f1" },
          { label: zh?"最高APR":"Best APR",               val: "14.8%",            color: "#10b981" },
          { label: zh?"支持链数":"Chains Tracked",        val: STAKING_DATA.length, color: "#f59e0b" },
        ].map((c,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-lg font-extrabold" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold">{zh?"主流链质押数据":"Major Chain Staking"}</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/30 bg-slate-50/30">
            {[zh?"公链":"Chain", zh?"质押量":"Staked", zh?"质押价值":"Staked USD", zh?"APR":"APR", zh?"验证节点":"Validators", zh?"7日变化":"7d Δ"].map((h,i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border/20">
            {[...STAKING_DATA].sort((a,b) => b.stakedUsd - a.stakedUsd).map((s,i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold" style={{ background: s.color }}>
                      {s.symbol[0]}
                    </div>
                    <div>
                      <div className="font-bold text-foreground text-sm">{s.chain}</div>
                      <div className="text-[10px] text-muted-foreground">{s.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{(s.staked/1e6).toFixed(1)}M {s.symbol}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-foreground">{fmtLarge(s.stakedUsd)}</td>
                <td className="px-3 py-2.5 text-right font-extrabold text-emerald-600">{s.apr}%</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{s.validators.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-semibold text-sm ${s.change7d > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {s.change7d > 0 ? "+" : ""}{(s.change7d/1e6).toFixed(1)}M
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: History ───────────────────────────────────────────────────────────

function HistorySection({ zh }: { zh: boolean }) {
  const [filter, setFilter] = useState<"all"|"bull"|"bear"|"event">("all");
  const typeColor = { bull: "#10b981", bear: "#ef4444", event: "#f59e0b" };
  const typeLabel = { bull: zh?"牛市事件":"Bull Event", bear: zh?"黑天鹅":"Black Swan", event: zh?"重大事件":"Key Event" };
  const filtered = filter === "all" ? HISTORY_EVENTS : HISTORY_EVENTS.filter(e => e.type === filter);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["all","bull","bear","event"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${filter===f ? "text-white border-transparent" : "bg-white border-border text-muted-foreground hover:border-current"}`}
            style={filter===f ? { background: f==="all" ? "#64748b" : typeColor[f], borderColor: f==="all" ? "#64748b" : typeColor[f] } : {}}>
            {f==="all" ? (zh?"全部":"All") : typeLabel[f]}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map((e,i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 hover:shadow-sm transition-shadow"
            style={{ borderLeft: `3px solid ${typeColor[e.type as keyof typeof typeColor]}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">{e.date}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white"
                    style={{ background: typeColor[e.type as keyof typeof typeColor] }}>
                    {typeLabel[e.type as keyof typeof typeLabel]}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-muted-foreground capitalize">{e.category}</span>
                </div>
                <div className="font-bold text-foreground text-sm">{zh ? e.zh : e.en}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground mb-0.5">{zh?"BTC影响":"BTC Impact"}</div>
                <div className="font-extrabold text-sm" style={{ color: typeColor[e.type as keyof typeof typeColor] }}>{e.btcImpact}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sidebar nav items ─────────────────────────────────────────────────────────

const NAV = [
  { key: "crypto",      zhLabel: "加密货币",  enLabel: "Crypto",      icon: <BarChart2      className="w-4 h-4" /> },
  { key: "index",       zhLabel: "指数",      enLabel: "Indices",     icon: <Activity       className="w-4 h-4" /> },
  { key: "tvl",         zhLabel: "TVL",       enLabel: "TVL",         icon: <Layers         className="w-4 h-4" /> },
  { key: "etf",         zhLabel: "ETF",       enLabel: "ETF",         icon: <Briefcase      className="w-4 h-4" /> },
  { key: "stocks",      zhLabel: "币股",      enLabel: "Stocks",      icon: <Building2      className="w-4 h-4" /> },
  { key: "unlocks",     zhLabel: "解锁",      enLabel: "Unlocks",     icon: <Lock           className="w-4 h-4" /> },
  { key: "smart",       zhLabel: "聪明钱",    enLabel: "Smart $",     icon: <Brain          className="w-4 h-4" /> },
  { key: "halving",     zhLabel: "减半倒计时", enLabel: "Halving",    icon: <Timer          className="w-4 h-4" /> },
  { key: "transfers",   zhLabel: "大额转账",  enLabel: "Transfers",   icon: <ArrowLeftRight className="w-4 h-4" /> },
  { key: "alerts",      zhLabel: "风险预警",  enLabel: "Alerts",      icon: <AlertTriangle  className="w-4 h-4" /> },
  { key: "gas",         zhLabel: "Gas监控",   enLabel: "Gas Fee",     icon: <Gauge          className="w-4 h-4" /> },
  { key: "whales",      zhLabel: "鲸鱼持仓",  enLabel: "Whales",      icon: <Anchor         className="w-4 h-4" /> },
  { key: "derivatives", zhLabel: "衍生品",    enLabel: "Derivatives", icon: <Trophy         className="w-4 h-4" /> },
  { key: "bridge",      zhLabel: "跨链桥",    enLabel: "Bridge",      icon: <Link2          className="w-4 h-4" /> },
  { key: "trending",    zhLabel: "热门",      enLabel: "Trending",    icon: <Flame          className="w-4 h-4" /> },
  { key: "launch",      zhLabel: "新币上线",  enLabel: "Launch",      icon: <Rocket         className="w-4 h-4" /> },
  { key: "sectors",     zhLabel: "叙事板块",  enLabel: "Sectors",     icon: <LayoutGrid     className="w-4 h-4" /> },
  { key: "mev",         zhLabel: "MEV套利",   enLabel: "MEV",         icon: <Cpu            className="w-4 h-4" /> },
  { key: "staking",     zhLabel: "节点质押",  enLabel: "Staking",     icon: <Server         className="w-4 h-4" /> },
  { key: "history",     zhLabel: "历史回溯",  enLabel: "History",     icon: <History        className="w-4 h-4" /> },
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
        {zh
          ? `📅 未来 30 天合计解锁：${fmtLarge(totalUsd)} · ${UNLOCK_DATA.length} 个市值≥$5亿代币（模拟数据）`
          : `📅 Next 30d total unlocks: ${fmtLarge(totalUsd)} · ${UNLOCK_DATA.length} tokens with MCap ≥ $500M (Demo data)`}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              {[zh ? "代币" : "Token", zh ? "市值" : "MCap", zh ? "解锁日期" : "Date", zh ? "解锁数量" : "Amount", zh ? "等值 USD" : "USD Value", zh ? "占流通比" : "% Supply", zh ? "风险" : "Risk"].map((h, i) => (
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
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtLarge(u.mcap)}</td>
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

// ── Section: Halving Countdown (multi-coin) ───────────────────────────────────

interface HalvingEvent { date: string; block: number; reward: number; price: number | null; label: string; }
interface HalvingCoin {
  symbol: string; name: string; color: string; emoji: string;
  nextDate: string; epochStart: string;
  currentReward: number; nextReward: number; reductionPct: number;
  epochBlocks: number; blockTimeSec: number; inflationNote: string;
  history: HalvingEvent[];
}

const HALVING_COINS: HalvingCoin[] = [
  {
    symbol: "BTC", name: "Bitcoin", color: "#F7931A", emoji: "₿",
    nextDate: "2028-04-20", epochStart: "2024-04-19",
    currentReward: 3.125, nextReward: 1.5625, reductionPct: 50,
    epochBlocks: 210_000, blockTimeSec: 600, inflationNote: "~0.85%/yr",
    history: [
      { date: "2012-11-28", block: 210_000,   reward: 25,    price: 12.5,   label: "第1次减半" },
      { date: "2016-07-09", block: 420_000,   reward: 12.5,  price: 650,    label: "第2次减半" },
      { date: "2020-05-11", block: 630_000,   reward: 6.25,  price: 8_600,  label: "第3次减半" },
      { date: "2024-04-19", block: 840_000,   reward: 3.125, price: 64_000, label: "第4次减半 ✓" },
      { date: "2028-04-20", block: 1_050_000, reward: 1.5625,price: null,   label: "第5次减半 (预估)" },
    ],
  },
  {
    symbol: "LTC", name: "Litecoin", color: "#B8B8B8", emoji: "Ł",
    nextDate: "2027-08-01", epochStart: "2023-08-02",
    currentReward: 6.25, nextReward: 3.125, reductionPct: 50,
    epochBlocks: 840_000, blockTimeSec: 150, inflationNote: "~1.2%/yr",
    history: [
      { date: "2015-08-25", block: 840_000,   reward: 25,   price: 3.2,  label: "第1次减半" },
      { date: "2019-08-05", block: 1_680_000, reward: 12.5, price: 100,  label: "第2次减半" },
      { date: "2023-08-02", block: 2_520_000, reward: 6.25, price: 93,   label: "第3次减半 ✓" },
      { date: "2027-08-01", block: 3_360_000, reward: 3.125,price: null, label: "第4次减半 (预估)" },
    ],
  },
  {
    symbol: "BCH", name: "Bitcoin Cash", color: "#8DC351", emoji: "₿",
    nextDate: "2028-04-20", epochStart: "2024-04-03",
    currentReward: 3.125, nextReward: 1.5625, reductionPct: 50,
    epochBlocks: 210_000, blockTimeSec: 600, inflationNote: "~0.85%/yr",
    history: [
      { date: "2020-04-08", block: 630_000,   reward: 6.25,  price: 247,    label: "第3次减半" },
      { date: "2024-04-03", block: 840_000,   reward: 3.125, price: 594,    label: "第4次减半 ✓" },
      { date: "2028-04-20", block: 1_050_000, reward: 1.5625,price: null,   label: "第5次减半 (预估)" },
    ],
  },
  {
    symbol: "ZEC", name: "Zcash", color: "#F4B728", emoji: "ⓩ",
    nextDate: "2026-11-18", epochStart: "2024-11-18",
    currentReward: 3.125, nextReward: 1.5625, reductionPct: 50,
    epochBlocks: 840_000, blockTimeSec: 75, inflationNote: "~1.5%/yr",
    history: [
      { date: "2020-11-18", block: 1_046_400, reward: 6.25,  price: 58,   label: "第1次减半" },
      { date: "2022-11-18", block: 1_886_400, reward: 3.125, price: 44,   label: "第2次减半" },
      { date: "2024-11-18", block: 2_726_400, reward: 1.5625,price: 34,   label: "第3次减半 ✓" },
      { date: "2026-11-18", block: 3_566_400, reward: 0.78125,price: null,label: "第4次减半 (预估)" },
    ],
  },
  {
    symbol: "ETC", name: "Ethereum Classic", color: "#699272", emoji: "⟠",
    nextDate: "2026-11-01", epochStart: "2024-07-15",
    currentReward: 2.048, nextReward: 1.6384, reductionPct: 20,
    epochBlocks: 5_000_000, blockTimeSec: 13, inflationNote: "~2.0%/yr",
    history: [
      { date: "2017-12-11", block: 5_000_000,  reward: 4,     price: 28,   label: "Era 2 (−20%)" },
      { date: "2020-03-17", block: 10_000_000, reward: 3.2,   price: 6.7,  label: "Era 3 (−20%)" },
      { date: "2022-04-25", block: 15_000_000, reward: 2.56,  price: 38,   label: "Era 4 (−20%)" },
      { date: "2024-07-15", block: 20_000_000, reward: 2.048, price: 26,   label: "Era 5 (−20%) ✓" },
      { date: "2026-11-01", block: 25_000_000, reward: 1.6384,price: null, label: "Era 6 (−20%) 预估" },
    ],
  },
  {
    symbol: "DASH", name: "Dash", color: "#008CE7", emoji: "Đ",
    nextDate: "2026-06-15", epochStart: "2025-06-20",
    currentReward: 1.817, nextReward: 1.682, reductionPct: 7.14,
    epochBlocks: 210_240, blockTimeSec: 157, inflationNote: "~4.5%/yr",
    history: [
      { date: "2023-06-10", block: 1_681_920, reward: 2.119, price: 56,   label: "−7.14%" },
      { date: "2024-06-15", block: 1_892_160, reward: 1.965, price: 29,   label: "−7.14%" },
      { date: "2025-06-20", block: 2_102_400, reward: 1.817, price: 38,   label: "−7.14% ✓" },
      { date: "2026-06-15", block: 2_312_640, reward: 1.682, price: null, label: "−7.14% 预估" },
    ],
  },
];

function useCoinCountdown(coin: HalvingCoin) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target  = new Date(coin.nextDate + "T00:00:00Z").getTime();
  const start   = new Date(coin.epochStart + "T00:00:00Z").getTime();
  const diff    = target - now;
  const elapsed = now - start;
  const blocksPerDay = 86_400 / coin.blockTimeSec;
  const minedBlocks  = Math.floor((elapsed / 86_400_000) * blocksPerDay);
  const remaining    = Math.max(0, coin.epochBlocks - minedBlocks);
  const pct          = Math.min(100, (minedBlocks / coin.epochBlocks) * 100);
  const days  = Math.max(0, Math.floor(diff / 86_400_000));
  const hours = Math.max(0, Math.floor((diff % 86_400_000) / 3_600_000));
  const mins  = Math.max(0, Math.floor((diff % 3_600_000)  / 60_000));
  const secs  = Math.max(0, Math.floor((diff % 60_000)     / 1_000));
  return { days, hours, mins, secs, minedBlocks, remaining, pct };
}

function HalvingSection({ zh }: { zh: boolean }) {
  const [selected, setSelected] = useState("BTC");
  const coin = HALVING_COINS.find(c => c.symbol === selected)!;
  const { days, hours, mins, secs, minedBlocks, remaining, pct } = useCoinCountdown(coin);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="space-y-4">
      {/* Coin selector */}
      <div className="flex flex-wrap gap-2">
        {HALVING_COINS.map(c => (
          <button key={c.symbol} onClick={() => setSelected(c.symbol)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${
              selected === c.symbol ? "text-white border-transparent shadow-md" : "bg-white text-muted-foreground border-border hover:border-current"
            }`}
            style={selected === c.symbol ? { background: c.color, borderColor: c.color } : { color: c.color }}>
            <span>{c.emoji}</span> {c.symbol}
          </button>
        ))}
      </div>

      {/* Hero countdown */}
      <div className="rounded-2xl p-5 sm:p-6 text-center relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${coin.color}10 0%, #fff 50%, ${coin.color}18 100%)`, border: `2px solid ${coin.color}44` }}>
        <div className="relative">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-xl font-extrabold" style={{ color: coin.color }}>{coin.emoji}</span>
            <h3 className="text-base font-extrabold" style={{ color: coin.color }}>
              {zh ? `${coin.name} 下次减半倒计时` : `${coin.name} Next Halving`}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {zh ? `预计 ${coin.nextDate}` : `Est. ${coin.nextDate}`}
            {coin.reductionPct !== 50 && <span className="ml-2 font-semibold" style={{ color: coin.color }}>({coin.reductionPct}% {zh?"减少":"reduction"})</span>}
          </p>

          {/* Timer */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-5">
            {[
              { v: days,  label: zh ? "天" : "Days" },
              { v: hours, label: zh ? "时" : "Hrs"  },
              { v: mins,  label: zh ? "分" : "Min"  },
              { v: secs,  label: zh ? "秒" : "Sec"  },
            ].map((u, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-14 sm:w-18 h-14 sm:h-18 rounded-2xl text-white flex items-center justify-center text-xl sm:text-2xl font-extrabold tabular-nums shadow-lg px-3 py-3"
                  style={{ background: coin.color, boxShadow: `0 4px 20px ${coin.color}44` }}>
                  {pad(u.v)}
                </div>
                <span className="text-[11px] font-semibold mt-1" style={{ color: coin.color }}>{u.label}</span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="max-w-md mx-auto">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{zh ? `已挖 ~${minedBlocks.toLocaleString()} 块` : `~${minedBlocks.toLocaleString()} mined`}</span>
              <span>{zh ? `剩余 ~${remaining.toLocaleString()} 块` : `~${remaining.toLocaleString()} left`}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: coin.color + "22" }}>
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: coin.color }} />
            </div>
            <p className="text-xs mt-1 font-semibold" style={{ color: coin.color }}>{pct.toFixed(2)}% {zh ? "本轮完成" : "complete"}</p>
          </div>
        </div>
      </div>

      {/* Reward cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: zh ? "当前区块奖励" : "Current Reward",    value: `${coin.currentReward} ${coin.symbol}`, color: "#10b981" },
          { label: zh ? "减半后奖励"   : "Post-Halving",      value: `${coin.nextReward} ${coin.symbol}`,    color: coin.color },
          { label: zh ? "减少幅度"     : "Reduction",         value: `${coin.reductionPct}%`,                color: "#ef4444"  },
          { label: zh ? "通胀率参考"   : "Est. Inflation",    value: coin.inflationNote,                     color: "#8b5cf6"  },
        ].map((c, i) => (
          <div key={i} className="bg-white border border-border/60 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className="text-base font-extrabold tabular-nums" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* History table */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold text-foreground">{coin.name} {zh ? "减半历史" : "Halving History"}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-slate-50/30">
              {[zh?"事件":"Event", zh?"日期":"Date", zh?"区块":"Block", zh?"区块奖励":"Reward", zh?"当时价格":"Price"].map((h, i) => (
                <th key={i} className={`px-4 py-2 text-xs font-semibold text-muted-foreground ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {coin.history.map((h, i) => (
              <tr key={i} className={h.price === null ? "font-semibold" : "hover:bg-slate-50/60 transition-colors"}>
                <td className="px-4 py-2.5 font-semibold text-sm" style={{ color: h.price === null ? coin.color : undefined }}>{h.label}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{h.date}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{h.block.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: coin.color }}>{h.reward} {coin.symbol}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {h.price === null
                    ? <span className="text-muted-foreground italic text-xs">{zh ? "待定" : "TBD"}</span>
                    : <span className="font-semibold">${h.price.toLocaleString()}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* All coins summary */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <div className="px-4 py-2.5 border-b border-border/30 bg-slate-50/50">
          <span className="text-sm font-bold text-foreground">{zh ? "主流币减半总览" : "Major Coin Halving Overview"}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-slate-50/30">
              {[zh?"币种":"Coin", zh?"下次减半":"Next Halving", zh?"剩余天数":"Days Left", zh?"当前奖励":"Reward", zh?"减少幅度":"Cut", zh?"轮次进度":"Progress"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {HALVING_COINS.map(c => {
              const msLeft = new Date(c.nextDate + "T00:00:00Z").getTime() - Date.now();
              const dLeft  = Math.max(0, Math.floor(msLeft / 86_400_000));
              const elapsedMs = Date.now() - new Date(c.epochStart + "T00:00:00Z").getTime();
              const ep = Math.min(100, (elapsedMs / (new Date(c.nextDate + "T00:00:00Z").getTime() - new Date(c.epochStart + "T00:00:00Z").getTime())) * 100);
              return (
                <tr key={c.symbol}
                  className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${selected === c.symbol ? "bg-blue-50/30" : ""}`}
                  onClick={() => setSelected(c.symbol)}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white shrink-0"
                        style={{ background: c.color }}>{c.emoji}</div>
                      <div>
                        <div className="font-bold text-foreground text-xs">{c.symbol}</div>
                        <div className="text-[10px] text-muted-foreground">{c.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{c.nextDate}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-extrabold tabular-nums text-sm ${dLeft < 180 ? "text-red-500" : dLeft < 365 ? "text-amber-500" : "text-foreground"}`}>
                      {dLeft}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">{zh ? "天" : "d"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: c.color }}>{c.currentReward} {c.symbol}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-red-500">−{c.reductionPct}%</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${ep}%`, background: c.color }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{ep.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: Large Transfers ──────────────────────────────────────────────────

const TRANSFER_DATA = [
  { time: "2m ago",  from: "0x28C6c06298d514Db089934071355E5743bf21d60", fromLabel: "Binance 14",    to: "0x742d35Cc6634C0532925a3b8D4C9b4e5b0e7c1B5", toLabel: null,          amount: 18_420, token: "ETH",  usd: 42_600_000,  chain: "Ethereum", type: "withdraw" },
  { time: "5m ago",  from: "Unknown",                                       fromLabel: null,          to: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE",   toLabel: "Binance 14",  amount: 9_800,  token: "ETH",  usd: 22_700_000,  chain: "Ethereum", type: "deposit"  },
  { time: "11m ago", from: "Tron Foundation",                               fromLabel: "Tron Found.", to: "Unknown",                                         toLabel: null,          amount: 450_000_000, token: "TRX", usd: 148_000_000, chain: "Tron", type: "unknown" },
  { time: "18m ago", from: "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",   fromLabel: "Binance 7",  to: "0xF977814e90dA44bFA03b6295A0616a897441aceE",   toLabel: "Binance 6",   amount: 62_400, token: "BNB",  usd: 38_500_000,  chain: "BSC",      type: "internal" },
  { time: "24m ago", from: "Unknown",                                       fromLabel: null,          to: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",   toLabel: "Binance 8",   amount: 2_100,  token: "BTC",  usd: 164_000_000, chain: "Bitcoin",  type: "deposit"  },
  { time: "31m ago", from: "0xf89d7b9c864f589bbF53a82105107622B35EaA4",    fromLabel: "Kraken",      to: "Unknown",                                         toLabel: null,          amount: 85_000, token: "SOL",  usd: 7_200_000,   chain: "Solana",   type: "withdraw" },
  { time: "44m ago", from: "Unknown",                                       fromLabel: null,          to: "Unknown",                                         toLabel: null,          amount: 320_000_000, token: "USDT",usd: 320_000_000, chain: "Tron", type: "stable"  },
  { time: "58m ago", from: "Jump Trading",                                  fromLabel: "Jump",        to: "Uniswap V3",                                      toLabel: "Uniswap",     amount: 4_200,  token: "ETH",  usd: 9_700_000,   chain: "Ethereum", type: "defi"     },
];

function fmtAddrShort(s: string) { if (s.length < 10) return s; return s.slice(0, 6) + "…" + s.slice(-4); }

function TransfersSection({ zh }: { zh: boolean }) {
  const [filter, setFilter] = useState<"all"|"exchange"|"whale"|"stable">("all");

  const filtered = TRANSFER_DATA.filter(t => {
    if (filter === "exchange") return t.type === "deposit" || t.type === "withdraw" || t.type === "internal";
    if (filter === "whale")    return t.usd >= 50_000_000;
    if (filter === "stable")   return t.type === "stable";
    return true;
  });

  const typeInfo = (type: string) => {
    switch (type) {
      case "deposit":  return { label: zh?"交易所入金":"Deposit",  cls: "bg-red-50 text-red-600"   };
      case "withdraw": return { label: zh?"交易所出金":"Withdraw", cls: "bg-emerald-50 text-emerald-600" };
      case "internal": return { label: zh?"内部转账":"Internal",   cls: "bg-blue-50 text-blue-600" };
      case "stable":   return { label: zh?"稳定币":"Stablecoin",   cls: "bg-slate-100 text-slate-600" };
      case "defi":     return { label: "DeFi",                     cls: "bg-purple-50 text-purple-600" };
      default:         return { label: zh?"未知":"Unknown",        cls: "bg-amber-50 text-amber-600" };
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: "all",      label: zh ? "全部" : "All"           },
          { key: "exchange", label: zh ? "交易所" : "Exchange"    },
          { key: "whale",    label: zh ? "巨鲸(>$50M)" : "Whale ($50M+)" },
          { key: "stable",   label: zh ? "稳定币" : "Stablecoin" },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filter === f.key ? "bg-indigo-600 text-white border-indigo-600" : "border-border bg-white text-muted-foreground hover:border-slate-400"}`}>
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          {zh ? "⚠️ 模拟数据" : "⚠️ Demo data"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-slate-50/50">
              {[zh?"时间":"Time", zh?"类型":"Type", zh?"来源":"From", zh?"去向":"To", zh?"金额":"Amount", zh?"等值USD":"USD Value", zh?"链":"Chain"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.map((t, i) => {
              const ti = typeInfo(t.type);
              return (
                <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{t.time}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ti.cls}`}>{ti.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <span className="text-foreground font-semibold">{t.fromLabel ?? fmtAddrShort(t.from)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <span className="text-foreground font-semibold">{t.toLabel ?? fmtAddrShort(t.to)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {t.amount.toLocaleString()} <span className="font-normal text-muted-foreground">{t.token}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground">{fmtLarge(t.usd)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{t.chain}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground px-1">
        {zh ? "真实数据接入需对接 Arkham Intelligence / Nansen / Whale Alert API。" : "Real data requires Arkham / Nansen / Whale Alert API integration."}
      </p>
    </div>
  );
}

// ── Section: Risk Alerts ──────────────────────────────────────────────────────

const ALERTS_DATA = [
  {
    level: "critical", icon: "🚨",
    title: { zh: "Binance ETH 大规模出金 — 2h 累计 $4.2 亿", en: "Binance ETH Mass Outflow — $420M in 2h" },
    desc:  { zh: "过去 2 小时 Binance ETH 热钱包累计出金超 18 万枚 ETH，历史上此类大规模流出往往先于大行情发生。", en: "Over 180,000 ETH outflowed from Binance hot wallet in 2h. Historically precedes major price moves." },
    tags: ["ETH", "Binance"],
    time: "12m ago",
    category: { zh: "流动性", en: "Liquidity" },
  },
  {
    level: "critical", icon: "⚠️",
    title: { zh: "USDT 在 Curve 3pool 短暂失衡 — 占比升至 58%", en: "USDT Curve 3pool Imbalance — Ratio Hit 58%" },
    desc:  { zh: "Curve 3pool 中 USDT 占比升至 58%，偏离正常的 33% 水平，暗示市场存在 USDT→USDC 的结构性转换压力。", en: "USDT share in Curve 3pool hit 58% vs normal 33%, signaling structural USDT→USDC conversion pressure." },
    tags: ["USDT", "Curve", "Stablecoin"],
    time: "28m ago",
    category: { zh: "稳定币", en: "Stablecoin" },
  },
  {
    level: "high", icon: "🔴",
    title: { zh: "ARB 大规模解锁即将到来 — $4,900 万", en: "ARB Massive Unlock Incoming — $49M" },
    desc:  { zh: "6 月 8 日将有 9,200 万枚 ARB（约 $4,900 万）解锁，占流通供应量 2.8%，可能带来短期抛压。", en: "92M ARB (~$49M) unlocks on Jun 8, representing 2.8% of circulating supply. Watch for sell pressure." },
    tags: ["ARB", "Unlock"],
    time: "1h ago",
    category: { zh: "解锁预警", en: "Unlock" },
  },
  {
    level: "high", icon: "🛡️",
    title: { zh: "Euler Finance 再审计完成 — 发现 2 个中危漏洞", en: "Euler Finance Re-Audit Complete — 2 Medium Issues Found" },
    desc:  { zh: "第三方审计机构 Trail of Bits 完成 Euler V2 重审计，发现 2 个中等风险漏洞已修复，未发现高危。建议谨慎参与新部署合约。", en: "Trail of Bits completed Euler V2 re-audit. 2 medium issues found and patched, no critical. Exercise caution with new deployments." },
    tags: ["DeFi", "Security"],
    time: "3h ago",
    category: { zh: "安全", en: "Security" },
  },
  {
    level: "medium", icon: "🟡",
    title: { zh: "BTC 休眠币加速移动 — 链上 HODL 波浪信号", en: "BTC Dormant Coins Accelerating — HODL Wave Signal" },
    desc:  { zh: "过去 24h 超过 12,000 BTC 的休眠地址（沉睡 >2 年）开始活动，Coin Days Destroyed 指标显著上升，历史上此信号出现在周期顶部附近。", en: "12,000+ BTC from addresses dormant >2 years became active in 24h. CDD metric surging — historically appears near cycle tops." },
    tags: ["BTC", "On-chain"],
    time: "5h ago",
    category: { zh: "市场信号", en: "Market Signal" },
  },
  {
    level: "medium", icon: "📋",
    title: { zh: "美 SEC 暂缓 3 家 ETF 审批 — 等待更多信息", en: "SEC Delays 3 ETF Approvals — Awaiting More Info" },
    desc:  { zh: "美国 SEC 宣布对 Grayscale ETH ETF、Franklin Templeton SOL ETF 等 3 个申请要求补充材料，90 天内作出最终决定。", en: "SEC requested additional info for 3 applications including Grayscale ETH ETF. Final decision within 90 days." },
    tags: ["ETF", "Regulation", "SEC"],
    time: "8h ago",
    category: { zh: "监管", en: "Regulation" },
  },
  {
    level: "low", icon: "🟢",
    title: { zh: "以太坊 gas 费创 6 个月新低 — 均值 3 Gwei", en: "Ethereum Gas Hits 6-Month Low — Avg 3 Gwei" },
    desc:  { zh: "以太坊主网 gas 费降至 3 Gwei，为近 6 个月最低水平，链上交互成本大幅降低，DeFi 用户友好度上升。", en: "Ethereum mainnet gas dropped to 3 Gwei, 6-month low. On-chain interaction costs significantly reduced." },
    tags: ["ETH", "Gas"],
    time: "12h ago",
    category: { zh: "网络状态", en: "Network" },
  },
];

const LEVEL_STYLE = {
  critical: { border: "border-red-300",    bg: "bg-red-50",    badge: "bg-red-500 text-white",     dot: "bg-red-500",    label: { zh: "严重", en: "Critical" } },
  high:     { border: "border-orange-300", bg: "bg-orange-50", badge: "bg-orange-500 text-white",   dot: "bg-orange-500", label: { zh: "高危", en: "High"     } },
  medium:   { border: "border-amber-300",  bg: "bg-amber-50",  badge: "bg-amber-400 text-white",    dot: "bg-amber-400",  label: { zh: "中等", en: "Medium"   } },
  low:      { border: "border-emerald-300",bg: "bg-emerald-50",badge: "bg-emerald-500 text-white",  dot: "bg-emerald-500",label: { zh: "正常", en: "Normal"   } },
} as const;

function AlertsSection({ zh }: { zh: boolean }) {
  const [levelFilter, setLevelFilter] = useState<"all"|"critical"|"high"|"medium"|"low">("all");
  const levels = ["all", "critical", "high", "medium", "low"] as const;
  const levelLabel: Record<string, string> = { all: zh?"全部":"All", critical: zh?"严重":"Critical", high: zh?"高危":"High", medium: zh?"中等":"Medium", low: zh?"正常":"Normal" };

  const filtered = ALERTS_DATA.filter(a => levelFilter === "all" || a.level === levelFilter);

  return (
    <div className="space-y-3">
      {/* Level filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {levels.map(l => {
          const style = l === "all" ? null : LEVEL_STYLE[l];
          return (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                levelFilter === l
                  ? (l === "all" ? "bg-slate-800 text-white border-slate-800" : `${style!.badge} border-transparent`)
                  : "border-border bg-white text-muted-foreground hover:border-slate-400"
              }`}>
              {levelLabel[l]}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          {zh ? "⚠️ 模拟数据" : "⚠️ Demo data"}
        </span>
      </div>

      {/* Alert cards */}
      <div className="space-y-3">
        {filtered.map((alert, i) => {
          const style = LEVEL_STYLE[alert.level as keyof typeof LEVEL_STYLE];
          return (
            <div key={i} className={`rounded-2xl border ${style.border} ${style.bg} p-4 hover:shadow-md transition-all`}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                      {style.label[zh ? "zh" : "en"]}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/70 text-muted-foreground border border-border/40">
                      {alert.category[zh ? "zh" : "en"]}
                    </span>
                    {alert.tags.filter(t => typeof t === "string").map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 text-muted-foreground border border-border/30">{tag}</span>
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">{alert.time}</span>
                  </div>
                  <h4 className="font-bold text-sm text-foreground leading-snug mb-1">
                    {alert.title[zh ? "zh" : "en"]}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {alert.desc[zh ? "zh" : "en"]}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnchainPage() {
  const { lang } = useLang();
  const zh = lang === "zh-CN";
  const search = useSearch();
  const initialTab = (new URLSearchParams(search).get("tab") as NavKey | null) ?? "crypto";
  const [active, setActive] = useState<NavKey>(initialTab);

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
              {active === "crypto"      && (zh ? "实时行情 · CoinGecko" : "Live prices · CoinGecko")}
              {active === "index"       && (zh ? "市场情绪与关键指数" : "Market sentiment & key indices")}
              {active === "tvl"         && (zh ? "链上流动性 · DefiLlama" : "On-chain liquidity · DefiLlama")}
              {active === "etf"         && (zh ? "现货 BTC ETF 资金流向" : "Spot BTC ETF fund flows")}
              {active === "stocks"      && (zh ? "加密相关上市公司" : "Crypto-related public companies")}
              {active === "unlocks"     && (zh ? "大额代币解锁预警" : "Major token unlock alerts")}
              {active === "smart"       && (zh ? "巨鲸链上动向追踪" : "On-chain whale activity")}
              {active === "halving"     && (zh ? "多币种减半倒计时 · 历史数据" : "Multi-coin halving countdown & history")}
              {active === "transfers"   && (zh ? "链上异常大额转账实时监控" : "Real-time large on-chain transfer monitor")}
              {active === "alerts"      && (zh ? "市场风险信号 · 安全 · 监管" : "Market risk signals · Security · Regulation")}
              {active === "gas"         && (zh ? "ETH & L2 实时 Gas 价格 · 最优交易时机" : "ETH & L2 real-time Gas · Best tx windows")}
              {active === "whales"      && (zh ? "BTC 鲸鱼地址持仓 · 30日流向追踪" : "BTC whale addresses · 30d flow tracking")}
              {active === "derivatives" && (zh ? "期货持仓 · 资金费率 · 期权数据" : "Futures OI · Funding rates · Options data")}
              {active === "bridge"      && (zh ? "跨链桥接量 · 大额跨链转移监控" : "Bridge volumes · Large cross-chain transfers")}
              {active === "trending"    && (zh ? "当前最热代币 · 叙事 · 社交热度" : "Hottest tokens · Narratives · Social buzz")}
              {active === "launch"      && (zh ? "即将上线 TGE / IDO · 近期发行表现" : "Upcoming TGE / IDO · Recent launch perf")}
              {active === "sectors"     && (zh ? "板块/主题聚合 · 热力图" : "Sector aggregation · Narrative heatmap")}
              {active === "mev"         && (zh ? "MEV · 三明治攻击 · 套利 · 清算" : "MEV · Sandwich attacks · Arbitrage · Liquidations")}
              {active === "staking"     && (zh ? "主流链质押数据 · APR · 验证节点" : "Major chain staking · APR · Validators")}
              {active === "history"     && (zh ? "重大历史事件 · BTC 价格影响回溯" : "Major historical events · BTC price impact")}
            </p>
          </div>
        </div>

        {/* Section content */}
        {active === "crypto"      && <CryptoSection      zh={zh} />}
        {active === "index"       && <IndexSection       zh={zh} />}
        {active === "tvl"         && <TvlSection         zh={zh} />}
        {active === "etf"         && <EtfSection         zh={zh} />}
        {active === "stocks"      && <StocksSection      zh={zh} />}
        {active === "unlocks"     && <UnlocksSection     zh={zh} />}
        {active === "smart"       && <SmartSection       zh={zh} />}
        {active === "halving"     && <HalvingSection     zh={zh} />}
        {active === "transfers"   && <TransfersSection   zh={zh} />}
        {active === "alerts"      && <AlertsSection      zh={zh} />}
        {active === "gas"         && <GasSection         zh={zh} />}
        {active === "whales"      && <WhaleSection       zh={zh} />}
        {active === "derivatives" && <DerivSection       zh={zh} />}
        {active === "bridge"      && <BridgeSection      zh={zh} />}
        {active === "trending"    && <TrendingSection    zh={zh} />}
        {active === "launch"      && <LaunchSection      zh={zh} />}
        {active === "sectors"     && <SectorsSection     zh={zh} />}
        {active === "mev"         && <MevSection         zh={zh} />}
        {active === "staking"     && <StakingSection     zh={zh} />}
        {active === "history"     && <HistorySection     zh={zh} />}
      </main>
    </div>
  );
}
