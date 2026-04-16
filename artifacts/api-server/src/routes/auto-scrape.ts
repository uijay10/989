import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin, ADMIN_WALLETS } from "../lib/admin-check";
import { verifyAdminToken } from "../lib/admin-token";
import { runUnifiedScrape, runKeywordScrape, isKeywordScrapeRunning, KEYWORD_GRAB_CONFIG, DEFAULT_KEYWORDS, SCRAPE_CONFIG } from "../lib/auto-scraper";
import type { UnifiedScrapeOptions as KeywordScrapeOptions } from "../lib/auto-scraper";
import { getDailyQuotaStats, areFreeProvidersDailyExhausted } from "../lib/ai-provider";
import { readArticlesBackupFile } from "../lib/articles-backup";
import { importBackupToDb } from "../lib/import-backup";
import { dedupAiPosts } from "../lib/dedup-posts";

const router: IRouter = Router();

function checkScrapeAuth(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  const key = req.headers["x-scrape-key"] ?? req.query.key;
  const expectedKey = process.env.SCRAPE_INTERNAL_KEY;
  if (expectedKey && key === expectedKey) { next(); return; }

  const authHeader = String(req.headers.authorization ?? "");
  if (authHeader.startsWith("Bearer ")) {
    const wallet = verifyAdminToken(authHeader.slice(7));
    if (wallet && ADMIN_WALLETS.has(wallet)) { next(); return; }
    res.status(403).json({ error: "Forbidden: invalid token" }); return;
  }
  const walletRaw = String(req.query.adminWallet ?? (req.body as Record<string, unknown>)?.adminWallet ?? "");
  if (walletRaw.toLowerCase() && ADMIN_WALLETS.has(walletRaw.toLowerCase())) { next(); return; }
  res.status(403).json({ error: "Forbidden: missing scrape key or admin credentials" });
}

// v2.0_migrated_2026: Trigger a unified scrape (DeepSeek mode)
router.post("/run", checkScrapeAuth, async (req, res) => {
  if (isKeywordScrapeRunning()) {
    res.status(409).json({ error: "Scrape already running" });
    return;
  }
  runUnifiedScrape({
    paidOnly: true,
    maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerDeepSeekRun,
  })
    .then(summary => { console.log("[unified-scrape] /run done:", summary); })
    .catch(e => { console.error("[unified-scrape] /run error:", e); });

  res.json({ ok: true, message: "Unified scrape started (mode: deepseek, dual-publish)" });
});

