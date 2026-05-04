import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin, ADMIN_WALLETS } from "../lib/admin-check";
import { verifyAdminToken } from "../lib/admin-token";
import { runUnifiedScrape, runKeywordScrape, isKeywordScrapeRunning, KEYWORD_GRAB_CONFIG, DEFAULT_KEYWORDS, SCRAPE_CONFIG } from "../lib/auto-scraper";
import type { UnifiedScrapeOptions as KeywordScrapeOptions } from "../lib/auto-scraper";
import { getDailyQuotaStats, areFreeProvidersDailyExhausted, getDeepSeekHourlyBudgetUsd } from "../lib/ai-provider";
import { readArticlesBackupFile } from "../lib/articles-backup";
import { importBackupToDb } from "../lib/import-backup";
import { dedupAiPosts } from "../lib/dedup-posts";
import { runJsBulkScrape } from "../scripts/js-bulk-scrape";

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
    const hours = Number(body.hours ?? 48);
    const sinceRaw = String(body.since ?? "").trim();
    const sections = Array.isArray(body.sections) ? body.sections.map((s) => String(s)) : [];
    const stats = await importBackupToDb({
      maxItems: Number.isFinite(maxItems) ? maxItems : 50000,
      dryRun,
      since: sinceRaw ? new Date(sinceRaw) : (Number.isFinite(hours) && hours > 0 ? new Date(Date.now() - hours * 60 * 60 * 1000) : undefined),
      sections,
    });
    res.json({ ok: true, dryRun, stats });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.post("/backfill-sections", checkScrapeAuth, async (_req, res) => {
  try {
    const result = await db.execute(sql`
      WITH src AS (
        SELECT *
        FROM posts
        WHERE created_at >= NOW() - INTERVAL '180 days'
          AND (
            section IN ('defi', 'analytics', 'nft', 'research', 'HTX', 'Gate.io', 'KuCoin', 'Bitget')
            OR lower(title) ~ '(defi|dex|tvl|yield|liquidity|swap|amm|lending|perp|uniswap|aave|curve|gmx|dydx|nft|gamefi|opensea|magic eden|blur|immutable|metaverse|htx|huobi|gate\\.io|gateio|kucoin|bitget)'
            OR lower(content) ~ '(defi|dex|tvl|yield|liquidity|swap|amm|lending|perp|uniswap|aave|curve|gmx|dydx|nft|gamefi|opensea|magic eden|blur|immutable|metaverse|htx|huobi|gate\\.io|gateio|kucoin|bitget)'
          )
      ),
      inserted AS (
        INSERT INTO posts (
          title, content, section, author_wallet, author_name, author_type,
          views, likes, comments, kol_like_points, kol_comment_points,
          is_pinned, pin_queued, expires_at, source_url, ai_confidence, importance,
          event_start_time, event_end_time, created_at
        )
        SELECT
          s.title,
          s.content,
          CASE
            WHEN lower(s.title) ~ '(htx|huobi)' THEN 'HTX'
            WHEN lower(s.title) ~ '(gate\\.io|gateio)' THEN 'Gate.io'
            WHEN lower(s.title) ~ '(kucoin)' THEN 'KuCoin'
            WHEN lower(s.title) ~ '(bitget)' THEN 'Bitget'
            WHEN lower(s.title) ~ '(defi|dex|tvl|yield|liquidity|swap|amm|lending|perp|uniswap|aave|curve|gmx|dydx)' THEN 'defi'
            WHEN lower(s.title) ~ '(nft|gamefi|opensea|magic eden|blur|immutable|metaverse)' THEN 'nft'
            WHEN lower(s.title) ~ '(analytics|on-chain data|onchain data|data analysis|chain analysis|nansen|glassnode|dune|messari|coingecko)' THEN 'analytics'
            ELSE 'research'
          END,
          s.author_wallet, s.author_name, s.author_type,
          s.views, s.likes, s.comments, s.kol_like_points, s.kol_comment_points,
          s.is_pinned, s.pin_queued, s.expires_at, s.source_url, s.ai_confidence, s.importance,
          s.event_start_time, s.event_end_time, s.created_at
        FROM src s
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT COUNT(*)::int AS inserted FROM inserted
    `);

    const inserted = Number((result.rows?.[0] as { inserted?: string | number } | undefined)?.inserted ?? 0);
    res.json({ ok: true, inserted });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ── JS Section 一次性历史批量抓取（近3个月，关键词直接匹配，无需AI配额）────────
// Auth: SCRAPE_INTERNAL_KEY header/query OR admin credentials.
let jsBulkRunning = false;
router.post("/js-bulk", checkScrapeAuth, async (req, res) => {
  if (jsBulkRunning) {
    res.status(409).json({ error: "JS bulk scrape already running" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const windowDays = Math.min(180, Math.max(7, Number(body.windowDays ?? 90)));

  res.json({ ok: true, message: `JS bulk scrape started (window: ${windowDays} days, no AI quota used)` });

  jsBulkRunning = true;
  runJsBulkScrape(windowDays)
    .then(r => {
      console.log("[js-bulk] done:", JSON.stringify({ inserted: r.inserted, matched: r.matched, duplicatesSkipped: r.duplicatesSkipped, sourcesFailed: r.sourcesFailed }));
    })
    .catch(e => {
      console.error("[js-bulk] error:", e);
    })
    .finally(() => {
      jsBulkRunning = false;
    });
});

router.get("/js-bulk/status", checkScrapeAuth, (_req, res) => {
  res.json({ running: jsBulkRunning });
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

// Status/metrics endpoints are safe to expose to internal operators via SCRAPE_INTERNAL_KEY.
// This avoids needing a wallet signature just to monitor whether the cron is running.
router.get("/status", checkScrapeAuth, async (_req, res) => {
  const quotaStats = getDailyQuotaStats();
  const freeExhausted = areFreeProvidersDailyExhausted();
  res.json({
    version: "v2.0_migrated_2026",
    scrapeRunning: isKeywordScrapeRunning(),
    mode: "unified-dual-publish",
    schedule: (() => {
      const g = Number(process.env.SCRAPE_GROQ_INTERVAL_MIN);
      const d = Number(process.env.SCRAPE_DEEPSEEK_INTERVAL_MIN);
      const gm = Number.isFinite(g) && g > 0 ? Math.round(g) : 20;
      const dm = Number.isFinite(d) && d > 0 ? Math.round(d) : 60;
      const hourlyUsd = getDeepSeekHourlyBudgetUsd();
      return `Groq every ${gm}min wall-clock (freeOnly, Groq keys only) + DeepSeek every ${dm}min wall-clock (paidOnly, ≤$${hourlyUsd.toFixed(4)}/UTC hour, no daily cap). No cross-provider takeover. All articles → section + 7×24快讯.`;
    })(),
    freeExhausted,
    quotaStats,
    config: {
      maxArticlesPerGroqRun:     SCRAPE_CONFIG.maxArticlesPerGroqRun,
      maxArticlesPerDeepSeekRun: SCRAPE_CONFIG.maxArticlesPerDeepSeekRun,
      maxDailyArticles:          SCRAPE_CONFIG.maxDailyArticles,
      normalTimeWindowHours:     SCRAPE_CONFIG.normalTimeWindowHours,
      deepseekHourlyBudgetUsd:   getDeepSeekHourlyBudgetUsd(),
      deepseekHourlyBudgetEnv:   "DEEPSEEK_HOURLY_BUDGET_USD",
    },
  });
});

router.get("/logs", checkScrapeAuth, async (req, res) => {
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

router.get("/runs", checkScrapeAuth, async (req, res) => {
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

router.get("/keywords", checkScrapeAuth, async (_req, res) => {
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

router.put("/keywords", checkScrapeAuth, async (req, res) => {
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
