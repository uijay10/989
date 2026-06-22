import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import router from "./routes";
import { db, client } from "@workspace/db";
import { sql } from "drizzle-orm";

import { DEFAULT_KEYWORDS } from "./lib/auto-scraper";
import { initDeepSeekDailyBudget } from "./lib/ai-provider";
import { ensureTursoPostsTable, tursoGetLastAiPostAt } from "./lib/turso-posts";

/** ALTER TABLE ADD COLUMN — silently ignores "duplicate column" errors (SQLite has no IF NOT EXISTS) */
async function safeAddCol(table: string, col: string, typeDef: string) {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw e;
  }
}

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Stale-feed safety net (traffic + periodic) ───────────────────────────────
// Hosting environments may sleep, cron may stall, or scrapes may run but save 0 items.
// We periodically (and on /api/feed traffic) check staleness against BOTH:
// - last unified scrape log timestamp
// - last AI post created_at
// If either is too old, we kick ONE Groq unified scrape (throttled).
let lastStaleKickMs = 0;

async function readLastUnifiedScrapeAt(): Promise<Date | null> {
  try {
    const r = await db.execute(sql`
      SELECT created_at
      FROM scrape_logs
      WHERE run_id LIKE ${"unified_%"}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const last = (r as { rows?: Array<{ created_at?: string | Date }> }).rows?.[0]?.created_at;
    return last ? new Date(last) : null;
  } catch {
    return null;
  }
}

async function readLastAiPostAt(): Promise<Date | null> {
  return tursoGetLastAiPostAt();
}

async function logStaleKickEvent(status: "skip" | "error" | "ok", message: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scrape_logs (run_id, source_name, source_url, status, items_found, items_saved, error_msg)
      VALUES (
        ${`unified_stale_kick_${Date.now()}`},
        ${"[stale-kick]"},
        ${""},
        ${status},
        0,
        0,
        ${message.slice(0, 900)}
      )
    `);
  } catch {
    // non-fatal
  }
}

