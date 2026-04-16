export interface Web3Event {
  id?: string | number;
  title: string;
  description?: string;
  project_name?: string;
  start_time?: string;
  end_time?: string;
  crawl_time?: string;
  source_url?: string;
  tags?: string[];
  importance?: string;
  category?: string[];
  ai_confidence?: number;
  isPinned?: boolean;
  pinnedUntil?: string | null;
  authorWallet?: string;
  authorType?: string;
  authorName?: string;
}

export const CATEGORIES = [
  "全部", "IDO/Launchpad", "融资公告", "链上奖励/空投",
  "行业动态", "Meme热点", "政策监管", "测试网", "节点招募",
  "代币解锁", "开发者专区", "招聘",
];

export function isEventExpired(event: Web3Event): boolean {
  if (!event.start_time) return false;
  const diffDays = (new Date(event.start_time).getTime() - Date.now()) / 86400000;
  return diffDays < -60;
}

export function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatRelativeTime(dateStr?: string, lang = "zh-CN"): string {
  if (!dateStr) return "";
  const zh = lang === "zh-CN";
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return zh ? "刚刚" : "Just now";
    if (mins < 60) return zh ? `${mins}分钟前` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return zh ? `${hrs}小时前` : `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return zh ? "昨天" : "Yesterday";
    if (days < 7) return zh ? `${days}天前` : `${days}d ago`;
    if (days < 30) return zh ? `${Math.floor(days / 7)}周前` : `${Math.floor(days / 7)}w ago`;
    const locale = zh ? "zh-CN" : "en-US";
    return new Date(dateStr).toLocaleDateString(locale, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function formatSourceLabel(url?: string): string {
  if (!url) return "";
  if (/twitter\.com|x\.com/i.test(url)) return "Twitter / X";
  if (/discord\.com|discord\.gg/i.test(url)) return "Discord";
  if (/t\.me|telegram/i.test(url)) return "Telegram";
  if (/medium\.com/i.test(url)) return "Medium";
  if (/github\.com/i.test(url)) return "GitHub";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "官网";
  }
}
