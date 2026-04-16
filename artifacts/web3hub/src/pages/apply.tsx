import { useState } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { useLang } from "@/lib/i18n";
import { useLocation } from "wouter";
import {
  Building2, User, Globe, Twitter, MessageCircle, Send,
  BookOpen, CheckCircle2, ArrowRight, Loader2, AlertTriangle,
  Sparkles, ChevronRight,
} from "lucide-react";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}
const apiBase = getApiBase();

type Role = "project" | "participant";
type SubmitState = "idle" | "submitting" | "success" | "error";

const T = {
  "zh-CN": {
    title: "完善你的信息",
    subtitle: "请选择你的身份，完成设置后即可使用平台全部功能",
    chooseRole: "选择你的身份",
    roleProject: "项目方",
    roleProjectDesc: "我是项目团队 / 创始人，想认领公告、管理需求",
    roleParticipant: "参与者",
    roleParticipantDesc: "我是开发者 / 社区用户，想浏览公告、订阅内容、申请机会",
    fillInfo: "填写信息",
    projectName: "项目名称",
    projectNamePh: "请输入项目名称",
    projectTwitter: "项目官方 X / Twitter",
    projectTwitterPh: "@YourProject 或完整链接",
    website: "官网链接",
    websitePh: "https://yourproject.xyz（可选）",
    discord: "Discord 链接",
    discordPh: "https://discord.gg/...（可选）",
    telegram: "Telegram 链接",
    telegramPh: "https://t.me/...（可选）",
    whitepaper: "白皮书 / 文档链接",
    whitepaperPh: "https://docs.yourproject.xyz（可选）",
    displayName: "显示名称",
    displayNamePh: "你想展示的名字",
    personalTwitter: "X / Twitter（可选）",
    personalTwitterPh: "@YourHandle 或完整链接",
    bio: "个人简介（可选）",
    bioPh: "简短介绍你自己，不超过 100 字",
    required: "必填",
    optional: "选填",
    cta: "完成设置并进入平台",
    submitting: "正在提交...",
    successProject: "申请已提交！",
    successProjectMsg: "感谢你的申请，我们将在 24 小时内完成审核。审核通过后，你将获得项目方权限，可以认领公告、发布需求。",
    successParticipant: "设置完成！",
    successParticipantMsg: "欢迎加入 Web3 Release！你现在可以浏览全平台公告，订阅感兴趣的栏目，申请匹配机会。",
    goHome: "进入平台 →",
    errNeedWallet: "请先连接钱包",
    errRequired: "此字段为必填",
    errDailyLimit: "今日申请次数已达上限（每 24 小时最多 2 次），请明天再试",
    errGeneric: "提交失败，请稍后重试",
    pendingNote: "审核期间你仍可浏览平台，功能不受影响",
    connectFirst: "请连接钱包后再进行操作",
  },
  en: {
    title: "Complete Your Profile",
    subtitle: "Choose your role and complete setup to unlock all platform features",
    chooseRole: "Choose Your Role",
    roleProject: "Project Owner",
    roleProjectDesc: "I'm a project team / founder — I want to claim announcements and manage demands",
    roleParticipant: "Participant",
    roleParticipantDesc: "I'm a developer / community user — I want to browse, subscribe, and apply",
    fillInfo: "Fill in Your Info",
    projectName: "Project Name",
    projectNamePh: "Enter your project name",
    projectTwitter: "Project X / Twitter",
    projectTwitterPh: "@YourProject or full URL",
    website: "Website",
    websitePh: "https://yourproject.xyz (optional)",
    discord: "Discord",
    discordPh: "https://discord.gg/... (optional)",
    telegram: "Telegram",
    telegramPh: "https://t.me/... (optional)",
    whitepaper: "Whitepaper / Docs",
    whitepaperPh: "https://docs.yourproject.xyz (optional)",
    displayName: "Display Name",
    displayNamePh: "Your display name",
    personalTwitter: "X / Twitter (optional)",
    personalTwitterPh: "@YourHandle or full URL",
    bio: "Short Bio (optional)",
    bioPh: "A brief introduction, max 100 characters",
    required: "Required",
    optional: "Optional",
    cta: "Complete Setup & Enter Platform",
    submitting: "Submitting...",
    successProject: "Application Submitted!",
    successProjectMsg: "Thank you for applying. We'll review your application within 24 hours. Once approved, you'll unlock project owner features.",
    successParticipant: "Setup Complete!",
    successParticipantMsg: "Welcome to Web3 Release! You can now browse all announcements, subscribe to sections, and apply for opportunities.",
    goHome: "Enter Platform →",
    errNeedWallet: "Please connect your wallet first",
    errRequired: "This field is required",
    errDailyLimit: "Daily apply limit reached (max 2 per 24h). Please try again tomorrow.",
    errGeneric: "Submission failed, please try again",
    pendingNote: "You can browse the platform during review — no features blocked",
    connectFirst: "Please connect your wallet to continue",
  },
};

