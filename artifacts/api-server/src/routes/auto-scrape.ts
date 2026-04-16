import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin, ADMIN_WALLETS } from "../lib/admin-check";
import { verifyAdminToken } from "../lib/admin-token";
import { runKeywordScrape, isKeywordScrapeRunning, KEYWORD_GRAB_CONFIG, DEFAULT_KEYWORDS, KeywordScrapeOptions } from "../lib/auto-scraper";
import { getDailyQuotaStats, areFreeProvidersDailyExhausted } from "../lib/ai-provider";

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

// Trigger a full keyword scrape (all sections)
router.post("/run", checkScrapeAuth, async (req, res) => {
  if (isKeywordScrapeRunning()) {
    res.status(409).json({ error: "Scrape already running" });
    return;
  }
  runKeywordScrape({
    paidOnly: true,
    maxArticlesPerRun: KEYWORD_GRAB_CONFIG.maxArticlesPerRun,
  })
    .then(summary => { console.log("[keyword-scrape] /run done:", summary); })
    .catch(e => { console.error("[keyword-scrape] /run error:", e); });

  res.json({ ok: true, message: "Keyword scrape started (mode: deepseek)" });
});

// One-time backfill for specific sections with custom time window
// Body: { plates?: string[], hours?: number, freeOnly?: boolean, maxArticlesPerRun?: number }
// When plates is omitted, ALL sections are included.
router.post("/backfill", checkScrapeAuth, async (req, res) => {
  if (isKeywordScrapeRunning()) {
    res.status(409).json({ error: "Scrape already running — try again in a moment" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const plates = Array.isArray(body?.plates) ? (body.plates as string[]) : undefined;
  const hoursRaw = Number(body?.hours ?? 240);
  const overrideWindowHours = hoursRaw > 0 ? hoursRaw : 240;
  const freeOnly = body?.freeOnly === true;
  const maxArticlesPerRun = Number(body?.maxArticlesPerRun ?? 500);

  const validPlates = Object.keys(KEYWORD_GRAB_CONFIG.plates);

  // Validate plates when provided
  if (plates) {
    const invalidPlates = plates.filter(p => !validPlates.includes(p));
    if (invalidPlates.length > 0) {
      res.status(400).json({ error: `Unknown plate names: ${invalidPlates.join(", ")}. Valid names: ${validPlates.join(", ")}` });
      return;
    }
  }

  const targetPlates = plates ?? validPlates; // default: all sections

  const opts: KeywordScrapeOptions = {
    plates: targetPlates,
    overrideWindowHours,
    freeOnly,              // default false — use DeepSeek for big backfills
    maxArticlesPerRun,
    ignoreDailyLimit: true, // backfill always bypasses daily cap
  };

  runKeywordScrape(opts)
    .then(summary => { console.log("[keyword-scrape] /backfill done:", summary); })
    .catch(e => { console.error("[keyword-scrape] /backfill error:", e); });

  res.json({
    ok: true,
    message: `Backfill started for ${targetPlates.length} sections over last ${overrideWindowHours}h`,
    plates: targetPlates,
    overrideWindowHours,
    freeOnly,
    maxArticlesPerRun,
  });
});

// Trigger keyword scrape with optional window override
router.post("/keyword", checkScrapeAuth, async (req, res) => {
  if (isKeywordScrapeRunning()) {
    res.status(409).json({ error: "Keyword scrape already running" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const hoursRaw = Number(req.query.hours ?? body?.hours ?? 0);
  const overrideHours = hoursRaw > 0 ? hoursRaw : undefined;

  runKeywordScrape({
    overrideWindowHours: overrideHours,
    paidOnly: true,
    maxArticlesPerRun: KEYWORD_GRAB_CONFIG.maxArticlesPerRun,
  })
    .then(summary => { console.log("[keyword-scrape] /keyword done:", summary); })
    .catch(e => { console.error("[keyword-scrape] /keyword error:", e); });

  res.json({
    ok: true,
    message: `Keyword scrape started (window: ${overrideHours ? overrideHours + "h override" : "auto"}, mode: deepseek)`,
    config: KEYWORD_GRAB_CONFIG,
  });
});

router.get("/keyword/config", requireAdmin, (_req, res) => {
  res.json({ config: KEYWORD_GRAB_CONFIG });
});

router.get("/status", requireAdmin, async (_req, res) => {
  const quotaStats = getDailyQuotaStats();
  const freeExhausted = areFreeProvidersDailyExhausted();
  res.json({
    keywordScrapeRunning: isKeywordScrapeRunning(),
    mode: "deepseek",
    schedule: "DeepSeek only (non-flash) — every 2h. Groq flash (快讯 only) — every 30min. DS flash (快讯) — every 10min.",
    quotaStats,
    config: {
      maxArticlesPerRun: KEYWORD_GRAB_CONFIG.maxArticlesPerRun,
      maxArticlesPerRunDeepSeek: KEYWORD_GRAB_CONFIG.maxArticlesPerRunDeepSeek,
      maxDailyArticles: KEYWORD_GRAB_CONFIG.maxDailyArticles,
      normalTimeWindowHours: KEYWORD_GRAB_CONFIG.normalTimeWindowHours,
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
