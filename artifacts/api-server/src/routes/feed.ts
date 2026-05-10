import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { readArticlesBackupFile } from "../lib/articles-backup";
import { classifyChainExchangeTags } from "../lib/tag-classifier";

// ── Server-side response cache (avoids repeated Neon round-trips on tab switches) ──
interface CacheEntry { data: unknown; expiresAt: number }
const feedCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function getCacheKey(params: Record<string, string | undefined>): string {
  return JSON.stringify(params);
}
function getFromCache(key: string): unknown | null {
  const entry = feedCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { feedCache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: unknown): void {
  feedCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  // Prune stale entries if cache grows large
  if (feedCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of feedCache) { if (now > v.expiresAt) feedCache.delete(k); }
  }
}

const router: IRouter = Router();

router.get("/", async (req, res) => {
  // Allow short server-side caching; tell browser/CDN not to cache (they'd show stale feed).
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(1000, parseInt(req.query.limit as string) || 30);
    const category = (req.query.category as string) || "all";
    const chain = (req.query.chain as string | undefined)?.trim();
    const exchange = (req.query.exchange as string | undefined)?.trim();
    const chainList = chain ? chain.split(",").map(s => s.trim()).filter(Boolean) : [];
    const exchangeList = exchange ? exchange.split(",").map(s => s.trim()).filter(Boolean) : [];
    const offset = (page - 1) * limit;

    // ── Cache check (skip cache for page > 1 or tag filters to keep freshness) ──
    const cacheKey = getCacheKey({ category, page: String(page), limit: String(limit), chain, exchange });
    const cached = getFromCache(cacheKey);
    if (cached) {
      res.setHeader("X-Feed-Cache", "HIT");
      return res.json(cached);
    }

    const conditions: any[] = [eq(postsTable.authorType, "ai")];
    if (category !== "all") {
      const cats = category.split(",").map(s => s.trim()).filter(Boolean);
      if (cats.length > 1) {
        conditions.push(inArray(postsTable.section, cats as any));
      } else if (cats.length === 1) {
        conditions.push(eq(postsTable.section, cats[0]!));
      }
    }
    const whereBase = and(...conditions);

    const wantsTagFilter = chainList.length > 0 || exchangeList.length > 0;

    // ── Chain/exchange filter: SQL array-contains on stored tag columns ──────
    // chain_tags / exchange_tags are set by the AI scraper at insert time.
    // Using the DB columns avoids full-table scans and returns results instantly.
    if (wantsTagFilter) {
      const tagConditions: any[] = [...conditions];

      if (chainList.length > 0) {
        const chainClauses = chainList.map(c =>
          sql`${postsTable.chainTags} @> ARRAY[${c}]::text[]`
        );
        tagConditions.push(chainClauses.length === 1 ? chainClauses[0] : or(...chainClauses));
      }
      if (exchangeList.length > 0) {
        const exClauses = exchangeList.map(e =>
          sql`${postsTable.exchangeTags} @> ARRAY[${e}]::text[]`
        );
        tagConditions.push(exClauses.length === 1 ? exClauses[0] : or(...exClauses));
      }
      const whereTagged = and(...tagConditions);

      const [countRes, taggedRows] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(postsTable).where(whereTagged),
        db.select({
          id: postsTable.id,
          title: postsTable.title,
          content: postsTable.content,
          createdAt: postsTable.createdAt,
          section: postsTable.section,
          authorName: postsTable.authorName,
          sourceUrl: postsTable.sourceUrl,
          importance: postsTable.importance,
        })
          .from(postsTable)
          .where(whereTagged)
          .orderBy(desc(postsTable.createdAt))
          .limit(limit)
          .offset(offset),
      ]);

      const tagTotal = Number(countRes[0]?.count ?? 0);
      const hasMore = offset + taggedRows.length < tagTotal;

      return res.json({
        items: taggedRows.map((r) => ({
          id: String(r.id),
          title: r.title,
          summary: r.content ? r.content.slice(0, 200) : "",
          time: r.createdAt.toISOString(),
          category: r.section || "other",
          source: r.authorName,
          link: r.sourceUrl,
          importance: r.importance ?? null,
        })),
        hasMore,
        total: tagTotal,
      });
    }

    // ── Normal feed (no chain/exchange) — parallel count + data queries ─────
    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(postsTable).where(whereBase),
      db.select({
        id: postsTable.id,
        title: postsTable.title,
        content: postsTable.content,
        createdAt: postsTable.createdAt,
        section: postsTable.section,
        authorName: postsTable.authorName,
        sourceUrl: postsTable.sourceUrl,
        importance: postsTable.importance,
      })
        .from(postsTable)
        .where(whereBase)
        .orderBy(desc(postsTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const hasMore = offset + rows.length < total;

    // Fallback: when DB is empty/unavailable, serve from local JSONL backup (best-effort).
    if (total === 0 && rows.length === 0) {
      const backup = readArticlesBackupFile()
        .filter((a) => (a.author_type ?? "ai") === "ai")
        .filter(
          (a) =>
            category === "all" ||
            (a.section ?? "other") === category ||
            (category === "724news" && (a.section ?? "other") === "flash"),
        )
        .sort((a, b) => {
          const at = a.created_at ? Date.parse(a.created_at) : 0;
          const bt = b.created_at ? Date.parse(b.created_at) : 0;
          if (bt !== at) return bt - at;
          return Number(b.id) - Number(a.id);
        });

      let backupFiltered = backup;
      if (chainList.length > 0 || exchangeList.length > 0) {
        backupFiltered = backup.filter((a) => {
          const tags = classifyChainExchangeTags({ title: a.title ?? "", description: a.content ?? "" });
          const chainHit = chainList.length > 0
            ? tags.chainTags.some((t) => chainList.includes(String(t)))
            : true;
          const exHit = exchangeList.length > 0
            ? tags.exchangeTags.some((t) => exchangeList.includes(String(t)))
            : true;
          return chainHit && exHit;
        });
      }
      const paged = backupFiltered.slice(offset, offset + limit);
      const backupTotal = backupFiltered.length;
      const backupHasMore = offset + paged.length < backupTotal;

      return res.json({
        items: paged.map((r) => ({
          id: String(r.id),
          title: r.title,
          summary: r.content ? r.content.slice(0, 200) : "",
          time: r.created_at
            ? new Date(r.created_at).toISOString()
            : new Date().toISOString(),
          category: r.section || "other",
          source: r.author_name ?? undefined,
          link: r.source_url ?? undefined,
          importance: (r as any).importance ?? null,
        })),
        hasMore: backupHasMore,
        total: backupTotal,
      });
    }

    const payload = {
      items: rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        summary: r.content ? r.content.slice(0, 200) : "",
        time: r.createdAt.toISOString(),
        category: r.section || "other",
        source: r.authorName,
        link: r.sourceUrl,
        importance: r.importance ?? null,
      })),
      hasMore,
      total,
    };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error("Feed API error:", error);
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

export default router;
