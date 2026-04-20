import { useState, useEffect } from "react";
import { useGetPosts, useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useWeb3Auth } from "@/lib/web3";
import { PenSquare, CheckCircle2, Eye } from "lucide-react";
import { EventList } from "@/components/events/EventList";
import { Link, useLocation } from "wouter";
import { useLang } from "@/lib/i18n";
import { generateGradient } from "@/lib/utils";
import { TagBadge } from "@/components/post-card";
import { RoleBadge } from "@/components/role-badge";
import { PriceTicker } from "@/components/PriceTicker";
import { FEATURES } from "@/lib/feature-flags";
import { HotEcosystemQuickEntry } from "@/components/hot-ecosystem-quick-entry";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { getApiBase } from "@/lib/api-base";
import { semanticTitleKey } from "@/lib/semantic-title-key";

const DATE_LOCALES: Record<string, Locale> = {
  "en": enUS, "zh-CN": zhCN,
};

const PAGE_SIZE = 20;
const PIN_SLOTS = 16;

function getCountdown(until: string) {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return "已到期";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const ss = String(secs).padStart(2, "0");
  if (days > 0) return `${days}d ${hours}h ${mins}m ${ss}s`;
  if (hours > 0) return `${hours}h ${mins}m ${ss}s`;
  return `${mins}m ${ss}s`;
}

function useCountdownStr(until: string | null | undefined) {
  const [cd, setCd] = useState(() => until ? getCountdown(until) : "");
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setCd(getCountdown(until)), 1000);
    return () => clearInterval(id);
  }, [until]);
  return cd;
}

