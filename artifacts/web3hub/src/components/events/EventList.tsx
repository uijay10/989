import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ExternalLink, Pin, Shuffle, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import {
  type Web3Event,
  isEventExpired,
  formatRelativeTime,
  formatSourceLabel,
} from "@/lib/events";
import { useEventFilter } from "@/lib/event-filter-context";
import { useLang } from "@/lib/i18n";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { AdminPinModal, PostCard } from "@/components/post-card";
import { getApiBase } from "@/lib/api-base";
import { semanticDedupKey } from "@/lib/semantic-title-key";

const SECTION_TO_ZH: Record<string, string> = {
  testnet:   "测试网",
  "724news": "7*24快讯",
  flash:     "7*24快讯",
  ido:       "IDO/Launchpad",
  presale:   "预售",
  funding:   "融资公告",
  airdrop:   "链上奖励/空投",
  recruiting:"招聘",
  nodes:     "节点招募",
  mainnet:   "主网上线",
  exchange:  "交易所上线",
  quest:     "链上奖励/空投",
  developer:  "开发者专区",
  devbounty:  "开发者漏洞奖金",
  grant:      "项目捐赠/赞助",
  bugbounty:  "漏洞赏金",
};

const SECTION_TO_EN: Record<string, string> = {
  testnet:   "Testnet",
  "724news": "7*24 News",
  flash:     "7*24 News",
  ido:       "IDO/Launchpad",
  presale:   "Presale",
  funding:   "Funding",
  airdrop:   "On-chain Rewards",
  recruiting:"Hiring",
  nodes:     "Node Recruitment",
  mainnet:   "Mainnet Launch",
  exchange:  "Exchange Listing",
  quest:     "On-chain Rewards",
  developer:  "Developer Zone",
  devbounty:  "Dev & Bug Bounty",
  grant:      "Grants & Sponsorship",
  bugbounty:  "Bug Bounty",
};

function getSectionLabel(section: string, lang: string): string {
  const map = lang === "zh-CN" ? SECTION_TO_ZH : SECTION_TO_EN;
  return map[section] ?? section;
}

function getEventDisplayKey(e: Web3Event): string | null {
  return semanticDedupKey(e.title ?? "", e.source_url);
}

const CAT_I18N: Record<string, string> = {
  "快讯":       "nav_flash",
  "测试网":     "nav_testnet",
  "IDO/Launchpad": "nav_ido",
  "预售":       "nav_presale",
  "融资公告":   "nav_funding",
  "链上奖励/空投": "nav_quest",
  "空投":       "nav_quest",
  "链上任务":   "nav_quest",
  "招聘":       "nav_recruiting",
  "节点招募":   "nav_nodes",
  "主网上线":   "nav_mainnet",
  "交易所上线": "nav_exchange",
  "开发者专区": "nav_developer",
  "开发者漏洞奖金": "nav_devbounty",
  "项目捐赠/赞助": "nav_grant",
  "漏洞赏金":     "nav_bugbounty",
};

/** Align with feed / DB: English + Chinese; anything else → no Hot·Normal badge & default title color. */
function normalizeEventImportance(imp?: string | null): "high" | "medium" | "other" {
  if (imp == null) return "other";
  const s0 = String(imp).trim().replace(/\u00a0/g, " ");
  if (!s0) return "other";
  const lower = s0.toLowerCase();
  if (["high", "critical", "important", "urgent", "severe", "major"].includes(lower)) return "high";
  if (["medium", "normal", "general", "moderate", "average"].includes(lower)) return "medium";
  if (s0 === "高" || s0 === "重要" || s0 === "紧急" || s0 === "极高") return "high";
  if (s0 === "中" || s0 === "一般" || s0 === "中等" || s0 === "中度") return "medium";
  if (["low", "minor", "trivial"].includes(lower) || s0 === "低" || s0 === "普通" || s0 === "次要") return "other";
  return "other";
}

function importanceDot(importance?: string | null) {
  const level = normalizeEventImportance(importance);
  if (level === "high") return "bg-red-500";
  if (level === "medium") return "bg-amber-400";
  return null;
}

