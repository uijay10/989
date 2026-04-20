import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, ExternalLink, BellPlus } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getApiBase } from "@/lib/api-base";

export type ColumnKind = "chain" | "exchange";

type ColumnMeta = {
  name: string;            // display name, e.g. "Solana" / "BNB Chain"
  slug: string;            // url slug, e.g. "solana" / "bnb-chain"
  titleZh: string;
  titleEn: string;
  officialLinks?: { label: string; href: string }[];
};

type Item = {
  id: string | number;
  title: string;
  description?: string | null;
  createdAt?: string | null;
  source?: string | null;
  url?: string | null;
  tags?: string[] | null;
};

function humanTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export function ColumnTemplatePage({
  kind,
  meta,
}: {
  kind: ColumnKind;
  meta: ColumnMeta;
}) {
  const { lang } = useLang();
  const isZh = lang === "zh-CN";

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const title = isZh ? meta.titleZh : meta.titleEn;

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "40");
    p.set("page", "1");
    if (debounced) p.set("q", debounced);
    // - tag filters:
    if (kind === "chain") p.set("chain", meta.name);
    if (kind === "exchange") p.set("exchange", meta.name);
    return p.toString();
  }, [debounced, kind, meta.name]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        // Use posts endpoint as a placeholder feed source.
        // Backend can later route this to an events endpoint with tag filters.
        const res = await fetch(`${getApiBase()}/posts?${queryParams}`);
        const data = await res.json().catch(() => ({}));
        const list: Item[] = (data?.posts ?? data?.items ?? []) as Item[];
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/70 bg-white/65 backdrop-blur-sm px-6 py-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isZh
                ? "聚合该生态相关快讯与机会（含来源标注），支持筛选与搜索。"
                : "A curated feed of news and opportunities with source attribution, filters, and search."}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 shadow-md shadow-blue-300/50 transition whitespace-nowrap"
            title={isZh ? "订阅该专栏更新（占位）" : "Subscribe (placeholder)"}
          >
            <BellPlus className="w-4 h-4" />
            {isZh ? "订阅该专栏更新" : "Subscribe"}
          </button>
        </div>

        {/* Search */}
        <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isZh ? "搜索标题 / 关键词 / 来源..." : "Search title / keywords / source..."}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200/70 bg-white/80 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/60 border border-slate-200/60 animate-pulse" />
            ))
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white/65 px-6 py-10 text-center text-sm text-slate-500">
              {isZh ? "暂无内容（后台打标与专栏过滤接入后将自动显示）" : "No items yet (will appear after tagging & filters are wired up)."}
              <div className="mt-3">
                <Link href="/" className="text-blue-600 font-semibold hover:underline">
                  {isZh ? "返回首页" : "Back to Home"}
                </Link>
              </div>
            </div>
          ) : (
            items.map((it) => (
              <div key={String(it.id)} className="rounded-2xl border border-slate-200/70 bg-white/65 backdrop-blur-sm px-5 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-slate-900 leading-snug">
                      {it.url ? (
                        <a href={it.url} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">
                          {it.title}
                        </a>
                      ) : (
                        it.title
                      )}
                    </div>
                    {it.description && (
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed line-clamp-2">{it.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {it.createdAt && <span>{humanTime(it.createdAt)}</span>}
                      {it.source && <span>来源：{it.source}</span>}
                      {it.tags?.slice(0, 6)?.map((tg) => (
                        <span key={tg} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                          {tg}
                        </span>
                      ))}
                    </div>
                  </div>
                  {it.url && (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 w-9 h-9 rounded-xl border border-slate-200/70 bg-white/70 hover:bg-white flex items-center justify-center transition"
                      title={isZh ? "打开原文" : "Open source"}
                    >
                      <ExternalLink className="w-4 h-4 text-slate-600" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Official links */}
        <aside className="space-y-3">
          <div className="rounded-2xl border border-slate-200/70 bg-white/65 backdrop-blur-sm px-5 py-4 shadow-sm">
            <div className="text-sm font-extrabold text-slate-900">{isZh ? "官方链接" : "Official Links"}</div>
            <div className="mt-3 space-y-2">
              {(meta.officialLinks ?? []).length === 0 ? (
                <div className="text-sm text-slate-500">
                  {isZh ? "稍后补充（占位）" : "Coming soon (placeholder)"}
                </div>
              ) : (
                meta.officialLinks!.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white transition"
                  >
                    <span className="truncate">{l.label}</span>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

