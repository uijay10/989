import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { readArticlesBackupFile } from "../lib/articles-backup";
import { classifyChainExchangeTags } from "../lib/tag-classifier";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(1000, parseInt(req.query.limit as string) || 30);
    const category = (req.query.category as string) || "all";
    const chain = (req.query.chain as string | undefined)?.trim();
    const exchange = (req.query.exchange as string | undefined)?.trim();
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [
      eq(postsTable.authorType, "ai"),
    ];
    if (category !== "all") {
      const cats = category.split(",").map(s => s.trim()).filter(Boolean);
      if (cats.length > 1) {
        conditions.push(inArray(postsTable.section, cats as any));
      } else if (cats.length === 1) {
        conditions.push(eq(postsTable.section, cats[0]!));
      }
    }
    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(postsTable)
        .where(where),
      db
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
        .where(where)
        .orderBy(desc(postsTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    let total = Number(countResult[0]?.count ?? 0);
    let filteredRows = rows;
    if (chain || exchange) {
      filteredRows = rows.filter((r) => {
        const tags = classifyChainExchangeTags({ title: r.title ?? "", description: r.content ?? "" });
        const chainHit = chain ? tags.chainTags.some((t) => String(t).toLowerCase() === chain.toLowerCase()) : true;
        const exHit = exchange ? tags.exchangeTags.some((t) => String(t).toLowerCase() === exchange.toLowerCase()) : true;
        return chainHit && exHit;
      });
      // total is best-effort when filtering without DB tag columns.
      total = filteredRows.length + offset; // monotonic enough for UI; hasMore is derived below
    }
    const hasMore = offset + filteredRows.length < total;

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
      if (chain || exchange) {
        backupFiltered = backup.filter((a) => {
          const tags = classifyChainExchangeTags({ title: a.title ?? "", description: a.content ?? "" });
          const chainHit = chain ? tags.chainTags.some((t) => String(t).toLowerCase() === chain.toLowerCase()) : true;
          const exHit = exchange ? tags.exchangeTags.some((t) => String(t).toLowerCase() === exchange.toLowerCase()) : true;
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
      items: filteredRows.map((r) => ({
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
