import { useState, useEffect } from "react";
import { filterContent, filterErrorMessage } from "@/lib/content-filter";
import { useWeb3Auth } from "@/lib/web3";
import { useCreatePost, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { useLocation } from "wouter";
import { AlertCircle, CheckCircle2, PenSquare, X, Pin, Sparkles, Copy, Check } from "lucide-react";
import { isAdmin } from "@/lib/admin";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}

const NAV_SECTIONS = [
  "ido", "funding", "quest", "policy",
  "testnet", "nodes", "recruiting", "devbounty", "grant",
] as const;

type NavSection = typeof NAV_SECTIONS[number];

const PROJECT_SECTIONS: NavSection[] = [...NAV_SECTIONS];

const KOL_SECTIONS: NavSection[] = [
  "ido", "quest", "testnet", "nodes", "devbounty", "recruiting", "grant",
];

const DEV_SECTIONS: NavSection[] = [
  "devbounty", "testnet", "quest", "recruiting", "grant",
];

const NORMAL_SECTIONS: NavSection[] = ["recruiting"];

const SECTION_LABEL_KEYS: Record<string, string> = {
  ido: "nav_ido",
  funding: "nav_funding", quest: "nav_quest", policy: "nav_policy",
  testnet: "nav_testnet", nodes: "nav_nodes",
  recruiting: "nav_recruiting", devbounty: "nav_devbounty",
  grant: "nav_grant",
};

function getSections(spaceType: string, adminUser: boolean): string[] {
  if (adminUser) return PROJECT_SECTIONS;
  if (spaceType === "kol") return KOL_SECTIONS;
  if (spaceType === "developer" || spaceType === "devbounty") return DEV_SECTIONS;
  if (!spaceType) return NORMAL_SECTIONS;
  return PROJECT_SECTIONS;
}

type Step = "form" | "confirm" | "done";

