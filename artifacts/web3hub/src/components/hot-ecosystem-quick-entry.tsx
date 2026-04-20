import { useLocation } from "wouter";
import { useEventFilter } from "@/lib/event-filter-context";

type QuickItem = {
  label: string;
  kind: "chain" | "exchange";
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
  hint: `查看 ${name} 专栏 - Grants、Testnet、Airdrop 等机会`,
}));

const EXCHANGE_ITEMS: QuickItem[] = EXCHANGES.map((name) => ({
  label: name,
  kind: "exchange",
  hint: `查看 ${name} 专栏 - Listing、公告与机会`,
}));

const pillCls =
  "relative px-3 py-1 rounded-full text-[14px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer " +
  "text-slate-800 hover:text-slate-900 hover:bg-slate-100";

function TagLinksRow({ items }: { items: QuickItem[] }) {
  const [location, navigate] = useLocation();
  const {
    activeChains,
    setActiveChains,
    activeExchanges,
    setActiveExchanges,
    setActiveCategory,
  } = useEventFilter();
  return (
    <div className="flex flex-nowrap items-center justify-start gap-x-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <button
          key={`${it.kind}:${it.label}`}
          type="button"
          title={it.hint}
          onClick={() => {
            // Behavior: like top nav tabs — filter current main module as data source.
            // If we're not already on a content page, route to home first.
            if (location === "/chains" || location === "/exchanges") navigate("/");

            setActiveCategory("全部");
            if (it.kind === "chain") {
              setActiveChains(
                activeChains.includes(it.label)
                  ? activeChains.filter((x) => x !== it.label)
                  : [...activeChains, it.label]
              );
            } else {
              setActiveExchanges(
                activeExchanges.includes(it.label)
                  ? activeExchanges.filter((x) => x !== it.label)
                  : [...activeExchanges, it.label]
              );
            }
          }}
          className={`${pillCls} ${
            (it.kind === "chain" && activeChains.includes(it.label)) ||
            (it.kind === "exchange" && activeExchanges.includes(it.label))
              ? "text-white bg-blue-600 shadow-sm hover:bg-blue-700 hover:text-white"
              : ""
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function HotEcosystemQuickEntry() {
  const all = [...CHAIN_ITEMS, ...EXCHANGE_ITEMS];
  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <TagLinksRow items={all} />
      </div>
    </div>
  );
}

