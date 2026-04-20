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

function TagLinksRow({ items }: { items: QuickItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          title={it.hint}
          className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-slate-900 hover:border-slate-300"
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

export function HotEcosystemQuickEntry() {
  return (
    <section className="w-full rounded-2xl border border-slate-200/60 bg-white/55 backdrop-blur-sm px-5 py-4 shadow-sm">
      <div>
        <div className="text-sm font-extrabold text-slate-900">热门生态快速入口</div>
        <div className="mt-0.5 text-xs text-slate-500">按公链 / 交易所快速查看对应机会与公告</div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-1 w-12 shrink-0 text-xs font-bold text-slate-500">公链</div>
          <TagLinksRow items={CHAIN_ITEMS} />
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-1 w-12 shrink-0 text-xs font-bold text-slate-500">交易所</div>
          <TagLinksRow items={EXCHANGE_ITEMS} />
        </div>
      </div>
    </section>
  );
}

