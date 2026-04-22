import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useEventFilter } from "@/lib/event-filter-context";

type CountsMap = Record<string, number> | undefined;

type QuickItem = {
  label: string;
  kind: "chain" | "exchange";
  href: string;
  hint: string;
};

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CHAINS = [
  "Ethereum",
  "Solana",
  "BNB Chain",
  "Arbitrum",
  "Base",
  "Optimism",
  "Sui",
  "Aptos",
] as const;

const EXCHANGES = [
  "Binance",
  "OKX",
  "Bybit",
  "Coinbase",
  "Kraken",
] as const;

const CHAIN_ITEMS: QuickItem[] = CHAINS.map((name) => ({
  label: name,
  kind: "chain",
  href: `/chains/${slugify(name)}`,
  hint: `查看 ${name} 专栏 - Grants、Testnet、Airdrop 等机会`,
}));

const EXCHANGE_ITEMS: QuickItem[] = EXCHANGES.map((name) => ({
  label: name,
  kind: "exchange",
  href: `/exchanges/${slugify(name)}`,
  hint: `查看 ${name} 专栏 - Listing、公告与机会`,
}));

/** 与 layout 第一行主导航同字号（text-[13px] font-semibold） */
const pillCls =
  "relative px-2.5 py-0.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer " +
  "text-slate-800 hover:text-slate-900 hover:bg-slate-100";

function TagLinksRow({ items, counts }: { items: QuickItem[]; counts?: CountsMap }) {
  const [location, navigate] = useLocation();
  const { clearEcosystem, setActiveCategory } = useEventFilter();
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);

  useEffect(() => {
    // Once navigation completes, drop optimistic state.
    if (optimisticHref && location === optimisticHref) {
      setOptimisticHref(null);
    }
  }, [location, optimisticHref]);

  const isActiveHref = (href: string) => (optimisticHref ?? location) === href;
  return (
    <div className="flex w-full flex-nowrap items-center justify-start gap-x-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <button
          key={`${it.kind}:${it.label}`}
          type="button"
          title={it.hint}
          onClick={() => {
            // Match top-nav behavior: click navigates to a dedicated page, no multi-select filtering.
            setOptimisticHref(it.href);
            clearEcosystem();
            setActiveCategory("全部");
            navigate(it.href);
          }}
          className={`${pillCls} ${
            isActiveHref(it.href)
              ? "text-white bg-blue-600 shadow-sm hover:bg-blue-700 hover:text-white"
              : ""
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span>{it.label}</span>
            {counts && typeof counts[it.label] === "number" && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                  isActiveHref(it.href)
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/70 text-slate-600"
                }`}
              >
                {counts[it.label]}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function HotEcosystemQuickEntry({ counts }: { counts?: { chains?: CountsMap; exchanges?: CountsMap } }) {
  const all = [...CHAIN_ITEMS, ...EXCHANGE_ITEMS];
  const mergedCounts = useMemo(() => {
    const out: Record<string, number> = {};
    const ch = counts?.chains ?? {};
    const ex = counts?.exchanges ?? {};
    for (const k of Object.keys(ch)) out[k] = Number(ch[k] ?? 0);
    for (const k of Object.keys(ex)) out[k] = Number(ex[k] ?? 0);
    return out;
  }, [counts?.chains, counts?.exchanges]);
  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <TagLinksRow items={all} counts={mergedCounts} />
      </div>
    </div>
  );
}