async function maybeKickStaleUnifiedScrape(reason: "traffic" | "timer"): Promise<void> {
  // throttle: at most once per 15 minutes per process (all reasons share the same throttle)
  if (Date.now() - lastStaleKickMs < 15 * 60 * 1000) return;
  if (process.env.NODE_ENV === "test") return;

  const staleScrapeMs = Number(process.env.STALE_SCRAPE_MS ?? "");
  const staleAiMs = Number(process.env.STALE_AI_POST_MS ?? "");
  // Default to 60min so "no new posts for ~1h" self-recovers.
  const scrapeThreshold = Number.isFinite(staleScrapeMs) && staleScrapeMs > 60_000 ? staleScrapeMs : 60 * 60 * 1000; // 60min
  const aiThreshold = Number.isFinite(staleAiMs) && staleAiMs > 60_000 ? staleAiMs : 60 * 60 * 1000; // 60min

  try {
    const lastScrapeAt = await readLastUnifiedScrapeAt();
    const lastAiAt = await readLastAiPostAt();
    const now = Date.now();

    const scrapeStale = !lastScrapeAt || (now - lastScrapeAt.getTime() > scrapeThreshold);
    const aiStale = !lastAiAt || (now - lastAiAt.getTime() > aiThreshold);
    if (!scrapeStale && !aiStale) return;

    const instanceId = getCronInstanceId();
    if (!(await tryClaimCronLeaderLease(instanceId))) return;

    const { runUnifiedScrape, SCRAPE_CONFIG, isGroqScrapeRunning, isDeepSeekScrapeRunning } =
      await import("./lib/auto-scraper");
    const { areFreeProvidersDailyExhausted, canRunPaidUnifiedScrape, explainWhyPaidDeepSeekBlocked } =
      await import("./lib/ai-provider");

    const freeExhausted = areFreeProvidersDailyExhausted();
    const canPaid = canRunPaidUnifiedScrape();

    // If the feed is stale, try paid DeepSeek recovery first when available.
    // This covers cases where Groq isn't "daily exhausted" but still keeps saving 0 due to cooldowns,
    // provider outages, or overly aggressive dedup/guards.
    if (aiStale && canPaid) {
      if (isDeepSeekScrapeRunning()) return;
      lastStaleKickMs = Date.now();
      console.log(
        `[stale-kick:${reason}] AI feed stale — triggering unified DeepSeek scrape — ` +
          `scrapeStale=${scrapeStale} aiStale=${aiStale}`
      );
      void runUnifiedScrape({
        paidOnly: true,
        maxArticlesPerRun: Math.min(40, SCRAPE_CONFIG.maxArticlesPerDeepSeekRun),
      }).catch((e) => {
        void logStaleKickEvent("error", `deepseek_kick_error: ${e instanceof Error ? e.message : String(e)}`);
        console.error(`[stale-kick:${reason}] paid scrape error:`, e);
      });
      return;
    }

    // When all Groq keys hit daily quota, freeOnly runs save 0 forever — recover with DeepSeek if possible.
    if (freeExhausted && canPaid) {
      if (isDeepSeekScrapeRunning()) return;
      lastStaleKickMs = Date.now();
      console.log(
        `[stale-kick:${reason}] free AI daily exhausted — triggering unified DeepSeek scrape — ` +
          `scrapeStale=${scrapeStale} aiStale=${aiStale}`
      );
      void runUnifiedScrape({
        paidOnly: true,
        maxArticlesPerRun: Math.min(40, SCRAPE_CONFIG.maxArticlesPerDeepSeekRun),
      }).catch((e) => console.error(`[stale-kick:${reason}] paid scrape error:`, e));
      return;
    }
    if (freeExhausted && !canPaid) {
      const detail = explainWhyPaidDeepSeekBlocked() ?? "unknown";
      console.warn(
        `[stale-kick:${reason}] Groq daily quota exhausted; paid DeepSeek recovery skipped — ${detail}`
      );
      void logStaleKickEvent("skip", `paid_recovery_skipped: ${detail}`);
      lastStaleKickMs = Date.now();
      return;
    }

    if (isGroqScrapeRunning()) return;

    lastStaleKickMs = Date.now();
    console.log(
      `[stale-kick:${reason}] triggering unified Groq scrape — scrapeStale=${scrapeStale} aiStale=${aiStale} ` +
        `(lastScrape=${lastScrapeAt?.toISOString() ?? "none"}, lastAi=${lastAiAt?.toISOString() ?? "none"})`
    );
    void runUnifiedScrape({
      freeOnly: true,
      maxArticlesPerRun: Math.min(80, SCRAPE_CONFIG.maxArticlesPerGroqRun),
    }).catch((e) => console.error(`[stale-kick:${reason}] scrape error:`, e));
  } catch {
    // ignore
  }
}

app.use("/api", (req, _res, next) => {
  // Only kick on feed-like traffic to avoid unnecessary DB work.
  if (req.path.startsWith("/feed")) {
    void maybeKickStaleUnifiedScrape("traffic");
  }
  next();
});

app.use("/api", router);

