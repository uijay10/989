import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import router from "./routes";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { DEFAULT_KEYWORDS } from "./lib/auto-scraper";
import { initDeepSeekDailyBudget } from "./lib/ai-provider";

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
  try {
    const r = await db.execute(sql`
      SELECT created_at
      FROM posts
      WHERE author_type = 'ai'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const last = (r as { rows?: Array<{ created_at?: string | Date }> }).rows?.[0]?.created_at;
    return last ? new Date(last) : null;
  } catch {
    return null;
  }
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
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        wallet TEXT NOT NULL,
        author_name TEXT,
        author_avatar TEXT,
        content TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        reply_to INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS likes INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS reply_to INTEGER`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS comment_likes (
        id SERIAL PRIMARY KEY,
        comment_id INTEGER NOT NULL,
        wallet TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(comment_id, wallet)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient_wallet TEXT NOT NULL,
        type TEXT NOT NULL,
        from_wallet TEXT,
        from_name TEXT,
        post_id INTEGER,
        post_title TEXT,
        is_read BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS post_section TEXT`);
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url TEXT`);
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_confidence REAL`);
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS importance TEXT`);
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_start_time TIMESTAMP`);
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_end_time TIMESTAMP`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_sources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'rss',
        priority INTEGER NOT NULL DEFAULT 2,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_keywords (
        id SERIAL PRIMARY KEY,
        keyword TEXT NOT NULL UNIQUE,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_logs (
        id SERIAL PRIMARY KEY,
        run_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        status TEXT NOT NULL,
        items_found INTEGER NOT NULL DEFAULT 0,
        items_saved INTEGER NOT NULL DEFAULT 0,
        error_msg TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scrape_logs_run_id ON scrape_logs(run_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scrape_logs_created_at ON scrape_logs(created_at DESC)`);

    // Enable pg_trgm for fuzzy title similarity in the dedup guards.
    // Extension creation is idempotent and is NOT tracked as a schema diff by the migration tool.
    // Note: we intentionally do NOT create a GIN index here — indexes created outside of the
    // ORM schema trigger deployment migration failures. The similarity() queries work fine
    // without an index at our current data volume.
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    } catch (extErr) {
      console.warn("[db] pg_trgm extension not available on this database — fuzzy dedup disabled:", extErr instanceof Error ? extErr.message : extErr);
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread',
        reply TEXT,
        replied_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Remove duplicate AI posts: keep only the most recent per (section, normalized title)
    await db.execute(sql`
      DELETE FROM posts
      WHERE author_type = 'ai'
        AND id NOT IN (
          SELECT DISTINCT ON (section, LOWER(TRIM(title))) id
          FROM posts
          WHERE author_type = 'ai'
          ORDER BY section, LOWER(TRIM(title)), created_at DESC
        )
    `);

    // Sync DEFAULT_KEYWORDS — insert any new keywords not yet in DB
    for (const kw of DEFAULT_KEYWORDS) {
      await db.execute(sql`
        INSERT INTO scrape_keywords (keyword, enabled)
        VALUES (${kw}, true)
        ON CONFLICT (keyword) DO NOTHING
      `);
    }

    // ── Startup cleanup: remove stale AI-scraped articles ─────────────────────
    // IMPORTANT: This is destructive (DELETE FROM posts). To avoid "articles
    // occasionally disappearing" after a restart, this cleanup is opt-in.
    // Enable only when you explicitly intend to purge historical AI posts.
    const enableStartupCleanup = process.env.ENABLE_STARTUP_AI_POST_CLEANUP === "true";
    if (enableStartupCleanup) {
      console.warn("[startup-cleanup] ENABLE_STARTUP_AI_POST_CLEANUP=true — destructive cleanup enabled");

      // 1. event_end_time already passed (event is over)
      await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND title NOT LIKE '[archived]%'
          AND event_end_time IS NOT NULL
          AND event_end_time < NOW() - INTERVAL '1 day'
          AND expires_at > NOW()
      `);

      // 2. event_start_time exceeds per-section limits
      await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND title NOT LIKE '[archived]%'
          AND expires_at > NOW()
          AND event_start_time IS NOT NULL
          AND (
            (section IN ('quest','airdrop') AND event_start_time < NOW() - INTERVAL '7 days') OR
            (section IN ('ido','testnet','nodes','devbounty','funding') AND event_start_time < NOW() - INTERVAL '30 days') OR
            (section = 'grant'    AND event_start_time < NOW() - INTERVAL '60 days') OR
            (section IN ('industry','policy') AND event_start_time < NOW() - INTERVAL '21 days') OR
            (section IN ('724news','flash','meme') AND event_start_time < NOW() - INTERVAL '14 days')
          )
      `);

      // 2b. Fuzzy title duplicates — same section, within 7 days, similarity > 0.72
      //     Keep the earliest published article (lowest id); delete later near-duplicates.
      try {
        await db.execute(sql`
          DELETE FROM posts
          WHERE author_type = 'ai'
            AND title NOT LIKE '[archived]%'
            AND expires_at > NOW()
            AND id IN (
              SELECT DISTINCT b.id
              FROM posts a
              JOIN posts b ON a.section = b.section
                AND a.id < b.id
                AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) < 604800
                AND similarity(LOWER(a.title), LOWER(b.title)) > 0.72
              WHERE a.expires_at > NOW()
                AND b.expires_at > NOW()
                AND a.title NOT LIKE '[archived]%'
                AND b.title NOT LIKE '[archived]%'
            )
        `);
      } catch {
        // pg_trgm may not be ready yet on first boot — skip gracefully
      }

      // 3. URL contains an old year (/2024/ or earlier) for non-quest/airdrop sections
      await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND title NOT LIKE '[archived]%'
          AND expires_at > NOW()
          AND section NOT IN ('quest','airdrop')
          AND (
            source_url ~ '/201[0-9]/'
            OR source_url ~ '/2020/'
            OR source_url ~ '/2021/'
            OR source_url ~ '/2022/'
            OR source_url ~ '/2023/'
            OR source_url ~ '/2024/'
            OR source_url ~ '/2025/(0[1-9]|1[0-1])/'
          )
      `);

      // 4. Ensure tombstone records exist for known permanently-stale paragraph.com URLs.
      //    These keep the source_url guard working even after manual deletions.
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
                 ${url}, 0.0, 'low', NOW() - INTERVAL '1 day',
                 0, 0, 0, 0, 0, false, false
          WHERE NOT EXISTS (SELECT 1 FROM posts WHERE source_url = ${url})
        `);
      }
    }

    console.log("[db] ensureTables: OK");
  } catch (e) {
    console.error("[db] ensureTables error:", e);
  }
}

ensureTables();
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
      heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

    const res = await db.execute(sql`
      INSERT INTO cron_leader (id, instance_id, heartbeat) VALUES (1, ${instanceId}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        instance_id = ${instanceId},
        heartbeat = NOW()
      WHERE
        cron_leader.heartbeat < NOW() - (${String(Math.floor(staleMs))}::bigint * INTERVAL '1 millisecond')
        OR cron_leader.instance_id = ${instanceId}
      RETURNING instance_id
    `);
    const rows = (res as { rows?: { instance_id: string }[] }).rows;
    if (rows?.length) return rows[0]!.instance_id === instanceId;

    const sel = await db.execute(sql`SELECT instance_id FROM cron_leader WHERE id = 1`);
    const holder = (sel as { rows?: { instance_id: string }[] }).rows?.[0]?.instance_id;
    return holder === instanceId;
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
    void db.execute(sql`UPDATE cron_leader SET heartbeat = NOW() WHERE id = 1 AND instance_id = ${instanceId}`).catch(() => {});
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
      const byAge = await db.execute(sql`
        DELETE FROM posts
        WHERE author_type = 'ai'
          AND created_at < NOW() - (${String(RETAIN_DAYS)}::int * INTERVAL '1 day')
      `);
      const deletedByAge = (byAge as unknown as { rowCount?: number }).rowCount ?? 0;

      // 2. If still over MAX_ROWS, delete oldest excess
      const countRes = await db.execute(sql`SELECT COUNT(*) AS cnt FROM posts WHERE author_type = 'ai'`);
      const total = Number((countRes.rows[0] as { cnt: string }).cnt);
      let deletedByCount = 0;
      if (total > MAX_ROWS) {
        const excess = total - MAX_ROWS;
        const byCount = await db.execute(sql`
          DELETE FROM posts
          WHERE id IN (
            SELECT id FROM posts
            WHERE author_type = 'ai'
            ORDER BY created_at ASC
            LIMIT ${String(excess)}
          )
        `);
        deletedByCount = (byCount as unknown as { rowCount?: number }).rowCount ?? 0;
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
  app.use(express.static(publicPath));
  app.use((_req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

export default app;
