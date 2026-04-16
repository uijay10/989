import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLang } from '@/lib/i18n';
import { getApiBase } from '@/lib/api-base';

interface FeedItem {
  id: string;
  title: string;
  summary?: string;
  time: string;
  category: string;
  source?: string;
  link?: string;
  importance?: string | null;
}

type DisplayFeedItem = FeedItem & { _categories?: string[] };

const SECTION_LABEL_ZH: Record<string, string> = {
  "724news":  "7*24快讯",
  flash:      "7*24快讯",
  ido:        "IDO/Launchpad",
  funding:    "融资公告",
  quest:      "活动奖励",
  airdrop:    "活动奖励",
  policy:     "政策监管",
  testnet:    "测试网",
  nodes:      "节点招募",
  recruiting: "招聘",
  devbounty:  "开发者漏洞奖金",
  grant:      "捐赠/赞助",
};

const SECTION_LABEL_EN: Record<string, string> = {
  "724news":  "7*24 News",
  flash:      "7*24 News",
  ido:        "IDO/Launchpad",
  funding:    "Funding",
  quest:      "On-chain Rewards",
  airdrop:    "On-chain Rewards",
  policy:     "Regulation",
  testnet:    "Testnet",
  nodes:      "Node Recruitment",
  recruiting: "Hiring",
  devbounty:  "Dev & Bug Bounty",
  grant:      "Grants & Sponsorship",
};

const POLL_INTERVAL_MS = 60 * 1000; // 60秒轮询一次

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function getDedupKey(item: FeedItem): string {
  // 更激进：按「标题 + 域名」合并，同一网站上标题完全相同的视为同一条快讯
  const title = normalizeText(item.title || "");
  let host = "";
  if (item.link && item.link.trim()) {
    try {
      host = new URL(item.link.trim()).hostname.toLowerCase();
    } catch {
      host = item.link.trim().toLowerCase();
    }
  }
  return `text:${title}::${host}`;
}

type ImportanceLevel = "high" | "medium" | "low";

/** Map DB / AI free-text to a stable level; many old rows store Chinese or mixed casing. */
function normalizeImportanceValue(raw: unknown): ImportanceLevel | null {
  if (raw === null || raw === undefined) return null;
  const s0 = String(raw).trim().replace(/\u00a0/g, " ");
  if (!s0) return null;
  const lower = s0.toLowerCase();

  if (["high", "critical", "important", "major", "severe", "urgent"].includes(lower)) return "high";
  if (["medium", "normal", "general", "moderate", "avg", "average"].includes(lower)) return "medium";
  if (["low", "minor", "trivial"].includes(lower)) return "low";

  if (s0 === "高" || s0 === "重要" || s0 === "紧急" || s0 === "极高") return "high";
  if (s0 === "中" || s0 === "一般" || s0 === "中等" || s0 === "中度") return "medium";
  if (s0 === "低" || s0 === "普通" || s0 === "次要") return "low";

  if (/重要|紧急|极高|[高中](?:级|风险|优先|权重)|热点|\bhigh\b|\burgent\b|\bcritical\b/i.test(s0)) {
    if (/低(?:级|风险|优先|于)?|普通|次要|\blow\b|\bminor\b/i.test(s0)) return "low";
    return "high";
  }
  if (/中等|一般|中度|中性|\bmedium\b|\bnormal\b|\bmoderate\b/i.test(s0)) return "medium";
  if (/低(?:级|风险|优先|于)?|普通|次要|轻微|\blow\b|\bminor\b/i.test(s0)) return "low";

  return null;
}