// Ensure tables added in recent migrations exist (safe to run on every startup)
async function ensureTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        wallet TEXT NOT NULL,
        author_name TEXT,
        author_avatar TEXT,
        content TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        reply_to INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await safeAddCol("comments", "likes", "INTEGER NOT NULL DEFAULT 0");
    await safeAddCol("comments", "reply_to", "INTEGER");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS comment_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id INTEGER NOT NULL,
        wallet TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        UNIQUE(comment_id, wallet)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_wallet TEXT NOT NULL,
        type TEXT NOT NULL,
        from_wallet TEXT,
        from_name TEXT,
        post_id INTEGER,
        post_title TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await safeAddCol("notifications", "post_section", "TEXT");

    // Ensure Drizzle-schema tables exist (needed when connecting to a fresh database)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL UNIQUE,
        username TEXT,
        avatar TEXT,
        points INTEGER NOT NULL DEFAULT 0,
        energy INTEGER NOT NULL DEFAULT 0,
        space_status TEXT,
        space_type TEXT,
        invite_code TEXT,
        invite_count INTEGER NOT NULL DEFAULT 0,
        last_checkin INTEGER,
        twitter TEXT,
        telegram TEXT,
        discord TEXT,
        language TEXT DEFAULT 'en',
        is_banned INTEGER NOT NULL DEFAULT 0,
        pin_count INTEGER NOT NULL DEFAULT 0,
        website TEXT,
        space_rejected_at INTEGER,
        space_reject_reason TEXT,
        daily_apply_count INTEGER NOT NULL DEFAULT 0,
        last_apply_date TEXT,
        invited_by TEXT,
        daily_like_count INTEGER NOT NULL DEFAULT 0,
        daily_comment_count INTEGER NOT NULL DEFAULT 0,
        last_interaction_date TEXT,
        tokens INTEGER NOT NULL DEFAULT 0,
        last_slot_pull INTEGER,
        daily_tokens_earned INTEGER NOT NULL DEFAULT 0,
        last_token_date TEXT,
        last_post_at INTEGER,
        normal_daily_post_count INTEGER NOT NULL DEFAULT 0,
        normal_daily_post_date TEXT,
        whitepaper TEXT,
        bio TEXT,
        tags TEXT,
        subscriptions TEXT,
        contact TEXT,
        contact_public INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        section TEXT NOT NULL,
        author_wallet TEXT NOT NULL,
        author_name TEXT,
        author_avatar TEXT,
        author_type TEXT,
        chain_tags TEXT,
        exchange_tags TEXT,
        views INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        kol_like_points INTEGER NOT NULL DEFAULT 0,
        kol_comment_points INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        pinned_until INTEGER,
        pin_queued INTEGER NOT NULL DEFAULT 0,
        pin_queued_at INTEGER,
        expires_at INTEGER,
        source_url TEXT,
        ai_confidence REAL,
        importance TEXT,
        event_start_time INTEGER,
        event_end_time INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        logo TEXT,
        tagline TEXT,
        chain TEXT,
        tags TEXT,
        website TEXT,
        twitter TEXT,
        owner_wallet TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        pinned_until INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        latest_post_title TEXT,
        latest_post_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS space_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        type TEXT NOT NULL,
        twitter TEXT,
        tweet_link TEXT,
        project_name TEXT,
        project_twitter TEXT,
        docs_link TEXT,
        github TEXT,
        linkedin TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reject_reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);

    await safeAddCol("posts", "source_url", "TEXT");
    await safeAddCol("posts", "ai_confidence", "REAL");
    await safeAddCol("posts", "importance", "TEXT");
    await safeAddCol("posts", "event_start_time", "INTEGER");
    await safeAddCol("posts", "event_end_time", "INTEGER");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'rss',
        priority INTEGER NOT NULL DEFAULT 2,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        status TEXT NOT NULL,
        items_found INTEGER NOT NULL DEFAULT 0,
        items_saved INTEGER NOT NULL DEFAULT 0,
        error_msg TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scrape_logs_run_id ON scrape_logs(run_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scrape_logs_created_at ON scrape_logs(created_at DESC)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread',
        reply TEXT,
        replied_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);

    // Remove duplicate AI posts: keep the highest id per (section, normalized title)
    await db.execute(sql`
      DELETE FROM posts
      WHERE author_type = 'ai'
        AND id NOT IN (
          SELECT MAX(id) FROM posts
          WHERE author_type = 'ai'
          GROUP BY section, LOWER(TRIM(title))
        )
    `);

    // Sync DEFAULT_KEYWORDS — insert any new keywords not yet in DB
    for (const kw of DEFAULT_KEYWORDS) {
      await db.execute(sql`
        INSERT INTO scrape_keywords (keyword, enabled)
        VALUES (${kw}, 1)
        ON CONFLICT (keyword) DO NOTHING
      `);
    }

    // ── Startup cleanup: remove stale AI-scraped articles ─────────────────────
    const enableStartupCleanup = process.env.ENABLE_STARTUP_AI_POST_CLEANUP === "true";
    if (enableStartupCleanup) {
      console.warn("[startup-cleanup] ENABLE_STARTUP_AI_POST_CLEANUP=true — destructive cleanup enabled");
      const nowMs = Date.now();

      // 1. event_end_time already passed (event is over)
      await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND title NOT LIKE '[archived]%'
          AND event_end_time IS NOT NULL
          AND event_end_time < ${nowMs - 86400000}
          AND expires_at > ${nowMs}
      `);

      // 2. event_start_time exceeds per-section limits
      await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND title NOT LIKE '[archived]%'
          AND expires_at > ${nowMs}
          AND event_start_time IS NOT NULL
          AND (
            (section IN ('quest','airdrop') AND event_start_time < ${nowMs - 7 * 86400000}) OR
            (section IN ('ido','testnet','nodes','devbounty','funding') AND event_start_time < ${nowMs - 30 * 86400000}) OR
            (section = 'grant' AND event_start_time < ${nowMs - 60 * 86400000}) OR
            (section IN ('industry','policy') AND event_start_time < ${nowMs - 21 * 86400000}) OR
            (section IN ('724news','flash','meme') AND event_start_time < ${nowMs - 14 * 86400000})
          )
      `);

      // 3. URL contains an old year (/2010/–/2025/(Jan-Nov)/) for non-quest/airdrop sections
      await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND title NOT LIKE '[archived]%'
          AND expires_at > ${nowMs}
          AND section NOT IN ('quest','airdrop')
          AND (
            source_url LIKE '%/2010/%' OR source_url LIKE '%/2011/%' OR
            source_url LIKE '%/2012/%' OR source_url LIKE '%/2013/%' OR
            source_url LIKE '%/2014/%' OR source_url LIKE '%/2015/%' OR
            source_url LIKE '%/2016/%' OR source_url LIKE '%/2017/%' OR
            source_url LIKE '%/2018/%' OR source_url LIKE '%/2019/%' OR
            source_url LIKE '%/2020/%' OR source_url LIKE '%/2021/%' OR
            source_url LIKE '%/2022/%' OR source_url LIKE '%/2023/%' OR
            source_url LIKE '%/2024/%'
          )
      `);

      // 4. Tombstone records for known stale URLs
      const staleUrls = [
        { url: "https://paragraph.com/@blurdao/season-2-rewards-loyalty", title: "[archived] Blur Season 2 Rewards" },
        { url: "https://paragraph.com/@blurdao/season-3-rewards-loyalty", title: "[archived] Blur Season 3 Rewards" },
        { url: "https://paragraph.com/@blurdao/season-4-rewards-loyalty", title: "[archived] Blur Season 4 Rewards" },
      ];
      for (const { url, title } of staleUrls) {
        await db.execute(sql`
          INSERT INTO posts (title, content, section, author_wallet, author_name, author_type,
                             source_url, ai_confidence, importance, expires_at,
                             views, likes, comments, kol_like_points, kol_comment_points,
                             is_pinned, pin_queued)
          SELECT ${title}, '', 'quest',
                 '0x0000000000000000000000000000000000000000', 'AI System', 'ai',
                 ${url}, 0.0, 'low', ${nowMs - 86400000},
                 0, 0, 0, 0, 0, 0, 0
          WHERE NOT EXISTS (SELECT 1 FROM posts WHERE source_url = ${url})
        `);
      }
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_visit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        ip_address TEXT,
        visited_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        duration_minutes INTEGER
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_visit_logs_visited_at ON user_visit_logs(visited_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_visit_logs_wallet ON user_visit_logs(wallet)`);
    await safeAddCol("user_visit_logs", "duration_minutes", "INTEGER");

    console.log("[db] ensureTables: OK");
  } catch (e) {
    console.error("[db] ensureTables error:", e);
  }
}

