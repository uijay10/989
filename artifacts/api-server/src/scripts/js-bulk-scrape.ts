/**
 * JS Section Bulk Scraper (一次性历史抓取)
 * 抓取近6个月的永州教师对调/轮岗/交流相关文章，直接关键词匹配，无需AI分类配额。
 */

import Parser from "rss-parser";
import { db, postsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { classifyChainExchangeTags } from "../lib/tag-classifier";

const SECTION = "js";
const SECONDARY_SECTION = "724news";
const AI_SYSTEM_WALLET = "ai-system";
const AI_SYSTEM_NAME = "AI精选";

// ── JS专项RSS来源（多维搜索，尽量覆盖6个月范围）──────────────────────────────
const JS_SOURCES = [
  // 永州教师核心搜索（Google News RSS，每次最多约100条，通常覆盖1-4周）
  { name: "GNews 永州教师对调", url: "https://news.google.com/rss/search?q=永州+教师+对调+轮岗&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州市教育局", url: "https://news.google.com/rss/search?q=永州市教育局+教师+公告&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 湖南教师调动", url: "https://news.google.com/rss/search?q=湖南+永州+教师+调动+交流&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 湖南省教育厅", url: "https://news.google.com/rss/search?q=湖南省教育厅+教师+政策&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州教育通知", url: "https://news.google.com/rss/search?q=永州+教育+教师+招聘+通知&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州教师交流", url: "https://news.google.com/rss/search?q=永州+教师+交流+轮岗+调动&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州教师招聘", url: "https://news.google.com/rss/search?q=永州+教师+招聘+编制+公告&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州教育政策", url: "https://news.google.com/rss/search?q=永州+教育+政策+教师+公告&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  // 扩展搜索——覆盖更多维度
  { name: "GNews 永州教师编制", url: "https://news.google.com/rss/search?q=永州+教师+编制+招聘+考试&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州区县教育", url: "https://news.google.com/rss/search?q=零陵+冷水滩+祁阳+道县+教师&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 湖南城乡教师", url: "https://news.google.com/rss/search?q=湖南+城乡+教师+交流+轮岗+支教&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 义务教育流动", url: "https://news.google.com/rss/search?q=湖南+义务教育+教师+流动+政策&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  { name: "GNews 永州骨干教师", url: "https://news.google.com/rss/search?q=永州+骨干教师+援教+支教&hl=zh-CN&gl=CN&ceid=CN:zh-Hans" },
  // 权威媒体RSS
  { name: "中国教育新闻网", url: "https://www.jyb.cn/rss/rmtjyb.xml" },
  { name: "红网教育频道",   url: "https://edu.rednet.cn/rss.xml" },
];

// ── 关键词匹配规则 ─────────────────────────────────────────────────────────────
// 独立强匹配：含有这些复合词直接通过
const STANDALONE_TERMS = [
  "教师对调", "教师轮岗", "教师交流轮岗", "教师交流调动",
  "永州市教育局", "永州教育局", "永州教师",
  "教师招聘", "教师编制", "教师交流", "教师调动", "教育局公告", "教育局通知",
];
// 双重匹配：同时含永州地名 + 教师/教育相关词
const YONGZHOU_TERMS = [
  "永州", "永州市", "湖南永州",
  "零陵", "冷水滩", "祁阳", "道县", "东安",
  "宁远", "蓝山", "新田", "双牌", "江永", "江华",
];
const EDU_TERMS = [
  "教师", "教育", "学校", "校长", "教职", "教学", "教龄",
  "对调", "轮岗", "交流", "调动", "调配", "支教", "援教", "骨干教师",
  "编制", "招聘", "教育局", "教育厅", "中小学", "义务教育", "考编", "入编",
];

function matchesJsKeywords(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  if (STANDALONE_TERMS.some(t => text.includes(t))) return true;
  const hasYz = YONGZHOU_TERMS.some(t => text.includes(t));
  if (!hasYz) return false;
  return EDU_TERMS.some(t => text.includes(t));
}

function safeDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? null : d;
}

function normalizeUrl(url: string): string {
  return String(url || "").trim().toLowerCase().replace(/\/+$/, "");
}

export interface JsBulkScrapeResult {
  sourcesAttempted: number;
  sourcesFailed: number;
  totalFetched: number;
  inWindow: number;
  matched: number;
  inserted: number;
  duplicatesSkipped: number;
  errors: string[];
  sourceStats: Array<{ name: string; fetched: number; matched: number; inserted: number; error?: string }>;
}

export async function runJsBulkScrape(windowDays = 180): Promise<JsBulkScrapeResult> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const result: JsBulkScrapeResult = {
    sourcesAttempted: JS_SOURCES.length,
    sourcesFailed: 0,
    totalFetched: 0,
    inWindow: 0,
    matched: 0,
    inserted: 0,
    duplicatesSkipped: 0,
    errors: [],
    sourceStats: [],
  };

  const parser = new Parser({
    timeout: 25000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Web3ReleaseBot/2.0)",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    requestOptions: { rejectUnauthorized: false },
  });

  for (const src of JS_SOURCES) {
    const stat = { name: src.name, fetched: 0, matched: 0, inserted: 0 };
    result.sourceStats.push(stat);

    let feed: Parser.Output<Record<string, unknown>> | null = null;
    try {
      const res = await fetch(src.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Web3ReleaseBot/2.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const xml = await res.text();
      feed = await parser.parseString(xml);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      stat.error = msg;
      result.sourcesFailed++;
      result.errors.push(`[${src.name}] ${msg}`);
      console.warn(`[js-bulk] ✗ ${src.name} — ${msg}`);
      continue;
    }

    const items = feed.items ?? [];
    stat.fetched = items.length;
    result.totalFetched += items.length;

    for (const item of items) {
      const title = String(item.title ?? "").replace(/<[^>]+>/g, "").trim();
      if (!title) continue;

      // 时间窗口过滤
      const rawDate = (item.pubDate ?? item.isoDate ?? (item as Record<string, unknown>).published) as string | undefined;
      const pub = safeDate(rawDate ?? null);
      if (pub && pub < cutoff) continue;
      result.inWindow++;

      const description = String(
        item.contentSnippet ?? item.content ?? item.summary ?? item.description ?? ""
      ).replace(/<[^>]+>/g, "").slice(0, 1000).trim();

      const link = String(item.link ?? (item as Record<string, unknown>).guid ?? "").trim();

      // 关键词匹配
      if (!matchesJsKeywords(title, description)) continue;
      stat.matched++;
      result.matched++;

      // URL去重
      if (link) {
        try {
          const existing = await db.execute(
            sql`SELECT id FROM posts WHERE source_url = ${link} AND section = ${SECTION} LIMIT 1`
          );
          if ((existing.rows as unknown[]).length > 0) {
            result.duplicatesSkipped++;
            continue;
          }
        } catch { /* ignore, try insert */ }
      }

      // 标题去重（90天内同section）
      const normTitle = title.toLowerCase().trim();
      try {
        const titleDup = await db.execute(
          sql`SELECT id FROM posts
              WHERE section = ${SECTION}
                AND LOWER(TRIM(title)) = ${normTitle}
                AND created_at > NOW() - INTERVAL '90 days'
              LIMIT 1`
        );
        if ((titleDup.rows as unknown[]).length > 0) {
          result.duplicatesSkipped++;
          continue;
        }
      } catch { /* ignore */ }

      const now = new Date();
      const pubTs = pub ?? now;
      const tags = classifyChainExchangeTags({ title, description });

      // 组装插入——createdAt 设为文章发布时间（历史文章归档）
      const baseValues: Record<string, unknown> = {
        title: title.slice(0, 200),
        content: (description || title).slice(0, 2000),
        section: SECTION,
        authorWallet: AI_SYSTEM_WALLET,
        authorName: AI_SYSTEM_NAME,
        authorType: "ai",
        chainTags: tags.chainTags,
        exchangeTags: tags.exchangeTags,
        sourceUrl: link ? link.slice(0, 500) : null,
        aiConfidence: 0.85,
        importance: "medium",
        eventStartTime: null,
        eventEndTime: null,
        expiresAt: new Date(pubTs.getTime() + 90 * 24 * 60 * 60 * 1000),
        views: 0, likes: 0, comments: 0,
        kolLikePoints: 0, kolCommentPoints: 0,
        isPinned: false, pinQueued: false,
        createdAt: pubTs,
      };

      let savedToJs = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(postsTable).values(baseValues as any);
        savedToJs = true;
        stat.inserted++;
        result.inserted++;
        console.log(`[js-bulk] ✓ js ← "${title.slice(0, 60)}" (${pubTs.toISOString().slice(0, 10)})`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/chain_tags|exchange_tags/i.test(msg)) {
          // 不带 tag 列重试
          const { chainTags: _ct, exchangeTags: _et, ...noTagValues } = baseValues;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await db.insert(postsTable).values(noTagValues as any);
            savedToJs = true;
            stat.inserted++;
            result.inserted++;
            console.log(`[js-bulk] ✓ js(no-tags) ← "${title.slice(0, 60)}"`);
          } catch (e2: unknown) {
            result.errors.push(`insert(js) "${title.slice(0, 40)}": ${e2 instanceof Error ? e2.message : e2}`);
          }
        } else {
          result.errors.push(`insert(js) "${title.slice(0, 40)}": ${msg}`);
        }
      }

      // 同步写一份到724news快讯（非致命）
      if (savedToJs) {
        try {
          const dup724 = link
            ? await db.execute(sql`SELECT id FROM posts WHERE source_url = ${link} AND section = ${SECONDARY_SECTION} LIMIT 1`)
            : { rows: [] };
          if ((dup724.rows as unknown[]).length === 0) {
            const v724 = { ...baseValues, section: SECONDARY_SECTION };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await db.insert(postsTable).values(v724 as any).catch(() => {});
          }
        } catch { /* secondary insert failure is non-fatal */ }
      }
    }
  }

  console.log(
    `[js-bulk] 完成: 来源${result.sourcesAttempted}个（失败${result.sourcesFailed}）` +
    ` | 抓取${result.totalFetched}条 → 窗口内${result.inWindow}条 → 匹配${result.matched}条` +
    ` → 入库${result.inserted}条（去重跳过${result.duplicatesSkipped}条）`
  );
  return result;
}
