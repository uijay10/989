import { Link, useLocation } from "wouter";
import { useWeb3Auth } from "@/lib/web3";
import { WalletPickerModal } from "@/components/wallet-modal";
import { useGetMe } from "@workspace/api-client-react";
import { useLang, type LangCode } from "@/lib/i18n";
import { isAdmin } from "@/lib/admin";
import { DISCLAIMER_CONTENT } from "@/lib/disclaimer-content";
import { LogOut, ChevronDown, LayoutDashboard, ShieldCheck, PenSquare, FileText, X, Bell, Trash2 } from "lucide-react";
import { cn, truncateAddress, generateGradient } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useEventFilter, NAV_KEY_TO_CATEGORY } from "@/lib/event-filter-context";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { getApiBase } from "@/lib/api-base";
import { exchangeSectionSlug } from "@/lib/ecosystem";
import PromoAd from "@/components/promo-ad";

const DATE_LOCALES_LAYOUT: Record<string, Locale> = {
  "en": enUS, "zh-CN": zhCN,
};

// ── Ecosystem quick-entry (chains + exchanges) ──────────────────────────────
type EcoItem = { label: string; kind: "chain" | "exchange"; href: string; hint: string };

const CHAINS = ["Ethereum","Solana","BNB Chain","Arbitrum","Base","Sui","Aptos"] as const;
const EXCHANGES = ["Binance","OKX","Bybit","Coinbase","Kraken","Bitget"] as const;

const CHAIN_ITEMS: EcoItem[] = CHAINS.map((name) => ({
  label: name, kind: "chain",
  href: `/chains/${name.trim().toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}`,
  hint: `查看 ${name} 专栏 - Grants、Testnet、Airdrop 等机会`,
}));
const EXCHANGE_ITEMS: EcoItem[] = EXCHANGES.map((name) => ({
  label: name, kind: "exchange",
  href: `/exchanges/${exchangeSectionSlug(name)}`,
  hint: `查看 ${name} 专栏 - Listing、公告与机会`,
}));
const ALL_ECOSYSTEM_ITEMS: EcoItem[] = [...CHAIN_ITEMS, ...EXCHANGE_ITEMS];

const ecoLinkCls =
  "relative px-3 py-1 rounded-full text-[14px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer " +
  "text-slate-800 hover:text-slate-900 hover:bg-slate-100";

