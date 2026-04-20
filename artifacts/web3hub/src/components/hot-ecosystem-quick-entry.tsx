import { Link } from "wouter";

type QuickItem = {
  label: string;
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
  "Bybit",
  "Coinbase",
  "Kraken",
] as const;

const CHAIN_ITEMS: QuickItem[] = CHAINS.map((name) => ({
  label: name,
  href: `/chains/${slugify(name)}`,
  hint: `查看 ${name} 专栏 - Grants、Testnet、Airdrop 等机会`,
}));

const EXCHANGE_ITEMS: QuickItem[] = EXCHANGES.map((name) => ({
  label: name,
  href: `/exchanges/${slugify(name)}`,
  hint: `查看 ${name} 专栏 - Listing、公告与机会`,
}));

const pillCls =
  "relative px-3 py-1 rounded-full text-[14px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer " +
  "text-slate-800 hover:text-slate-900 hover:bg-slate-100";

function TagLinksRow({ items }: { items: QuickItem[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-0.5 gap-y-1">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          title={it.hint}
          className={pillCls}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

export function HotEcosystemQuickEntry() {
  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <TagLinksRow items={CHAIN_ITEMS} />
        <TagLinksRow items={EXCHANGE_ITEMS} />
      </div>
    </div>
  );
}