// Trigger with optional window override (Groq mode)
router.post("/keyword", checkScrapeAuth, async (req, res) => {
  if (isKeywordScrapeRunning()) {
    res.status(409).json({ error: "Unified scrape already running" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const hoursRaw = Number(req.query.hours ?? body?.hours ?? 0);
  const overrideHours = hoursRaw > 0 ? hoursRaw : undefined;

  runUnifiedScrape({
    overrideWindowHours: overrideHours,
    freeOnly: true,
    maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerGroqRun,
  })
    .then(summary => { console.log("[unified-scrape] /keyword done:", summary); })
    .catch(e => { console.error("[unified-scrape] /keyword error:", e); });

  res.json({
    ok: true,
    message: `Unified scrape started (window: ${overrideHours ? overrideHours + "h" : "auto"}, mode: groq-first, dual-publish)`,
    config: SCRAPE_CONFIG,
  });
});

router.get("/keyword/config", requireAdmin, (_req, res) => {
  res.json({ config: SCRAPE_CONFIG, version: SCRAPE_CONFIG.VERSION });
});

// Read historical articles from articles_backup.json (JSONL) for verification/debug.
// Auth: SCRAPE_INTERNAL_KEY header/query OR admin credentials (same as scrape triggers).
router.get("/backup", checkScrapeAuth, (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50")) || 50));
    const category = String(req.query.category ?? "all");
    const offset = (page - 1) * limit;

    const all = readArticlesBackupFile()
      .filter((a) => (a.author_type ?? "ai") === "ai")
      .filter((a) => category === "all" || (a.section ?? "other") === category)
      .sort((a, b) => {
        const at = a.created_at ? Date.parse(a.created_at) : 0;
        const bt = b.created_at ? Date.parse(b.created_at) : 0;
        if (bt !== at) return bt - at;
        return Number(b.id) - Number(a.id);
      });

    const items = all.slice(offset, offset + limit);
    res.json({
      page,
      limit,
      total: all.length,
      hasMore: offset + items.length < all.length,
      items,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// Import historical articles from articles_backup.json into PostgreSQL.
// This is a one-time operation to restore legacy content visibility.
// Auth: SCRAPE_INTERNAL_KEY header/query OR admin credentials.
router.post("/backup/import", checkScrapeAuth, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const maxItems = Number(body.maxItems ?? 50000);
    const dryRun = body.dryRun === true;
    const stats = await importBackupToDb({
      maxItems: Number.isFinite(maxItems) ? maxItems : 50000,
      dryRun,
    });
    res.json({ ok: true, dryRun, stats });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// De-duplicate AI posts after import or scraping.
// Scope: AI posts only, and de-dup happens within the same section (won't break dual-publish).
// Auth: SCRAPE_INTERNAL_KEY header/query OR admin credentials.
router.post("/dedup", checkScrapeAuth, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const days = Number(body.days ?? 90);
    const dryRun = body.dryRun !== false;
    const maxScan = Number(body.maxScan ?? 50000);
    const maxDeletes = Number(body.maxDeletes ?? 5000);

    const result = await dedupAiPosts({
      days: Number.isFinite(days) ? days : 90,
      dryRun,
      maxScan: Number.isFinite(maxScan) ? maxScan : 50000,
      maxDeletes: Number.isFinite(maxDeletes) ? maxDeletes : 5000,
    });

    res.json({ ok: true, dryRun, result });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/status", requireAdmin, async (_req, res) => {
  const quotaStats = getDailyQuotaStats();
  const freeExhausted = areFreeProvidersDailyExhausted();
  res.json({
    version: "v2.0_migrated_2026",
    scrapeRunning: isKeywordScrapeRunning(),
    mode: "unified-dual-publish",
    schedule: "Groq every 30min (11 keys, freeOnly) + DeepSeek every 60min (paidOnly, $0.020833/h cap). All articles → section + 7×24快讯.",
    freeExhausted,
    quotaStats,
    config: {
      maxArticlesPerGroqRun:     SCRAPE_CONFIG.maxArticlesPerGroqRun,
      maxArticlesPerDeepSeekRun: SCRAPE_CONFIG.maxArticlesPerDeepSeekRun,
      maxDailyArticles:          SCRAPE_CONFIG.maxDailyArticles,
      normalTimeWindowHours:     SCRAPE_CONFIG.normalTimeWindowHours,
      deepseekHourlyBudget:      "$0.020833",
      deepseekDailyBudget:       "$0.50",
    },
  });
});

router.get("/logs", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 200), 500);
    const runId = req.query.runId as string | undefined;
    let query = `SELECT id, run_id, source_name, source_url, status, items_found, items_saved, error_msg, created_at
                 FROM scrape_logs`;
    if (runId) {
      query += ` WHERE run_id = '${runId.replace(/'/g, "''")}'`;
    }
    query += ` ORDER BY created_at DESC LIMIT ${limit}`;
    const rows = await db.execute(sql.raw(query));
    res.json({ logs: rows.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/runs", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const rows = await db.execute(sql`
      SELECT run_id,
             MIN(created_at) AS started_at,
             COUNT(*)::int AS total_sources,
             SUM(items_found)::int AS total_found,
             SUM(items_saved)::int AS total_saved,
             COUNT(*) FILTER (WHERE status = 'error')::int AS errors
      FROM scrape_logs
      GROUP BY run_id
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
    res.json({ runs: rows.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/keywords", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT id, keyword, enabled FROM scrape_keywords ORDER BY id ASC`);
    let keywords = rows.rows as Array<{ id: number; keyword: string; enabled: boolean }>;
    if (keywords.length === 0) {
      keywords = DEFAULT_KEYWORDS.map((k, i) => ({ id: i + 1, keyword: k, enabled: true }));
    }
    res.json({ keywords });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/keywords", requireAdmin, async (req, res) => {
  try {
    const { keywords } = req.body as { keywords: string[] };
    if (!Array.isArray(keywords)) { res.status(400).json({ error: "keywords array required" }); return; }
    await db.execute(sql`DELETE FROM scrape_keywords`);
    for (const kw of keywords) {
      if (typeof kw === "string" && kw.trim()) {
        await db.execute(sql`INSERT INTO scrape_keywords (keyword, enabled) VALUES (${kw.trim()}, true)`);
      }
    }
    res.json({ ok: true, count: keywords.length });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