export default function PostNew() {
  const { address, isConnected } = useWeb3Auth();
  const createPost = useCreatePost();
  const queryClient = useQueryClient();
  const { t, lang } = useLang();
  const [, setLocation] = useLocation();

  const { data: meData, refetch: refetchMe } = useGetMe(
    { wallet: address ?? "" },
    { query: { enabled: !!address && isConnected } }
  );
  const me = (meData as any)?.user ?? meData;
  const pinCount = me?.pinCount ?? 0;
  const spaceType = me?.spaceType ?? "";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [section, setSection] = useState("");
  const [wantToPin, setWantToPin] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [pinQueued, setPinQueued] = useState(false);
  const [pinQueuedEstimate, setPinQueuedEstimate] = useState<string | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [todayRemaining, setTodayRemaining] = useState<number | null>(null);

  // Fetch today's remaining post count on mount
  useEffect(() => {
    if (!address || !isConnected) return;
    const apiBase = getApiBase();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    fetch(`${apiBase}/posts?authorWallet=${address.toLowerCase()}&limit=10`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.posts) return;
        const todayCount = (data.posts as any[]).filter(
          (p: any) => new Date(p.createdAt) >= todayStart
        ).length;
        setTodayRemaining(Math.max(0, 3 - todayCount));
      })
      .catch(() => {});
  }, [address, isConnected]);

  // AI Assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"post" | "reply">("post");
  const [aiInput, setAiInput] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiCopied, setAiCopied] = useState(false);

  const generateContent = (userInput: string) => {
    const isCN = lang === "zh-CN";
    const input = userInput.trim();

    // ── Keyword detectors ──
    const isTestnet = /测试网|testnet|test net/i.test(input);
    const isIDO = /\bido\b|launchpad|发售|募资/i.test(input);
    const isAirdrop = /空投|airdrop/i.test(input);
    const isAudit = /审计|audit/i.test(input);
    const isRecruit = /招募|招聘|recruit|hire|hiring|looking for/i.test(input);
    const isNode = /节点|node/i.test(input);
    const isHackathon = /黑客松|hackathon/i.test(input);
    const isAMA = /\bama\b/i.test(input);
    const isFunding = /融资|funding|投资|raise|raised/i.test(input);
    const isBugBounty = /漏洞|bug bounty|赏金/i.test(input);

    // Extract project name — first all-caps or CamelCase word, or after 项目/project
    const nameMatch = input.match(/项目\s*([A-Za-z0-9_]+)|([A-Za-z0-9_]+)\s*项目|project\s+([A-Za-z0-9_]+)|([A-Z][A-Za-z0-9]{1,15})\b/);
    const projectName = nameMatch ? (nameMatch[1] || nameMatch[2] || nameMatch[3] || nameMatch[4]) || "Our Project" : "Our Project";

    // Extract numbers / amounts
    const numMatches = input.match(/[\d,，.]+\s*(?:亿|万|千|百|[kKmMbBtT])?/g) || [];
    const firstNum = numMatches[0]?.trim() || "";

    // ── REPLY MODE ──
    if (aiMode === "reply") {
      const hasLike = /点赞|liked|like/i.test(input);
      const hasComment = /评论|comment/i.test(input);
      const hasFollow = /关注|follow/i.test(input);
      const actionWord = isCN
        ? (hasLike ? "点赞" : hasComment ? "评论" : hasFollow ? "关注" : "互动")
        : (hasLike ? "like" : hasComment ? "comment" : hasFollow ? "follow" : "interaction");

      if (isCN) {
        return `💬 回复内容

非常感谢您的${actionWord}与支持！🙏 这对我们项目来说是莫大的鼓励！

我们目前正在全力推进${projectName !== "Our Project" ? ` ${projectName}` : ""}各项进展，欢迎加入我们的 Guild，获取一手资讯、专属奖励和早期参与机会！有任何问题欢迎随时 DM 我，期待与您深入交流 🚀

━━━━━━━━━━━━━
💡 运营建议：
• 可邀请对方加入您的 Guild，建立长期合作关系`;
      }
      return `💬 Reply Draft

Thanks so much for the ${actionWord}! 🙏 It really means a lot to us and keeps the team going!

We're pushing hard on ${projectName !== "Our Project" ? projectName : "our project"} right now — would love to have you in our Guild for exclusive updates, rewards, and early access opportunities! Feel free to DM anytime, happy to chat more 🚀

━━━━━━━━━━━━━
💡 Growth Tips:
• Invite them to your Guild to build a long-term relationship`;
    }

    // ── NEW POST MODE ──
    // Determine section type label + emojis
    const typeInfo = isTestnet ? { cn: "测试网", en: "Testnet", emoji: "🧪", tag: isIDO ? "#IDO" : "#Testnet" }
      : isIDO ? { cn: "IDO/Launchpad", en: "IDO/Launchpad", emoji: "🚀", tag: "#IDO #Launchpad" }
      : isAirdrop ? { cn: "空投活动", en: "Airdrop Campaign", emoji: "🎁", tag: "#Airdrop" }
      : isAudit ? { cn: "安全审计需求", en: "Security Audit", emoji: "🔐", tag: "#SecurityAudit" }
      : isRecruit ? { cn: "团队招募", en: "Recruiting", emoji: "👥", tag: "#Recruiting #Hiring" }
      : isNode ? { cn: "节点招募", en: "Node Recruitment", emoji: "⛓️", tag: "#NodeRecruitment" }
      : isHackathon ? { cn: "黑客松", en: "Hackathon", emoji: "💻", tag: "#Hackathon" }
      : isAMA ? { cn: "AMA 互动", en: "AMA Session", emoji: "🎙️", tag: "#AMA" }
      : isFunding ? { cn: "融资公告", en: "Funding Round", emoji: "💰", tag: "#Funding" }
      : isBugBounty ? { cn: "漏洞赏金", en: "Bug Bounty", emoji: "🐛", tag: "#BugBounty" }
      : { cn: "项目动态", en: "Project Update", emoji: "📢", tag: "#Web3 #Community" };

    const numStr = firstNum ? (isCN ? `${firstNum}枚` : `${firstNum}`) : "";

    if (isCN) {
      return `📌 标题建议
${typeInfo.emoji} ${projectName} ${typeInfo.cn}正式启动${numStr ? `！${numStr}${isAirdrop || isTestnet ? "代币开放领取" : ""}` : "！"}

━━━━━━━━━━━━━
📝 帖子内容

${projectName} 现已正式开启${typeInfo.cn}阶段！${numStr && (isTestnet || isAirdrop) ? `总计 ${numStr}代币面向全球社区开放，` : ""}我们诚邀所有 Web3 社区成员参与，共同见证${projectName}的重要里程碑 ${typeInfo.emoji}

${isTestnet ? `✅ 参与测试网，率先体验核心功能\n✅ 完成任务，赢取丰厚早期参与奖励\n✅ 加入社区，与核心团队直接交流` : isIDO ? `✅ 白名单资格限时开放，先到先得\n✅ 早期参与享受最优惠价格\n✅ 持有代币享受生态专属权益` : isAudit ? `✅ 寻求专业安全审计团队合作\n✅ 全面覆盖智能合约与协议层\n✅ 审计完成后公开报告，保障社区信任` : isRecruit ? `✅ 开放多个核心岗位，诚邀 Web3 精英加入\n✅ 具有竞争力的薪酬 + 代币激励\n✅ 远程办公，全球协作` : `✅ 重要进展公告\n✅ 社区参与机会开放\n✅ 早期参与者获得专属奖励`}

🎯 立即加入 ${projectName} 社区，不错过任何机会！

━━━━━━━━━━━━━
🏷️ 推荐标签
${typeInfo.tag} #${projectName} #Web3Release #Web3

━━━━━━━━━━━━━
💡 运营建议
• 建议同步创建 Guild 并在帖子中邀请社区加入`;
    }

    return `📌 Title Suggestion
${typeInfo.emoji} ${projectName} ${typeInfo.en} is LIVE${numStr ? ` — ${numStr} Tokens Available!` : "!"}

━━━━━━━━━━━━━
📝 Post Content

${projectName} has officially launched its ${typeInfo.en} phase! ${numStr && (isTestnet || isAirdrop) ? `With a total of ${numStr} tokens available to the global community, ` : ""}we invite all Web3 community members to participate and be part of this major milestone ${typeInfo.emoji}

${isTestnet ? `✅ Test core features before mainnet launch\n✅ Complete tasks and earn generous early-bird rewards\n✅ Connect directly with the core team` : isIDO ? `✅ Whitelist spots are limited — first come, first served\n✅ Early participants get the best entry price\n✅ Token holders gain exclusive ecosystem privileges` : isAudit ? `✅ Seeking professional security audit partners\n✅ Full coverage of smart contracts & protocol layer\n✅ Public report post-audit to build community trust` : isRecruit ? `✅ Multiple core positions open for Web3 talent\n✅ Competitive salary + token incentives\n✅ Remote-friendly, globally distributed team` : `✅ Important project milestone announcement\n✅ Community participation opportunities now open\n✅ Early participants receive exclusive rewards`}

🎯 Join the ${projectName} community now and don't miss out!

━━━━━━━━━━━━━
🏷️ Suggested Tags
${typeInfo.tag} #${projectName} #Web3Release #Web3

━━━━━━━━━━━━━
💡 Growth Tips
• Create a Guild and invite community members directly from your post`;
  };

  const copyAiPrompt = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2000);
    });
  };

  const isAdminUser = isAdmin(address);
  const availableSections = getSections(spaceType, isAdminUser);
  const inputCls = "w-full p-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground";

  const withPin = wantToPin && pinCount > 0;

  const validateForm = () => {
    if (!title.trim()) { setError(t("postErrNoTitle")); return false; }
    if (!content.trim()) { setError(t("postErrNoContent")); return false; }
    if (!section) { setError(t("postErrNoSection")); return false; }
    if (!availableSections.includes(section)) { setError(t("postErrNoPermission")); return false; }
    const titleCheck = filterContent(title.trim());
    if (!titleCheck.ok) { setError(filterErrorMessage(titleCheck)); return false; }
    const contentCheck = filterContent(content.trim());
    if (!contentCheck.ok) { setError(filterErrorMessage(contentCheck)); return false; }
    setError(""); return true;
  };

  const isNormalPoster = !isAdminUser && (!spaceType || (spaceType !== "project" && spaceType !== "kol" && spaceType !== "developer"));
  const normalPostsUsed = isNormalPoster ? (() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const storedDate = me?.normalDailyPostDate ?? null;
    return storedDate === todayStr ? (me?.normalDailyPostCount ?? 0) : 0;
  })() : 0;
  const normalPostsRemaining = Math.max(0, 10 - normalPostsUsed);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !validateForm()) return;
    // Show overwrite warning if normal user already posted today
    if (isNormalPoster && normalPostsUsed >= 1) { setShowOverwriteConfirm(true); return; }
    setStep("confirm");
  };

  const pinPost = async (postId: number) => {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/posts/${postId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.queued) {
      setPinQueued(true);
      setPinQueuedEstimate(data.estimatedAt ?? null);
    }
  };

  const handleConfirmedPost = () => {
    if (!address) return;
    createPost.mutate(
      { data: { title: title.trim(), content: content.trim(), section, authorWallet: address } },
      {
        onSuccess: async (newPost: any) => {
          if (wantToPin && newPost?.id && pinCount > 0) {
            await pinPost(newPost.id);
          }
          if (typeof (newPost as any)?.remaining === "number") {
            setTodayRemaining((newPost as any).remaining);
          }
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
          refetchMe();
          setStep("done");
          setTimeout(() => setLocation("/"), 2500);
        },
        onError: (e: any) => {
          const body = (e as any)?.response ?? (e as any)?.body ?? {};
          const errCode = body?.error ?? String(e?.message ?? "");
          if (errCode === "BANNED") {
            setStep("form"); setError(t("bannedError"));
          } else if (errCode === "DAILY_LIMIT") {
            setStep("form");
            setTodayRemaining(0);
            setError(lang === "zh-CN" ? "今日发布已达上限（3篇），请明天再来。" : "Daily post limit reached (3 posts). Please try again tomorrow.");
          } else if (errCode === "NORMAL_DAILY_LIMIT") {
            setStep("form");
            setError(`今日发布已达上限（${body?.limit ?? 10}次），请明天再试。`);
          } else if (errCode === "TEAM_ONLY" || errCode === "NORMAL_USER_SECTION_RESTRICTED") {
            setStep("form"); setError("当前仅开放团队账号发帖，敬请期待。");
          } else if (errCode === "CONTENT_FILTER") {
            setStep("form"); setError(body?.message || t("postErrContentFilter"));
          } else {
            setStep("form"); setError(errCode || t("postErrGeneral"));
          }
        },
      }
    );
  };

  if (!isConnected) {
    return (
      <div className="py-32 text-center max-w-sm mx-auto">
        <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t("connect")}</h2>
        <p className="text-muted-foreground text-sm">{t("postConnectWalletHint")}</p>
      </div>
    );
  }

  if (me !== undefined && spaceType !== "project" && !isAdmin(address)) {
    return (
      <div className="py-32 text-center max-w-sm mx-auto space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mx-auto">
          <AlertCircle className="w-9 h-9 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold">{lang === "zh-CN" ? "暂不开放" : "Not Available"}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {lang === "zh-CN"
            ? "当前仅开放团队账号发帖，KOL / 开发者 / 普通用户发帖功能即将上线，敬请期待。"
            : "Posting is currently available to team accounts only. KOL, developer, and regular user posting is coming soon."}
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="py-24 text-center max-w-md mx-auto animate-in zoom-in space-y-6">
        <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
        <div>
          <h2 className="text-3xl font-bold mb-2">{t("postSuccess")}</h2>
          {pinQueued ? (
            <div className="mt-4 px-5 py-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/50 text-left space-y-1.5">
              <p className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Pin className="w-4 h-4" /> {t("postPinQueued")}
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400/80 leading-relaxed">
                {t("postPinQueuedDesc")}
              </p>
              {pinQueuedEstimate && (
                <p className="text-xs text-muted-foreground">
                  {t("postPinQueuedEta")} {new Date(pinQueuedEstimate).toLocaleString()}
                </p>
              )}
            </div>
          ) : wantToPin ? (
            <p className="text-green-600 text-sm mt-1 font-semibold">{t("postPinned3Days")}</p>
          ) : null}
          <p className="text-muted-foreground text-sm mt-4">{t("postRedirecting")}</p>
        </div>
      </div>
    );
  }

  const confirmText = withPin
    ? (lang === "zh" ? `这将消耗 1 置顶次数。当前剩余：${pinCount} 次置顶` : `This will use 1 pin slot. Current balance: ${pinCount} pins`)
    : (lang === "zh" ? "确认发布此内容？" : "Confirm to publish this post?");

  return (
    <>

      {/* ── AI Assistant Modal ── */}
      {aiOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAiOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "#0A0C14", border: "1px solid rgba(255,215,0,0.25)" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5" style={{ color: "#FFD700" }} />
                <span className="font-bold text-white text-base">{t("aiAssistantTitle")}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(255,215,0,0.12)", color: "#FFD700" }}>
                  {t("aiAssistantFree")}
                </span>
              </div>
              <button onClick={() => setAiOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Mode tabs */}
              <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
                <button
                  onClick={() => { setAiMode("post"); setAiResult(""); setAiCopied(false); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={aiMode === "post"
                    ? { background: "rgba(255,215,0,0.2)", color: "#FFD700", border: "1px solid rgba(255,215,0,0.4)" }
                    : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }}
                >
                  📝 {lang === "zh-CN" ? "发布新帖" : "New Post"}
                </button>
                <button
                  onClick={() => { setAiMode("reply"); setAiResult(""); setAiCopied(false); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={aiMode === "reply"
                    ? { background: "rgba(100,220,150,0.18)", color: "#4ade80", border: "1px solid rgba(100,220,150,0.35)" }
                    : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }}
                >
                  💬 {lang === "zh-CN" ? "回复互动" : "Reply"}
                </button>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                {aiMode === "post"
                  ? (lang === "zh-CN" ? "描述你的项目需求，AI 助手自动生成标题、内容和标签" : "Describe your project needs — the assistant will generate a title, content, and tags for you")
                  : (lang === "zh-CN" ? "描述你收到的互动内容（点赞/评论/消息通知），一键生成专业回复" : "Describe the interaction you received and get a professional reply generated instantly")}
              </p>
              <textarea
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                placeholder={aiMode === "post"
                  ? (lang === "zh-CN" ? "例如：我的项目BTC 需要发布测试网，总量2100万..." : "e.g. My project BTC needs to launch testnet, total supply 21 million...")
                  : (lang === "zh-CN" ? "例如：有人点赞了我的测试网帖子，并留言说很感兴趣..." : "e.g. Someone liked my testnet post and commented they're very interested...")}
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", caretColor: "#FFD700" }}
              />
              <button
                onClick={() => { setAiResult(generateContent(aiInput.trim())); setAiCopied(false); }}
                disabled={!aiInput.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,150,50,0.2))", color: "#FFD700", border: "1px solid rgba(255,215,0,0.4)" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                ✨ {lang === "zh-CN" ? "生成内容" : "Generate"}
              </button>
              {aiResult && (
                <div className="relative rounded-xl p-3 text-xs leading-relaxed font-mono max-h-48 overflow-y-auto"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", whiteSpace: "pre-wrap" }}>
                  {aiResult}
                  <button
                    onClick={() => copyAiPrompt(aiResult)}
                    className="sticky bottom-0 left-0 mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    style={{ background: aiCopied ? "rgba(34,197,94,0.2)" : "rgba(255,215,0,0.2)", color: aiCopied ? "#22c55e" : "#FFD700" }}
                  >
                    {aiCopied ? <><Check className="w-3 h-3" />{t("aiAssistantCopied")}</> : <><Copy className="w-3 h-3" />{t("aiAssistantCopy")}</>}
                  </button>
                </div>
              )}
              {!aiResult && (
                <p className="text-xs text-center py-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {lang === "zh-CN" ? "输入需求后点击生成，内容将直接填充到此处" : "Enter your needs and click Generate — content appears here instantly"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Post Confirmation Overlay ── */}
      {step === "confirm" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setStep("form")} />
          <div className="relative w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5"
            style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
            <button onClick={() => setStep("form")}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400"
              style={{ backgroundColor: "#f3f4f6" }}>
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1"
                style={{ backgroundColor: "#dcfce7" }}>
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <h3 className="text-lg font-bold" style={{ color: "#111827" }}>{t("postConfirmTitle")}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#6b7280" }}>{confirmText}</p>
            </div>
            <div className="rounded-xl p-4 space-y-1.5 text-left"
              style={{ backgroundColor: "#f9fafb", border: "1px solid #f3f4f6" }}>
              <p className="text-xs" style={{ color: "#9ca3af" }}>
                {t("postConfirmSectionLabel")} <span className="font-semibold" style={{ color: "#374151" }}>{t(SECTION_LABEL_KEYS[section] ?? section)}</span>
                {withPin && <span className="ml-2 text-amber-500 font-bold">{t("postPin3Days")}</span>}
              </p>
              <p className="text-sm font-bold line-clamp-2" style={{ color: "#111827" }}>{title}</p>
              <p className="text-xs line-clamp-2" style={{ color: "#6b7280" }}>{content}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("form")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white"
                style={{ backgroundColor: "#ef4444" }}>
                {lang === "zh-CN" ? "取消" : "Cancel"}
              </button>
              <button onClick={handleConfirmedPost} disabled={createPost.isPending}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-60"
                style={{ backgroundColor: "#22c55e" }}>
                {createPost.isPending ? t("postFormSubmitting") : (lang === "zh-CN" ? "确定发布" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite confirmation dialog for normal users re-posting */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto rounded-2xl p-6 max-w-sm w-full space-y-4"
            style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <p className="text-sm leading-relaxed" style={{ color: "#111827" }}>{t("normalOverwriteMsg")}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowOverwriteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                style={{ backgroundColor: "#f3f4f6", color: "#6b7280" }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "#e5e7eb")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "#f3f4f6")}>
                {t("cancel")}
              </button>
              <button onClick={() => { setShowOverwriteConfirm(false); setStep("confirm"); }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors"
                style={{ backgroundColor: "#FF69B4", color: "#ffffff" }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "#ff4da6")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "#FF69B4")}>
                {t("pinOk")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto py-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <PenSquare className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">{t("createPostTitle")}</h1>
          </div>
          {!isNormalPoster && pinCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-violet-100 dark:bg-violet-950/30 text-violet-600">
              <Pin className="w-3.5 h-3.5" />{pinCount} {t("pinUnit")}
            </div>
          )}
        </div>

        <form onSubmit={handleFormSubmit} className="bg-card border border-border rounded-2xl p-7 space-y-5 shadow-sm">
          {/* Section */}
          <div>
            <label className="block text-sm font-semibold mb-2">{t("postFormSection")} *</label>
            <select value={section} onChange={e => setSection(e.target.value)} className={inputCls}>
              <option value="">{t("postFormSection")}...</option>
              {availableSections.map(s => (
                <option key={s} value={s}>{t(SECTION_LABEL_KEYS[s] ?? s)}</option>
              ))}
            </select>
            {!spaceType && !isAdminUser && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                {t("normalPostHint").replace("{n}", String(normalPostsRemaining))}
              </p>
            )}
            {spaceType === "kol" && (
              <p className="text-xs text-muted-foreground mt-1">{t("postKolSectionNote")}</p>
            )}
            {spaceType === "developer" && (
              <p className="text-xs text-muted-foreground mt-1">{t("postDevSectionNote")}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold mb-2">{t("postFormTitle")} *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={t("postFormTitle") + "..."} className={inputCls} maxLength={120} />
            <div className="text-xs text-muted-foreground text-right mt-1">{title.length}/120</div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-semibold mb-2">{t("postFormContent")} *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={t("postFormContent") + "..."} rows={8}
              className={`${inputCls} resize-y min-h-[160px]`} maxLength={5000} />
            <div className="text-xs text-muted-foreground text-right mt-1">{content.length}/5000</div>
          </div>

          {/* Pin option — project users and admins */}
          {pinCount > 0 && (spaceType === "project" || isAdminUser) && (
            <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors
              hover:border-amber-300 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-950/20">
              <input type="checkbox" checked={wantToPin} onChange={e => setWantToPin(e.target.checked)}
                className="w-4 h-4 accent-amber-500" />
              <Pin className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{t("postPinLabel")}</p>
                <p className="text-xs text-muted-foreground">{t("postPinDesc").replace("{n}", String(pinCount))}</p>
              </div>
            </label>
          )}

          {todayRemaining !== null && !isAdminUser && spaceType === "project" && (
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
              todayRemaining === 0
                ? "bg-red-50 dark:bg-red-900/20 text-red-500 border border-red-200 dark:border-red-800"
                : "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800"
            }`}>
              {todayRemaining === 0
                ? lang === "zh-CN" ? "⛔ 今日发布已达上限（3篇），请明天再来" : "⛔ Daily post limit reached (3 posts). Please try again tomorrow."
                : lang === "zh-CN" ? `📝 今日还能发布 ${todayRemaining} 次` : `📝 You can post ${todayRemaining} more time${todayRemaining === 1 ? "" : "s"} today`}
            </div>
          )}

          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setLocation("/")}
              className="flex-1 py-3.5 rounded-xl font-semibold text-base border border-border bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
              {lang === "zh-CN" ? "取消" : "Cancel"}
            </button>
            <button type="submit" disabled={createPost.isPending}
              className="flex-1 py-3.5 rounded-xl font-bold text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 transition-colors disabled:opacity-50">
              {createPost.isPending ? t("postFormSubmitting") : (lang === "zh-CN" ? "发布" : "Publish")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