function EcosystemRow({ items }: { items: EcoItem[] }) {
  const [loc, nav] = useLocation();
  const { clearEcosystem, setActiveCategory } = useEventFilter();
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);
  useEffect(() => {
    if (optimisticHref && loc === optimisticHref) setOptimisticHref(null);
  }, [loc, optimisticHref]);
  const activeEco = optimisticHref ?? loc;
  return (
    <div className="flex flex-nowrap items-center justify-center gap-x-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <button
          key={`${it.kind}:${it.label}`}
          type="button"
          title={it.hint}
          onClick={() => { setOptimisticHref(it.href); clearEcosystem(); setActiveCategory("全部"); nav(it.href); }}
          className={`${ecoLinkCls} ${activeEco === it.href ? "text-white bg-blue-600 shadow-sm hover:bg-blue-700 hover:text-white" : ""}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

const NAV_KEYS = [
  { key: "nav_ido",        href: "/section/ido" },
  { key: "nav_funding",    href: "/section/funding" },
  { key: "nav_vc",         href: "/section/vc" },
  { key: "nav_quest",      href: "/section/quest" },
  { key: "nav_defi",       href: "/section/defi" },
  { key: "nav_analytics",  href: "/section/analytics" },
  { key: "nav_nft",        href: "/section/nft" },
  { key: "nav_research",   href: "/section/research" },
  { key: "nav_policy",     href: "/section/policy" },
  { key: "nav_testnet",    href: "/section/testnet" },
  { key: "nav_nodes",      href: "/section/nodes" },
  { key: "nav_devbounty",  href: "/section/devbounty" },
  { key: "nav_grant",      href: "/section/grant" },
];

const LANGUAGES: { value: LangCode; label: string }[] = [
  { value: "en",    label: "English" },
  { value: "zh-CN", label: "中文简体" },
];


export function Layout({ children }: { children: React.ReactNode }) {
  const { address, isConnected, user, disconnect } = useWeb3Auth();
  const { data: meData } = useGetMe({ wallet: address ?? "" }, { query: { enabled: !!address } });
  const [location, navigate] = useLocation();
  const [optimisticNavHref, setOptimisticNavHref] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { activeCategory, setActiveCategory, clearEcosystem } = useEventFilter();
  // Keep ecosystem strip always visible for consistent UX across all main modules.
  const showEcosystemStrip = true;
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [whitepaperOpen, setWhitepaperOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const { t, lang, setLang } = useLang();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const admin = isAdmin(address);
  const meLoading = !address || (!!address && meData === undefined);
  const isSpaceOwner = meData?.user?.spaceStatus === "approved" || meData?.user?.spaceStatus === "active";

  // Notification state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifList, setNotifList] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const apiBase = getApiBase();
  useEffect(() => {
    if (!address) return;
    const fetchNotifs = async () => {
      try {
        const res = await fetch(`${apiBase}/notifications?wallet=${address}`);
        if (!res.ok) return;
        const d = await res.json();
        setNotifList(d.notifications ?? []);
        setUnread(d.unread ?? 0);
      } catch {}
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30000);
    return () => clearInterval(id);
  }, [address]);

  const openBell = async () => {
    setNotifOpen(v => !v);
    if (!notifOpen && unread > 0 && address) {
      try {
        await fetch(`${apiBase}/notifications/mark-read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address }),
        });
        setUnread(0);
        setNotifList(prev => prev.map(n => ({ ...n, isRead: true })));
      } catch {}
    }
  };

  const deleteNotif = async (id: number) => {
    if (!address) return;
    try {
      await fetch(`${apiBase}/notifications/${id}?wallet=${address.toLowerCase()}`, { method: "DELETE" });
      setNotifList(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  useEffect(() => {
    function handleClickOutsideBell(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideBell);
    return () => document.removeEventListener("mousedown", handleClickOutsideBell);
  }, []);

  // Always force light mode
  if (typeof window !== "undefined") {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("web3hub_dark");
  }

  const handleMouseEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setIsDropdownOpen(true);
  };
  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setIsDropdownOpen(false), 1000);
  };
  const toggleDropdown = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setIsDropdownOpen(v => !v);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Once route change completes, drop optimistic highlight.
    if (optimisticNavHref && location === optimisticNavHref) {
      setOptimisticNavHref(null);
    }
  }, [location, optimisticNavHref]);

  const activeHref = optimisticNavHref ?? location;
  const navLinkClass = (href: string, _navKey?: string) => {
    const isActive = activeHref === href;
    return cn(
      "relative px-3 py-1 rounded-full text-[14px] font-semibold whitespace-nowrap transition-all duration-200 group cursor-pointer",
      isActive
        ? "text-white bg-blue-600 shadow-sm"
        : "text-slate-800 hover:text-slate-900 hover:bg-slate-100"
    );
  };

  const handleNavClick = (e: React.MouseEvent, href: string, _navKey: string) => {
    e.preventDefault();
    clearEcosystem();
    setOptimisticNavHref(href);
    navigate(href);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{background: "#EEF5FF"}}>
      {/* ── Top Navbar (+ Home ecosystem strip) ──────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full">
        <div className="glass-panel !border-l-0 !border-r-0 !border-t-0 border-b border-border/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-[70px] gap-3">
              {/* promo-ad placeholder — hidden */}
              <div className="flex items-center justify-center gap-3 shrink-0 min-w-0">
                <a href="/" onClick={e => { e.preventDefault(); clearEcosystem(); setActiveCategory("全部"); setOptimisticNavHref("/"); navigate("/"); }}
                  className="flex items-center gap-2.5 group cursor-pointer min-w-0">
                  <img src="/logo.png" alt="Web3 Release" className="w-10 h-10 object-contain shrink-0" />
                  <span className="font-display font-bold text-[1.65rem] tracking-tight text-blue-600 truncate">Web3 Release</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    clearEcosystem();
                    setActiveCategory("全部");
                    setOptimisticNavHref("/");
                    navigate("/");
                  }}
                  className="shrink-0 px-4 py-1.5 rounded-full text-[14px] font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                >
                  {lang === "en" ? "Home" : t("navHome")}
                </button>
              </div>
              <div className="relative z-[60] flex items-center gap-2 ml-auto">
              {/* Admin-only JS entry ── only visible to admin wallets */}
              {admin && (
                <a
                  href="/section/js"
                  onClick={(e) => { e.preventDefault(); clearEcosystem(); setOptimisticNavHref("/section/js"); navigate("/section/js"); }}
                  className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full border border-red-300 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm transition-colors shrink-0"
                  title="JS — 永州教师对调（管理员）"
                >
                  JS
                </a>
              )}
              {/* Language selector */}
              <div className="relative hidden sm:block z-[60]">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as LangCode)}
                  className="appearance-none bg-white dark:bg-slate-800 border border-border dark:border-slate-700 rounded-full pl-3 pr-7 py-1.5 text-[15px] font-semibold text-muted-foreground dark:text-slate-200 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground dark:text-slate-400 pointer-events-none" />
              </div>
              {/* ── Notification Bell ── */}
              {isConnected && (
                <div className="relative z-[60]" ref={bellRef}>
                  <button
                    onClick={openBell}
                    className="relative w-9 h-9 flex items-center justify-center rounded-full border border-border hover:bg-muted/50 transition-colors"
                    title={t("notifTitle") || "通知"}
                  >
                    <Bell className="w-4.5 h-4.5 text-muted-foreground" style={{ width: 18, height: 18 }} />
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
                        style={{ background: "#FF69B4", lineHeight: 1 }}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 max-h-[420px] overflow-y-auto rounded-2xl shadow-2xl z-50 border border-border/50 dark:border-slate-700"
                      style={{ background: "#fff" }}>
                      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">{t("notifTitle") || "通知"}</span>
                        {notifList.length > 0 && (
                          <span className="text-xs text-muted-foreground">{notifList.length} {t("notifCount") || "条"}</span>
                        )}
                      </div>
                      {notifList.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                          {t("notifEmpty") || "暂无通知"}
                        </div>
                      ) : (
                        <div className="divide-y divide-border/20">
                          {notifList.map((n: any) => (
                            <div key={n.id}
                              className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors ${!n.isRead ? "bg-pink-50/60 dark:bg-pink-950/10" : ""}`}>
                              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base"
                                style={{ background: n.type === "new_post" ? "#f0fdf4" : n.type === "like" ? "#fff0f6" : "#eff6ff" }}>
                                {n.type === "new_post" ? "🔔" : n.type === "like" ? "❤️" : "💬"}
                              </div>
                              <div className="flex-1 min-w-0">
                                {n.type === "new_post" ? (
                                  <>
                                    <p className="text-sm text-foreground leading-snug">
                                      <span className="font-semibold">{n.postSection ?? ""}</span>
                                      {lang === "zh-CN" ? " 板块有新内容" : " section has a new post"}
                                    </p>
                                    {n.postTitle && (
                                      <Link href={n.postId ? `/post/${n.postId}` : "#"} onClick={() => setNotifOpen(false)}
                                        className="text-xs text-blue-500 hover:underline mt-0.5 font-medium block truncate">
                                        《{n.postTitle}》
                                      </Link>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm text-foreground leading-snug">
                                      <span className="font-semibold">{n.fromName ?? truncateAddress(n.fromWallet ?? "")}</span>
                                      {" "}{n.type === "like" ? (t("notifLiked") || "赞了你的帖子") : (t("notifCommented") || "评论了你的帖子")}
                                    </p>
                                    {n.postTitle && (
                                      <Link href={n.postId ? `/post/${n.postId}` : "#"} onClick={() => setNotifOpen(false)}
                                        className="text-xs text-blue-500 hover:underline mt-0.5 block truncate">
                                        《{n.postTitle}》
                                      </Link>
                                    )}
                                  </>
                                )}
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: DATE_LOCALES_LAYOUT[lang] ?? enUS })}
                                </p>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); deleteNotif(n.id); }}
                                className="shrink-0 ml-1 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 transition-colors group"
                                title="删除此通知"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover:text-red-600" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Space owner → red Post button; loading → hide; not owner → Apply link */}
              {isConnected && isSpaceOwner ? (
                <Link href="/post/new"
                  className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all">
                  <PenSquare className="w-4 h-4" /> {t("postNow")}
                </Link>
              ) : null}

              {!isConnected ? (
                <button
                  onClick={() => setWalletModalOpen(true)}
                  className="px-5 py-2 rounded-full text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
                >
                  {t("connect")}
                </button>
              ) : (
                <div className="relative" ref={dropdownRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                  <button
                    onClick={toggleDropdown}
                    className="flex items-center gap-2 p-1 pr-3 rounded-full border border-border hover:border-primary/50 hover:bg-muted/30 transition-all"
                  >
                    <div
                      className="w-7 h-7 rounded-full bg-transparent overflow-hidden"
                      style={user?.avatar
                        ? { backgroundImage: `url(${user.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : { background: generateGradient(address) }}
                    />
                    <span className="text-sm font-medium font-mono">{truncateAddress(address)}</span>
                    {admin && <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />}
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-2xl py-1 z-[200] overflow-hidden"
                      style={{ background: "#2563eb", border: "1px solid #3b82f6" }}>
                      <Link href="/profile" onClick={() => setIsDropdownOpen(false)}
                        className="group flex items-center gap-2.5 px-4 py-3 text-sm text-white hover:bg-blue-700 transition-colors cursor-pointer">
                        <LayoutDashboard className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" /> {t("dashboard")}
                      </Link>
                      {admin && (
                        <Link href="/profile" onClick={() => setIsDropdownOpen(false)}
                          className="group flex items-center gap-2.5 px-4 py-3 text-sm text-white hover:bg-blue-700 transition-colors cursor-pointer">
                          <ShieldCheck className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" /> 管理员面板
                        </Link>
                      )}
                      <div className="my-1" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }} />
                      <button onClick={() => { disconnect(); setIsDropdownOpen(false); }}
                        className="group w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white hover:bg-blue-700 transition-colors text-left">
                        <LogOut className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" /> {t("logout")}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Unified nav module (main nav + ecosystem) ── */}
        <div className="border-t border-slate-200/60 bg-white/70 backdrop-blur-md">
          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-0.5">
            {/* Row 1: section nav */}
            <div className="flex flex-nowrap items-center justify-center gap-x-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => {
                  clearEcosystem();
                  setActiveCategory("全部");
                  setOptimisticNavHref("/");
                  navigate("/");
                }}
                className={cn(
                  "relative inline-flex items-center justify-center shrink-0 px-3.5 py-2 rounded-full text-[15px] font-bold whitespace-nowrap transition-all duration-200 cursor-pointer",
                  activeHref === "/" && activeCategory === "全部"
                    ? "text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-300/50"
                    : "text-slate-800 hover:text-slate-900 hover:bg-slate-100",
                )}
              >
                {lang === "zh-CN" ? "7*24快讯" : "7*24 News"}
              </button>
              {NAV_KEYS.filter(({ adminOnly }) => !adminOnly || admin).map(({ key, href }) => (
                <a
                  key={key}
                  href={href}
                  onClick={(e) => handleNavClick(e, href, key)}
                  className={navLinkClass(href, key)}
                >
                  <span className="relative z-10">{t(key)}</span>
                </a>
              ))}
            </div>
            {/* Row 2: chains + exchanges — no gap, same container, no divider */}
            {showEcosystemStrip && <EcosystemRow items={ALL_ECOSYSTEM_ITEMS} />}
          </div>

        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* ── Floating Right Panel: Social + Scroll ─── */}
      <div className="fixed right-4 bottom-8 z-50 flex flex-col gap-1.5">
        {/* Team */}
        <button
          type="button"
          onClick={() => setTeamOpen(true)}
          title={t("floatTeam")}
          className="w-9 h-9 rounded-lg bg-slate-600/75 hover:bg-slate-700/90 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-white/80 group-hover:stroke-white fill-none transition-colors" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="3" />
            <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" />
            <circle cx="17" cy="8" r="2" />
            <path d="M21 20c0-2.209-1.791-4-4-4" />
          </svg>
        </button>

        {/* Disclaimer */}
        <button
          type="button"
          onClick={() => setWhitepaperOpen(true)}
          title={t("disclaimerBtn")}
          className="w-9 h-9 rounded-lg bg-slate-600/75 hover:bg-slate-700/90 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group"
        >
          {/* Custom “disclaimer/doc” glyph to match the social icon style */}
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 stroke-white/80 group-hover:stroke-white fill-none transition-colors"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Page */}
            <path d="M8 3.5h6.5L19 8v12a1.5 1.5 0 0 1-1.5 1.5H8A3 3 0 0 1 5 18.5v-12A3 3 0 0 1 8 3.5Z" />
            {/* Fold */}
            <path d="M14.5 3.5V8H19" />
            {/* “i” mark */}
            <path d="M12 11.2h0" />
            <path d="M12 13v4.2" />
          </svg>
        </button>

        {/* Social buttons */}
        <a href="https://x.com/Web3Release" target="_blank" rel="noreferrer" title="X / Twitter"
          className="w-9 h-9 rounded-lg bg-slate-600/75 hover:bg-slate-700/90 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white/80 group-hover:fill-white transition-colors">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <a href="https://t.me/Web3Release" target="_blank" rel="noreferrer" title="Telegram"
          className="w-9 h-9 rounded-lg bg-slate-600/75 hover:bg-slate-700/90 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white/80 group-hover:fill-white transition-colors">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </a>
        <a href="https://mail.google.com/mail/?view=cm&fs=1&to=contact@web3release.com" target="_blank" rel="noopener noreferrer" title={t("floatContact")}
          className="w-9 h-9 rounded-lg bg-slate-600/75 hover:bg-slate-700/90 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group">
          <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-white/80 group-hover:stroke-white fill-none transition-colors" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </a>

        {/* Divider */}
        <div className="h-px bg-slate-400/40 mx-1 my-0.5" />

        {/* Scroll Up */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title={t("floatScrollTop")}
          className="w-9 h-9 rounded-lg bg-slate-500/60 hover:bg-slate-600/80 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-white/75 group-hover:stroke-white fill-none transition-colors" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        {/* Scroll Down */}
        <button
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
          title={t("floatScrollBottom")}
          className="w-9 h-9 rounded-lg bg-slate-500/60 hover:bg-slate-600/80 flex items-center justify-center transition-all shadow-md backdrop-blur-sm group"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-white/75 group-hover:stroke-white fill-none transition-colors" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* ── Team Modal ── */}
      {teamOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setTeamOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-border/50 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-blue-600 dark:stroke-blue-400 fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="7" r="3" /><path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" /><circle cx="17" cy="8" r="2" /><path d="M21 20c0-2.209-1.791-4-4-4" />
                  </svg>
                </div>
                <p className="font-semibold text-sm text-foreground">Team</p>
              </div>
              <button onClick={() => setTeamOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted dark:hover:bg-slate-800 transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Team member card */}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                {/* Avatar placeholder */}
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
                  <span className="text-white font-bold text-xl">J</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-foreground leading-tight">Jove</h3>
                  <span className="inline-block mt-0.5 mb-3 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                    Founder &amp; CEO
                  </span>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    From China. 5 years of experience in journalism (3 of which were professional writing), 2 years of programming experience, and 8 years of in-depth experience in the cryptocurrency field.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                    Has participated in the development of over 100 Web3 projects and personally oversaw the entire project development process — product design, technology development, content aggregation, operation and promotion.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                {[
                  { value: "8yr", label: "Crypto Experience" },
                  { value: "100+", label: "Web3 Projects" },
                  { value: "5yr", label: "Journalism" },
                ].map(stat => (
                  <div key={stat.label} className="bg-muted/50 dark:bg-slate-800/50 rounded-xl py-3 px-2">
                    <p className="font-bold text-base text-foreground">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Disclaimer Modal ── */}
      {whitepaperOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setWhitepaperOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-border/50 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            {/* Header */}
            {(() => {
              const dc = DISCLAIMER_CONTENT[lang] ?? DISCLAIMER_CONTENT["en"];
              return (
                <>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground leading-tight">{dc.title}</p>
                        <p className="text-xs text-muted-foreground leading-tight">{dc.version}</p>
                      </div>
                    </div>
                    <button onClick={() => setWhitepaperOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted dark:hover:bg-slate-800 transition-colors text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Scrollable content */}
                  <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {dc.clauses.map(({ heading, body }) => (
                      <div key={heading} className="rounded-xl border border-border/40 dark:border-slate-800 bg-muted/30 dark:bg-slate-800/30 px-4 py-3">
                        <p className="font-semibold text-sm text-foreground mb-1">{heading}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed" style={{ whiteSpace: "pre-wrap" }}>{body}</p>
                      </div>
                    ))}
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
                      <p className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-1">{dc.warningTitle}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" style={{ whiteSpace: "pre-wrap" }}>{dc.warning}</p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground pb-1">{dc.footer}</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <WalletPickerModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}
