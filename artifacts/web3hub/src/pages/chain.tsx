import { useMemo } from "react";
import { useParams } from "wouter";
import { ColumnTemplatePage } from "@/pages/column-template";

const CHAINS: Record<string, { name: string; titleZh: string; titleEn: string; officialLinks?: { label: string; href: string }[] }> = {
  "ethereum": {
    name: "Ethereum",
    titleZh: "Ethereum 专栏 - 实时机会与新闻",
    titleEn: "Ethereum Column - Live Opportunities & News",
    officialLinks: [
      { label: "Ethereum.org", href: "https://ethereum.org/" },
      { label: "Ethereum Foundation", href: "https://ethereum.foundation/" },
    ],
  },
  "solana": {
    name: "Solana",
    titleZh: "Solana 专栏 - 实时机会与新闻",
    titleEn: "Solana Column - Live Opportunities & News",
    officialLinks: [
      { label: "Solana", href: "https://solana.com/" },
      { label: "Solana Foundation", href: "https://solana.org/" },
    ],
  },
  "bnb-chain": {
    name: "BNB Chain",
    titleZh: "BNB Chain 专栏 - 实时机会与新闻",
    titleEn: "BNB Chain Column - Live Opportunities & News",
    officialLinks: [
      { label: "BNB Chain", href: "https://www.bnbchain.org/" },
    ],
  },
  "arbitrum": {
    name: "Arbitrum",
    titleZh: "Arbitrum 专栏 - 实时机会与新闻",
    titleEn: "Arbitrum Column - Live Opportunities & News",
    officialLinks: [
      { label: "Arbitrum", href: "https://arbitrum.io/" },
    ],
  },
  "base": {
    name: "Base",
    titleZh: "Base 专栏 - 实时机会与新闻",
    titleEn: "Base Column - Live Opportunities & News",
    officialLinks: [
      { label: "Base", href: "https://www.base.org/" },
    ],
  },
  "optimism": {
    name: "Optimism",
    titleZh: "Optimism 专栏 - 实时机会与新闻",
    titleEn: "Optimism Column - Live Opportunities & News",
    officialLinks: [
      { label: "Optimism", href: "https://www.optimism.io/" },
    ],
  },
  "sui": {
    name: "Sui",
    titleZh: "Sui 专栏 - 实时机会与新闻",
    titleEn: "Sui Column - Live Opportunities & News",
    officialLinks: [
      { label: "Sui", href: "https://sui.io/" },
    ],
  },
  "aptos": {
    name: "Aptos",
    titleZh: "Aptos 专栏 - 实时机会与新闻",
    titleEn: "Aptos Column - Live Opportunities & News",
    officialLinks: [
      { label: "Aptos", href: "https://aptosfoundation.org/" },
    ],
  },
};

export default function ChainColumnPage() {
  const params = useParams() as { slug?: string };
  const slug = (params?.slug ?? "").toLowerCase();

  const meta = useMemo(() => {
    const found = CHAINS[slug];
    if (found) return { ...found, slug };
    const title = slug ? slug.replace(/-/g, " ") : "Chain";
    const name = title.split(" ").map(s => s.slice(0, 1).toUpperCase() + s.slice(1)).join(" ");
    return {
      name,
      slug,
      titleZh: `${name} 专栏 - 实时机会与新闻`,
      titleEn: `${name} Column - Live Opportunities & News`,
      officialLinks: [],
    };
  }, [slug]);

  return <ColumnTemplatePage kind="chain" meta={meta} />;
}