ensureTables();
ensureTursoPostsTable();
initDeepSeekDailyBudget();

// ── Onchain data scrapers (route B: scrape + DeepSeek extract) ───────────────
// Refreshes /api/onchain/{etf,launch,whales} cache on a slow schedule.
// First run 3 min after boot, then every 6h. Each kind staggered 60s apart to avoid burst.
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_ONCHAIN_SCRAPE !== "true") {
  const KINDS = ["etf", "launch"] as const;
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  const tickOnchain = async (kind: typeof KINDS[number]) => {
    try {
      // Multi-instance safety: only one replica runs the paid scrape per tick.
      const instanceId = getCronInstanceId();
      if (!(await tryClaimCronLeaderLease(instanceId))) {
        console.log(`[cron:onchain:${kind}] not leader — skipping`);
        return;
      }
      const { ensureOnchainCacheTable, runOnchainScrapeGuarded } = await import("./lib/onchain-scrapers");
      await ensureOnchainCacheTable();
      console.log(`[cron:onchain:${kind}] starting scrape`);
      const out = await runOnchainScrapeGuarded(kind);
      console.log(`[cron:onchain:${kind}] result:`, out);
    } catch (e) {
      console.error(`[cron:onchain:${kind}] error:`, e);
    }
  };

  KINDS.forEach((k, i) => {
    const initialDelay = (3 * 60 + i * 60) * 1000; // boot + 3,4,5 min
    setTimeout(() => { void tickOnchain(k); }, initialDelay);
    setInterval(() => { void tickOnchain(k); }, SIX_HOURS_MS);
  });
  console.log(`[cron:onchain] scheduler ready — every 6h for ${KINDS.join(", ")} (DeepSeek extraction)`);
}