function eventTitleClass(level: "high" | "medium" | "other"): string {
  const base = "text-lg font-semibold leading-snug mb-2 transition-colors";
  if (level === "high") {
    // 明亮正红（接近你截图的红），浅色模式下非常纯红；深色模式略微变浅避免发黑
    return `${base} text-[#EF4444] dark:text-[#F87171] group-hover:text-[#EF4444] dark:group-hover:text-[#F87171]`;
  }
  if (level === "medium") {
    // 更深饱和蓝（参考客户端「一般」标签）；悬停不变色
    return `${base} text-[#0052D9] dark:text-[#5B9FFF] group-hover:text-[#0052D9] dark:group-hover:text-[#5B9FFF]`;
  }
  return `${base} text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400`;
}

function importanceSortRank(imp?: string | null): number {
  const l = normalizeEventImportance(imp);
  if (l === "high") return 0;
  if (l === "medium") return 1;
  return 2;
}

function EventRow({
  event,
  lang,
  tFn,
  adminUser,
  currentWallet,
  onPinRequest,
  onDeleteRequest,
}: {
  event: Web3Event;
  lang: string;
  tFn: (k: string) => string;
  adminUser: boolean;
  currentWallet?: string;
  onPinRequest: (id: number | string) => void;
  onDeleteRequest: (id: number | string) => void;
}) {
  const zh = lang === "zh-CN";
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    setIsClamped(el.scrollHeight > el.clientHeight);
  }, [event.description, expanded]);
  const cats = event.category ?? [];
  const srcLabel = formatSourceLabel(event.source_url);
  const relTime = formatRelativeTime(event.crawl_time ?? event.start_time, lang);
  const impLevel = normalizeEventImportance(event.importance);
  const dot = importanceDot(event.importance);
  const iLabel =
    impLevel === "high" ? (zh ? "重要" : "Hot")
    : impLevel === "medium" ? (zh ? "一般" : "Normal")
    : "";

  const isUserPost = event.authorType && event.authorType !== "ai";
  const isOwnPost = currentWallet && event.authorWallet &&
    currentWallet.toLowerCase() === event.authorWallet.toLowerCase();
  const canControl = adminUser || isOwnPost;

  const spaceTypeLabel = (t: string) => {
    if (t === "project") return zh ? "项目方" : "Project";
    if (t === "kol") return "KOL";
    if (t === "developer") return zh ? "开发者" : "Dev";
    return t;
  };

  return (
    <li className={`py-4 border-b border-slate-200 dark:border-slate-700 last:border-0 group list-none ${
      isUserPost ? "bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-950/20 dark:to-transparent rounded-lg px-3 -mx-3" : ""
    }`}>
      <div className="flex items-center mb-1.5 gap-2">
        <span className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono shrink-0">{relTime}</span>
          {isUserPost && event.authorName && (
            <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 font-medium min-w-0">
              <span className="w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-[10px] shrink-0">👤</span>
              <span className="truncate">{event.authorName}</span>
              {event.authorType && (
                <span className="px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-500 dark:text-violet-400 text-[10px] font-semibold shrink-0">
                  {spaceTypeLabel(event.authorType)}
                </span>
              )}
            </span>
          )}
        </span>
        {adminUser && event.id != null && (
          <button
            onClick={() => onPinRequest(event.id!)}
            title={zh ? "置顶" : "Pin"}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-500"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}
        {canControl && event.id != null && (
          <button
            onClick={() => onDeleteRequest(event.id!)}
            title={zh ? "删除此帖子" : "Delete post"}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <h3 className={eventTitleClass(impLevel)}>
        {event.title}
      </h3>

      {(cats.length > 0 || iLabel) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {cats.map(c => (
            <span key={c} className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-medium">
              {CAT_I18N[c] ? tFn(CAT_I18N[c]) : c}
            </span>
          ))}
          {iLabel && dot && (
            <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
              {iLabel}
            </span>
          )}
        </div>
      )}

      {event.description && (
        <div className="mb-2.5">
          <p ref={descRef} className={`text-base text-slate-600 dark:text-slate-400 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
            {event.description}
          </p>
          {(isClamped || expanded) && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="text-xs text-violet-500 hover:text-violet-700 mt-1 font-medium"
            >
              {expanded ? (zh ? "收起" : "Show less") : (zh ? "展开更多" : "Show more")}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {(event.tags ?? []).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              #{tag}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {isUserPost ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-500 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
              {zh ? "用户发布" : "User Post"}
            </span>
          ) : event.source_url && event.source_url !== "#" ? (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <span>{zh ? "信息来源：" : "Source: "}{srcLabel}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : srcLabel ? (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {zh ? "信息来源：" : "Source: "}{srcLabel}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/* ── Sorting helpers ─────────────────────────────────────── */

function getSourceKey(url?: string): string {
  if (!url || url === "#") return "_unknown";
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 40); }
}

/** LCG-based seeded shuffle — stable per session seed */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Round-robin interleave across source domains so no single
 * source dominates consecutive rows.
 */
function spreadBySource(posts: Web3Event[], seed?: number): Web3Event[] {
  if (posts.length <= 3) return posts;

  const buckets = new Map<string, Web3Event[]>();
  for (const post of posts) {
    const src = getSourceKey(post.source_url);
    if (!buckets.has(src)) buckets.set(src, []);
    buckets.get(src)!.push(post);
  }

  let queues = [...buckets.values()];
  // Shuffle bucket order (so the same source isn't always column-1)
  if (seed !== undefined) queues = seededShuffle(queues, seed);

  const result: Web3Event[] = [];
  while (result.length < posts.length) {
    let progressed = false;
    for (const q of queues) {
      if (q.length > 0) { result.push(q.shift()!); progressed = true; }
    }
    if (!progressed) break;
  }
  return result;
}

/* ── Module-level cache (survives re-renders / navigation) ── */
const _eventsCache = new Map<string, Web3Event[]>();
const _pinnedCache = new Map<string, any[]>();
const _cacheTs = new Map<string, number>();
const _totalCache = new Map<string, number>(); // per-section historical total
const CACHE_TTL = 60_000; // 60 s — background-refresh after this
/** Poll so new scraped posts appear without manual reload (tab visible only). */
const AUTO_REFRESH_MS = 30_000;

/* ── EventList component ─────────────────────────────────── */

export function EventList({
  sectionSlug,
  sectionName,
  chain,
  exchange,
}: {
  sectionSlug?: string;
  sectionName?: string;
  chain?: string;
  exchange?: string;
} = {}) {
  const { activeCategory } = useEventFilter();
  const { t, lang } = useLang();
  const zh = lang === "zh-CN";
  const { address } = useWeb3Auth();
  const adminUser = isAdmin(address);
  // User requirement: no pinned area anywhere (including homepage).
  const showPinned = false;

  /** Stable random seed for this browser session */
  const sessionSeed = useRef(Math.random() * 0xffffffff >>> 0);

  const cacheKey = sectionSlug ?? "__home__";

  const [allEvents, setAllEvents] = useState<Web3Event[]>(() => _eventsCache.get(cacheKey) ?? []);
  const [pinnedPosts, setPinnedPosts] = useState<any[]>(() => _pinnedCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !_eventsCache.has(cacheKey));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [serverOffset, setServerOffset] = useState(0);
  const [serverTotal, setServerTotal] = useState(() => _totalCache.get(cacheKey) ?? 0);
  const [page, setPage] = useState(1);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"time" | "importance" | "random">("time");
  const [fetchTick, setFetchTick] = useState(0);
  const PAGE_LIMIT = 50;

  const [pinTargetId, setPinTargetId] = useState<number | string | null>(null);
  const [pinHours, setPinHours] = useState<number | "">(72);
  const [pinCustom, setPinCustom] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinMsg, setPinMsg] = useState("");

  const [deleteTargetId, setDeleteTargetId] = useState<number | string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refetch = useCallback(() => setFetchTick(t => t + 1), []);

  // Auto-refresh list while user stays on the page (new AI posts from scraper).
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setFetchTick(t => t + 1);
    };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [cacheKey]);

  // ==================== 新增：全局去重函数（放在 refetch 之后） ====================
  const deduplicateEvents = useCallback((events: Web3Event[]) => {
    const seen = new Set<string>();
    return events.filter((event) => {
      // 三重去重：id + title + source_url
      const key = `${event.id || ''}-${(event.title || '').trim()}-${event.source_url || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  useEffect(() => {
    const cached = _eventsCache.get(cacheKey);
    const ts = _cacheTs.get(cacheKey) ?? 0;
    const stale = Date.now() - ts > CACHE_TTL;

    // If we have fresh cache — show immediately, skip network
    if (cached && !stale && fetchTick === 0) {
      const cachedTotal = _totalCache.get(cacheKey);
      if (cachedTotal !== undefined) setServerTotal(cachedTotal);
      return;
    }

    // If we have stale cache — show it instantly, then refresh silently
    if (cached) {
      setLoading(false); // keep old data visible while refreshing
    } else {
      setLoading(true);
    }
    setError("");

    const buildUrl = (page: number) => {
      const lim = PAGE_LIMIT;
      const cats = sectionSlug === "quest"
        ? "quest,airdrop"
        : sectionSlug === "ido"
        ? "ido,mainnet,exchange,presale"
        : sectionSlug
        ? sectionSlug
        : "all";
      const extra =
        (chain ? `&chain=${encodeURIComponent(chain)}` : "") +
        (exchange ? `&exchange=${encodeURIComponent(exchange)}` : "");
      return `${getApiBase()}/feed?category=${encodeURIComponent(cats)}&limit=${lim}&page=${page}${extra}`;
    };

    Promise.all([
      fetch(buildUrl(1)).then(r => r.ok ? r.json() : { items: [], total: 0, hasMore: false }),
      showPinned
        ? fetch(`${getApiBase()}/posts?pinned=1&limit=16`).then(r => r.ok ? r.json() : { posts: [] })
        : Promise.resolve({ posts: [] }),
    ]).then(([aiData, pinnedData]) => {
      const aiPosts: Array<Record<string, unknown>> = Array.isArray((aiData as any).items) ? (aiData as any).items : [];
      const pinned: any[] = Array.isArray(pinnedData.posts) ? pinnedData.posts : [];
      setPinnedPosts(pinned);

      const pinnedIds = new Set(pinned.map((p: any) => p.id));
      const events: Web3Event[] = aiPosts
        .filter(p => !pinnedIds.has(p.id))
        .map((p) => ({
          id: p.id as number | string,
          title: p.title as string,
          description: (p.summary as string) ?? (p.content as string),
          project_name: (p.source as string) ?? "",
          category: (p.category ? [getSectionLabel(p.category as string, lang)] : []) as string[],
          source_url: (p.link as string) ?? (p.sourceUrl as string) ?? undefined,
          importance: (p.importance as string) ?? "medium",
          crawl_time: (p.time as string) ?? (p.createdAt as string),
        }));

      // Write to cache
      _eventsCache.set(cacheKey, events);
      _pinnedCache.set(cacheKey, pinned);
      _cacheTs.set(cacheKey, Date.now());

      // 先去重，再按 crawl_time 严格降序排序
      setAllEvents(deduplicateEvents(events).sort((a, b) => {
        const timeA = new Date(a.crawl_time || 0).getTime();
        const timeB = new Date(b.crawl_time || 0).getTime();
        return timeB - timeA;
      }));
      setServerOffset(aiPosts.length);
      setHasMore(Boolean((aiData as any).hasMore));
      const displayCount = Number((aiData as any).total ?? 0);
      if (displayCount) { setServerTotal(displayCount); _totalCache.set(cacheKey, displayCount); }
      // 同步 ref，让 loadMore 从正确 offset 开始
      _lmOffset.current  = aiPosts.length;
      _lmHasMore.current = Boolean((aiData as any).hasMore);
      setLoading(false);
    }).catch(() => {
      setError(zh ? "数据加载失败，请刷新重试" : "Failed to load data, please refresh");
      setLoading(false);
    });
  }, [fetchTick, sectionSlug, cacheKey]);

  // ==================== 无限滚动 - 全用 ref 做守卫，彻底消除竞争 ====================
  // 初始值从缓存推算：缓存有50条说明可能还有更多，缓存有N<50条说明已全部加载
  const _cachedLen  = _eventsCache.get(cacheKey)?.length ?? 0;
  const _lmLoading  = useRef(false);
  const _lmHasMore  = useRef(_cachedLen === 0 || _cachedLen >= PAGE_LIMIT); // 无缓存或缓存满50条→可能还有更多
  const _lmOffset   = useRef(_cachedLen);  // 从缓存长度开始，跳过已展示的数据

  // 当 section 切换时重置（跳过首次挂载，避免把刚从缓存初始化的 offset 清零）
  const _didMount = useRef(false);
  useEffect(() => {
    if (!_didMount.current) { _didMount.current = true; return; }
    _lmLoading.current = false;
    _lmHasMore.current = true;
    _lmOffset.current  = 0;
    setHasMore(true);
  }, [sectionSlug]);

  const loadMore = useCallback(async () => {
    if (_lmLoading.current || !_lmHasMore.current) return;

    _lmLoading.current = true;
    setLoadingMore(true);

    try {
      const nextPage = page + 1;
      const cats = sectionSlug === "quest"
        ? "quest,airdrop"
        : sectionSlug === "ido"
        ? "ido,mainnet,exchange,presale"
        : sectionSlug
        ? sectionSlug
        : "all";

      const extra =
        (chain ? `&chain=${encodeURIComponent(chain)}` : "") +
        (exchange ? `&exchange=${encodeURIComponent(exchange)}` : "");
      const url = `${getApiBase()}/feed?category=${encodeURIComponent(cats)}&limit=${PAGE_LIMIT}&page=${nextPage}${extra}`;
      const res = await fetch(url);
      const data = await res.json();
      const newItems: any[] = data.items || [];

      setPage(nextPage);
      _lmOffset.current = _lmOffset.current + newItems.length;
      _lmHasMore.current = Boolean(data.hasMore);
      setHasMore(Boolean(data.hasMore));
      const total = Number(data.total ?? 0);
      if (total) { setServerTotal(total); _totalCache.set(cacheKey, total); }

      const newEvents: Web3Event[] = newItems.map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.summary ?? p.content,
        project_name: p.source ?? "",
        category: p.category ? [getSectionLabel(p.category, lang)] : [],
        source_url: p.link ?? p.sourceUrl,
        importance: p.importance ?? "medium",
        crawl_time: p.time ?? p.createdAt,
      }));

      setAllEvents(prev => {
        const deduped = deduplicateEvents([...prev, ...newEvents]);
        return deduped.sort((a, b) =>
          new Date(b.crawl_time || 0).getTime() - new Date(a.crawl_time || 0).getTime()
        );
      });
    } catch (err) {
      console.error("加载更多失败:", err);
    } finally {
      _lmLoading.current = false;  // 同步重置，不等 useEffect
      setLoadingMore(false);
    }
  }, [sectionSlug, deduplicateEvents, page, lang, chain, exchange]); // page drives feed paging

  // 检查是否接近底部，满足则加载下一批
  const checkScrollBottom = useCallback(() => {
    if (_lmLoading.current || !_lmHasMore.current) return;
    const dist = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    if (dist < 600) loadMore();
  }, [loadMore]);

  // scroll 监听
  useEffect(() => {
    window.addEventListener('scroll', checkScrollBottom, { passive: true });
    return () => window.removeEventListener('scroll', checkScrollBottom);
  }, [checkScrollBottom]);

  // 每次 loadMore 完成后延迟检查（处理内容未填满屏幕的情况）
  useEffect(() => {
    if (!loadingMore) {
      const t = setTimeout(checkScrollBottom, 500); // 500ms 等 DOM 渲染完
      return () => clearTimeout(t);
    }
  }, [loadingMore, checkScrollBottom]);

  const getTime = (e: Web3Event) =>
    e.crawl_time ? new Date(e.crawl_time).getTime()
    : e.start_time ? new Date(e.start_time).getTime()
    : 0;

  const base = allEvents
    .filter(e => !isEventExpired(e))
    .filter(e => sectionSlug ? true : activeCategory === "全部" || (e.category ?? []).includes(activeCategory))
    .filter(e => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      );
    });

  // Primary sort
  let primarySorted: Web3Event[];
  if (sortBy === "random") {
    primarySorted = seededShuffle(base, sessionSeed.current);
  } else if (sortBy === "importance") {
    primarySorted = [...base].sort((a, b) => {
      const ia = importanceSortRank(a.importance);
      const ib = importanceSortRank(b.importance);
      if (ia !== ib) return ia - ib;
      return getTime(b) - getTime(a);
    });
  } else {
    primarySorted = [...base].sort((a, b) => getTime(b) - getTime(a));
  }

  // 显示层：按「标题语义指纹 + 域名」去重（相似标题、同站多篇软文、多板块重复会折叠）
  const seenDisplayKeys = new Set<string>();
  const filtered: Web3Event[] = [];
  for (const e of primarySorted) {
    const key = getEventDisplayKey(e);
    if (!key || !seenDisplayKeys.has(key)) {
      if (key) seenDisplayKeys.add(key);
      filtered.push(e);
    }
  }

  const doAdminPin = async () => {
    if (!address || !pinTargetId) return;
    const hours = Number(pinHours);
    if (!hours || hours < 1) return;
    setPinning(true);
    setPinMsg("");
    try {
      const res = await fetch(`${getApiBase()}/posts/${pinTargetId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, durationHours: hours }),
      });
      const d = await res.json();
      if (!res.ok) {
        setPinMsg(`❌ ${d.error}`);
      } else {
        setPinMsg(zh
          ? `✅ 置顶成功！有效期 ${hours >= 24 ? Math.round(hours / 24) + " 天" : hours + " 小时"}`
          : `✅ Pinned for ${hours >= 24 ? Math.round(hours / 24) + "d" : hours + "h"}`);
        refetch();
      }
    } finally {
      setPinning(false);
      setPinTargetId(null);
    }
  };

  const doAdminDelete = async () => {
    if (!address || !deleteTargetId) return;
    setDeleting(true);
    try {
      const res = await fetch(`${getApiBase()}/admin/posts/${deleteTargetId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminWallet: address }),
      });
      if (res.ok) {
        // Remove from local state immediately for instant feedback
        setAllEvents(prev => prev.filter(e => e.id !== deleteTargetId));
        _eventsCache.set(cacheKey, (_eventsCache.get(cacheKey) ?? []).filter((e: Web3Event) => e.id !== deleteTargetId));
      }
    } finally {
      setDeleting(false);
      setDeleteTargetId(null);
    }
  };

  return (
    <div>
      {/* Pinned posts section */}
      {showPinned && pinnedPosts.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
              {zh ? "置顶公告" : "Pinned Announcements"}
            </span>
            <span className="text-xs text-violet-400/70">({pinnedPosts.length})</span>
          </div>
          {pinnedPosts.map((post: any) => (
            <PostCard key={post.id} post={post} onRefresh={refetch} compact />
          ))}
        </div>
      )}

      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            {sectionName ? (
              <span className="text-sm font-semibold text-primary/80 bg-primary/8 px-2 py-0.5 rounded-full">
                {sectionName}
              </span>
            ) : (
              <>🔥 {zh ? "事件聚合" : "Events"}</>
            )}
            {!loading && (
              <span className="text-xs font-normal text-slate-400">
                {zh ? `共 ${serverTotal > 0 ? serverTotal : filtered.length} 条` : `${serverTotal > 0 ? serverTotal : filtered.length} events`}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            {(["time", "importance", "random"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortBy(mode)}
                className={`text-xs px-2.5 py-1 border rounded-full transition-colors ${
                  sortBy === mode
                    ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
                }`}
              >
                {mode === "time"
                  ? (zh ? "⏱ 最新" : "⏱ Latest")
                  : mode === "importance"
                  ? (zh ? "⭐ 热门" : "⭐ Hot")
                  : (zh ? "🔀 随机" : "🔀 Mix")}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={zh ? "搜索项目名称、描述、标签、关键词..." : "Search by project name, description, tags, keywords..."}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 dark:focus:border-blue-600 transition-colors"
          />
        </div>

        {activeCategory !== "全部" && (
          <div className="flex items-center gap-1.5 mb-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{zh ? "筛选：" : "Filter:"}</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-medium">
              {t(CAT_I18N[activeCategory] as any) || activeCategory}
            </span>
          </div>
        )}

        {loading && (
          <ul className="space-y-0">
            {[1, 2, 3].map(i => (
              <li key={i} className="py-4 border-b border-slate-200 dark:border-slate-700 space-y-2.5 animate-pulse">
                <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-5 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-4 w-5/6 bg-slate-100 dark:bg-slate-800 rounded" />
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="text-center py-12 text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm font-medium">
              {zh
                ? (chain || exchange ? "暂无该链/交易所的相关信息" : "暂无相关事件")
                : (chain || exchange ? "No matching chain/exchange info" : "No events found")}
            </p>
            <p className="text-xs mt-1 opacity-70">
              {zh
                ? (chain || exchange ? "可取消上方标签选择以恢复“全部”视图" : "尝试切换分类或清空搜索条件")
                : (chain || exchange ? "Unselect tags above to return to “All”" : "Try switching category or clearing search")}
            </p>
          </div>
        )}

        {!loading && !error && (
          <ul className="space-y-0">
            {filtered.map((event, idx) => (
              <EventRow
                key={event.id ?? idx}
                event={event}
                lang={lang}
                tFn={(k) => t(k as any)}
                adminUser={showPinned && adminUser}
                currentWallet={address ?? undefined}
                onPinRequest={(id) => {
                  setPinTargetId(id);
                  setPinHours(72);
                  setPinCustom(false);
                  setPinMsg("");
                }}
                onDeleteRequest={(id) => setDeleteTargetId(id)}
              />
            ))}
          </ul>
        )}

        {/* 无限滚动触发器 */}
        <div ref={loadMoreTriggerRef} className="h-20 flex items-center justify-center mt-4">
          {loadingMore && (
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm">
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              {zh ? "正在加载更多..." : "Loading more..."}
            </div>
          )}
          {!hasMore && allEvents.length > 0 && !loading && (
            <div className="text-slate-400 dark:text-slate-500 text-xs py-4">
              — {zh ? "已经到底啦，没有更多内容了" : "No more content"} —
            </div>
          )}
        </div>
      </div>

      {/* Admin pin modal (portal) */}
      {pinTargetId != null && createPortal(
        <AdminPinModal
          hours={pinHours}
          setHours={setPinHours}
          custom={pinCustom}
          setCustom={setPinCustom}
          pinning={pinning}
          onConfirm={doAdminPin}
          onClose={() => { setPinTargetId(null); setPinMsg(""); }}
        />,
        document.body
      )}
      {pinMsg && pinTargetId == null && (
        <p className="text-sm mt-3 text-violet-500 font-medium text-center">{pinMsg}</p>
      )}

      {/* Admin delete confirm dialog (portal) */}
      {deleteTargetId != null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {zh ? "确认删除" : "Confirm Delete"}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {zh ? "此操作不可撤销，帖子将被永久删除。" : "This action cannot be undone."}
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteTargetId(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {zh ? "取消" : "Cancel"}
              </button>
              <button
                onClick={doAdminDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {deleting ? (zh ? "删除中…" : "Deleting…") : (zh ? "确认删除" : "Delete")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
