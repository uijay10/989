import { useWeb3Auth } from "@/lib/web3";
import { useUpsertUser, useGetMe } from "@workspace/api-client-react";
import { generateGradient, truncateAddress } from "@/lib/utils";
import { RoleBadge } from "@/components/role-badge";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check, Edit2, Save, ShieldCheck, Globe, ExternalLink,
  Bell, Bookmark, Settings, LogOut,
  Twitter, MessageCircle, Send, BookOpen, Copy,
  AlertCircle, FileText, PenSquare,
  Users, Pin, Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { isAdmin } from "@/lib/admin";
import { SlotMachine } from "@/components/slot-machine";
import { FEATURES } from "@/lib/feature-flags";
import { Link } from "wouter";
import AdminPage from "./admin";
import { getApiBase } from "@/lib/api-base";
import { exchangeSectionSlug } from "@/lib/ecosystem";
import { CHAINS, EXCHANGES, makeEcosystemSectionId } from "@/lib/ecosystem";

const apiBase = getApiBase();

type NavTab =
  | "subscriptions"
  | "notifications"
  | "publish"
  | "posts"
  | "apply"
  | "settings"
  | "admin";

const HOME_SECTION_NAMES = [
  "IDO/Launchpad",
  "融资公告",
  "VC",
  "链上奖励/空投",
  "DeFi",
  "数据分析",
  "NFT/GameFi",
  "研报精选",
  "政策监管",
  "测试网",
  "节点招募",
  "开发者漏洞奖金",
  "捐赠/赞助",
];
const SECTION_EN: Record<string, string> = {
  "IDO/Launchpad": "IDO/Launchpad",
  "融资公告": "Funding",
  "VC": "VC",
  "链上奖励/空投": "Rewards & Airdrop",
  "DeFi": "DeFi",
  "数据分析": "Analytics",
  "NFT/GameFi": "NFT/GameFi",
  "研报精选": "Research",
  "政策监管": "Regulation",
  "测试网": "Testnet",
  "节点招募": "Node Recruitment",
  "开发者漏洞奖金": "Dev & Bug Bounty",
  "捐赠/赞助": "Grants",
};

function NotifIcon({ type }: { type: string }) {
  if (type === "like") return <span>❤️</span>;
  if (type === "new_apply" || type === "apply") return <span>🤝</span>;
  if (type === "new_post" || type === "section_update") return <span>📄</span>;
  return <span>🔔</span>;
}

function timeAgo(iso: string, zh: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return zh ? `${mins}分钟前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return zh ? `${hrs}小时前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return zh ? `${days}天前` : `${days}d ago`;
}