// ── Scrape scheduler ──────────────────────────────────────────────────────────
//
//  v2.0_migrated_2026 unified cron
//    - Exactly 11× Groq + 1× DeepSeek instances are allowed to scrape/publish.
//    - No plate-specific scrapers. A single unified flow runs on a fixed cadence.
//    - Keyword source: DB scrape_keywords (enabled=true) → DEFAULT_KEYWORDS fallback.
//
//  Set DISABLE_SCRAPE_CRON=true in dev to reserve all quota for prod.
//
//  DB leader lease: only ONE instance runs each scrape, but EVERY instance registers the same
//  timers. Before each tick we atomically try to claim/refresh the lease. This fixes:
//  - Non-leader replicas never running cron after boot
//  - Leader process dying while heartbeat row still "fresh" (no scrape until redeploy)
//
//  Env: CRON_LEADER_STALE_MS (default 300000 = 5 min) — if heartbeat older than this, another
//  instance may steal the lease. CRON_LEADER_HEARTBEAT_MS (default 60000) — renew interval.
//
async function ensureCronLeaderTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cron_leader (
      id INTEGER PRIMARY KEY DEFAULT 1,
      instance_id TEXT NOT NULL,
      heartbeat INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
}

function getCronInstanceId(): string {
  const host = process.env.HOSTNAME ?? process.env.COMPUTERNAME ?? "host";
  return `${host}-pid${process.pid}-port${process.env.PORT ?? "?"}`;
}

/** Atomically become leader if lease is stale OR we already hold it. Returns true if this instance holds the lease. */
async function tryClaimCronLeaderLease(instanceId: string): Promise<boolean> {
  try {
    await ensureCronLeaderTable();
    const staleEnv = Number(process.env.CRON_LEADER_STALE_MS);
    const staleMs = Number.isFinite(staleEnv) && staleEnv > 30_000 ? staleEnv : 300_000;

    const nowMs = Date.now();
    const staleThreshold = nowMs - staleMs;

    const res = await db.execute(sql`
      INSERT INTO cron_leader (id, instance_id, heartbeat) VALUES (1, ${instanceId}, ${nowMs})
      ON CONFLICT (id) DO UPDATE SET
        instance_id = ${instanceId},
        heartbeat = ${nowMs}
      WHERE
        cron_leader.heartbeat < ${staleThreshold}
        OR cron_leader.instance_id = ${instanceId}
      RETURNING instance_id
    `);
    const rows = (res as { rows?: { instance_id: string }[] }).rows;
    if (rows?.length) return String(rows[0]!.instance_id) === instanceId;

    const sel = await db.execute(sql`SELECT instance_id FROM cron_leader WHERE id = 1`);
    const holder = (sel as { rows?: { instance_id: string }[] }).rows?.[0]?.instance_id;
    return String(holder) === instanceId;
  } catch (e) {
    console.warn("[cron-leader] tryClaimCronLeaderLease failed; allowing tick to run:", e);
    return true;
  }
}

