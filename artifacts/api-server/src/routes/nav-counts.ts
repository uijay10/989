import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { classifyChainExchangeTags } from "../lib/tag-classifier";

const router: IRouter = Router();

type NavCountsResponse = {
  generatedAt: string;
  ttlSeconds: number;
  sections: Record<string, number>;
  chains: Record<string, number>;
  exchanges: Record<string, number>;
};

// In-memory cache per process (good enough for navbar).
const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache: { at: number; data: NavCountsResponse } | null = null;

const NAV_SECTIONS = [
  "724news",
  "ido",
  "funding",
  "vc",
  "quest",
  "policy",
  "testnet",
  "nodes",
  "recruiting",
  "devbounty",
  "grant",
] as const;

const CHAIN_NAMES = ["Ethereum", "Solana", "BNB Chain", "Arbitrum", "Base", "Optimism", "Sui", "Aptos"] as const;
const EXCHANGE_NAMES = ["Binance", "OKX", "Bybit", "Coinbase", "Kraken"] as const;

router.get("/nav-counts", async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  const now = Date.now();
  if (_cache && (now - _cache.at) < CACHE_TTL_MS) {
    res.json(_cache.data);
    return;
  }

  // Section counts: exact DB counts (AI posts only).
  const sectionRows = await db.execute(sql`
    SELECT section, COUNT(*)::int AS c
    FROM posts
    WHERE author_type = 'ai'
      AND section = ANY(ARRAY[${sql.join(NAV_SECTIONS.map((s) => sql`${s}`), sql`, `)}]::text[])
    GROUP BY section
  `);
  const sections: Record<string, number> = Object.fromEntries(NAV_SECTIONS.map((s) => [s, 0]));
  for (const r of (sectionRows.rows as Array<{ section: string; c: number }>)) {
    sections[String(r.section)] = Number(r.c ?? 0);
  }

  // Ecosystem counts (chain/exchange): scan latest N AI posts and classify.
  // This avoids relying on DB tag columns which may not be backfilled.
  const HARD_SCAN_CAP = 5000;
  const scan = await db
    .select({
      title: postsTable.title,
      content: postsTable.content,
    })
    .from(postsTable)
    .where(sql`${postsTable.authorType} = 'ai'`)
    .orderBy(desc(postsTable.createdAt))
    .limit(HARD_SCAN_CAP);

  const chains: Record<string, number> = Object.fromEntries(CHAIN_NAMES.map((c) => [c, 0]));
  const exchanges: Record<string, number> = Object.fromEntries(EXCHANGE_NAMES.map((e) => [e, 0]));

  for (const row of scan) {
    const tags = classifyChainExchangeTags({ title: row.title ?? "", description: row.content ?? "" });
    for (const c of tags.chainTags) {
      chains[String(c)] = (chains[String(c)] ?? 0) + 1;
    }
    for (const e of tags.exchangeTags) {
      exchanges[String(e)] = (exchanges[String(e)] ?? 0) + 1;
    }
  }

  const data: NavCountsResponse = {
    generatedAt: new Date().toISOString(),
    ttlSeconds: Math.round(CACHE_TTL_MS / 1000),
    sections,
    chains,
    exchanges,
  };
  _cache = { at: now, data };
  res.json(data);
});

export default router;