function inferImportanceFromContent(text: string): ImportanceLevel | null {
  const t = text.trim();
  if (!t) return null;

  const tagged = t.match(/importance["'\s:：]+([a-z\u4e00-\u9fff]{1,24})/i);
  if (tagged?.[1]) {
    const v = normalizeImportanceValue(tagged[1]);
    if (v) return v;
  }

  if (/\bhigh\b|\burgent\b|\bcritical\b|重要|高优先级|极高|紧急/i.test(t)) return "high";
  if (/\bmedium\b|\bnormal\b|\bmoderate\b|一般|中等|中度/i.test(t)) return "medium";
  if (/\blow\b|\bminor\b|普通|次要|轻微/i.test(t)) return "low";

  return null;
}

function resolveImportanceLevel(item: FeedItem): ImportanceLevel | null {
  const fromField = normalizeImportanceValue(item.importance);
  if (fromField) return fromField;
  const fromSummary = inferImportanceFromContent(item.summary ?? "");
  if (fromSummary) return fromSummary;
  return inferImportanceFromContent(item.title ?? "");
}

/** Deeper blue / red than default link blue so differences are obvious in light mode. */
function titleBlockClass(level: ImportanceLevel | null): string {
  const base = "text-xl font-semibold leading-tight mb-2";
  if (level === "high") return `${base} text-[#EF4444] dark:text-[#F87171]`;
  if (level === "medium") return `${base} text-[#0052D9] dark:text-[#5B9FFF]`;
  return `${base} text-gray-900 dark:text-zinc-100`;
}

function titleLinkClass(level: ImportanceLevel | null): string {
  const base = "hover:underline";
  if (level === "high") return `${base} text-[#EF4444] dark:text-[#F87171]`;
  if (level === "medium") return `${base} text-[#0052D9] dark:text-[#5B9FFF]`;
  return `${base} text-gray-900 dark:text-zinc-100`;
}

function titleInlineStyle(level: ImportanceLevel | null): React.CSSProperties | undefined {
  if (level === "high") {
    const c = "#EF4444";
    return { color: c, WebkitTextFillColor: c };
  }
  if (level === "medium") {
    const c = "#0052D9";
    return { color: c, WebkitTextFillColor: c };
  }
  return undefined;
}

const Unified724Feed: React.FC = () => {
  const { lang, t } = useLang();
  const SECTION_LABEL = lang === 'zh-CN' ? SECTION_LABEL_ZH : SECTION_LABEL_EN;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | string>('all');
  const [newCount, setNewCount] = useState(0); // 新到文章数

  const observerRef = useRef<HTMLDivElement>(null);
  const loadingRef  = useRef(false);
  const topIdRef    = useRef<string | null>(null); // 当前列表最新文章 id

  const displayItems: DisplayFeedItem[] = useMemo(() => {
    // In "All", collapse dual-published duplicates (板块 + 7×24快讯)
    if (activeTab !== "all") return items;

    const out: DisplayFeedItem[] = [];
    const seen = new Map<string, DisplayFeedItem>();
    for (const it of items) {
      const key = getDedupKey(it);
      const existing = seen.get(key);
      if (!existing) {
        const first: DisplayFeedItem = { ...it, _categories: [it.category] };
        seen.set(key, first);
        out.push(first);
        continue;
      }
      const cats = existing._categories ?? [existing.category];
      if (!cats.includes(it.category)) {
        existing._categories = [...cats, it.category];
      }
    }
    return out;
  }, [items, activeTab]);

  const displayTotal = useMemo(() => {
    return activeTab === "all" ? displayItems.length : total;
  }, [activeTab, displayItems.length, total]);

  const loadFeed = useCallback(async (reset = false) => {
    if (loadingRef.current || (!hasMore && !reset)) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const tabParam = activeTab === 'all' ? '' : `&category=${activeTab}`;
      const currentPage = reset ? 1 : page;

      const url = `${getApiBase()}/feed?page=${currentPage}&limit=30${tabParam}`;

      const res = await fetch(url);
      const data = await res.json();

      const incoming: FeedItem[] = data.items || [];

      if (reset) {
        setItems(incoming);
        setTotal(data.total || 0);
        setPage(2);
        setNewCount(0);
        topIdRef.current = incoming[0]?.id ?? null;
      } else {
        setItems((prev) => [...prev, ...incoming]);
        setPage((prev) => prev + 1);
      }

      setHasMore(data.hasMore ?? false);
    } catch (error) {
      console.error('加载快讯失败:', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [page, activeTab, loading, hasMore]);

  // Tab 切换时重置并重新加载
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setTotal(0);
    setNewCount(0);
    topIdRef.current = null;
    loadFeed(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 自动轮询：每 60 秒静默检查有无新文章
  useEffect(() => {
    const poll = async () => {
      try {
        const tabParam = activeTab === 'all' ? '' : `&category=${activeTab}`;
        const res = await fetch(`${getApiBase()}/feed?page=1&limit=5${tabParam}`);
        const data = await res.json();
        const latest: FeedItem[] = data.items || [];
        if (!latest.length) return;

        const currentTopId = topIdRef.current;
        if (!currentTopId) {
          topIdRef.current = latest[0].id;
          return;
        }

        // 计算有多少篇文章比当前列表顶部更新
        const newItems = latest.filter(i => Number(i.id) > Number(currentTopId));
        if (newItems.length > 0) {
          setNewCount(prev => prev + newItems.length);
        }
      } catch {
        // 静默失败
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeTab]);

  // 点击"查看新文章"提示条 → 重新从头加载
  const handleRefresh = useCallback(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setTotal(0);
    setNewCount(0);
    topIdRef.current = null;
    loadFeed(true);
  }, [loadFeed]);

  // 无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadFeed();
        }
      },
      { threshold: 0.8 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [loadFeed, hasMore, loading]);


  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">{t('nav_724news')}</h2>
        {displayTotal > 0 && (
          <div className="text-sm text-gray-500">
            {lang === 'zh-CN'
              ? <>{'\u5171'} <span className="font-semibold text-black dark:text-white">{displayTotal}</span> {'\u6761'}</>
              : <><span className="font-semibold text-black dark:text-white">{displayTotal}</span> articles</>
            }
          </div>
        )}
      </div>

      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-2 mb-8 border-b pb-4">
        {['all', '724news', 'ido', 'funding', 'quest', 'policy', 'testnet', 'nodes', 'recruiting', 'devbounty', 'grant'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300'
            }`}
          >
            {tab === 'all' ? (lang === 'zh-CN' ? '全部' : 'All') : (SECTION_LABEL[tab] ?? tab)}
          </button>
        ))}
      </div>

      {/* 新文章提示条 */}
      {newCount > 0 && (
        <button
          onClick={handleRefresh}
          className="w-full mb-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {lang === 'zh-CN'
            ? `↑ 有 ${newCount} 篇新文章，点击刷新`
            : `↑ ${newCount} new article${newCount > 1 ? 's' : ''} — click to refresh`
          }
        </button>
      )}

      {/* 文章列表 */}
      <div className="space-y-6">
        {displayItems.length === 0 && !loading && (
          <div className="py-16 text-center text-gray-400">暂无内容</div>
        )}
        {displayItems.map((item) => {
          const impLevel = resolveImportanceLevel(item);
          return (
          <div key={item.id} className="border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              {(item._categories?.length ? item._categories : [item.category]).map((cat) => (
                <span
                  key={cat}
                  className="text-xs font-medium px-3 py-1 bg-blue-100 text-blue-700 rounded-full"
                  title={activeTab === "all" && (item._categories?.length ?? 0) > 1 ? (lang === "zh-CN" ? "同一条新闻已同步到多个板块" : "This story is published in multiple sections") : undefined}
                >
                  {SECTION_LABEL[cat] ?? cat}
                </span>
              ))}
              <span className="text-xs text-gray-500">{item.time}</span>
            </div>
            <h3
              className={titleBlockClass(impLevel)}
              style={titleInlineStyle(impLevel)}
            >
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={titleLinkClass(impLevel)}
                  style={titleInlineStyle(impLevel)}
                >
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </h3>
            {item.summary && (
              <p className="text-gray-600 dark:text-zinc-400 text-[15px] leading-relaxed">{item.summary}</p>
            )}
          </div>
        );
        })}
      </div>

      {/* 无限滚动触发器 */}
      {hasMore && (
        <div ref={observerRef} className="py-16 text-center text-gray-500">
          {loading ? '正在加载更多...' : '向下滚动加载更多历史文章'}
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="py-16 text-center text-gray-400">🎉 已加载全部已发布文章</div>
      )}
    </div>
  );
};

export { Unified724Feed };
