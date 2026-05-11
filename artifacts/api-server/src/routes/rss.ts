import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { readArticlesBackupFile } from "../lib/articles-backup";

const router: IRouter = Router();

router.get("/ecosystem-counts", async (_req, res) => {
  try {
    const rows = await db
      .select({
        section: postsTable.section,
        count: sql<number>`count(*)`,
      })
      .from(postsTable)
      .where(eq(postsTable.authorType, "ai"))
      .groupBy(postsTable.section);

    const backup = readArticlesBackupFile().filter((a) => (a.author_type ?? "ai") === "ai");
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.section ?? "other"] = Number(row.count ?? 0);
    }
    for (const item of backup) {
      const section = item.section ?? "other";
      counts[section] = (counts[section] ?? 0) + 1;
    }
    res.json({ counts });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get("/rss.xml", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: postsTable.id,
        title: postsTable.title,
        content: postsTable.content,
        createdAt: postsTable.createdAt,
        section: postsTable.section,
        sourceUrl: postsTable.sourceUrl,
      })
      .from(postsTable)
      .where(eq(postsTable.authorType, "ai"))
      .orderBy(desc(postsTable.createdAt))
      .limit(100);

    const items = rows.length > 0
      ? rows.map((r) => ({
          title: r.title,
          description: (r.content ?? r.title).slice(0, 300),
          url: r.sourceUrl ?? "https://web3release.com/",
          date: r.createdAt.toISOString(),
          guid: String(r.id),
        }))
      : readArticlesBackupFile()
          .filter((a) => (a.author_type ?? "ai") === "ai")
          .sort((a, b) => (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0))
          .slice(0, 100)
          .map((r) => ({
            title: r.title,
            description: (r.content ?? r.title).slice(0, 300),
            url: r.source_url ?? "https://web3release.com/",
            date: r.created_at ?? new Date().toISOString(),
            guid: String(r.id),
          }));

    const escapeXml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Web3Release - 最新Web3事件快讯</title>
<description>实时聚合 IDO、Launchpad、融资公告、空投、测试网、DeFi 等 Web3 机会平台</description>
<link>https://web3release.com/</link>
<language>zh-CN</language>
<pubDate>${new Date().toUTCString()}</pubDate>
${items
  .map(
    (item) => `
<item>
<title>${escapeXml(item.title)}</title>
<description>${escapeXml(item.description)}</description>
<link>${escapeXml(item.url)}</link>
<guid isPermaLink="false">${escapeXml(item.guid)}</guid>
<pubDate>${new Date(item.date).toUTCString()}</pubDate>
</item>`,
  )
  .join("")}
</channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.send(xml);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;