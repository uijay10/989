import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, Share2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { zhCN, enUS, type Locale } from "date-fns/locale";
import { useLang } from "@/lib/i18n";
import { getApiBase } from "@/lib/api-base";

const DATE_LOCALES: Record<string, Locale> = {
  "zh-CN": zhCN, "en": enUS,
};

const DATE_FORMATS: Record<string, string> = {
  "zh-CN": "yyyy年M月d日 HH:mm",
  "en": "h:mm a · MMM d, yyyy",
};

interface PostData {
  id: number;
  title: string;
  content: string;
  section: string;
  authorWallet: string;
  authorName?: string | null;
  authorType?: string | null;
  views?: number;
  likes: number;
  comments: number;
  createdAt: string;
  sourceUrl?: string | null;
  importance?: string | null;
}

export default function PostDetail() {
  const [, params] = useRoute("/post/:id");
  const postId = Number(params?.id);
  const { t, lang } = useLang();
  const apiBase = getApiBase();
  const dateLocale = DATE_LOCALES[lang] ?? enUS;
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/posts/${postId}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
    enabled: !!postId && !isNaN(postId),
  });

  const post = (data?.post ?? data) as PostData | undefined;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-[620px] mx-auto">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border/30">
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="px-4 pt-6 space-y-3">
          <div className="h-7 w-3/4 bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-[620px] mx-auto py-16 text-center">
        <p className="text-2xl font-semibold mb-3">{t("postDetailNotFound")}</p>
        <p className="text-muted-foreground mb-6 text-sm">{t("postDetailNotFoundDesc")}</p>
        <Link href="/" className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("postDetailBackHome")}
        </Link>
      </div>
    );
  }

  const postDate = new Date(post.createdAt);
  const viewCount = post.views ?? 0;

  return (
    <div className="max-w-[620px] mx-auto">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-5 px-4 py-3 sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/30">
        <Link href="/"
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors text-foreground"
          title={t("back") || "Back"}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="text-lg font-semibold">{t("postDetailTitle")}</span>
      </div>

      {/* ── Post content ── */}
      <div className="px-4 pt-6 pb-4">
        {/* Title */}
        <h1 className="text-[1.35rem] font-semibold text-foreground leading-snug mb-3 break-words">
          {post.title}
        </h1>

        {/* Body */}
        <p className="text-base text-foreground/85 leading-relaxed whitespace-pre-wrap break-words"
          style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
          {post.content}
        </p>

        {/* Source link */}
        {post.sourceUrl && (
          <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            查看原文
          </a>
        )}

        {/* ── Meta row: time · views · copy link ── */}
        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
          <span>
            {format(postDate, DATE_FORMATS[lang] ?? DATE_FORMATS["en"], { locale: dateLocale })}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {viewCount.toLocaleString()}
          </span>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 hover:text-green-500 transition-colors"
            title={t("copiedLink")}
          >
            {copied
              ? <span className="text-xs text-green-500">{t("copiedLink")}</span>
              : <Share2 className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

    </div>
  );
}
