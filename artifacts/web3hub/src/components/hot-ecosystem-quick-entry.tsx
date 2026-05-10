import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useEventFilter } from "@/lib/event-filter-context";
import { exchangeSectionSlug } from "@/lib/ecosystem";
import { getApiBase } from "@/lib/api-base";

type QuickItem = {
  label: string;
  kind: "chain" | "exchange";
  href: string;
  hint: string;
  count: number;
};

const CHAINS = [
  "Ethereum",
  "Solana",
  "BNB Chain",
  "Arbitrum",
  "Base",
  "Sui",
  "Aptos",
] as const;

const EXCHANGES = [
  "Binance",
  "OKX",
  "Bybit",
  "Coinbase",
  "Kraken",
  "Bitget",
] as const;

const CHAIN_ITEMS: QuickItem[] = CHAINS.map((name) => ({
  label: name,
  kind: "chain",
  href: `/chains/${name.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
  hint: `查看 ${name} 专栏 - Grants、Testnet、Airdrop 等机会`,
  count: 0,
}));

const EXCHANGE_ITEMS: QuickItem[] = EXCHANGES.map((name) => ({
  label: name,
  kind: "exchange",
  href: `/exchanges/${exchangeSectionSlug(name)}`,
  hint: `查看 ${name} 专栏 - Listing、公告与机会`,
  count: 0,
}));

/** 与 layout 第一行主导航同字号（text-[14px] font-semibold） */
const pillCls =
  "relative px-3 py-1 rounded-full text-[14px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer " +
  "text-slate-800 hover:text-slate-900 hover:bg-slate-100";

function TagLinksRow({ items }: { items: QuickItem[] }) {
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
    <div className="flex w-full flex-nowrap items-center justify-center gap-x-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <span className="inline-flex items-center gap-1">
            <span>{it.label}</span>
            <span className="text-[11px] font-medium text-slate-500">共{it.count}条</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function HotEcosystemQuickEntry() {
  const apiBase = getApiBase();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const all = useMemo(
    () =>
      [...CHAIN_ITEMS, ...EXCHANGE_ITEMS].map((item) => ({
        ...item,
        count: counts[item.label] ?? 0,
      })),
    [counts],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/ecosystem-counts`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.counts) return;
        setCounts(data.counts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <TagLinksRow items={all} />
      </div>
    </div>
  );
}

