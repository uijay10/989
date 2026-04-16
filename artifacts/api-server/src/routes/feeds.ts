import { Router } from "express";
import { fetchMemeTokens, fetchIdoTokens, fetchTrendingCoins } from "../lib/external-feeds";
import { db, postsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import Parser from "rss-parser";

const router = Router();
const rssParser = new Parser();

router.get("/meme", async (_req, res) => {
  try {
    const data = await fetchMemeTokens();
    res.json({ ok: true, tokens: data });
  } catch (e) {
    console.error("[feeds/meme]", e);
    res.json({ ok: false, tokens: [] });
  }
});

router.get("/ido", async (_req, res) => {
  try {
    const data = await fetchIdoTokens();
    res.json({ ok: true, tokens: data });
  } catch (e) {
    console.error("[feeds/ido]", e);
    res.json({ ok: false, tokens: [] });
  }
});

router.get("/trending", async (_req, res) => {
  try {
    const data = await fetchTrendingCoins();
    res.json({ ok: true, tokens: data });
  } catch (e) {
    console.error("[feeds/trending]", e);
    res.json({ ok: false, tokens: [] });
  }
});

async function dbPostsBySection(section: string, limit = 20) {
  return db
    .select({
      id: postsTable.id,
      title: postsTable.title,
      content: postsTable.content,
      sourceUrl: postsTable.sourceUrl,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .where(eq(postsTable.section, section))
    .orderBy(desc(postsTable.createdAt))
    .limit(limit);
}

router.get("/airdrops", async (_req, res) => {
  try {
    const items = await dbPostsBySection("airdrop");
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/airdrops]", e);
    res.json({ ok: false, items: [] });
  }
});

router.get("/unlocks", async (_req, res) => {
  try {
    const items = await dbPostsBySection("unlock");
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/unlocks]", e);
    res.json({ ok: false, items: [] });
  }
});

router.get("/industry", async (_req, res) => {
  try {
    const items = await dbPostsBySection("industry");
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/industry]", e);
    res.json({ ok: false, items: [] });
  }
});

router.get("/policy", async (_req, res) => {
  try {
    const items = await dbPostsBySection("policy");
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/policy]", e);
    res.json({ ok: false, items: [] });
  }
});

router.get("/funding", async (_req, res) => {
  try {
    const items = await dbPostsBySection("funding");
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/funding]", e);
    res.json({ ok: false, items: [] });
  }
});

let grantsCache: { data: unknown[]; expiresAt: number } | null = null;

router.get("/grants", async (_req, res) => {
  try {
    if (grantsCache && Date.now() < grantsCache.expiresAt) {
      return res.json({ ok: true, items: grantsCache.data });
    }

    const commRes = await fetch(
      "https://gapapi.karmahq.xyz/v2/communities?limit=12",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(10000) }
    );
    const commRaw = await commRes.json() as { payload?: Array<{ uid: string; details?: { name?: string; slug?: string; logoUrl?: string } }> } | Array<{ uid: string; details?: { name?: string; slug?: string; logoUrl?: string } }>;
    const communities = Array.isArray(commRaw) ? commRaw : ((commRaw as { payload?: unknown[] }).payload ?? []) as Array<{ uid: string; details?: { name?: string; slug?: string; logoUrl?: string } }>;

    const allGrants: unknown[] = [];
    await Promise.allSettled(
      communities.slice(0, 8).map(async (c) => {
        const slug = c.details?.slug;
        if (!slug) return;
        try {
          const gRes = await fetch(
            `https://gapapi.karmahq.xyz/v2/communities/${slug}/grants?limit=4`,
            { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
          );
          if (!gRes.ok) return;
          const raw = await gRes.json();
          const grants = (Array.isArray(raw) ? raw : (raw as { data?: unknown[] }).data ?? []) as Array<{ uid: string; title?: string; description?: string }>;
          grants.slice(0, 4).forEach(g => allGrants.push({
            uid: g.uid,
            title: g.title,
            description: g.description,
            community: c.details?.name ?? slug,
            communityLogo: c.details?.logoUrl,
            link: `https://gap.karmahq.xyz/project/${g.uid}`,
          }));
        } catch {
        }
      })
    );

    grantsCache = { data: allGrants, expiresAt: Date.now() + 10 * 60 * 1000 };
    res.json({ ok: true, items: allGrants });
  } catch (e) {
    console.error("[feeds/grants]", e);
    res.json({ ok: false, items: [] });
  }
});

let bugbountyCache: { data: unknown[]; expiresAt: number } | null = null;

router.get("/bugbounty", async (_req, res) => {
  try {
    if (bugbountyCache && Date.now() < bugbountyCache.expiresAt) {
      return res.json({ ok: true, items: bugbountyCache.data });
    }
    const r = await fetch(
      "https://raw.githubusercontent.com/infosec-us-team/Immunefi-Bug-Bounty-Programs-Unofficial/main/projects.json",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(12000) }
    );
    const raw = await r.json() as Array<{ id?: string; project?: string; name?: string; slug?: string; maxBounty?: string; totalPaid?: string; chains?: string[] }>;
    const items = (Array.isArray(raw) ? raw : []).slice(0, 20).map(b => ({
      id: b.id ?? b.slug ?? b.name,
      name: b.project ?? b.name ?? "未知项目",
      slug: b.slug ?? b.id ?? "",
      maxBounty: b.maxBounty,
      totalPaid: b.totalPaid,
      chains: b.chains ?? [],
    }));
    bugbountyCache = { data: items, expiresAt: Date.now() + 10 * 60 * 1000 };
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/bugbounty]", e);
    res.json({ ok: false, items: [] });
  }
});

router.get("/quest", async (_req, res) => {
  try {
    const items = await dbPostsBySection("quest");
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/quest]", e);
    res.json({ ok: false, items: [] });
  }
});

let recruitingCache: { data: unknown[]; expiresAt: number } | null = null;

router.get("/recruiting", async (_req, res) => {
  try {
    if (recruitingCache && Date.now() < recruitingCache.expiresAt) {
      return res.json({ ok: true, items: recruitingCache.data });
    }
    const feed = await rssParser.parseURL("https://api.cryptojobslist.com/rss/web3.xml");
    const items = feed.items.slice(0, 12).map(item => ({
      title: item.title ?? "职位",
      company: item.creator ?? "未知团队",
      link: item.link ?? "https://cryptojobslist.com",
      pubDate: item.pubDate ?? "",
      salary: item.content?.match(/\$[\d,]+/g)?.[0] ?? "—",
    }));
    recruitingCache = { data: items, expiresAt: Date.now() + 15 * 60 * 1000 };
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[feeds/recruiting]", e);
    res.json({ ok: false, items: [] });
  }
});

export default router;
