import { useMemo } from "react";
import { useParams } from "wouter";
import { EventList } from "@/components/events/EventList";
import { useLang } from "@/lib/i18n";

const EXCHANGES: Record<string, { name: string; titleZh: string; titleEn: string; officialLinks?: { label: string; href: string }[] }> = {
  "binance": {
    name: "Binance",
    titleZh: "Binance 专栏 - 公告与机会",
    titleEn: "Binance Column - Announcements & Opportunities",
    officialLinks: [
      { label: "Binance Announcements", href: "https://www.binance.com/en/support/announcement" },
    ],
  },
  "bybit": {
    name: "Bybit",
    titleZh: "Bybit 专栏 - 公告与机会",
    titleEn: "Bybit Column - Announcements & Opportunities",
    officialLinks: [
      { label: "Bybit Announcements", href: "https://announcements.bybit.com/" },
    ],
  },
  "coinbase": {
    name: "Coinbase",
    titleZh: "Coinbase 专栏 - 公告与机会",
    titleEn: "Coinbase Column - Announcements & Opportunities",
    officialLinks: [
      { label: "Coinbase", href: "https://www.coinbase.com/" },
    ],
  },
  "kraken": {
    name: "Kraken",
    titleZh: "Kraken 专栏 - 公告与机会",
    titleEn: "Kraken Column - Announcements & Opportunities",
    officialLinks: [
      { label: "Kraken Announcements", href: "https://www.kraken.com/learn/announcements" },
    ],
  },
};

export default function ExchangeColumnPage() {
  const params = useParams() as { slug?: string };
  const slug = (params?.slug ?? "").toLowerCase();
  const { lang } = useLang();

  const meta = useMemo(() => {
    const found = EXCHANGES[slug];
    if (found) return { ...found, slug };
    const title = slug ? slug.replace(/-/g, " ") : "Exchange";
    const name = title.split(" ").map(s => s.slice(0, 1).toUpperCase() + s.slice(1)).join(" ");
    return {
      name,
      slug,
      titleZh: `${name} 专栏 - 公告与机会`,
      titleEn: `${name} Column - Announcements & Opportunities`,
      officialLinks: [],
    };
  }, [slug]);

  const title = lang === "zh-CN" ? meta.titleZh : meta.titleEn;
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <EventList key={`exchange:${slug}`} sectionName={title} exchange={meta.name} />
    </div>
  );
}

