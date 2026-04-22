import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { readArticlesBackupFile } from "../lib/articles-backup";
import { classifyChainExchangeTags } from "../lib/tag-classifier";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  // Live feed must never be cached by CDN/browser/proxy — stale JSON looks like “7×24 stopped updating”.
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

    let countResult: Array<{ count: number }> = [];
    let rows: Array<{
      id: number;
      title: string;
      content: string | null;
      createdAt: Date;
      section: string | null;
      authorName: string | null;
      sourceUrl: string | null;
      importance: string | null;
    }> = [];

    // Always count the base set first (exact, fast).
    countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(postsTable)
      .where(whereBase);

    let total = Number(countResult[0]?.count ?? 0);

    // ── Chain/exchange columns: robust in-memory filtering with scan ──────────
    // We intentionally DO NOT rely on DB tag columns here because older rows may
    // not have them backfilled (which would make the column “shrink” to a handful).
    if (wantsTagFilter) {
      const HARD_SCAN_CAP = 5000; // protect API from unbounded scans
      const batchSize = Math.max(200, Math.min(1000, limit * 5));

      const need = page * limit; // collect enough matches to serve page N
      const matches: typeof rows = [];
      let scanOffset = 0;

      const filterHit = (r: typeof rows[number]) => {
        const tags = classifyChainExchangeTags({ title: r.title ?? "", description: r.content ?? "" });
        const chainHit = chainList.length > 0
          ? tags.chainTags.some((t) => chainList.includes(String(t)))
          : true;
        const exHit = exchangeList.length > 0
          ? tags.exchangeTags.some((t) => exchangeList.includes(String(t)))
          : true;
        return chainHit && exHit;
      };

      while (scanOffset < total && scanOffset < HARD_SCAN_CAP && matches.length < need) {
        const batch = await db
          .select({
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
          .limit(batchSize)
          .offset(scanOffset);

        if (batch.length === 0) break;
        for (const r of batch) {
          if (filterHit(r)) matches.push(r);
        }
        scanOffset += batch.length;
        if (batch.length < batchSize) break;
      }

      // If the base set is small, finish scanning to compute an accurate total.
      // This makes the “共 102 条” label correct and prevents false “no more” states.
      if (total > 0 && total <= HARD_SCAN_CAP && scanOffset < total) {
        while (scanOffset < total && scanOffset < HARD_SCAN_CAP) {
          const batch = await db
            .select({
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
            .limit(batchSize)
            .offset(scanOffset);
          if (batch.length === 0) break;
          for (const r of batch) {
            if (filterHit(r)) matches.push(r);
          }
          scanOffset += batch.length;
          if (batch.length < batchSize) break;
        }
      }

      const tagTotal = total <= HARD_SCAN_CAP ? matches.length : Math.max(matches.length, (page - 1) * limit + matches.slice((page - 1) * limit).length);
      const paged = matches.slice(offset, offset + limit);
      const hasMore = total <= HARD_SCAN_CAP
        ? (offset + paged.length < tagTotal)
        : (paged.length === limit); // best-effort when we didn't scan everything

      return res.json({
        items: paged.map((r) => ({
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

    // ── Normal feed (no chain/exchange) ───────────────────────────────────────
    rows = await db
      .select({
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
      .offset(offset);

    const hasMore = offset + rows.length < total;

    // Fallback: when DB is empty/unavailable, serve from local JSONL backup (best-effort).
    // This preserves the existing DB-first mechanism while allowing legacy data to show.
    if (total === 0 && rows.length === 0) {
      const backup = readArticlesBackupFile()
        .filter((a) => (a.author_type ?? "ai") === "ai")
        .filter(
          (a) => category === "all" || (a.section ?? "other") === category,
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
          importance: (r as any).importance ?? null, // ✅ 新增：fallback 也返回 importance
        })),
        hasMore: backupHasMore,
        total: backupTotal,
      });
    }

    res.json({
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
    });
  } catch (error) {
    console.error("Feed API error:", error);
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

export default router;