// ── v2.0_migrated_2026: Unified cron scheduler ───────────────────────────────
//
//  Two independent cycles replacing all old plate-specific scrapers:
//
//  [Groq cycle]     Every 30 min (48 runs/day)
//                   freeOnly=true — uses Groq1..Groq11 (11 instances)
//                   Uses the system keyword list (DB scrape_keywords → DEFAULT_KEYWORDS).
//
//  [DeepSeek cycle] Every 60 min (24 runs/day)
//                   paidOnly=true — uses DeepSeek exclusively (never mixed into Groq cron)
//                   Blocked only by app-side UTC hourly USD cap (DEEPSEEK_HOURLY_BUDGET_USD; 0=unlimited); no 24h total cap.
//
//  Both cycles use ALL combined keywords → AI classify →
//  dual-publish to matched section(s) + 7×24快讯
//
//  DB lease: each tick tries to claim; only the holder runs scrape (others skip silently).
//
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_SCRAPE_CRON !== "true") {
  const instanceId = getCronInstanceId();
  const hbEnv = Number(process.env.CRON_LEADER_HEARTBEAT_MS);
  const heartbeatMs = Number.isFinite(hbEnv) && hbEnv >= 10_000 ? hbEnv : 60_000;

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const parseMinEnv = (key: string, def: number, lo: number, hi: number): number => {
    const v = Number(process.env[key]);
    if (!Number.isFinite(v) || v <= 0) return def;
    return clamp(Math.round(v), lo, hi);
  };

  const groqIntervalMin = parseMinEnv("SCRAPE_GROQ_INTERVAL_MIN", 20, 5, 180);
  const dsIntervalMin   = parseMinEnv("SCRAPE_DEEPSEEK_INTERVAL_MIN", 60, 10, 360);
  const GROQ_INTERVAL_MS = groqIntervalMin * 60 * 1000;
  const DS_INTERVAL_MS   = dsIntervalMin * 60 * 1000;

  let groqRunCount = 0;
  let dsRunCount = 0;

  // Renew lease while this process holds it (long scrapes can exceed one tick interval).
  setInterval(() => {
    void db.execute(sql`UPDATE cron_leader SET heartbeat = ${Date.now()} WHERE id = 1 AND instance_id = ${instanceId}`).catch(() => {});
  }, heartbeatMs);

  const tickGroq = async () => {
    if (!(await tryClaimCronLeaderLease(instanceId))) return;
    const { areFreeProvidersDailyExhausted } = await import("./lib/ai-provider");
    if (areFreeProvidersDailyExhausted()) {
      console.log("[cron:groq] Skipped — all free Groq providers daily exhausted (DeepSeek cycle may still run)");
      return;
    }
    const { runUnifiedScrape, SCRAPE_CONFIG, isGroqScrapeRunning } = await import("./lib/auto-scraper");
    if (isGroqScrapeRunning()) {
      console.warn("[cron:groq] Skipped tick — Groq scrape still running");
      return;
    }
    groqRunCount++;
    console.log(`[cron:groq] Run #${groqRunCount} (${instanceId}) — freeOnly, all keywords, dual-publish`);
    try {
      const result = await runUnifiedScrape({
        freeOnly:          true,
        maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerGroqRun,
      });
      console.log(`[cron:groq] Done — saved: ${result.totalItemsSaved}, found: ${result.totalItemsFound}`);
    } catch (e) {
      console.error("[cron:groq] Error:", e);
    }
  };

  const tickDeepSeek = async () => {
    if (!(await tryClaimCronLeaderLease(instanceId))) return;
    const { runUnifiedScrape, SCRAPE_CONFIG, isDeepSeekScrapeRunning } = await import("./lib/auto-scraper");
    if (isDeepSeekScrapeRunning()) {
      console.warn("[cron:deepseek] Skipped tick — DeepSeek scrape still running");
      return;
    }
    dsRunCount++;
    console.log(`[cron:deepseek] Run #${dsRunCount} (${instanceId}) — paidOnly, all keywords, dual-publish`);
    try {
      const result = await runUnifiedScrape({
        paidOnly:          true,
        maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerDeepSeekRun,
      });
      console.log(`[cron:deepseek] Done — saved: ${result.totalItemsSaved}, found: ${result.totalItemsFound}`);
    } catch (e) {
      console.error("[cron:deepseek] Error:", e);
    }
  };

  setTimeout(() => { void tickGroq(); }, 5 * 1000);
  setInterval(() => { void tickGroq(); }, GROQ_INTERVAL_MS);

  setTimeout(() => { void tickDeepSeek(); }, 90 * 1000);
  setInterval(() => { void tickDeepSeek(); }, DS_INTERVAL_MS);

  console.log(
    `[cron] unified scheduler started instance=${instanceId} — ` +
    `Groq every ${groqIntervalMin}min + DeepSeek every ${dsIntervalMin}min (lease per tick, heartbeat ${heartbeatMs}ms). ` +
    "Keyword source: DB scrape_keywords → DEFAULT_KEYWORDS."
  );

} else if (process.env.DISABLE_SCRAPE_CRON === "true") {
  console.log("[cron] DISABLE_SCRAPE_CRON=true — scraper disabled, all API quota reserved for production");
}

