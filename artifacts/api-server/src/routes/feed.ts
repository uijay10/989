import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 30);
    const category = (req.query.category as string) || "all";
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [eq(postsTable.authorType, "ai")];
    if (category !== "all") {
      conditions.push(eq(postsTable.section, category));
    }
    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(postsTable).where(where),
      db.select({
        id:         postsTable.id,
        title:      postsTable.title,
        content:    postsTable.content,
        createdAt:  postsTable.createdAt,
        section:    postsTable.section,
        authorName: postsTable.authorName,
        sourceUrl:  postsTable.sourceUrl,
      })
        .from(postsTable)
        .where(where)
        .orderBy(desc(postsTable.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total  = Number(countResult[0]?.count ?? 0);
    const hasMore = offset + rows.length < total;

    res.json({
      items: rows.map(r => ({
        id:       String(r.id),
        title:    r.title,
        summary:  r.content ? r.content.slice(0, 200) : "",
        time:     r.createdAt.toISOString(),
        category: r.section || "other",
        source:   r.authorName,
        link:     r.sourceUrl,
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