function MyPostsTab({ address, isSpaceOwner, zh, adminUser }: { address: string; isSpaceOwner: boolean; zh: boolean; adminUser: boolean }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!address || !isSpaceOwner) { setLoading(false); return; }
    fetch(`${apiBase}/posts?authorWallet=${address.toLowerCase()}&limit=50`)
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(data => { setPosts(Array.isArray(data.posts) ? data.posts : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [address, isSpaceOwner]);

  const doDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/posts/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== id));
        setMsg(zh ? "已删除" : "Deleted");
        setTimeout(() => setMsg(""), 2500);
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.message || d.error || (zh ? "删除失败" : "Delete failed"));
        setTimeout(() => setMsg(""), 3000);
      }
    } catch {
      setMsg(zh ? "网络错误" : "Network error");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const doPin = async (id: number) => {
    setPinningId(id);
    try {
      const res = await fetch(`${apiBase}/posts/${id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, durationHours: 72 }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(d.queued ? (zh ? "已加入置顶队列" : "Queued for pin") : (zh ? "置顶成功 72小时" : "Pinned for 72h"));
        setPosts(prev => prev.map(p => p.id === id ? { ...p, isPinned: true } : p));
      } else {
        setMsg(d.message || d.error || (zh ? "置顶失败" : "Pin failed"));
      }
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg(zh ? "网络错误" : "Network error");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setPinningId(null);
    }
  };

  if (!isSpaceOwner) return (
    <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
      <PenSquare className="w-10 h-10 text-muted-foreground/20 mx-auto" />
      <p className="font-medium text-muted-foreground">{zh ? "仅团队用户可查看发布记录" : "Team members only"}</p>
    </div>
  );

  if (loading) return <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm">{zh ? "加载中…" : "Loading…"}</div>;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <PenSquare className="w-4 h-4 text-green-500" />
        {zh ? "我的发布" : "My Posts"}
        {posts.length > 0 && <span className="text-xs font-normal text-muted-foreground">({posts.length})</span>}
      </h2>
      {msg && <p className="text-sm text-center text-violet-500 font-medium">{msg}</p>}
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{zh ? "暂无发布记录" : "No posts yet."}</p>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <div key={p.id} className="border border-border rounded-xl p-4 hover:bg-muted/30 transition-colors group">
              <div className="flex items-start gap-2">
                <Link href={`/post/${p.id}`} className="font-medium text-sm hover:text-primary line-clamp-2 flex-1">{p.title}</Link>
                <div className="flex items-center gap-1 shrink-0">
                  {adminUser && (
                    <button
                      onClick={() => doPin(p.id)}
                      disabled={pinningId === p.id}
                      title={zh ? "置顶" : "Pin"}
                      className="p-1.5 rounded-lg border border-border hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-300 text-muted-foreground hover:text-violet-500 transition-colors disabled:opacity-40"
                    >
                      {pinningId === p.id
                        ? <span className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin inline-block" />
                        : <Pin className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => doDelete(p.id)}
                        disabled={deletingId === p.id}
                        className="px-2 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {deletingId === p.id ? (zh ? "删除中…" : "…") : (zh ? "确认" : "Yes")}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                      >
                        {zh ? "取消" : "No"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(p.id)}
                      title={zh ? "删除" : "Delete"}
                      className="p-1.5 rounded-lg border border-border hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="bg-muted px-2 py-0.5 rounded-full">{p.section}</span>
                {p.isPinned && <span className="text-violet-500 font-medium">📌 {zh ? "已置顶" : "Pinned"}</span>}
                <span>👁 {(p.views ?? 0).toLocaleString()}</span>
                <span>❤️ {p.likes ?? 0}</span>
                <span className="ml-auto">{timeAgo(p.createdAt, zh)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export default function Profile() {
  const { address, isConnected, disconnect } = useWeb3Auth() as any;
  const upsertMutation = useUpsertUser();
  const queryClient = useQueryClient();
  const { data: meData } = useGetMe(
    { wallet: address ?? "" },
    { query: { enabled: !!address } }
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const admin = isAdmin(address);
  const me = (meData as any)?.user ?? meData;
  const { t, lang } = useLang();
  const zh = lang === "zh-CN";

  const isSpaceOwner = me?.spaceStatus === "approved" || me?.spaceStatus === "active";
  const spaceType = me?.spaceType;
  const defaultName = zh
    ? (isSpaceOwner ? "团队" : "用户")
    : (isSpaceOwner ? "Team" : "User");
  const displayUsername = me?.username || me?.spaceType || defaultName;

  const [activeTab, setActiveTab] = useState<NavTab>("notifications");
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);

  const [twitter, setTwitter]       = useState("");
  const [website, setWebsite]       = useState("");
  const [discord, setDiscord]       = useState("");
  const [telegram, setTelegram]     = useState("");
  const [whitepaper, setWhitepaper] = useState("");
  const [username, setUsername]     = useState("");
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved">("idle");

  const [showEditLinks, setShowEditLinks] = useState(false);
  const [editTwitter, setEditTwitter]     = useState("");
  const [editWebsite, setEditWebsite]     = useState("");
  const [editDiscord, setEditDiscord]     = useState("");
  const [editTelegram, setEditTelegram]   = useState("");
  const [editWhitepaper, setEditWhitepaper] = useState("");
  const [editSaving, setEditSaving]       = useState(false);


  useEffect(() => {
    if (!me) return;
    setTwitter(me.twitter ?? "");
    setWebsite(me.website ?? "");
    setUsername(me.username ?? "");
    setDiscord((me as any).discord ?? "");
    setTelegram((me as any).telegram ?? "");
    setWhitepaper((me as any).whitepaper ?? "");
    setSubscriptions((me as any).subscriptions ?? []);
  }, [me]);


  const fetchNotifs = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${apiBase}/notifications?wallet=${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setNotifUnread(data.unread ?? 0);
    } catch {}
  }, [address]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const markRead = async () => {
    if (!address || notifUnread === 0) return;
    try {
      await fetch(`${apiBase}/notifications/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      setNotifUnread(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const deleteNotif = async (id: number) => {
    if (!address) return;
    try {
      await fetch(`${apiBase}/notifications/${id}?wallet=${address.toLowerCase()}`, { method: "DELETE" });
      setNotifications(prev => {
        const updated = prev.filter(n => n.id !== id);
        const wasUnread = prev.find(n => n.id === id && !n.isRead);
        if (wasUnread) setNotifUnread(u => Math.max(0, u - 1));
        return updated;
      });
    } catch {}
  };

  const toggleSubscription = async (section: string) => {
    if (!address) return;
    const next = subscriptions.includes(section)
      ? subscriptions.filter(s => s !== section)
      : [...subscriptions, section];
    setSubscriptions(next);
    try {
      await fetch(`${apiBase}/users/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, subscriptions: next }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    } catch {}
  };

  const handleSaveUsername = () => {
    if (!address || !usernameDirty) return;
    setSaveStatus("saving");
    upsertMutation.mutate(
      { data: { wallet: address, username, language: lang } as any },
      {
        onSuccess: () => {
          setSaveStatus("saved");
          setUsernameDirty(false);
          queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
          setTimeout(() => setSaveStatus("idle"), 3000);
        },
        onError: () => setSaveStatus("idle"),
      }
    );
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !address) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      upsertMutation.mutate(
        { data: { wallet: address, avatar: ev.target?.result as string } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }) }
      );
    };
    reader.readAsDataURL(file);
  };

  const openEditLinks = () => {
    setEditTwitter(twitter); setEditWebsite(website);
    setEditDiscord(discord); setEditTelegram(telegram);
    setEditWhitepaper(whitepaper);
    setShowEditLinks(true);
  };

  const saveEditLinks = async () => {
    if (!address) return;
    setEditSaving(true);
    try {
      await fetch(`${apiBase}/users/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          twitter: editTwitter, website: editWebsite,
          discord: editDiscord, telegram: editTelegram,
          whitepaper: editWhitepaper,
        }),
      });
      setTwitter(editTwitter); setWebsite(editWebsite);
      setDiscord(editDiscord); setTelegram(editTelegram);
      setWhitepaper(editWhitepaper);
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      setShowEditLinks(false);
    } catch {} finally { setEditSaving(false); }
  };


  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertCircle className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-bold">{zh ? "连接钱包" : "Connect Wallet"}</h2>
        <p className="text-sm text-muted-foreground">{zh ? "请连接钱包以查看个人中心。" : "Please connect your wallet to view your profile."}</p>
      </div>
    );
  }

  type NavItem = { tab: NavTab; icon: React.ReactNode; label: string; disabled?: boolean };

  const NAV_ITEMS: NavItem[] = [
    ...(!admin ? [
      { tab: "subscriptions" as NavTab, icon: <Bookmark className="w-4 h-4" />, label: zh ? "我的订阅" : "Subscriptions" },
      { tab: "notifications" as NavTab, icon: <Bell className="w-4 h-4" />,     label: zh ? "最近通知" : "Notifications" },
    ] : []),
    ...(isSpaceOwner
      ? [
          { tab: "publish" as NavTab, icon: <FileText className="w-4 h-4" />, label: zh ? "发布内容" : "Publish" },
          { tab: "posts"   as NavTab, icon: <PenSquare className="w-4 h-4" />, label: zh ? "我的发布" : "My Posts" },
        ]
      : [
          { tab: "publish" as NavTab, icon: <FileText className="w-4 h-4" />, label: zh ? "发布内容" : "Publish", disabled: true },
          { tab: "posts"   as NavTab, icon: <PenSquare className="w-4 h-4" />, label: zh ? "我的发布" : "My Posts", disabled: true },
          { tab: "apply"   as NavTab, icon: <Users className="w-4 h-4" />,     label: zh ? "团队申请" : "Apply" },
        ]
    ),
    { tab: "settings", icon: <Settings className="w-4 h-4" />, label: zh ? "账号设置" : "Settings" },
    ...(admin ? [
      { tab: "admin" as NavTab, icon: <ShieldCheck className="w-4 h-4" />, label: "admin" },
    ] : []),
  ];

  const renderMain = () => {
    switch (activeTab) {

      case "subscriptions": return (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-500" />
              {zh ? "我的订阅" : "My Subscriptions"}
            </h2>
            <span className="text-xs text-muted-foreground">
              {zh ? `已订阅 ${subscriptions.length} 个` : `${subscriptions.length} subscribed`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {zh ? "点击标签切换订阅状态，订阅后将收到该栏目的新内容推送。" : "Click to toggle subscription."}
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">{zh ? "板块" : "Sections"}</div>
              <div className="flex flex-wrap gap-2">
                {HOME_SECTION_NAMES.map(s => {
                  const active = subscriptions.includes(s);
                  return (
                    <button key={s} onClick={() => toggleSubscription(s)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-150 ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-primary hover:text-primary"
                      }`}>
                      {active && <Check className="w-3 h-3 inline mr-1.5" />}
                      {zh ? s : (SECTION_EN[s] ?? s)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chains */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">{zh ? "公链" : "Chains"}</div>
              <div className="flex flex-wrap gap-2">
                {CHAINS.map((name) => {
                  const id = makeEcosystemSectionId("chain", name);
                  const active = subscriptions.includes(id);
                  return (
                    <button key={id} onClick={() => toggleSubscription(id)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-150 ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-primary hover:text-primary"
                      }`}>
                      {active && <Check className="w-3 h-3 inline mr-1.5" />}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Exchanges */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">{zh ? "交易所" : "Exchanges"}</div>
              <div className="flex flex-wrap gap-2">
                {EXCHANGES.map((name) => {
                  const id = makeEcosystemSectionId("exchange", name);
                  const active = subscriptions.includes(id);
                  return (
                    <button key={id} onClick={() => toggleSubscription(id)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-150 ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-primary hover:text-primary"
                      }`}>
                      {active && <Check className="w-3 h-3 inline mr-1.5" />}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );

      case "notifications": return (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-rose-500" />
              {zh ? "最近通知" : "Notifications"}
              {notifUnread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">{notifUnread}</span>
              )}
            </h2>
            {notifUnread > 0 && (
              <button onClick={markRead} className="text-xs text-muted-foreground hover:text-foreground">
                {zh ? "全部已读" : "Mark all read"}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">{zh ? "暂无通知" : "No notifications yet"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n: any) => (
                <div key={n.id} className={`flex items-start gap-3 p-3 rounded-xl ${!n.isRead ? "bg-primary/5 border border-primary/10" : "hover:bg-muted/40"}`}>
                  <span className="shrink-0 mt-0.5 text-base"><NotifIcon type={n.type} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      {n.fromName && <span className="font-semibold">{n.fromName} </span>}
                      {n.postTitle
                        ? (zh ? `对「${n.postTitle}」进行了互动` : `interacted with "${n.postTitle}"`)
                        : (n.type === "new_apply" ? (zh ? "向您发起了匹配申请" : "sent you a match request") : n.type)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.createdAt, zh)}</p>
                  </div>
                  {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                  <button
                    onClick={() => deleteNotif(n.id)}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 transition-colors group"
                    title={zh ? "删除此通知" : "Delete notification"}
                  >
                    <Trash2 className="w-4 h-4 text-red-400 group-hover:text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );

      case "publish": return isSpaceOwner ? (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            {zh ? "发布内容" : "Publish Content"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {zh ? "作为团队成员，你可以向各分区发布内容。" : "As a team member, you can publish content to any section."}
          </p>
          <Link href="/post/new"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow transition-all">
            <PenSquare className="w-4 h-4" />
            {zh ? "发布新内容" : "Create New Post"}
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
          <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto" />
          <p className="font-medium text-muted-foreground">{zh ? "仅团队用户可发布内容" : "Team members only"}</p>
          <button onClick={() => setActiveTab("apply")} className="text-sm text-primary hover:underline">
            {zh ? "申请成为团队用户 →" : "Apply for team access →"}
          </button>
        </div>
      );

      case "posts": return <MyPostsTab address={address ?? ""} isSpaceOwner={isSpaceOwner} zh={zh} adminUser={admin} />;

      case "apply": return (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            {zh ? "团队申请" : "Apply for Team"}
          </h2>
          {me?.spaceStatus === "pending" ? (
            <div className="py-8 text-center space-y-2">
              <div className="text-3xl">⏳</div>
              <p className="font-semibold text-amber-600 dark:text-amber-400">{zh ? "审核中" : "Under Review"}</p>
              <p className="text-sm text-muted-foreground">{zh ? "我们将在24小时内完成审核。" : "We'll review within 24 hours."}</p>
            </div>
          ) : isSpaceOwner ? (
            <div className="py-8 text-center space-y-2">
              <div className="text-3xl">✅</div>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">{zh ? "已通过" : "Approved"}</p>
              <p className="text-sm text-muted-foreground">{zh ? "你已是团队用户，享有发布权限。" : "You are a team member with publishing rights."}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {zh
                  ? "申请成为团队用户后，你将获得专属展示位与发布权限，加入 Web3 Release 生态。"
                  : "Apply to become a team member and get a dedicated profile, publishing rights, and ecosystem benefits."}
              </p>
              <Link href="/apply"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm shadow transition-all">
                <Users className="w-4 h-4" />
                {zh ? "立即申请 →" : "Apply Now →"}
              </Link>
            </>
          )}
        </div>
      );

      case "settings": return (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            {zh ? "账号设置" : "Account Settings"}
          </h2>

          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{zh ? "显示名称" : "Display Name"}</label>
            <div className="flex gap-2">
              <input
                value={username}
                onChange={e => { setUsername(e.target.value); setUsernameDirty(true); }}
                placeholder={truncateAddress(address)}
                maxLength={32}
                className="flex-1 text-sm bg-muted/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {usernameDirty && (
                <button onClick={handleSaveUsername} disabled={saveStatus === "saving"}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
                  <Save className="w-3 h-3" />
                  {saveStatus === "saving" ? "..." : saveStatus === "saved" ? "✓" : (zh ? "保存" : "Save")}
                </button>
              )}
            </div>
          </div>

          {/* Avatar */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{zh ? "头像" : "Avatar"}</label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl border-2 border-border"
                style={me?.avatar
                  ? { backgroundImage: `url(${me.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: generateGradient(address) }} />
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-colors">
                <Edit2 className="w-3 h-3" />
                {zh ? "更换头像" : "Change Avatar"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          <div className="pt-2 border-t border-border/60 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{zh ? "钱包地址" : "Wallet Address"}</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">{address}</span>
              <button onClick={() => navigator.clipboard.writeText(address ?? "")}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60">
            <button onClick={() => disconnect?.()}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 hover:border-red-200 transition-all">
              <LogOut className="w-3.5 h-3.5" />
              {zh ? "断开钱包" : "Disconnect Wallet"}
            </button>
          </div>
        </div>
      );

      case "admin": return admin ? <AdminPage /> : null;

      default: return null;
    }
  };

  return (
    <>
      <div className="flex gap-5 items-start">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-52 shrink-0 sticky top-24 space-y-4">

          {/* Avatar + Username + Wallet */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
              <div className="w-16 h-16 rounded-full border-2 border-border"
                style={me?.avatar
                  ? { backgroundImage: `url(${me.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: generateGradient(address) }} />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Edit2 className="w-3.5 h-3.5 text-white" />
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center">
                <p className="text-sm font-bold leading-tight">{displayUsername}</p>
                <RoleBadge spaceType={isSpaceOwner ? spaceType : null} size="xs" />
              </div>
              <div className="flex items-center gap-1 mt-0.5 justify-center">
                <span className="text-xs font-mono text-muted-foreground">{truncateAddress(address ?? "")}</span>
                <button onClick={() => navigator.clipboard.writeText(address ?? "")}
                  className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground/50 hover:text-muted-foreground">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Project Links — hidden for admin */}
          {!admin && (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-muted-foreground">{zh ? "项目链接" : "Links"}</span>
                <button onClick={openEditLinks} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
              {[
                { icon: <Twitter className="w-3 h-3 text-sky-500" />, val: twitter, ph: "Twitter" },
                { icon: <Globe className="w-3 h-3 text-green-500" />, val: website, ph: zh ? "官网" : "Website" },
                { icon: <MessageCircle className="w-3 h-3 text-indigo-500" />, val: discord, ph: "Discord" },
                { icon: <Send className="w-3 h-3 text-blue-400" />, val: telegram, ph: "Telegram" },
                { icon: <BookOpen className="w-3 h-3 text-amber-500" />, val: whitepaper, ph: zh ? "白皮书" : "Whitepaper" },
              ].map(({ icon, val, ph }, i) => (
                <div key={i} className="flex items-center gap-2 py-1 group">
                  <span className="shrink-0">{icon}</span>
                  {val ? (
                    <a href={val} target="_blank" rel="noreferrer"
                      className="text-xs text-foreground/80 hover:text-primary truncate flex-1 flex items-center gap-1">
                      <span className="truncate">{val.replace(/^https?:\/\/(www\.)?/, "")}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground/40 italic">{ph}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border/60" />

          {/* Navigation */}
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(({ tab, icon, label, disabled }) => (
              <button key={tab}
                onClick={() => !disabled && setActiveTab(tab)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                  disabled
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : activeTab === tab
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}>
                {icon}
                <span className="truncate flex-1">{label}</span>
                {disabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50 font-normal shrink-0">
                    {zh ? "团队" : "Team"}
                  </span>
                )}
                {tab === "notifications" && notifUnread > 0 && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-bold">{notifUnread}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 min-w-0 space-y-5">

          {/* Slot Machine — hidden when admin panel is active */}
          {FEATURES.dailyLucky && activeTab !== "admin" && (
            <div className="rounded-2xl p-5 bg-card border border-border">
              <SlotMachine
                wallet={address ?? ""}
                tokens={me?.tokens ?? 0}
                lastSlotPull={(me as any)?.lastSlotPull ?? null}
                onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }); }}
              />
            </div>
          )}

          {/* Tab content */}
          {renderMain()}
        </main>
      </div>

      {/* Edit Links Modal */}
      {showEditLinks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowEditLinks(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base text-gray-900">{zh ? "编辑项目链接" : "Edit Project Links"}</h3>
            {[
              { label: "X / Twitter", val: editTwitter, set: setEditTwitter, ph: "https://x.com/yourhandle" },
              { label: zh ? "官网" : "Website",  val: editWebsite, set: setEditWebsite, ph: "https://yourproject.xyz" },
              { label: "Discord",  val: editDiscord, set: setEditDiscord, ph: "https://discord.gg/..." },
              { label: "Telegram", val: editTelegram, set: setEditTelegram, ph: "https://t.me/..." },
              { label: zh ? "白皮书" : "Whitepaper", val: editWhitepaper, set: setEditWhitepaper, ph: "https://docs.yourproject.xyz" },
            ].map(({ label, val, set, ph }) => (
              <div key={label}>
                <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
                <input type="url" value={val} onChange={e => set(e.target.value)} placeholder={ph}
                  className="w-full text-sm text-gray-900 bg-white border border-gray-200 rounded-xl px-3 py-2 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowEditLinks(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                {zh ? "取消" : "Cancel"}
              </button>
              <button onClick={saveEditLinks} disabled={editSaving}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60">
                {editSaving ? (zh ? "保存中..." : "Saving...") : (zh ? "保存" : "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