function getSlotCountdown(lastPull: string): string {
  const next = new Date(new Date(lastPull).getTime() + 24 * 60 * 60 * 1000);
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return "";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2,"0")}.${String(m).padStart(2,"0")}.${String(s).padStart(2,"0")}`;
}

function DailyLuckyBtn({ lastSlotPull, label }: { lastSlotPull: string | null; label: string }) {
  const { t } = useLang();
  const [cd, setCd] = useState(() => lastSlotPull ? getSlotCountdown(lastSlotPull) : "");

  useEffect(() => {
    if (!lastSlotPull) { setCd(""); return; }
    const tick = () => setCd(getSlotCountdown(lastSlotPull));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSlotPull]);

  const canPull = !lastSlotPull || Date.now() - new Date(lastSlotPull).getTime() >= 24 * 60 * 60 * 1000;

  if (!canPull && cd) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm select-none cursor-default"
        style={{
          background: "rgba(0,0,0,0.04)",
          border: "1px solid rgba(0,0,0,0.1)",
          color: "#555",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 400,
          letterSpacing: "0.02em",
        }}>
        {t("slotCooldown")} · {cd}
      </span>
    );
  }

  return (
    <a href="/profile"
      className="daily-lucky-btn shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all"
      style={{
        background: "rgba(239,68,68,0.08)",
        color: "#dc2626",
        border: "1px solid rgba(239,68,68,0.3)",
        textDecoration: "none",
        fontWeight: 600,
      }}>
      {t("slotPull")}
    </a>
  );
}

function AuthorAvatar({ wallet, name, avatar, size = "sm" }: {
  wallet: string; name?: string | null; avatar?: string | null; size?: "sm" | "md" | "lg" | "xl";
}) {
  const initials = ((name ?? wallet ?? "?").slice(0, 2)).toUpperCase();
  const cls = size === "xl"
    ? "w-20 h-20 rounded-full shrink-0 flex items-center justify-center text-base font-bold text-white overflow-hidden bg-transparent"
    : size === "lg"
    ? "w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white overflow-hidden bg-transparent"
    : size === "md"
    ? "w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white overflow-hidden bg-transparent"
    : "w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden bg-transparent";
  return (
    <div className={cls} style={avatar ? undefined : { background: generateGradient(wallet ?? "0") }}>
      {avatar ? <img src={avatar} className="w-full h-full object-cover" alt="" /> : initials}
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  testnet: "测试网", ido: "IDO", security: "安全", integration: "集成",
  airdrop: "链上奖励/空投", quest: "链上奖励/空投", events: "活动", funding: "融资", jobs: "求职/招聘",
  nodes: "节点", showcase: "展示", ecosystem: "生态", partners: "合作",
  hackathon: "黑客松", ama: "AMA", bugbounty: "漏洞赏金", community: "社区",
  developer: "开发者", devbounty: "开发者漏洞奖金", kol: "KOL",
};

// ── Pinned card: structured layout ───────────────────────
function PostPinnedCard({ post, idx = 0 }: { post: any; idx?: number }) {
  const { t, lang } = useLang();
  const cd = useCountdownStr(post.pinnedUntil);
  const sectionLabel = t(`nav_${post.section}` as any) || post.section;
  const dateLocale = DATE_LOCALES[lang] ?? enUS;
  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: false, locale: dateLocale }) : "";
  const displayName = post.authorName ?? `${post.authorWallet?.slice(0, 6)}...`;
  return (
    <Link href={`/section/${post.section}`}
      className="pinned-card relative rounded-2xl bg-white dark:bg-slate-800 overflow-hidden flex flex-col hover:scale-[1.03] hover:brightness-105 transition-all duration-300 group cursor-pointer h-full"
      style={{ animationDelay: `${(idx % 8) * 0.6}s` }}>
      <span className="absolute inset-0 rounded-2xl pointer-events-none" />

      {/* Row 1: 标签 (left) | 时间 (right) */}
      <div className="flex items-center justify-between px-3 pt-2 mb-1 gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {post.authorTags?.map((tag: string) => <TagBadge key={tag} tag={tag} />)}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
      </div>

      {/* Row 2: LOGO | 名字 + 身份 (left) | 分区 (right) */}
      <div className="flex items-center mb-2 pl-3 gap-1.5">
        <AuthorAvatar wallet={post.authorWallet} name={post.authorName} avatar={post.authorAvatar} size="lg" />
        <div className="ml-1 flex items-center gap-1 flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-snug truncate">{displayName}</p>
          <RoleBadge spaceType={post.authorType ?? null} size="xs" />
        </div>
        <span className="text-xs text-primary font-semibold px-2 py-0.5 rounded-full bg-primary/10 shrink-0 mr-2">{sectionLabel}</span>
      </div>

      {/* Row 3: 主题 (post title) */}
      <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug px-3 mb-1">{post.title}</p>

      <div className="flex-1" />

      {/* 倒计时 — bottom-left */}
      {cd && (
        <span className="self-start mt-auto mx-3 mb-2 text-xs text-red-500 font-bold bg-red-50 dark:bg-red-950/30 px-2.5 py-0.5 rounded-full">{cd}</span>
      )}
    </Link>
  );
}

function PinnedSlotEmpty({ idx = 0 }: { idx?: number }) {
  return (
    <div
      className="shimmer-cell rounded-xl bg-white/30 dark:bg-slate-800/30 h-full"
      style={{ animationDelay: `${(idx % 8) * 1}s`, opacity: 0.4 }}
    />
  );
}

// ── Regular post card (2-col split layout) ───────────────
function PostRegularCard({ post, num }: { post: any; num: number }) {
  const { t } = useLang();
  const displayName = post.authorName ?? `${post.authorWallet?.slice(0, 6)}...`;
  const sectionLabel = t(`nav_${post.section}` as any) || post.section;
  return (
    <Link href={`/post/${post.id}`}
      className="flex flex-col gap-1.5 px-5 py-4 rounded-2xl border border-border/30 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all group cursor-pointer">
      {/* 第一行：序号 | 头像 | 名字 | 标签 | 分区 | 查看 */}
      <div className="flex items-center gap-3">
        <span className={`text-base font-bold w-9 shrink-0 text-center ${num <= 3 ? "text-red-500" : "text-muted-foreground/50"}`}>{num}</span>
        <div className="shrink-0">
          <AuthorAvatar wallet={post.authorWallet} name={post.authorName} avatar={post.authorAvatar} size="lg" />
        </div>
        <div className="w-36 shrink-0 flex items-center gap-1">
          <p className="text-base font-semibold text-foreground truncate">{displayName}</p>
          <RoleBadge spaceType={post.authorType ?? null} size="xs" />
        </div>
        <div className="flex-1" />
        {post.authorTags?.length > 0 && (
          <div className="shrink-0 flex items-center gap-1">
            {post.authorTags.map((tag: string) => <TagBadge key={tag} tag={tag} />)}
          </div>
        )}
        <span className="shrink-0 text-sm font-semibold px-3.5 py-1.5 rounded-full bg-primary/10 text-primary">{sectionLabel}</span>
        <span className="shrink-0 flex items-center gap-1 text-base text-primary font-semibold group-hover:underline whitespace-nowrap">
          <Eye className="w-4 h-4" /> {t("view")}
        </span>
      </div>
      {/* 第二行：标题（缩进跳过序号） */}
      <p className="text-sm font-semibold text-foreground truncate pl-12 pr-2">{post.title}</p>
    </Link>
  );
}

function ImportantNews({ lang }: { lang: string }) {
  const zh = lang === "zh-CN";
  const { data, isLoading } = useQuery({
    queryKey: ["/api/posts", "important-news-high"],
    queryFn: async () => {
      const res = await fetch(`${getApiBase()}/posts?limit=36&page=1&importance=high&authorType=ai`);
      return res.json() as Promise<{ posts: any[] }>;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const raw = data?.posts ?? [];
  const seen = new Set<string>();
  const posts: any[] = [];
  for (const p of raw) {
    const title = String((p as any).title ?? "").trim();
    // 重要动态：只按「标题语义指纹」折叠，不按域名（各站转载同标题仍只显示一条）
    const sem = semanticTitleKey(title);
    const key = sem ? `inews:${sem}` : `id:${(p as any).id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push(p);
    if (posts.length >= 12) break;
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-base leading-none">🔥</span>
        <span className="font-bold text-[14px] text-slate-800">{zh ? "重要动态" : "Important Updates"}</span>
      </div>
      <ul className="fixed-number-list">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <li key={i} data-number={i + 1}>
                <div className="h-3.5 rounded bg-slate-200 animate-pulse" style={{ width: `${60 + (i % 4) * 10}%` }} />
              </li>
            ))
          : posts.length === 0
          ? (
              <li className="py-4 text-center text-xs text-slate-400" data-number="">{zh ? "暂无重要动态" : "No important updates"}</li>
            )
          : posts.map((post: any, index: number) => (
              <li key={post.id} data-number={index + 1}>
                <Link
                  href={`/post/${post.id}`}
                  className="block text-slate-700 hover:text-blue-600 hover:underline underline-offset-2 leading-snug line-clamp-2 transition-colors"
                  title={post.title}
                >
                  {post.title}
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const { t, lang } = useLang();
  const { address, isConnected } = useWeb3Auth();
  const { data: meData } = useGetMe({ wallet: address ?? "" }, { query: { enabled: !!address && isConnected } });
  const me = (meData as any)?.user ?? meData;
  const spaceStatus = me?.spaceStatus;
  const isSpaceOwner = spaceStatus === "approved" || spaceStatus === "active";
  const hasJoined = isSpaceOwner;
  const isPending = spaceStatus === "pending";
  const [search, setSearch] = useState("");


  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // Pinned posts (all types — admin can pin any post)
  const { data: pinnedData } = useQuery({
    queryKey: ["/api/posts", "pinned-home"],
    queryFn: async () => {
      const res = await fetch(`${getApiBase()}/posts?pinned=1&limit=${PIN_SLOTS}`);
      return res.json() as Promise<{ posts: any[] }>;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Regular posts — when searching: all types; when browsing: project-type only
  const { data: postsData, isLoading } = useQuery({
    queryKey: ["/api/posts", "home-regular", page, debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch) {
        // Search across ALL post types so nothing is missed
        const res = await fetch(
          `${getApiBase()}/posts?page=${page}&limit=${PAGE_SIZE}&q=${encodeURIComponent(debouncedSearch)}`
        );
        return res.json() as Promise<{ posts: any[]; total: number; totalPages: number; page: number }>;
      }
      // Normal home feed: project posts only
      const res = await fetch(`${getApiBase()}/posts?authorType=project&page=${page}&limit=${PAGE_SIZE}`);
      return res.json() as Promise<{ posts: any[]; total: number; totalPages: number; page: number }>;
    },
    staleTime: 15_000,
    refetchInterval: debouncedSearch ? false : 30_000,
    refetchOnWindowFocus: true,
  });

  const pinnedPosts = pinnedData?.posts ?? [];
  const allPosts = postsData?.posts ?? [];
  const totalPages = postsData?.totalPages ?? 1;
  const total = postsData?.total ?? 0;

  // Only hide the exact posts already shown in pinned zone (not ALL posts from same user)
  const pinnedIds = new Set(pinnedPosts.map((p: any) => p.id));
  const posts = allPosts.filter((p: any) => !pinnedIds.has(p.id));

  // Build fixed 16-slot grid
  const pinnedSlots = Array.from({ length: PIN_SLOTS }, (_, i) => pinnedPosts[i] ?? null);

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-end gap-3 pt-2">
        {FEATURES.dailyLucky && (
          <DailyLuckyBtn lastSlotPull={me?.lastSlotPull ?? null} label={t("dailyLucky")} />
        )}
        {isConnected && address && (
          <button
            type="button"
            onClick={() => { setLocation("/profile"); }}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-300/50 transition-all whitespace-nowrap"
          >
            {t("dashboard")}
          </button>
        )}
      </div>

      {/* Hot ecosystem quick entry (under navbar empty strip) */}
      <HotEcosystemQuickEntry />

      {/* Encouragement + CTA */}
      <div className="rounded-2xl px-6 py-6 border border-blue-200/60" style={{background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 50%, #e0f2fe 100%)"}}>
        <p className="text-lg sm:text-xl font-bold leading-snug mb-4" style={{ color: "#FF69B4" }}>
          {t("encouragement")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasJoined ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm bg-gradient-to-r from-emerald-500/10 to-green-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/60 cursor-default select-none pointer-events-none">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />{t("alreadyJoined")}
              </span>
              <Link href="/post/new"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-300 transition-all">
                <PenSquare className="w-4 h-4" /> {t("postNow")}
              </Link>
            </>
          ) : isPending ? (
            <span className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full font-bold text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 cursor-default select-none pointer-events-none">
              {t("spacePending")}
            </span>
          ) : (
            <>
              <Link href="/apply"
                className="inline-flex items-center justify-center gap-1 px-6 py-2.5 rounded-full font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-300 transition-all">
                🚀 {t("joinNow")}
              </Link>
              {isConnected && address && me && (
                <Link href="/post/new"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm bg-green-500 hover:bg-green-600 text-white shadow-md shadow-green-300/50 transition-all">
                  <PenSquare className="w-4 h-4" /> {t("postJobBtn")}
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Real-time Crypto Price Ticker — homepage only */}
      <div className="rounded-xl px-4 py-2.5 border border-slate-200/70 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm relative overflow-visible">
        <PriceTicker />
      </div>

      {/* Two-column: main feed + 重要动态 */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <EventList />
        </div>
        <div className="hidden lg:block w-72 xl:w-80 shrink-0">
          <ImportantNews lang={lang} />
        </div>
      </div>

      {/* Wallet required modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div
            className="pointer-events-auto rounded-2xl p-6 max-w-xs w-full text-center"
            style={{ backgroundColor: "#ffffff", border: "1px solid #bfdbfe", boxShadow: "0 20px 60px rgba(59,130,246,0.15)" }}
          >
            <p className="text-base font-bold mb-5" style={{ color: "#1d4ed8" }}>{t("connectWalletFirst")}</p>
            <button
              type="button"
              onClick={() => setShowWalletModal(false)}
              className="px-8 py-2 rounded-full font-bold text-sm text-white transition-colors"
              style={{ backgroundColor: "#2563eb" }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = "#2563eb")}
            >
              {t("pinOk")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