// Periodic stale check (independent of user traffic hitting /api/feed).
// This complements the built-in cron: if cron sleeps, DB insert pipeline stalls, or scrapes save 0,
// we still attempt recovery on a predictable cadence.
if (process.env.NODE_ENV !== "test") {
  const timerMin = Number(process.env.STALE_KICK_TIMER_MIN ?? "10");
  const ms = Number.isFinite(timerMin) && timerMin >= 1 ? Math.round(timerMin) * 60 * 1000 : 10 * 60 * 1000;
  setInterval(() => {
    void maybeKickStaleUnifiedScrape("timer");
  }, ms);
  console.log(`[stale-kick] timer enabled every ${Math.round(ms / 60000)}min`);
}

// ── Daily cleanup — keep Neon free tier within limits ────────────────────────
// Strategy: delete AI posts older than CLEANUP_RETAIN_DAYS (default 45).
// If total still exceeds CLEANUP_MAX_ROWS (default 80000), drop oldest excess.
// Runs once at startup (after 2 min delay) then every 24 h.
if (process.env.NODE_ENV !== "test") {
  const RETAIN_DAYS = Math.max(7, Number(process.env.CLEANUP_RETAIN_DAYS ?? "45"));
  const MAX_ROWS    = Math.max(1000, Number(process.env.CLEANUP_MAX_ROWS ?? "80000"));

  const runDailyCleanup = async () => {
    try {
      // 1. Delete articles older than RETAIN_DAYS
      const cutoffMs = Date.now() - RETAIN_DAYS * 86400 * 1000;
      const byAge = await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND created_at < ${cutoffMs}
      `);
      const deletedByAge = (byAge as unknown as { rowsAffected?: number }).rowsAffected ?? 0;

      // 2. If still over MAX_ROWS, delete oldest excess
      const countRes = await db.execute(sql`SELECT COUNT(*) AS cnt FROM posts WHERE author_type = 'ai'`);
      const total = Number((countRes.rows[0] as { cnt: string | number }).cnt);
      let deletedByCount = 0;
      if (total > MAX_ROWS) {
        const excess = total - MAX_ROWS;
        const byCount = await db.execute(sql`
          DELETE FROM posts
          WHERE id IN (
            SELECT id FROM posts
            WHERE author_type = 'ai'
            ORDER BY created_at ASC
            LIMIT ${excess}
          )
        `);
        deletedByCount = (byCount as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
      }

      const remaining = total - deletedByCount;
      console.log(
        `[cleanup] done — age: -${deletedByAge}, overflow: -${deletedByCount}, ` +
        `remaining: ~${remaining} (retain=${RETAIN_DAYS}d, cap=${MAX_ROWS})`
      );
    } catch (e) {
      console.error("[cleanup] error:", e);
    }
  };

  setTimeout(() => { void runDailyCleanup(); }, 2 * 60 * 1000);            // 2 min after boot
  setInterval(() => { void runDailyCleanup(); }, 24 * 60 * 60 * 1000);    // then every 24 h
  console.log(`[cleanup] scheduler ready — retain ${RETAIN_DAYS} days, cap ${MAX_ROWS} rows`);
}

// In production, serve the built frontend SPA
if (process.env.NODE_ENV === "production") {
  const publicPath = path.resolve(process.cwd(), "artifacts/web3hub/dist/public");
  // Hashed assets (JS/CSS/images) — cache aggressively; filename changes on every build
  app.use(express.static(publicPath, { maxAge: "1y", immutable: true }));
  // SPA fallback — always return the freshest index.html, never cache it
  app.use((_req, res) => {
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

export default app;
