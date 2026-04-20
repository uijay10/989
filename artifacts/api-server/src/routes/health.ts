import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, postsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import {
  areFreeProvidersDailyExhausted,
  canRunPaidUnifiedScrape,
  getDailyQuotaStats,
  getDeepSeekHourlyBudgetUsd,
  getDeepSeekHourlySpendUsd,
  isDeepSeekBlockedByAppHourlyCap,
  isDeepSeekHourlyCapDisabled,
  isFreeProviderAvailable,
} from "../lib/ai-provider";
import { getTodayArticlesProcessed, SCRAPE_CONFIG } from "../lib/auto-scraper";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Public (no auth) scraper diagnostics for operators.
// Helps debug "no new posts" without exposing secrets.
router.get("/healthz/scrape", async (_req, res) => {
  try {
    const now = new Date();

    const lastAiPost = await db
      .select({
        createdAt: postsTable.createdAt,
        section: postsTable.section,
        title: postsTable.title,
      })
      .from(postsTable)
      .where(sql`${postsTable.authorType} = 'ai'`)
      .orderBy(desc(postsTable.createdAt))
      .limit(1);

    const lastScrapeLog = await db.execute(sql`
      SELECT run_id, status, items_found, items_saved, error_msg, created_at
      FROM scrape_logs
      WHERE run_id LIKE ${"unified_%"}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const lastAi = lastAiPost[0];
    const lastLog = (lastScrapeLog as { rows?: any[] }).rows?.[0];

    const minutesSince = (d?: Date) =>
      d ? Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000)) : null;

    const lastAiAt = lastAi?.createdAt ? new Date(lastAi.createdAt) : null;
    const lastLogAt = lastLog?.created_at ? new Date(lastLog.created_at) : null;

    const todaySaved = await getTodayArticlesProcessed();
    const cronDisabled = process.env.DISABLE_SCRAPE_CRON === "true";

    res.json({
      status: "ok",
      now: now.toISOString(),
      scrapeCronDisabled: cronDisabled,
      dailyArticleBudget: {
        processedTodayViaLogs: todaySaved,
        maxPerDay: SCRAPE_CONFIG.maxDailyArticles,
        atCap: todaySaved >= SCRAPE_CONFIG.maxDailyArticles,
      },
      aiProviders: {
        freeGroqUsable: isFreeProviderAvailable(),
        allFreeGroqDailyExhausted: areFreeProvidersDailyExhausted(),
        canRunPaidDeepSeekUnified: canRunPaidUnifiedScrape(),
        quota: getDailyQuotaStats(),
      },
      // App-side DeepSeek $/hour cap (NOT your DeepSeek account balance). Default was ~$0.05/h and could block publishes for a whole UTC hour.
      deepSeekAppHourlyThrottle: {
        capUsd: isDeepSeekHourlyCapDisabled() ? null : getDeepSeekHourlyBudgetUsd(),
        disabled: isDeepSeekHourlyCapDisabled(),
        estimatedSpentUsdThisUtcHour: getDeepSeekHourlySpendUsd(),
        blockedByThisCap: isDeepSeekBlockedByAppHourlyCap(),
      },
      lastAiPost: lastAiAt
        ? {
            at: lastAiAt.toISOString(),
            minutesAgo: minutesSince(lastAiAt),
            section: lastAi?.section ?? null,
            title: String(lastAi?.title ?? "").slice(0, 140),
          }
        : null,
      lastScrapeLog: lastLogAt
        ? {
            at: lastLogAt.toISOString(),
            minutesAgo: minutesSince(lastLogAt),
            runId: lastLog?.run_id ?? null,
            status: lastLog?.status ?? null,
            itemsFound: Number(lastLog?.items_found ?? 0),
            itemsSaved: Number(lastLog?.items_saved ?? 0),
            error: lastLog?.error_msg ? String(lastLog.error_msg).slice(0, 500) : null,
          }
        : null,
      hints: [
        "If scrapeCronDisabled=true: set DISABLE_SCRAPE_CRON!=true on the API host or cron will never run.",
        "If dailyArticleBudget.atCap=true: unified scraper stops until UTC date rolls (see scrape_logs SUM).",
        "If blockedByThisCap=true in deepSeekAppHourlyThrottle: app hourly limit hit (set DEEPSEEK_HOURLY_BUDGET_USD higher or =0 to disable). Account balance is separate.",
        "If allFreeGroqDailyExhausted=true but canRunPaidDeepSeekUnified=false: add/fix DEEPSEEK_API_KEY or fix throttle above.",
        "If lastScrapeLog is null: DB table scrape_logs may not exist or DB unreachable.",
        "If itemsFound>0 but itemsSaved=0: AI rejected or dedup/guards filtered everything, or DB insert failing.",
        "If lastScrapeLog.minutesAgo keeps increasing: process sleeping (e.g. host spun down), or leader lease held elsewhere, or only saves 0.",
      ],
    });
  } catch (e: unknown) {
    res.status(500).json({
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
