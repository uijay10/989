import { useState, useEffect } from "react";

declare global {
  interface Window {
    Web3ReleaseAPI?: {
      getIndustryNews: () => Promise<Array<{ title?: string; source?: string; published_at?: string; date?: string; summary?: string; description?: string; url?: string }>>;
      getGrants: () => Promise<Array<{ name?: string; community?: string; amount?: string; status?: string }>>;
      getMeme: () => Promise<Array<{ baseToken?: { symbol?: string }; priceUsd?: string; priceChange24h?: { h24?: number } | number; url?: string; name?: string }>>;
      getIDO: () => Promise<Array<{ baseToken?: { symbol?: string }; priceUsd?: string; priceChange24h?: number; url?: string; name?: string }>>;
      getTokenUnlocks: () => Promise<Array<{ name?: string; unlockPercentage?: string | number; date?: string }>>;
      getTestnets: () => Array<{ name: string; url: string }>;
      getAirdrops?: () => Promise<Array<{ title?: string; content?: string; url?: string; sourceUrl?: string; createdAt?: string }>>;
    };
  }
}

function LoadingCards({ count = 3, cols = 3 }: { count?: number; cols?: number }) {
  const grid = cols === 2 ? "grid-cols-1 md:grid-cols-2" : cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid ${grid} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}

/** 标签页在前台时每 30s 拉一次，新文章无需手动刷新 */
const FEED_POLL_MS = 30_000;

function useJsonFeedItems<T>(url: string): { items: T[]; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      if (initial) setLoading(true);
      fetch(url)
        .then(r => r.json())
        .then((d: { items?: T[] }) => {
          if (!cancelled) setItems(d.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (initial && !cancelled) setLoading(false);
        });
    };
    load(true);
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load(false);
    }, FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url]);
  return { items, loading };
}

// ==================== 行业动态 ====================
export function IndustryNewsFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: number; title?: string; content?: string; sourceUrl?: string; createdAt?: string; url?: string }>(
    "/api/feeds/industry",
  );

  if (loading) return <LoadingCards count={3} />;
  if (items.length === 0) return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      暂无行业动态，AI 爬虫持续抓取中…
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">📰 实时行业资讯</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">AI 聚合 · 实时更新</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <a key={item.id ?? i}
            href={item.url || item.sourceUrl || "#"}
            target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border/40 rounded-2xl p-5 hover:shadow-lg hover:border-primary/30 transition group block">
            <h3 className="font-bold text-base mb-2 line-clamp-2 text-foreground group-hover:text-primary transition-colors">
              {item.title || '最新动态'}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{item.content || ''}</p>
            <p className="text-[10px] text-muted-foreground/60">
              {item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ''}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

