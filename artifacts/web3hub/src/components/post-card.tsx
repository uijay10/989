import { useState, useEffect } from "react";

function useCountdown(targetIso: string | null | undefined) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!targetIso) { setRemaining(""); return; }
    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setRemaining(""); return; }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(d > 0 ? `${d}d ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}
import { createPortal } from "react-dom";
import { Copy, Check, Pin, User, Eye, Clock, Globe, Twitter as TwitterIcon, X, Trash2 } from "lucide-react";
import { getApiBase } from "@/lib/api-base";

const SECTION_KEY_MAP: Record<string, string> = {
  testnet: "sTestnetLabel", ido: "sIdoLabel", security: "sSecurityLabel",
  integration: "sIntegrationLabel", airdrop: "sAirdropLabel", events: "sEventsLabel",
  funding: "sFundingLabel", jobs: "sJobsLabel", nodes: "sNodesLabel",
  defi: "sDefiLabel", analytics: "sAnalyticsLabel",
  nft: "sNftLabel", research: "sResearchLabel", js: "sJsLabel",
  showcase: "sShowcaseLabel", ecosystem: "sEcosystemLabel", partners: "sPartnersLabel",
  hackathon: "sHackathonLabel", ama: "sAmaLabel", bugbounty: "sBugbountyLabel",
  community: "nav_community", kol: "nav_kol", developer: "nav_developer",
  presale: "sIdoLabel", mainnet: "sIdoLabel", unlock: "sUnlockLabel",
  exchange: "sIdoLabel", quest: "sQuestLabel",
  meme: "sMemeLabel", policy: "sPolicyLabel",
};
import { formatDistanceToNow } from "date-fns";
import { useWeb3Auth } from "@/lib/web3";
import { generateGradient, truncateAddress } from "@/lib/utils";
import { RoleBadge } from "@/components/role-badge";
import { useLang } from "@/lib/i18n";
import { Link } from "wouter";
import { isAdmin } from "@/lib/admin";

const apiBase = getApiBase();

interface PostCardPost {
  id: number;
  title: string;
  content: string;
  section: string;
  authorWallet: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  authorType?: string | null;
  authorTags?: string[] | null;
  views?: number;
  likes: number;
  comments: number;
  isPinned?: boolean;
  pinnedUntil?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  sourceUrl?: string | null;
}

const TAG_COLORS: Record<string, string> = {
  L1: "bg-blue-500/15 text-blue-500", L2: "bg-blue-400/15 text-blue-400",
  Infrastructure: "bg-slate-500/15 text-slate-400", DePIN: "bg-indigo-500/15 text-indigo-400",
  Node: "bg-slate-400/15 text-slate-400", Validator: "bg-indigo-400/15 text-indigo-400",
  DeFi: "bg-emerald-500/15 text-emerald-500", DEX: "bg-teal-500/15 text-teal-500",
  RWA: "bg-cyan-500/15 text-cyan-500", SocialFi: "bg-violet-500/15 text-violet-500",
  NFT: "bg-pink-500/15 text-pink-500", GameFi: "bg-orange-500/15 text-orange-500",
  AI: "bg-purple-500/15 text-purple-500",
};
export function TagBadge({ tag }: { tag: string }) {
  const cls = TAG_COLORS[tag] ?? "bg-muted text-muted-foreground";
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>{tag}</span>;
}

interface PostCardProps {
  post: PostCardPost;
  onRefresh?: () => void;
  showPin?: boolean;
  compact?: boolean;
}

const CONTENT_LIMIT = 260; // chars shown before "read more"

const PIN_PRESETS = [
  { label: "1 小时", hours: 1 },
  { label: "6 小时", hours: 6 },
  { label: "12 小时", hours: 12 },
  { label: "24 小时", hours: 24 },
  { label: "3 天", hours: 72 },
  { label: "1 周", hours: 168 },
  { label: "1 个月", hours: 720 },
];

export function AdminPinModal({ hours, setHours, custom, setCustom, pinning, onConfirm, onClose }: {
  hours: number | ""; setHours: (h: number | "") => void;
  custom: boolean; setCustom: (c: boolean) => void;
  pinning: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const valid = Number(hours) >= 1;
  const label = valid
    ? (Number(hours) >= 720 ? `${Math.round(Number(hours) / 720)} 个月`
      : Number(hours) >= 168 ? `${Math.round(Number(hours) / 168)} 周`
      : Number(hours) >= 24 ? `${Math.round(Number(hours) / 24)} 天`
      : `${hours} 小时`)
    : "";
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-96 mx-4 border border-violet-300 dark:border-violet-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Pin className="w-4 h-4 text-violet-500 shrink-0" />
          <p className="text-sm font-semibold text-foreground">管理员置顶</p>
          <span className="ml-auto text-[10px] text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full font-medium">免费 · 无需能量</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">选择置顶时长，可置顶任意帖子，即时生效。</p>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {PIN_PRESETS.map(p => (
            <button key={p.hours}
              onClick={() => { setHours(p.hours); setCustom(false); }}
              className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${!custom && hours === p.hours
                ? "bg-violet-500 text-white border-violet-500"
                : "bg-muted text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"}`}>
              {p.label}
            </button>
          ))}
          <button
            onClick={() => { setCustom(true); setHours(""); }}
            className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${custom
              ? "bg-violet-500 text-white border-violet-500"
              : "bg-muted text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"}`}>
            自定义
          </button>
        </div>

        {custom && (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number" min={1} max={8760} value={hours}
              onChange={e => setHours(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="输入小时数"
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            />
            <span className="text-xs text-muted-foreground shrink-0">小时</span>
          </div>
        )}

        {valid && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mb-4 font-medium">置顶时长：{label}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">取消</button>
          <button onClick={onConfirm} disabled={pinning || !valid}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-50">
            {pinning ? "置顶中..." : "确认置顶"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_COLORS_MODAL: Record<string, string> = {
  developer: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  project: "bg-violet-500/10 text-violet-500 border-violet-500/30",
  kol: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

interface UserInfoModalProps {
  wallet: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  authorType?: string | null;
  authorTags?: string[] | null;
  onClose: () => void;
}

function UserInfoModal({ wallet, authorName, authorAvatar, authorType, authorTags, onClose }: UserInfoModalProps) {
  const { t } = useLang();
  const [extra, setExtra] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/users/me?wallet=${wallet}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setExtra(d); })
      .catch(() => {});
  }, [wallet]);

  const displayName = authorName || extra?.username || truncateAddress(wallet);
  const spaceType = extra?.spaceType ?? authorType ?? null;
  const spaceStatus = extra?.spaceStatus ?? null;
  const tags: string[] = extra?.tags?.length ? extra.tags : (authorTags ?? []);
  const roleLabel = spaceType === "project" ? t("roleProject")
    : spaceType === "developer" ? t("roleDeveloper")
    : spaceType === "kol" ? "KOL"
    : spaceType;
  const avatar = authorAvatar || extra?.avatar || null;
  const avatarStyle = avatar
    ? { backgroundImage: `url(${avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: generateGradient(wallet) };
  const copyWallet = () => {
    navigator.clipboard.writeText(wallet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const fetched = extra !== null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <span className="font-bold text-sm text-gray-900 dark:text-white">{t("userInfoBtn")}</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0" style={avatarStyle} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-gray-900 dark:text-white truncate">{displayName}</span>
                {spaceType && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ROLE_COLORS_MODAL[spaceType] ?? "bg-gray-100 text-gray-500 border-gray-300"}`}>
                    {roleLabel}
                  </span>
                )}
                {spaceStatus === "approved" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-600 border border-green-300 font-semibold dark:bg-green-900/30 dark:border-green-700">✓ Space</span>
                )}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {tags.map(tag => <TagBadge key={tag} tag={tag} />)}
                </div>
              )}
            </div>
          </div>

          {/* Info rows — always show all fields */}
          <div className="space-y-2">
            {/* Wallet */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
              <User className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span className="font-mono text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{wallet}</span>
              <button onClick={copyWallet} className="shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Twitter */}
            {fetched && (extra?.twitter ? (
              <a href={`https://twitter.com/${extra.twitter.replace("@", "")}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                <TwitterIcon className="w-3.5 h-3.5 shrink-0 text-sky-500" />
                <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{extra.twitter.startsWith("@") ? extra.twitter : `@${extra.twitter}`}</span>
              </a>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <TwitterIcon className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
              </div>
            ))}

            {/* Website */}
            {fetched && (extra?.website ? (
              <a href={extra.website.startsWith("http") ? extra.website : `https://${extra.website}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                <Globe className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{extra.website}</span>
              </a>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <Globe className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
              </div>
            ))}

            {/* Contact */}
            {fetched && (extra?.contact && extra?.contactPublic ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <span className="shrink-0 text-[10px] font-black text-pink-500 leading-none tracking-tight">KIT</span>
                <span className="text-xs text-gray-700 dark:text-gray-200 select-all flex-1 truncate">{extra.contact}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <span className="shrink-0 text-[10px] font-black text-gray-400 dark:text-gray-500 leading-none tracking-tight">KIT</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{t("contactNotPublic")}</span>
              </div>
            ))}

            {/* Loading skeleton when fetch not done yet */}
            {!fetched && (
              <div className="space-y-2 animate-pulse">
                <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-lg" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PostCard({ post, onRefresh, showPin, compact }: PostCardProps) {
  const { address, isConnected } = useWeb3Auth();
  const { t, lang } = useLang();
  const admin = isAdmin(address);

  const [copied, setCopied] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinConfirmOpen, setPinConfirmOpen] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [adminPinHours, setAdminPinHours] = useState<number | "">(72);
  const [adminPinCustom, setAdminPinCustom] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [userInfoOpen, setUserInfoOpen] = useState(false);

  const expiryCountdown = useCountdown(post.expiresAt ?? null);

  const isLong = post.content.length > CONTENT_LIMIT;
  const displayContent = expanded || !isLong
    ? post.content
    : post.content.slice(0, CONTENT_LIMIT).trimEnd() + "…";
  const readMoreLabel = lang === "zh-CN" ? "查看全文" : "Show more";
  const collapseLabel = lang === "zh-CN" ? "收起" : "Show less";

  const displayName = post.authorType === "ai"
    ? (post.authorName || "AI精选")
    : (post.authorName ?? truncateAddress(post.authorWallet));
  const authorHref = post.authorType === "ai" ? "#" : `/profile/${post.authorWallet}`;

  const doPin = async () => {
    if (!address) return;
    setPinConfirmOpen(false);
    setPinning(true);
    setPinMsg("");
    try {
      const res = await fetch(`${apiBase}/posts/${post.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      const d = await res.json();
      if (!res.ok) {
        setPinMsg(d.error === "No pin credits" ? "❌ 置顶次数不足" : `❌ ${d.error}`);
        return;
      }
      if (d.queued) {
        let waitStr = "";
        if (d.estimatedAt) {
          const ms = Math.max(0, new Date(d.estimatedAt).getTime() - Date.now());
          const h = Math.floor(ms / 3_600_000);
          const m = Math.floor((ms % 3_600_000) / 60_000);
          waitStr = h > 0 ? ` · 等待约 ${h}h${m}m` : ` · 等待约 ${m}分钟`;
        }
        setPinMsg(`置顶排队中${waitStr}`);
      } else {
        setPinMsg("✅ 置顶成功！");
        onRefresh?.();
      }
    } finally {
      setPinning(false);
    }
  };

  const doAdminPin = async () => {
    if (!address) return;
    const hours = Number(adminPinHours);
    if (!hours || hours < 1) return;
    setAdminPinOpen(false);
    setPinning(true);
    setPinMsg("");
    try {
      const res = await fetch(`${apiBase}/posts/${post.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, durationHours: hours }),
      });
      const d = await res.json();
      if (!res.ok) {
        setPinMsg(`❌ ${d.error}`);
        return;
      }
      setPinMsg(`✅ 管理员置顶成功！有效期 ${hours >= 24 ? Math.round(hours / 24) + " 天" : hours + " 小时"}`);
      onRefresh?.();
    } finally {
      setPinning(false);
    }
  };

  const handlePin = () => {
    if (!address || pinning) return;
    setPinMsg("");
    if (admin) {
      setAdminPinHours(72);
      setAdminPinCustom(false);
      setAdminPinOpen(true);
    } else {
      setPinConfirmOpen(true);
    }
  };

  const handleCopy = () => {
    const url = window.location.origin + `/post/${post.id}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleDelete = async () => {
    if (!admin || !address || deleting) return;
    if (!window.confirm(t("confirmDelete"))) return;
    setDeleting(true);
    setDeleteMsg("");
    try {
      const res = await fetch(`${apiBase}/admin/posts/${post.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) {
        setDeleteMsg(`❌ ${d.error ?? "Delete failed"}`);
        return;
      }
      setDeleteMsg("✅ 删除成功");
      onRefresh?.();
    } finally {
      setDeleting(false);
    }
  };

  if (compact) {
    return (
      <div className={`bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all ${post.isPinned ? "ring-1 ring-violet-400/50 bg-violet-50/20 dark:bg-violet-950/10" : ""}`}>
        {post.isPinned && (
          <div className="flex items-center gap-1 text-violet-500 text-xs font-semibold mb-2">
            <Pin className="w-3 h-3" /> {lang === "zh-CN" ? "已置顶" : "Pinned"}
            {post.pinnedUntil && (
              <span className="ml-1 opacity-60 font-normal">
                ({lang === "zh-CN" ? "还剩" : "expires"} {formatDistanceToNow(new Date(post.pinnedUntil))})
              </span>
            )}
          </div>
        )}
        {expiryCountdown && (
          <div className="flex items-center gap-1 text-orange-500 text-xs font-medium mb-2">
            <Clock className="w-3 h-3" /> {t("expiryLabel")}<span className="font-mono font-bold">{expiryCountdown}</span>
          </div>
        )}
        <div className="flex items-start gap-3">
          <Link href={authorHref}>
            <div className="w-8 h-8 rounded-full shrink-0 border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 bg-transparent"
              style={post.authorAvatar
                ? { backgroundImage: `url(${post.authorAvatar})`, backgroundSize: "cover", backgroundPosition: "center" }
                : { background: generateGradient(post.authorWallet) }}>
              {!post.authorAvatar && <div className="w-full h-full" />}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <Link href={authorHref} className="text-xs font-semibold text-foreground hover:text-primary transition-colors">{displayName}</Link>
              <RoleBadge spaceType={post.authorType} size="xs" />
              {post.authorTags?.map(tag => <TagBadge key={tag} tag={tag} />)}
              <button
                onClick={() => setUserInfoOpen(true)}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
              >
                {t("userInfoBtn")}
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(post.createdAt))} ago</span>
            </div>
            <p className="font-semibold text-sm text-foreground line-clamp-1">{post.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{displayContent}</p>
            {isLong && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
                className="text-xs text-primary hover:underline mt-0.5"
              >
                {expanded ? collapseLabel : readMoreLabel}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/40">
          <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">#{t(SECTION_KEY_MAP[post.section] ?? post.section) || post.section}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground/70 px-0.5">
              <Eye className="w-3 h-3" />{(post.views ?? 0).toLocaleString()}
            </span>
            <button onClick={handleCopy} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {(showPin || admin) && (
              <button onClick={handlePin} disabled={pinning} title="Pin post"
                className="text-xs text-muted-foreground hover:text-violet-500 transition-colors">
                <Pin className="w-3.5 h-3.5" />
              </button>
            )}
            {admin && (
              <button onClick={handleDelete} disabled={deleting} title={t("deletePost")}
                className="text-xs text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {deleteMsg && <p className="text-xs mt-2 text-red-500 font-medium">{deleteMsg}</p>}
        {/* Pin confirm modal – rendered via portal so it's never clipped */}
        {pinConfirmOpen && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPinConfirmOpen(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80 mx-4 border border-violet-200 dark:border-violet-800" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <Pin className="w-4 h-4 text-violet-500 shrink-0" />
                <p className="text-sm font-semibold text-foreground">确认置顶</p>
              </div>
              <p className="text-sm text-muted-foreground mb-4">置顶此帖将消耗 <strong className="text-violet-600">1 次</strong>置顶次数，确认操作？</p>
              <div className="flex gap-3">
                <button onClick={() => setPinConfirmOpen(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">取消</button>
                <button onClick={doPin} disabled={pinning}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-50">
                  {pinning ? "处理中..." : "确定置顶"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
        {adminPinOpen && createPortal(
          <AdminPinModal
            hours={adminPinHours} setHours={setAdminPinHours}
            custom={adminPinCustom} setCustom={setAdminPinCustom}
            pinning={pinning} onConfirm={doAdminPin} onClose={() => setAdminPinOpen(false)}
          />, document.body
        )}
        {pinMsg && !pinConfirmOpen && !adminPinOpen && (
          <p className="text-xs mt-2 text-violet-500 font-medium">{pinMsg}</p>
        )}
        {userInfoOpen && <UserInfoModal wallet={post.authorWallet} authorName={post.authorName} authorAvatar={post.authorAvatar} authorType={post.authorType} authorTags={post.authorTags} onClose={() => setUserInfoOpen(false)} />}
      </div>
    );
  }

  return (
    <div className={`bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all ${post.isPinned ? "ring-1 ring-violet-400/50 bg-violet-50/20 dark:bg-violet-950/10" : ""}`}>
      {post.isPinned && (
        <div className="flex items-center gap-1 text-violet-500 text-xs font-semibold mb-3">
          <Pin className="w-3.5 h-3.5" /> {lang === "zh-CN" ? "已置顶" : "Pinned"}
          {post.pinnedUntil && <span className="ml-1 opacity-60 font-normal">({lang === "zh-CN" ? "还剩" : "expires"} {formatDistanceToNow(new Date(post.pinnedUntil))})</span>}
        </div>
      )}
      {expiryCountdown && (
        <div className="flex items-center gap-1 text-orange-500 text-xs font-medium mb-3">
          <Clock className="w-3.5 h-3.5" /> {t("expiryLabel")}<span className="font-mono font-bold">{expiryCountdown}</span>
        </div>
      )}

      {/* Author header */}
      <div className="flex items-start gap-3 mb-4">
        <Link href={authorHref}>
          <div className="w-10 h-10 rounded-full shrink-0 border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 bg-transparent"
            style={post.authorAvatar
              ? { backgroundImage: `url(${post.authorAvatar})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: generateGradient(post.authorWallet) }}>
            {!post.authorAvatar && <div className="w-full h-full" />}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={authorHref} className="font-semibold text-sm hover:text-primary transition-colors">{displayName}</Link>
            <RoleBadge spaceType={post.authorType} size="xs" />
            {post.authorTags?.map(tag => <TagBadge key={tag} tag={tag} />)}
            <button
              onClick={() => setUserInfoOpen(true)}
              className="text-xs font-semibold px-2 py-0.5 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
            >
              {t("userInfoBtn")}
            </button>
            <span className="text-xs text-primary/70 bg-primary/8 px-2 py-0.5 rounded-full ml-auto">#{t(SECTION_KEY_MAP[post.section] ?? post.section) || post.section}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(post.createdAt))} ago</div>
        </div>
      </div>

      {/* AI badge for AI-extracted posts */}
      {post.authorType === "ai" && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            🤖 AI精选
          </span>
        </div>
      )}

      {/* Content */}
      <h3 className="font-bold text-base mb-2 text-foreground">{post.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed break-words" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{displayContent}</p>
      {isLong && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
          className="text-xs text-primary hover:underline mt-1.5"
        >
          {expanded ? collapseLabel : readMoreLabel}
        </button>
      )}
      {(post.authorType === "ai" || post.section === "js") && post.sourceUrl && (
        <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
          </svg>
          {post.section === "js" ? "信息来源" : "查看原文"}
        </a>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/40">
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-muted-foreground/60 pr-1">
            <Eye className="w-4 h-4" /> {(post.views ?? 0).toLocaleString()}
          </span>
          <button onClick={handleCopy} title="Copy link"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          {(showPin || admin) && (
            <button onClick={handlePin} disabled={pinning} title="Pin post"
              className="p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-muted-foreground hover:text-violet-600 transition-colors">
              <Pin className="w-4 h-4" />
            </button>
          )}
          {admin && (
            <button onClick={handleDelete} disabled={deleting} title={t("deletePost")}
              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <Link href={authorHref}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="View profile">
            <User className="w-4 h-4" />
          </Link>
        </div>
      </div>
      {deleteMsg && <p className="text-sm mt-2 text-red-500 font-medium">{deleteMsg}</p>}

      {/* Pin confirm modal – portal */}
      {pinConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPinConfirmOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80 mx-4 border border-violet-200 dark:border-violet-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Pin className="w-4 h-4 text-violet-500 shrink-0" />
              <p className="text-sm font-semibold text-foreground">确认置顶</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">置顶此帖将消耗 <strong className="text-violet-600">1 次</strong>置顶次数，确认操作？</p>
            <div className="flex gap-3">
              <button onClick={() => setPinConfirmOpen(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">取消</button>
              <button onClick={doPin} disabled={pinning}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-50">
                {pinning ? "处理中..." : "确定置顶"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {adminPinOpen && createPortal(
        <AdminPinModal
          hours={adminPinHours} setHours={setAdminPinHours}
          custom={adminPinCustom} setCustom={setAdminPinCustom}
          pinning={pinning} onConfirm={doAdminPin} onClose={() => setAdminPinOpen(false)}
        />, document.body
      )}
      {pinMsg && !pinConfirmOpen && !adminPinOpen && (
        <p className="text-sm mt-2 text-violet-500 font-medium">{pinMsg}</p>
      )}

      {userInfoOpen && <UserInfoModal wallet={post.authorWallet} authorName={post.authorName} authorAvatar={post.authorAvatar} authorType={post.authorType} authorTags={post.authorTags} onClose={() => setUserInfoOpen(false)} />}
    </div>
  );
}