function inputCls(err?: string) {
  return `w-full px-4 py-3 rounded-xl border text-sm transition-all outline-none focus:ring-2 bg-background text-foreground placeholder:text-muted-foreground/60 ${
    err
      ? "border-red-400 focus:ring-red-200 dark:focus:ring-red-900"
      : "border-border focus:ring-primary/20 focus:border-primary/50"
  }`;
}

export default function ApplySpace() {
  const { address, isConnected } = useWeb3Auth();
  const { lang } = useLang();
  const [, navigate] = useLocation();
  const tx = T[lang as keyof typeof T] ?? T.en;

  const [role, setRole] = useState<Role | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [apiError, setApiError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* Project Owner fields */
  const [projectName, setProjectName] = useState("");
  const [projectTwitter, setProjectTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [discord, setDiscord] = useState("");
  const [telegram, setTelegram] = useState("");
  const [whitepaper, setWhitepaper] = useState("");

  /* Participant fields */
  const [displayName, setDisplayName] = useState("");
  const [personalTwitter, setPersonalTwitter] = useState("");
  const [bio, setBio] = useState("");

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (role === "project") {
      if (!projectName.trim()) errs.projectName = tx.errRequired;
      if (!projectTwitter.trim()) errs.projectTwitter = tx.errRequired;
    }
    if (role === "participant") {
      if (!displayName.trim()) errs.displayName = tx.errRequired;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!address) return setApiError(tx.errNeedWallet);
    if (!role) return;
    if (!validate()) return;

    setSubmitState("submitting");
    setApiError("");

    try {
      if (role === "participant") {
        const res = await fetch(`${apiBase}/users/upsert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: address,
            username: displayName.trim(),
            twitter: personalTwitter.trim() || undefined,
            bio: bio.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error("upsert failed");
        setSubmitState("success");
      } else {
        const res = await fetch(`${apiBase}/spaces/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: address,
            type: "project",
            projectName: projectName.trim(),
            projectTwitter: projectTwitter.trim(),
            website: website.trim() || undefined,
            discord: discord.trim() || undefined,
            telegram: telegram.trim() || undefined,
            whitepaper: whitepaper.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.error === "DAILY_APPLY_LIMIT") throw new Error("DAILY_LIMIT");
          throw new Error(data.error ?? "apply failed");
        }
        setSubmitState("success");
      }
    } catch (e: any) {
      setSubmitState("error");
      if (e.message === "DAILY_LIMIT") {
        setApiError(tx.errDailyLimit);
      } else {
        setApiError(tx.errGeneric);
      }
    }
  };

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 py-20">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <User className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground text-sm">{tx.connectFirst}</p>
      </div>
    );
  }

  /* ── Success Screen ── */
  if (submitState === "success") {
    const isProject = role === "project";
    return (
      <div className="max-w-md mx-auto py-16 text-center px-4">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-extrabold mb-3">
          {isProject ? tx.successProject : tx.successParticipant}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-3">
          {isProject ? tx.successProjectMsg : tx.successParticipantMsg}
        </p>
        {isProject && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-6 text-left">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">{tx.pendingNote}</p>
          </div>
        )}
        <button onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
          {tx.goHome} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  /* ── Main Form ── */
  return (
    <div className="max-w-2xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Web3 Release · Onboarding
        </div>
        <h1 className="text-3xl font-extrabold mb-3 tracking-tight">{tx.title}</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">{tx.subtitle}</p>
      </div>

      {/* Step 1 — Role Selection */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</div>
          <span className="text-sm font-semibold">{tx.chooseRole}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 w-full">
          {/* Project Owner Card */}
          <button
            type="button"
            onClick={() => setRole("project")}
            className={`relative text-left rounded-2xl border-2 p-5 transition-all duration-200 group ${
              role === "project"
                ? "border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md shadow-green-200/40 dark:shadow-green-900/20"
                : "border-border hover:border-green-400/60 hover:bg-green-50/30 dark:hover:bg-green-950/10"
            }`}
          >
            {role === "project" && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
              role === "project" ? "bg-green-500" : "bg-muted group-hover:bg-green-100 dark:group-hover:bg-green-950/30"
            }`}>
              <Building2 className={`w-6 h-6 ${role === "project" ? "text-white" : "text-muted-foreground group-hover:text-green-600"}`} />
            </div>
            <p className={`font-bold text-base mb-1.5 ${role === "project" ? "text-green-700 dark:text-green-400" : ""}`}>
              {tx.roleProject}
            </p>
            <p className={`text-xs leading-relaxed ${role === "project" ? "text-green-600/80 dark:text-green-400/70" : "text-muted-foreground"}`}>
              {tx.roleProjectDesc}
            </p>
          </button>
        </div>
      </div>

      {/* Step 2 — Dynamic Form */}
      {role && (
        <div className="animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</div>
            <span className="text-sm font-semibold">{tx.fillInfo}</span>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">

            {/* ── Project Owner Fields ── */}
            {role === "project" && (
              <>
                {/* Project Name */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold">{tx.projectName}</label>
                    <span className="text-xs font-medium text-red-500">{tx.required}</span>
                  </div>
                  <input
                    type="text"
                    value={projectName}
                    onChange={e => { setProjectName(e.target.value); setFieldErrors(p => ({ ...p, projectName: "" })); }}
                    placeholder={tx.projectNamePh}
                    maxLength={64}
                    className={inputCls(fieldErrors.projectName)}
                  />
                  {fieldErrors.projectName && <p className="text-red-500 text-xs mt-1">{fieldErrors.projectName}</p>}
                </div>

                {/* Project Twitter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold flex items-center gap-1.5">
                      <Twitter className="w-4 h-4 text-sky-500" />
                      {tx.projectTwitter}
                    </label>
                    <span className="text-xs font-medium text-red-500">{tx.required}</span>
                  </div>
                  <input
                    type="text"
                    value={projectTwitter}
                    onChange={e => { setProjectTwitter(e.target.value); setFieldErrors(p => ({ ...p, projectTwitter: "" })); }}
                    placeholder={tx.projectTwitterPh}
                    className={inputCls(fieldErrors.projectTwitter)}
                  />
                  {fieldErrors.projectTwitter && <p className="text-red-500 text-xs mt-1">{fieldErrors.projectTwitter}</p>}
                </div>

                <div className="border-t border-border/60 pt-1">
                  <p className="text-xs text-muted-foreground mb-4">{lang === "zh-CN" ? "以下为可选字段，填写越完整，审核越快通过" : "Optional fields — more info means faster approval"}</p>

                  {/* Website */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
                        <Globe className="w-4 h-4 text-green-500" />
                        {tx.website}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{tx.optional}</span>
                      </label>
                      <input type="url" value={website} onChange={e => setWebsite(e.target.value)}
                        placeholder={tx.websitePh} className={inputCls()} />
                    </div>

                    {/* Discord */}
                    <div>
                      <label className="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
                        <MessageCircle className="w-4 h-4 text-indigo-500" />
                        {tx.discord}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{tx.optional}</span>
                      </label>
                      <input type="url" value={discord} onChange={e => setDiscord(e.target.value)}
                        placeholder={tx.discordPh} className={inputCls()} />
                    </div>

                    {/* Telegram */}
                    <div>
                      <label className="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
                        <Send className="w-4 h-4 text-blue-400" />
                        {tx.telegram}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{tx.optional}</span>
                      </label>
                      <input type="url" value={telegram} onChange={e => setTelegram(e.target.value)}
                        placeholder={tx.telegramPh} className={inputCls()} />
                    </div>

                    {/* Whitepaper */}
                    <div>
                      <label className="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
                        <BookOpen className="w-4 h-4 text-amber-500" />
                        {tx.whitepaper}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{tx.optional}</span>
                      </label>
                      <input type="url" value={whitepaper} onChange={e => setWhitepaper(e.target.value)}
                        placeholder={tx.whitepaperPh} className={inputCls()} />
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Error */}
      {apiError && (
        <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{apiError}</p>
        </div>
      )}

      {/* CTA Button */}
      {role && (
        <div className="mt-6 animate-in slide-in-from-bottom-2 duration-300">
          {/* Preview of what's next */}
          {role === "project" && (
            <div className="flex items-start gap-2 mb-4 text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">
              <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-muted-foreground/60 shrink-0" />
              <span>{lang === "zh-CN"
                ? "提交后进入审核流程（通常 24 小时内），审核期间不影响正常浏览"
                : "Your application will be reviewed within 24 hours. You can browse the platform while waiting."}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting"}
            className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base transition-all ${
              role === "project"
                ? "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/25 active:scale-[0.99]"
                : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99]"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {submitState === "submitting" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {tx.submitting}
              </>
            ) : (
              <>
                {tx.cta}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground mt-8">
        Web3 Release · {new Date().getFullYear()}
      </p>
    </div>
  );
}
