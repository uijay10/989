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
    // Runs on every startup (including production) to purge articles that
    // pre-date our filtering rules or slipped through before the guards existed.
    // All DELETEs are idempotent — safe to run repeatedly.

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

    console.log("[db] ensureTables: OK");
  } catch (e) {
    console.error("[db] ensureTables error:", e);
  }
}

ensureTables();
initDeepSeekDailyBudget();

// ── Scrape scheduler ──────────────────────────────────────────────────────────
//
//  v2.0_migrated_2026 unified cron
//    - Exactly 11× Groq + 1× DeepSeek instances are allowed to scrape/publish.
//    - No plate-specific scrapers. A single unified flow runs on a fixed cadence.
//    - Keyword source: DB scrape_keywords (enabled=true) → DEFAULT_KEYWORDS fallback.
//
//  Set DISABLE_SCRAPE_CRON=true in dev to reserve all quota for prod.
//
//  DB leader lock: only ONE instance across all running servers runs cron.
//  The first instance to start claims the lock; others skip cron entirely.
//
async function acquireCronLeader(): Promise<boolean> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cron_leader (
        id INTEGER PRIMARY KEY DEFAULT 1,
        instance_id TEXT NOT NULL,
        heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const instanceId = `pid-${process.pid}-port-${process.env.PORT ?? "?"}`;
    // Try to insert; if row exists AND heartbeat is fresh (< 5 min), we are NOT the leader
    const rows = await db.execute(sql`
      SELECT instance_id, heartbeat FROM cron_leader WHERE id = 1
    `);
    const existing = (rows as any).rows?.[0];
    if (existing) {
      const ageMs = Date.now() - new Date(existing.heartbeat).getTime();
      if (ageMs < 5 * 60 * 1000) {
        console.log(`[cron-leader] Instance ${existing.instance_id} holds the lock (${Math.round(ageMs/1000)}s old). Skipping cron on this instance.`);
        return false;
      }
      // Stale lock — take over
      await db.execute(sql`
        UPDATE cron_leader SET instance_id = ${instanceId}, heartbeat = NOW() WHERE id = 1
      `);
    } else {
      await db.execute(sql`
        INSERT INTO cron_leader (id, instance_id, heartbeat) VALUES (1, ${instanceId}, NOW())
        ON CONFLICT (id) DO UPDATE SET instance_id = ${instanceId}, heartbeat = NOW()
        WHERE cron_leader.heartbeat < NOW() - INTERVAL '5 minutes'
      `);
      // Verify we actually won
      const verify = await db.execute(sql`SELECT instance_id FROM cron_leader WHERE id = 1`);
      const winner = (verify as any).rows?.[0]?.instance_id;
      if (winner !== instanceId) {
        console.log(`[cron-leader] Lost lock race to ${winner}. Skipping cron on this instance.`);
        return false;
      }
    }
    console.log(`[cron-leader] Lock acquired by ${instanceId}. This instance will run cron.`);
    // Heartbeat every 2 minutes
    setInterval(async () => {
      await db.execute(sql`UPDATE cron_leader SET heartbeat = NOW() WHERE id = 1 AND instance_id = ${instanceId}`).catch(() => {});
    }, 2 * 60 * 1000);
    return true;
  } catch (e) {
    // If lock mechanism fails (e.g. DB error), allow cron to run to avoid outage
    console.warn("[cron-leader] Lock check failed, allowing cron anyway:", e);
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
//                   paidOnly=true — uses DeepSeek exclusively
//                   Hourly budget cap: $0.50/24 = ~$0.020833/hour
//                   Skips run automatically when hourly cap is reached
//
//  Both cycles use ALL combined keywords → AI classify →
//  dual-publish to matched section(s) + 7×24快讯
//
//  DB leader lock ensures only ONE server instance runs the cron.
//
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_SCRAPE_CRON !== "true") {
  acquireCronLeader().then(isLeader => {
    if (!isLeader) return;

    const GROQ_INTERVAL_MS = 30 * 60 * 1000;   // 30 min
    const DS_INTERVAL_MS   = 60 * 60 * 1000;   // 60 min

    let groqRunCount = 0;

    // ── Groq cycle (every 30 min, freeOnly) ─────────────────────────────────
    const runGroqCycle = async () => {
      const { runUnifiedScrape, SCRAPE_CONFIG } = await import("./lib/auto-scraper");
      groqRunCount++;
      console.log(`[cron:groq] Run #${groqRunCount} — freeOnly, all keywords, dual-publish`);
      try {
        const result = await runUnifiedScrape({
          freeOnly:          true,
          maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerGroqRun,
        });
        console.log(`[cron:groq] Done — saved: ${result.totalItemsSaved}, found: ${result.totalItemsFound}`);
      } catch (e) {
        console.error("[cron:groq] Error:", e);
      }
      setTimeout(runGroqCycle, GROQ_INTERVAL_MS);
    };

    // ── DeepSeek cycle (every 60 min, paidOnly, hourly budget $0.020833) ────
    const runDeepSeekCycle = async () => {
      const { runUnifiedScrape, SCRAPE_CONFIG } = await import("./lib/auto-scraper");
      console.log("[cron:deepseek] Run — paidOnly, all keywords, dual-publish, hourly budget cap");
      try {
        const result = await runUnifiedScrape({
          paidOnly:          true,
          maxArticlesPerRun: SCRAPE_CONFIG.maxArticlesPerDeepSeekRun,
        });
        console.log(`[cron:deepseek] Done — saved: ${result.totalItemsSaved}, found: ${result.totalItemsFound}`);
      } catch (e) {
        console.error("[cron:deepseek] Error:", e);
      }
      setTimeout(runDeepSeekCycle, DS_INTERVAL_MS);
    };

    // Groq: start 5 s after boot (allow DB init to complete)
    setTimeout(runGroqCycle, 5 * 1000);
    // DeepSeek: start 90 s after boot (offset to avoid simultaneous first run)
    setTimeout(runDeepSeekCycle, 90 * 1000);

    console.log(
      "[cron] v2.0_migrated_2026 unified scheduler started — " +
      "Groq every 30min (11 keys, freeOnly) + DeepSeek every 60min (paidOnly, $0.020833/h cap). " +
      "Keyword source: DB scrape_keywords → DEFAULT_KEYWORDS. " +
      "All articles dual-published to matched section + 7×24快讯."
    );

  }).catch(e => { console.error("[cron-leader] Unexpected error:", e); });

} else if (process.env.DISABLE_SCRAPE_CRON === "true") {
  console.log("[cron] DISABLE_SCRAPE_CRON=true — scraper disabled, all API quota reserved for production");
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