// ==================== 捐赠/赞助 ====================
export function GrantsFeed() {
  const { items: data, loading } = useJsonFeedItems<{ uid?: string; title?: string; description?: string; community?: string; communityLogo?: string; link?: string }>(
    "/api/feeds/grants",
  );

  if (loading) return <LoadingCards count={3} />;
  if (data.length === 0) return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      暂无最新资助计划，稍后再试
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">🎁 实时资助计划</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">Karma GAP</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.map((grant, i) => (
          <a key={grant.uid ?? i}
            href={grant.link || "https://gap.karmahq.xyz/"}
            target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border/40 rounded-2xl p-5 hover:shadow-xl hover:border-primary/40 transition-all block group">
            <div className="flex items-center gap-2 mb-3">
              {grant.communityLogo && (
                <img src={grant.communityLogo} alt={grant.community} className="w-6 h-6 rounded-full object-cover border border-border/40" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
              )}
              <span className="text-xs text-primary font-medium">{grant.community || '未知社区'}</span>
            </div>
            <h3 className="font-semibold text-sm text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
              {grant.title || '资助计划'}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-3 mb-4">{grant.description || ''}</p>
            <span className="block text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2.5 rounded-xl text-xs font-medium hover:opacity-90 transition">
              查看详情 & 申请 →
            </span>
          </a>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/30 mt-3">
        <span className="text-[10px] text-muted-foreground/50">数据来源：Karma GAP · 服务器端代理</span>
        <a href="https://gap.karmahq.xyz" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">查看全部 →</a>
      </div>
    </div>
  );
}

// ==================== IDO/Launchpad ====================
export function IDOFeed() {
  const [data, setData] = useState<Array<{ baseToken?: { symbol?: string }; priceUsd?: string; priceChange24h?: number; url?: string; name?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      const api = window.Web3ReleaseAPI;
      if (!api) {
        if (initial) setLoading(false);
        return;
      }
      if (initial) setLoading(true);
      api
        .getIDO()
        .then(d => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData([]);
        })
        .finally(() => {
          if (initial && !cancelled) setLoading(false);
        });
    };
    load(true);
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load(false);
    }, FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) return <LoadingCards count={4} cols={4} />;
  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">🚀 最新代币上市</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">DexScreener</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {data.map((item, i) => {
          const change = item.priceChange24h ?? 0;
          const isUp = change >= 0;
          const price = parseFloat(item.priceUsd || "0");
          function fmt(p: number) {
            if (p < 0.000001) return p.toExponential(2);
            if (p < 0.001) return p.toFixed(6);
            if (p < 1) return p.toFixed(4);
            return p.toFixed(2);
          }
          return (
            <div key={i} className="bg-card border border-border/40 rounded-2xl p-5 hover:border-orange-400/60 hover:shadow-sm transition">
              <div className="font-bold text-base text-foreground">{item.baseToken?.symbol || item.name || '新项目'}</div>
              <div className="text-xl font-semibold text-green-600 dark:text-green-400 my-2">${fmt(price)}</div>
              <div className={`text-sm font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                {isUp ? '+' : ''}{change.toFixed(2)}%
              </div>
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-3 block">查看详情 →</a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 代币解锁 ====================
export function TokenUnlocksFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: number; title?: string; content?: string; sourceUrl?: string; createdAt?: string }>(
    "/api/feeds/unlocks",
  );

  if (loading) return <LoadingCards count={4} cols={2} />;
  if (items.length === 0) return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      暂无代币解锁信息，AI 爬虫持续抓取中…
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">🔓 代币解锁动态</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">AI 聚合</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, i) => (
          <a key={item.id ?? i}
            href={item.url || item.sourceUrl || "#"}
            target="_blank" rel="noopener noreferrer"
            className="border border-border/40 rounded-2xl p-5 bg-card hover:border-amber-400/50 hover:shadow-sm transition group block">
            <h3 className="font-semibold text-sm text-foreground line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {item.title || '代币解锁'}
            </h3>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.content || ''}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-3">
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString("zh-CN") : ''}
            </p>
          </a>
        ))}
      </div>
      <div className="pt-2 border-t border-border/30 mt-3">
        <a href="https://defillama.com/unlocks" target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-primary hover:underline">查看 DeFiLlama 完整解锁日历 →</a>
      </div>
    </div>
  );
}

// ==================== 测试网 ====================
export function TestnetsFeed() {
  const [data, setData] = useState<Array<{ name: string; url: string }>>([]);

  useEffect(() => {
    const api = window.Web3ReleaseAPI;
    if (!api) return;
    setData(api.getTestnets());
  }, []);

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">🧪 测试网水龙头</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">静态资源</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((item, i) => (
          <div key={i} className="border border-border/40 rounded-2xl p-6 bg-card hover:bg-accent/30 hover:border-primary/30 transition">
            <h3 className="font-bold text-foreground">{item.name}</h3>
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-4 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition">
              领取测试币 →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 链上奖励/空投 ====================
export function AirdropsFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: number; title?: string; content?: string; sourceUrl?: string; createdAt?: string }>(
    "/api/feeds/airdrops",
  );
  const [wallet, setWallet] = useState("");
  const [checking, setChecking] = useState(false);

  function handleCheck() {
    if (!wallet.trim()) return;
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      window.open(`https://debank.com/profile/${wallet.trim()}`, "_blank");
    }, 800);
  }

  const AIRDROP_SITES = [
    { name: "DeBank", url: "https://debank.com" },
    { name: "Earni.fi", url: "https://earni.fi" },
    { name: "AirdropAlert", url: "https://airdropalert.com" },
    { name: "AirdropsMob", url: "https://airdrops.io" },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">🪂 链上奖励 / 空投</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">实时更新</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={wallet}
          onChange={e => setWallet(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCheck()}
          placeholder="输入钱包地址检查 eligibility…"
          className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
        />
        <button
          onClick={handleCheck}
          disabled={checking}
          className="px-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
        >
          {checking ? "查询中…" : "检查"}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {AIRDROP_SITES.map(s => (
          <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
            className="text-xs px-3 py-1 rounded-full bg-muted hover:bg-accent border border-border/40 text-muted-foreground hover:text-foreground transition-colors">
            {s.name} →
          </a>
        ))}
      </div>

      {loading ? (
        <LoadingCards count={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6">暂无最新空投信息，AI 爬虫持续抓取中…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item, i) => (
            <a key={item.id ?? i}
              href={item.url || item.sourceUrl || "#"}
              target="_blank" rel="noopener noreferrer"
              className="border border-border/40 rounded-2xl p-5 bg-card hover:border-emerald-500/50 hover:shadow-sm transition group block">
              <h3 className="font-semibold text-sm text-foreground line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {item.title || '空投资讯'}
              </h3>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.content || ''}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-3">
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString("zh-CN") : ''}
              </p>
            </a>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50 pt-1 border-t border-border/30">
        数据来源：AI 抓取聚合 • 点击卡片直达领取页 • 钱包检查跳转 DeBank
      </p>
    </div>
  );
}

// ==================== Meme热点（实时价格卡） ====================
export function MemePriceFeed() {
  type MemeItem = { baseToken?: { symbol?: string }; priceUsd?: string; priceChange24h?: { h24?: number } | number };
  const [data, setData] = useState<MemeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      const api = window.Web3ReleaseAPI;
      if (!api) {
        if (initial) setLoading(false);
        return;
      }
      if (initial) setLoading(true);
      api
        .getMeme()
        .then(d => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData([]);
        })
        .finally(() => {
          if (initial && !cancelled) setLoading(false);
        });
    };
    load(true);
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load(false);
    }, FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );
  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">🐸 实时 Meme 价格</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">DexScreener</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {data.map((item, i) => {
          const rawChange = item.priceChange24h;
          const change24h = typeof rawChange === "number" ? rawChange : (rawChange as { h24?: number })?.h24 ?? 0;
          const isUp = change24h >= 0;
          const price = parseFloat(item.priceUsd || "0");
          function fmt(p: number) {
            if (p < 0.000001) return p.toExponential(2);
            if (p < 0.001) return p.toFixed(6);
            if (p < 1) return p.toFixed(4);
            return p.toFixed(2);
          }
          return (
            <div key={i} className="bg-card border border-border/40 rounded-xl p-4 hover:scale-105 hover:shadow-sm transition cursor-default">
              <div className="font-bold text-sm text-foreground mb-1">{item.baseToken?.symbol || 'MEME'}</div>
              <div className="text-base font-semibold text-foreground">${fmt(price)}</div>
              <div className={`text-xs font-bold mt-1 ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                {isUp ? '+' : ''}{change24h.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 漏洞赏金 ====================
export function BugBountyFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: string; name?: string; slug?: string; maxBounty?: string; totalPaid?: string; chains?: string[] }>(
    "/api/feeds/bugbounty",
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">🐛 漏洞赏金</span>
        <a href="https://immunefi.com" target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full hover:text-foreground transition">Immunefi →</a>
      </div>
      {loading ? (
        <LoadingCards count={4} cols={2} />
      ) : items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6">暂无数据，稍后再试</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((b, i) => (
            <a key={b.id ?? i}
              href={`https://immunefi.com/bug-bounty/${b.slug || b.id}/`}
              target="_blank" rel="noopener noreferrer"
              className="border border-border/40 rounded-2xl p-5 bg-card hover:border-red-400/50 hover:shadow-sm transition group block">
              <h3 className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors mb-2">
                {b.name || '项目'}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {b.maxBounty && (
                  <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                    最高 ${Number(b.maxBounty).toLocaleString()}
                  </span>
                )}
                {b.totalPaid && (
                  <span className="text-xs text-muted-foreground">
                    已支付 ${Number(b.totalPaid).toLocaleString()}
                  </span>
                )}
              </div>
              {b.chains && b.chains.length > 0 && (
                <p className="text-[10px] text-muted-foreground/60 mt-2">{b.chains.slice(0, 3).join(" · ")}</p>
              )}
            </a>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/50 pt-1 border-t border-border/30">
        数据来源：Immunefi · 10分钟缓存 · 点击直达提交页
      </p>
    </div>
  );
}

// ==================== 链上任务 ====================
export function QuestFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: number; title?: string; content?: string; sourceUrl?: string; createdAt?: string }>(
    "/api/feeds/quest",
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">🎯 链上任务 / Quest</span>
        <a href="https://app.galxe.com" target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full hover:text-foreground transition">Galxe →</a>
      </div>
      {loading ? (
        <LoadingCards count={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6">暂无活跃链上任务，AI 爬虫持续抓取中…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((q, i) => (
            <a key={q.id ?? i}
              href={q.sourceUrl || "https://app.galxe.com"}
              target="_blank" rel="noopener noreferrer"
              className="border border-border/40 rounded-2xl p-5 bg-card hover:border-violet-400/50 hover:shadow-sm transition group block">
              <h3 className="font-semibold text-sm text-foreground line-clamp-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors mb-2">
                {q.title || '链上任务'}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{q.content || ''}</p>
              <p className="text-[10px] text-muted-foreground/60">
                {q.createdAt ? new Date(q.createdAt).toLocaleDateString("zh-CN") : ''}
              </p>
            </a>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/50 pt-1 border-t border-border/30">
        数据来源：AI 爬虫聚合 · 点击直达任务页
      </p>
    </div>
  );
}

// ==================== 政策/监管 ====================
export function PolicyFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: number; title?: string; content?: string; sourceUrl?: string; createdAt?: string }>(
    "/api/feeds/policy",
  );

  if (loading) return <LoadingCards count={3} />;
  if (items.length === 0) return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      暂无政策动态，AI 爬虫持续抓取中…
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">⚖️ 政策 / 监管</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">AI 聚合 · 实时更新</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <a key={item.id ?? i}
            href={item.sourceUrl || "#"}
            target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border/40 rounded-2xl p-5 hover:shadow-lg hover:border-blue-400/30 transition group block">
            <h3 className="font-bold text-base mb-2 line-clamp-2 text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {item.title || '政策动态'}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{item.content || ''}</p>
            <p className="text-[10px] text-muted-foreground/60">
              {item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ''}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

// ==================== 投融资 ====================
export function FundingFeed() {
  const { items, loading } = useJsonFeedItems<{ id?: number; title?: string; content?: string; sourceUrl?: string; createdAt?: string }>(
    "/api/feeds/funding",
  );

  if (loading) return <LoadingCards count={3} />;
  if (items.length === 0) return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      暂无最新融资动态，AI 爬虫持续抓取中…
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">💰 投融资动态</span>
        <span className="text-[10px] text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">AI 聚合 · 实时更新</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <a key={item.id ?? i}
            href={item.sourceUrl || "#"}
            target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border/40 rounded-2xl p-5 hover:shadow-lg hover:border-yellow-400/30 transition group block">
            <h3 className="font-bold text-base mb-2 line-clamp-2 text-foreground group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
              {item.title || '融资动态'}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{item.content || ''}</p>
            <p className="text-[10px] text-muted-foreground/60">
              {item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ''}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
