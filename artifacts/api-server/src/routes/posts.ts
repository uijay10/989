import { Router, type IRouter } from "express";
import { db, postsTable, usersTable, commentsTable, commentLikesTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, gte, or, ilike, inArray } from "drizzle-orm";
import { checkContent, filterErrorMessage } from "../content-filter";
import { awardInviterBonus } from "../lib/invite-bonus";
import { classifyChainExchangeTags } from "../lib/tag-classifier";

const router: IRouter = Router();

const PIN_SLOTS = 14; // max simultaneous pinned posts on homepage

const SECTION_SLUG_TO_ZH: Record<string, string> = {
  ido: "IDO/Launchpad",
  funding: "融资公告",
  quest: "链上奖励/空投",
  policy: "政策监管",
  testnet: "测试网",
  nodes: "节点招募",
  recruiting: "招聘",
  devbounty: "开发者漏洞奖金",
  grant: "项目捐赠/赞助",
  "724news": "7*24快讯",
  flash: "7*24快讯",
};

/**
 * Deterministic auto-view accumulation over 72 hours.
 * Each post gets a fixed target (seed = post id) and a random ease-in curve
 * (power 1.2–2.8) so growth is always slow and never completes before 72 h.
 * Applies to all user types. Real views (p.views in DB) are added on top.
 */
function computeAutoViews(id: number, createdAt: Date, authorType: string | null): number {
  const DURATION = 72 * 3_600_000; // 72 hours in ms

  // Hash 1 → target magnitude
  const h1 = Math.abs((id * 2654435761 + id * id * 40503) % 100_000);
  const rand1 = h1 / 100_000;

  // Hash 2 → curve shape (independent)
  const h2 = Math.abs((id * 1664525 + 1013904223 + id * id * 22695477) % 100_000);
  const rand2 = h2 / 100_000;

  let target: number;
  if (authorType === "project") {
    target = 2000 + Math.floor(rand1 * 24_001);   // 2 000 – 26 000
  } else if (authorType === "kol" || authorType === "developer") {
    target = 300  + Math.floor(rand1 * 1_201);    // 300 – 1 500
  } else {
    target = 200  + Math.floor(rand1 * 801);      // 200 – 1 000
  }

  const now    = Date.now();
  const startMs = createdAt.getTime();
  const endMs   = startMs + DURATION;

  if (now <= startMs) return 0;
  if (now >= endMs)   return target;

  const progress = (now - startMs) / DURATION; // 0–1, never reaches 1 before 72 h

  // Ease-in (power > 1): slow at start, accelerates — guarantees slow accumulation
  const power = 1.2 + rand2 * 1.6; // 1.2 – 2.8, unique per post
  return Math.floor(target * Math.pow(progress, power));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatPost(p: typeof postsTable.$inferSelect & { authorNameLive?: string | null; authorAvatarLive?: string | null; authorTagsLive?: string[] | null; authorTypeLive?: string | null }) {
  const liveType = p.authorTypeLive != null ? p.authorTypeLive : p.authorType;
  const autoViews = computeAutoViews(p.id, p.createdAt, liveType);
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    section: p.section,
    authorWallet: p.authorWallet,
    authorName: p.authorNameLive ?? p.authorName,
    authorAvatar: p.authorAvatarLive ?? p.authorAvatar,
    authorType: liveType,
    authorTags: p.authorTagsLive ?? [],
    views: (p.views ?? 0) + autoViews,
    likes: p.likes,
    comments: p.comments,
    kolLikePoints: p.kolLikePoints,
    kolCommentPoints: p.kolCommentPoints,
    isPinned: p.isPinned,
    pinnedUntil: p.pinnedUntil ? p.pinnedUntil.toISOString() : null,
    pinQueued: p.pinQueued,
    pinQueuedAt: p.pinQueuedAt ? p.pinQueuedAt.toISOString() : null,
    expiresAt: (p as any).expiresAt ? (p as any).expiresAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    sourceUrl: p.sourceUrl ?? null,
    aiConfidence: p.aiConfidence ?? null,
    importance: p.importance ?? null,
    eventStartTime: p.eventStartTime ? p.eventStartTime.toISOString() : null,
    eventEndTime: p.eventEndTime ? p.eventEndTime.toISOString() : null,
    chainTags: (p as any).chainTags ?? [],
    exchangeTags: (p as any).exchangeTags ?? [],
  };
}

/** Auto-expire pinned posts and promote queued posts */
async function expireAndPromote() {
  // 1. Expire posts whose pinnedUntil has passed
  await db.update(postsTable)
    .set({ isPinned: false, pinnedUntil: null })
    .where(and(eq(postsTable.isPinned, true), sql`${postsTable.pinnedUntil} < now()`));

  // 2. Count currently pinned project posts
  const pinnedCount = await db.select({ count: sql<number>`count(*)` })
    .from(postsTable)
    .where(and(eq(postsTable.isPinned, true), eq(postsTable.authorType, "project")));
  const activeCount = Number(pinnedCount[0]?.count ?? 0);
  const slotsAvailable = PIN_SLOTS - activeCount;

  // 3. Promote queued posts (FIFO) to fill available slots
  if (slotsAvailable > 0) {
    const queued = await db.select().from(postsTable)
      .where(and(eq(postsTable.pinQueued, true), eq(postsTable.authorType, "project")))
      .orderBy(asc(postsTable.pinQueuedAt))
      .limit(slotsAvailable);

    for (const qp of queued) {
      const pinnedUntil = new Date(Date.now() + 24 * 3600_000);
      await db.update(postsTable)
        .set({ isPinned: true, pinnedUntil, pinQueued: false, pinQueuedAt: null })
        .where(eq(postsTable.id, qp.id));
    }
  }
}

router.get("/", async (req, res) => {
  try {
  const section = req.query.section as string | undefined;
  const sections = req.query.sections as string | undefined;
  const authorType = req.query.authorType as string | undefined;
  const authorWallet = req.query.authorWallet as string | undefined;
  const pinnedOnly = req.query.pinned === "1" || req.query.pinned === "true";
  const importanceFilter = req.query.importance as string | undefined;
  // home=1 means filter by project-type only (home page both zones)
  const homeMode = req.query.home === "1";
  const q = (req.query.q as string | undefined)?.trim();
  const chain = (req.query.chain as string | undefined)?.trim();
  const exchange = (req.query.exchange as string | undefined)?.trim();
  const tab = (req.query.tab as string | undefined)?.trim(); // column tab filter (optional)
  const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
  const limit = Math.min(1000, parseInt(req.query.limit as string ?? "30") || 30);
  // 同时支持 ?offset=N（直接偏移）和 ?page=N（分页），offset 优先
  const rawOffset = req.query.offset !== undefined ? parseInt(req.query.offset as string) : NaN;
  const offset = !isNaN(rawOffset) ? rawOffset : (page - 1) * limit;

  await expireAndPromote();

  const conditions = [];
  // Always filter out expired posts (may be missing on legacy DBs; guarded by fallback below)
  const expiryCond = sql`(${postsTable.expiresAt} IS NULL OR ${postsTable.expiresAt} > now())`;
  conditions.push(expiryCond);

  // Historical conditions (no expiry filter) — for display count
  const conditionsAll = [];

  if (sections) {
    const secArr = sections.split(",");
    conditions.push(inArray(postsTable.section, secArr));
    conditionsAll.push(inArray(postsTable.section, secArr));
  } else if (section) {
    conditions.push(eq(postsTable.section, section));
    conditionsAll.push(eq(postsTable.section, section));
  }
  if (authorType) {
    conditions.push(eq(postsTable.authorType, authorType));
    // conditionsAll intentionally omits authorType — count ALL post types for historical total
  }
  if (homeMode) {
    conditions.push(eq(postsTable.authorType, "project"));
    // conditionsAll intentionally omits homeMode authorType filter
  }
  if (authorWallet) {
    conditions.push(eq(postsTable.authorWallet, authorWallet.toLowerCase()));
    conditionsAll.push(eq(postsTable.authorWallet, authorWallet.toLowerCase()));
  }
  if (pinnedOnly) conditions.push(eq(postsTable.isPinned, true));
  if (importanceFilter) conditions.push(eq(postsTable.importance, importanceFilter));
  if (q) conditions.push(
    or(
      ilike(postsTable.title, `%${q}%`),
      ilike(postsTable.content, `%${q}%`),
      ilike(postsTable.authorName, `%${q}%`),
      ilike(postsTable.authorWallet, `%${q}%`)
    )!
  );

  // Column tag filters (require DB columns chain_tags / exchange_tags)
  // NOTE: keep the SQL explicit so it's easy to remove if schema isn't migrated.
  if (chain) {
    conditions.push(sql`chain_tags @> ARRAY[${chain}]::text[]`);
  }
  if (exchange) {
    conditions.push(sql`exchange_tags @> ARRAY[${exchange}]::text[]`);
  }

  // Optional tab → section mapping (lightweight, can be expanded later)
  if (tab) {
    const TAB_TO_SECTION: Record<string, string> = {
      flash: "724news",
      grants: "grant",
      airdrop: "quest",
      testnet: "testnet",
      ido: "ido",
      nodes: "nodes",
      funding: "funding",
      listing: "ido",
    };
    const sec = TAB_TO_SECTION[tab];
    if (sec) conditions.push(eq(postsTable.section, sec));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const whereAll = conditionsAll.length ? and(...conditionsAll) : undefined;
  const whereNoExpiry = conditions.filter(c => c !== expiryCond).length
    ? and(...conditions.filter(c => c !== expiryCond))
    : undefined;

  // Jobs section: KOL/dev posts float above normal-user posts
  const orderBy = section === "jobs"
    ? [asc(sql`CASE WHEN ${postsTable.authorType} IS NULL THEN 1 ELSE 0 END`), desc(postsTable.createdAt)]
    : [desc(postsTable.createdAt)];

  // NOTE: avoid selecting optional/new columns by default (e.g. chain_tags/exchange_tags)
  // so the endpoint stays compatible even if DB schema isn't pushed yet.
  const POST_SELECT = {
    id: postsTable.id,
    title: postsTable.title,
    content: postsTable.content,
    section: postsTable.section,
    authorWallet: postsTable.authorWallet,
    authorName: postsTable.authorName,
    authorAvatar: postsTable.authorAvatar,
    authorType: postsTable.authorType,
    views: postsTable.views,
    likes: postsTable.likes,
    comments: postsTable.comments,
    kolLikePoints: postsTable.kolLikePoints,
    kolCommentPoints: postsTable.kolCommentPoints,
    isPinned: postsTable.isPinned,
    pinnedUntil: postsTable.pinnedUntil,
    pinQueued: postsTable.pinQueued,
    pinQueuedAt: postsTable.pinQueuedAt,
    expiresAt: postsTable.expiresAt,
    createdAt: postsTable.createdAt,
    sourceUrl: postsTable.sourceUrl,
    aiConfidence: postsTable.aiConfidence,
    importance: postsTable.importance,
    eventStartTime: postsTable.eventStartTime,
    eventEndTime: postsTable.eventEndTime,
  } as const;

  let all: { count: number }[] = [];
  let allHistorical: { count: number }[] = [];
  try {
    [all, allHistorical] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(postsTable).where(where),
      db.select({ count: sql<number>`count(*)` }).from(postsTable).where(whereAll),
    ]);
  } catch {
    // Legacy DB compatibility: if expires_at (or other newer columns) doesn't exist yet,
    // fall back to a simpler where clause without the expiry condition for counts.
    [all, allHistorical] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(postsTable).where(whereNoExpiry),
      db.select({ count: sql<number>`count(*)` }).from(postsTable).where(whereAll),
    ]);
  }

  let posts: any[] = [];
  try {
    posts = await db.select(POST_SELECT).from(postsTable).where(where).orderBy(...orderBy).limit(limit).offset(offset);
  } catch (e) {
    // Compatibility fallbacks:
    // 1) If chain/exchange filters are used but DB isn't migrated yet, retry without those filters.
    // 2) If legacy DB is missing expires_at or other newer columns, retry with a smaller select + no-expiry where.
    const withoutTagFilters = () => {
      const fallbackConds = conditions.filter((c) => String(c).includes("chain_tags") === false && String(c).includes("exchange_tags") === false);
      return fallbackConds.length ? and(...fallbackConds) : undefined;
    };

    if (chain || exchange) {
      const fallbackWhere = withoutTagFilters();
      posts = await db.select(POST_SELECT).from(postsTable).where(fallbackWhere).orderBy(...orderBy).limit(limit).offset(offset);
    } else {
      const LEGACY_SELECT = {
        id: postsTable.id,
        title: postsTable.title,
        content: postsTable.content,
        section: postsTable.section,
        authorWallet: postsTable.authorWallet,
        authorName: postsTable.authorName,
        authorAvatar: postsTable.authorAvatar,
        authorType: postsTable.authorType,
        views: postsTable.views,
        likes: postsTable.likes,
        comments: postsTable.comments,
        kolLikePoints: postsTable.kolLikePoints,
        kolCommentPoints: postsTable.kolCommentPoints,
        isPinned: postsTable.isPinned,
        pinnedUntil: postsTable.pinnedUntil,
        pinQueued: postsTable.pinQueued,
        pinQueuedAt: postsTable.pinQueuedAt,
        createdAt: postsTable.createdAt,
      } as const;

      posts = await db
        .select(LEGACY_SELECT)
        .from(postsTable)
        .where(whereNoExpiry)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);
    }
  }

  const wallets = [...new Set(posts.map(p => p.authorWallet))];
  const users = wallets.length
    ? await db.select({ wallet: usersTable.wallet, username: usersTable.username, avatar: usersTable.avatar, tags: (usersTable as any).tags, spaceType: usersTable.spaceType })
        .from(usersTable).where(sql`${usersTable.wallet} = ANY(ARRAY[${sql.join(wallets.map(w => sql`${w}`), sql`, `)}]::text[])`)
    : [];
  const userMap = Object.fromEntries(users.map(u => {
    let parsedTags: string[] = [];
    try {
      parsedTags = (u as any).tags ? JSON.parse((u as any).tags) : [];
      if (!Array.isArray(parsedTags)) parsedTags = [];
    } catch {
      parsedTags = [];
    }
    return [u.wallet, { ...u, parsedTags }];
  }));

  res.json({
    posts: posts.map(p => {
      const u = userMap[p.authorWallet];
      const authorNameLive = u?.username || u?.spaceType || null;
      return formatPost({ ...p, authorNameLive, authorAvatarLive: u?.avatar ?? null, authorTagsLive: u?.parsedTags ?? [], authorTypeLive: u?.spaceType ?? null });
    }),
    total: Number(all[0]?.count ?? 0),
    totalAll: Number(allHistorical[0]?.count ?? 0),
    page,
    totalPages: Math.ceil(Number(all[0]?.count ?? 0) / limit),
  });
  } catch (err) {
    // Absolute last-resort fallback: never 500 the homepage feed.
    // This handles any unexpected legacy-schema mismatch (missing columns like expires_at, etc.).
    console.error("[posts] GET /posts failed; returning legacy fallback:", err);
    try {
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
      const limit = Math.min(1000, parseInt((req.query.limit as string ?? "30") || 30));
      const rawOffset = req.query.offset !== undefined ? parseInt(req.query.offset as string) : NaN;
      const offset = !isNaN(rawOffset) ? rawOffset : (page - 1) * limit;

      const posts = await db
        .select({
          id: postsTable.id,
          title: postsTable.title,
          content: postsTable.content,
          section: postsTable.section,
          authorWallet: postsTable.authorWallet,
          authorName: postsTable.authorName,
          authorAvatar: postsTable.authorAvatar,
          authorType: postsTable.authorType,
          views: postsTable.views,
          likes: postsTable.likes,
          comments: postsTable.comments,
          kolLikePoints: postsTable.kolLikePoints,
          kolCommentPoints: postsTable.kolCommentPoints,
          isPinned: postsTable.isPinned,
          pinnedUntil: postsTable.pinnedUntil,
          pinQueued: postsTable.pinQueued,
          pinQueuedAt: postsTable.pinQueuedAt,
          createdAt: postsTable.createdAt,
        } as const)
        .from(postsTable)
        .orderBy(desc(postsTable.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        posts: posts.map((p) => formatPost(p as any)),
        total: posts.length,
        totalAll: posts.length,
        page,
        totalPages: 1,
      });
    } catch (fallbackErr) {
      console.error("[posts] legacy fallback also failed:", fallbackErr);
      // Still avoid throwing: return empty list rather than 500 to stop UI flicker.
      res.json({ posts: [], total: 0, totalAll: 0, page: 1, totalPages: 1 });
    }
  }
});

router.post("/", async (req, res) => {
  const { title, content, section, authorWallet } = req.body;
  if (!title || !content || !section || !authorWallet) {
    return res.status(400).json({ error: "title, content, section, authorWallet required" });
  }

  const titleFilter = checkContent(String(title));
  if (titleFilter) return res.status(422).json({ error: "CONTENT_FILTER", reason: titleFilter, message: filterErrorMessage(titleFilter) });
  const contentFilter = checkContent(String(content));
  if (contentFilter) return res.status(422).json({ error: "CONTENT_FILTER", reason: contentFilter, message: filterErrorMessage(contentFilter) });

  const lw = authorWallet.toLowerCase();
  const users = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
  let user = users[0];
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.isBanned || user.spaceStatus === "banned") {
    return res.status(403).json({ error: "BANNED" });
  }

  const spaceType = user.spaceType ?? "";
  const isAdmin = ADMIN_WALLETS_SET.has(lw);
  // Admins always get project-tier treatment regardless of spaceType
  const isNormalPoster = !isAdmin && (!spaceType || (spaceType !== "project" && spaceType !== "kol" && spaceType !== "developer"));

  const DAILY_LIMIT = 3;
  let todayCount = 0;

  if (!isAdmin) {
    // Temporarily: only team (project) accounts may post
    if (spaceType !== "project") {
      return res.status(403).json({ error: "TEAM_ONLY", message: "当前仅开放团队账号发帖，敬请期待" });
    }

    // Daily post limit — project: 3 posts / 24 h
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayRows = await db.select({ count: sql<number>`count(*)` })
      .from(postsTable).where(and(eq(postsTable.authorWallet, lw), gte(postsTable.createdAt, todayStart)));
    todayCount = Number(todayRows[0]?.count ?? 0);
    if (todayCount >= DAILY_LIMIT) {
      return res.status(429).json({ error: "DAILY_LIMIT", limit: DAILY_LIMIT, remaining: 0 });
    }
  }

  // Update lastPostAt + increment normal user daily post counter
  if (isNormalPoster && (req as any)._normalPostTodayStr) {
    const newCount = ((req as any)._normalPostUsed ?? 0) + 1;
    await db.update(usersTable).set({
      lastPostAt: new Date(),
      normalDailyPostCount: newCount,
      normalDailyPostDate: (req as any)._normalPostTodayStr,
    }).where(eq(usersTable.wallet, lw));
  } else {
    await db.update(usersTable).set({ lastPostAt: new Date() }).where(eq(usersTable.wallet, lw));
  }

  // Normal user: delete all their previous posts in THIS section so only one per section is ever visible
  if (isNormalPoster) {
    await db.delete(postsTable).where(and(eq(postsTable.authorWallet, lw), eq(postsTable.section, section)));
  }

  // KOL / developer: enforce max 5 posts per section — delete the oldest when posting the 6th
  const isKolOrDev = spaceType === "kol" || spaceType === "developer";
  if (isKolOrDev) {
    const existing = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(and(eq(postsTable.authorWallet, lw), eq(postsTable.section, section)))
      .orderBy(asc(postsTable.createdAt));
    if (existing.length >= 5) {
      // Delete the oldest post(s) so the count stays at 4 before the new one is added
      const toDelete = existing.slice(0, existing.length - 4);
      for (const p of toDelete) {
        await db.delete(postsTable).where(eq(postsTable.id, p.id));
      }
    }
  }

  // Expiry: all non-project/non-admin users 60 days, project/admin unlimited
  const postExpiresAt = (isNormalPoster || isKolOrDev)
    ? new Date(Date.now() + 60 * 24 * 3600_000)
    : null;

  // Admin who hasn't set a spaceType still posts as "project" so it appears on the home feed
  const resolvedAuthorType = user?.spaceType ?? (isAdmin ? "project" : null);
  const tags = classifyChainExchangeTags({ title: String(title), description: String(content) });

  const inserted = await db.insert(postsTable).values({
    title,
    content,
    section,
    authorWallet: lw,
    authorName: user?.username || user?.spaceType || null,
    authorAvatar: user?.avatar ?? null,
    authorType: resolvedAuthorType,
    chainTags: tags.chainTags,
    exchangeTags: tags.exchangeTags,
    likes: 0,
    comments: 0,
    kolLikePoints: 0,
    kolCommentPoints: 0,
    expiresAt: postExpiresAt,
    isPinned: false,
    pinQueued: false,
  }).returning();

  // 通知订阅了该板块的用户
  if (section) {
    const sectionZh = SECTION_SLUG_TO_ZH[section] ?? section;
    const allUsers = await db.select({
      wallet: usersTable.wallet,
      subscriptions: (usersTable as any).subscriptions,
    }).from(usersTable)
      .where(sql`subscriptions IS NOT NULL`);

    const subscribers = allUsers.filter(u => {
      try {
        const subs: string[] = JSON.parse(u.subscriptions ?? "[]");
        return (subs.includes(section) || subs.includes(sectionZh)) && u.wallet !== lw;
      } catch { return false; }
    });

    if (subscribers.length > 0) {
      await db.insert(notificationsTable).values(
        subscribers.map(u => ({
          recipientWallet: u.wallet,
          type: "new_post",
          fromWallet: lw,
          fromName: user?.username ?? null,
          postId: inserted[0].id,
          postTitle: inserted[0].title ?? null,
          postSection: sectionZh,
        } as any))
      ).catch(() => {});
    }
  }

  res.status(201).json({
    ...formatPost({
      ...inserted[0],
      authorNameLive: user?.username || user?.spaceType || null,
      authorAvatarLive: user?.avatar ?? null,
    }),
    ...(!isAdmin && { remaining: Math.max(0, DAILY_LIMIT - todayCount - 1), limit: DAILY_LIMIT }),
  });
});

router.get("/:id/comments", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const viewerWallet = req.query.wallet ? String(req.query.wallet).toLowerCase() : null;

  const rows = await db.select().from(commentsTable)
    .where(eq(commentsTable.postId, id))
    .orderBy(asc(commentsTable.createdAt))
    .limit(200);

  const wallets = [...new Set(rows.map(r => r.wallet))];
  const users = wallets.length
    ? await db.select({ wallet: usersTable.wallet, username: usersTable.username, avatar: usersTable.avatar })
        .from(usersTable).where(sql`${usersTable.wallet} = ANY(ARRAY[${sql.join(wallets.map(w => sql`${w}`), sql`, `)}]::text[])`)
    : [];
  const umap = Object.fromEntries(users.map(u => [u.wallet, u]));

  // Which comments has this viewer already liked?
  const commentIds = rows.map(r => r.id);
  let likedSet = new Set<number>();
  if (viewerWallet && commentIds.length) {
    const likedRows = await db.select({ commentId: commentLikesTable.commentId })
      .from(commentLikesTable)
      .where(and(
        eq(commentLikesTable.wallet, viewerWallet),
        sql`${commentLikesTable.commentId} = ANY(ARRAY[${sql.join(commentIds.map(id => sql`${id}`), sql`, `)}]::int[])`
      ));
    likedSet = new Set(likedRows.map(r => r.commentId));
  }

  res.json({ comments: rows.map(r => ({
    id: r.id, postId: r.postId, wallet: r.wallet,
    authorName: umap[r.wallet]?.username ?? r.authorName ?? null,
    authorAvatar: umap[r.wallet]?.avatar ?? r.authorAvatar ?? null,
    content: r.content,
    likes: r.likes ?? 0,
    replyTo: (r as any).replyTo ?? null,
    likedByViewer: likedSet.has(r.id),
    createdAt: r.createdAt.toISOString(),
  })) });
});

// Like / unlike a comment
router.post("/:id/comments/:commentId/like", async (req, res) => {
  const postId = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(postId) || isNaN(commentId)) return res.status(400).json({ error: "Invalid id" });
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });
  const lw = wallet.toLowerCase();

  // Check if already liked
  const existing = await db.select().from(commentLikesTable)
    .where(and(eq(commentLikesTable.commentId, commentId), eq(commentLikesTable.wallet, lw)))
    .limit(1);

  if (existing.length) {
    // Unlike
    await db.delete(commentLikesTable)
      .where(and(eq(commentLikesTable.commentId, commentId), eq(commentLikesTable.wallet, lw)));
    const updated = await db.update(commentsTable)
      .set({ likes: sql`GREATEST(${commentsTable.likes} - 1, 0)` })
      .where(eq(commentsTable.id, commentId))
      .returning({ likes: commentsTable.likes });
    return res.json({ liked: false, likes: updated[0]?.likes ?? 0 });
  } else {
    // Like
    await db.insert(commentLikesTable).values({ commentId, wallet: lw });
    const updated = await db.update(commentsTable)
      .set({ likes: sql`${commentsTable.likes} + 1` })
      .where(eq(commentsTable.id, commentId))
      .returning({ likes: commentsTable.likes });
    return res.json({ liked: true, likes: updated[0]?.likes ?? 0 });
  }
});

// Reply to a comment
router.post("/:id/comments/:commentId/reply", async (req, res) => {
  const postId = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(postId) || isNaN(commentId)) return res.status(400).json({ error: "Invalid id" });
  const { wallet, content } = req.body;
  if (!wallet || !content?.trim()) return res.status(400).json({ error: "wallet and content required" });

  const contentFilter = checkContent(content.trim());
  if (contentFilter) return res.status(422).json({ error: "CONTENT_FILTER", reason: contentFilter, message: filterErrorMessage(contentFilter) });

  const lw = wallet.toLowerCase();
  const userRows = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
  const user = userRows[0] ?? null;

  await db.insert(commentsTable).values({
    postId,
    wallet: lw,
    authorName: user?.username ?? null,
    authorAvatar: user?.avatar ?? null,
    content: content.trim(),
    replyTo: commentId,
  } as any);

  // Bump comment count on post
  await db.update(postsTable)
    .set({ comments: sql`${postsTable.comments} + 1` })
    .where(eq(postsTable.id, postId));

  // Notify the parent comment author
  const parentRows = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId)).limit(1);
  const parent = parentRows[0];
  if (parent && parent.wallet !== lw) {
    const postRows = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    await db.insert(notificationsTable).values({
      recipientWallet: parent.wallet,
      type: "comment",
      fromWallet: lw,
      fromName: user?.username ?? null,
      postId,
      postTitle: postRows[0]?.title ?? null,
    } as any).catch(() => {});
  }

  res.json({ ok: true });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  // Increment real view count (fire-and-forget, don't block response)
  db.update(postsTable)
    .set({ views: sql`${postsTable.views} + 1` })
    .where(eq(postsTable.id, id))
    .catch(() => {});

  const posts = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
  if (!posts.length) return res.status(404).json({ error: "Post not found" });

  const p = posts[0];
  const users = await db.select({ wallet: usersTable.wallet, username: usersTable.username, avatar: usersTable.avatar, tags: (usersTable as any).tags, spaceType: usersTable.spaceType })
    .from(usersTable).where(eq(usersTable.wallet, p.authorWallet)).limit(1);
  const u = users[0];
  const parsedTags = (u as any)?.tags ? JSON.parse((u as any).tags) : [];

  res.json(formatPost({ ...p, authorNameLive: u?.username || u?.spaceType || null, authorAvatarLive: u?.avatar ?? null, authorTagsLive: parsedTags, authorTypeLive: u?.spaceType ?? null }));
});

router.post("/:id/like", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { wallet } = req.body;

  const posts = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
  if (posts.length === 0) return res.status(404).json({ error: "Post not found" });
  const post = posts[0];

  const updated = await db.update(postsTable)
    .set({ likes: post.likes + 1 })
    .where(eq(postsTable.id, id))
    .returning();

  if (wallet) {
    const lw = wallet.toLowerCase();
    const today = todayStr();
    const userRows = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
    const user = userRows[0];

    if (user) {
      const isSpaceUser = user.spaceType === "project" || user.spaceType === "kol" || user.spaceType === "developer";
      const isToday = user.lastInteractionDate === today;
      const currentLikes = isToday ? (user.dailyLikeCount ?? 0) : 0;
      const MAX_DAILY_LIKES = 20;
      const TOKENS_PER_LIKE = 5;

      // Regular users earn tokens from liking; space users do not
      if (!isSpaceUser && currentLikes < MAX_DAILY_LIKES) {
        await db.update(usersTable).set({
          tokens: ((user as any).tokens ?? 0) + TOKENS_PER_LIKE,
          dailyLikeCount: currentLikes + 1,
          lastInteractionDate: today,
        } as any).where(eq(usersTable.wallet, lw));
        // Inviter gets 15% of liker's token earnings
        awardInviterBonus(lw, TOKENS_PER_LIKE);
      } else if (!isToday) {
        await db.update(usersTable).set({ dailyLikeCount: 1, lastInteractionDate: today }).where(eq(usersTable.wallet, lw));
      } else {
        await db.update(usersTable).set({ dailyLikeCount: currentLikes + 1 }).where(eq(usersTable.wallet, lw));
      }

      // Post author earns tokens when their post is liked (project/kol/developer only, max 2000/day)
      const TOKENS_PER_LIKE_AUTHOR = 5;
      const isSpaceAuthor = post.authorType === "project" || post.authorType === "kol" || post.authorType === "developer";
      if (isSpaceAuthor && post.authorWallet !== lw) {
        const authorRows = await db.select().from(usersTable).where(eq(usersTable.wallet, post.authorWallet)).limit(1);
        const author = authorRows[0];
        if (author) {
          const authorIsToday = (author as any).lastTokenDate === today;
          const currentEarned = authorIsToday ? ((author as any).dailyTokensEarned ?? 0) : 0;
          const MAX_AUTHOR_DAILY = 2000;
          const canEarn = Math.min(TOKENS_PER_LIKE_AUTHOR, MAX_AUTHOR_DAILY - currentEarned);
          if (canEarn > 0) {
            await db.update(usersTable).set({
              tokens: ((author as any).tokens ?? 0) + canEarn,
              dailyTokensEarned: currentEarned + canEarn,
              lastTokenDate: today,
            } as any).where(eq(usersTable.wallet, post.authorWallet));
            // Inviter gets 15% of author's token earnings
            awardInviterBonus(post.authorWallet, canEarn);
          } else if (!authorIsToday) {
            await db.update(usersTable).set({ dailyTokensEarned: 0, lastTokenDate: today } as any).where(eq(usersTable.wallet, post.authorWallet));
          }
        }
      }
    }
  }

  // Notify post author about the like (if liker != author)
  if (wallet) {
    const lw2 = wallet.toLowerCase();
    if (lw2 !== post.authorWallet) {
      const likerRows = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.wallet, lw2)).limit(1);
      await db.insert(notificationsTable).values({
        recipientWallet: post.authorWallet,
        type: "like",
        fromWallet: lw2,
        fromName: likerRows[0]?.username ?? null,
        postId: id,
        postTitle: post.title,
      }).catch(() => {});
    }
  }

  res.json({ likes: updated[0].likes });
});

router.post("/:id/comment", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { wallet, content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });

  const commentFilter = checkContent(String(content));
  if (commentFilter) return res.status(422).json({ error: "CONTENT_FILTER", reason: commentFilter, message: filterErrorMessage(commentFilter) });

  // Check ban status before any writes
  if (wallet) {
    const lw = wallet.toLowerCase();
    const userRows = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
    const user = userRows[0];
    if (user && (user.isBanned || user.spaceStatus === "banned")) {
      return res.status(403).json({ error: "BANNED" });
    }
  }

  const posts = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
  if (posts.length === 0) return res.status(404).json({ error: "Post not found" });
  const post = posts[0];

  const updated = await db.update(postsTable)
    .set({ comments: post.comments + 1 })
    .where(eq(postsTable.id, id))
    .returning();

  // Store actual comment content
  const lw_commenter = wallet ? wallet.toLowerCase() : null;
  let commenterUser: typeof usersTable.$inferSelect | null = null;
  if (lw_commenter) {
    const commenterRows = await db.select().from(usersTable).where(eq(usersTable.wallet, lw_commenter)).limit(1);
    commenterUser = commenterRows[0] ?? null;
  }
  await db.insert(commentsTable).values({
    postId: id,
    wallet: lw_commenter ?? "anonymous",
    authorName: commenterUser?.username ?? null,
    authorAvatar: commenterUser?.avatar ?? null,
    content,
  });

  // Notify post author (only if commenter != author)
  if (lw_commenter && lw_commenter !== post.authorWallet) {
    await db.insert(notificationsTable).values({
      recipientWallet: post.authorWallet,
      type: "comment",
      fromWallet: lw_commenter,
      fromName: commenterUser?.username ?? null,
      postId: id,
      postTitle: post.title,
    }).catch(() => {});
  }

  if (wallet) {
    const lw = wallet.toLowerCase();
    const today = todayStr();
    const userRows = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
    const user = userRows[0];

    if (user) {
      const isSpaceUser = user.spaceType === "project" || user.spaceType === "kol" || user.spaceType === "developer";
      const isToday = user.lastInteractionDate === today;
      const currentComments = isToday ? (user.dailyCommentCount ?? 0) : 0;
      const MAX_DAILY_COMMENTS = 20;
      const TOKENS_PER_COMMENT = 5;

      // Regular users earn tokens from commenting; space users do not
      if (!isSpaceUser && currentComments < MAX_DAILY_COMMENTS) {
        await db.update(usersTable).set({
          tokens: ((user as any).tokens ?? 0) + TOKENS_PER_COMMENT,
          dailyCommentCount: currentComments + 1,
          lastInteractionDate: today,
        } as any).where(eq(usersTable.wallet, lw));
        // Inviter gets 15% of commenter's token earnings
        awardInviterBonus(lw, TOKENS_PER_COMMENT);
      } else if (!isToday) {
        await db.update(usersTable).set({ dailyCommentCount: 1, lastInteractionDate: today }).where(eq(usersTable.wallet, lw));
      } else {
        await db.update(usersTable).set({ dailyCommentCount: currentComments + 1 }).where(eq(usersTable.wallet, lw));
      }

      // Post author earns tokens when their post is commented on (project/kol/developer only, max 2000/day)
      const TOKENS_PER_COMMENT_AUTHOR = 5;
      const isSpaceAuthor = post.authorType === "project" || post.authorType === "kol" || post.authorType === "developer";
      if (isSpaceAuthor && post.authorWallet !== lw) {
        const authorRows = await db.select().from(usersTable).where(eq(usersTable.wallet, post.authorWallet)).limit(1);
        const author = authorRows[0];
        if (author) {
          const authorIsToday = (author as any).lastTokenDate === today;
          const currentEarned = authorIsToday ? ((author as any).dailyTokensEarned ?? 0) : 0;
          const MAX_AUTHOR_DAILY = 2000;
          const canEarn = Math.min(TOKENS_PER_COMMENT_AUTHOR, MAX_AUTHOR_DAILY - currentEarned);
          if (canEarn > 0) {
            await db.update(usersTable).set({
              tokens: ((author as any).tokens ?? 0) + canEarn,
              dailyTokensEarned: currentEarned + canEarn,
              lastTokenDate: today,
            } as any).where(eq(usersTable.wallet, post.authorWallet));
            // Inviter gets 15% of author's token earnings
            awardInviterBonus(post.authorWallet, canEarn);
          } else if (!authorIsToday) {
            await db.update(usersTable).set({ dailyTokensEarned: 0, lastTokenDate: today } as any).where(eq(usersTable.wallet, post.authorWallet));
          }
        }
      }
    }
  }

  res.json({ comments: updated[0].comments, content });
});

const ADMIN_WALLETS_SET = new Set([
  "0xbe4548c1458be01838f1faafd69d335f0567399a","0x65fc40db57e872720294b7acbb2cdd88ca401929",
  "0xf9ba6e907e252de62d563db41bcdea7a37ea03c6","0xc1a420c0ac06d16dfb17c5ebd61caecd93840afd",
  "0x246104d684b52e87c3e1e5b1cfbd274451e421bc","0xd9520bd2592529fa5bd34643c57c08bdc0c9a6b0",
  "0xf3c14704107b4fee7384fa1bfba9a82975a3c12c","0xf49a301350a2665e9150e8d9b2686a25a39ffecf",
  "0x8ce881fd733879e419e7d78248c4e41f48c5b3b2","0x46cfbb9407eddf3954ca027bd7ac802402b61b95",
  "0x5de63ba702c04906d368f6c17fc78acff06094fe","0x8818aa3fbc1c2963651bc604554f7f4725a51704",
  "0x4b0b18f3f51d860b46d05229591e450a6a4850f9","0x394cf5ff2a1bffff5e475ff2ab6566a63a8258d10",
  "0xa0adb22151b7555c2d9c178e6da0e975d65b6013",
]);

router.post("/:id/pin", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { wallet, durationHours } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const lw = wallet.toLowerCase();
  const isAdminUser = ADMIN_WALLETS_SET.has(lw);

  // ── ADMIN PATH: free pin, any post, custom duration, immediate ──
  if (isAdminUser) {
    const postRows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!postRows.length) return res.status(404).json({ error: "Post not found" });
    const sec = String((postRows[0] as any).section ?? "");
    // Ecosystem columns are NOT pinnable.
    if (sec.startsWith("chain:") || sec.startsWith("exchange:")) {
      return res.status(400).json({ error: "ECOSECTION_NOT_PINNABLE" });
    }

    const hours = Math.max(1, Math.min(8760, Number(durationHours) || 72)); // clamp 1h–1yr
    const pinnedUntil = new Date(Date.now() + hours * 3600_000);
    await db.update(postsTable)
      .set({ isPinned: true, pinnedUntil, pinQueued: false, pinQueuedAt: null })
      .where(eq(postsTable.id, id));
    return res.json({ ok: true, queued: false, adminPin: true, pinnedUntil: pinnedUntil.toISOString() });
  }

  // Non-admin: pin not allowed
  return res.status(403).json({ error: "Only admins can pin posts" });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const lw = wallet.toLowerCase();
  const posts = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
  if (!posts.length) return res.status(404).json({ error: "Post not found" });

  const ADMIN_WALLETS = new Set([
    "0xbe4548c1458be01838f1faafd69d335f0567399a","0x65fc40db57e872720294b7acbb2cdd88ca401929",
    "0xf9ba6e907e252de62d563db41bcdea7a37ea03c6","0xc1a420c0ac06d16dfb17c5ebd61caecd93840afd",
    "0x246104d684b52e87c3e1e5b1cfbd274451e421bc","0xd9520bd2592529fa5bd34643c57c08bdc0c9a6b0",
    "0xf3c14704107b4fee7384fa1bfba9a82975a3c12c","0xf49a301350a2665e9150e8d9b2686a25a39ffecf",
    "0x8ce881fd733879e419e7d78248c4e41f48c5b3b2","0x46cfbb9407eddf3954ca027bd7ac802402b61b95",
    "0x5de63ba702c04906d368f6c17fc78acff06094fe","0x8818aa3fbc1c2963651bc604554f7f4725a51704",
    "0x4b0b18f3f51d860b46d05229591e450a6a4850f9","0x394cf5ff2a1bffff5e475ff2ab6566a63a8258d10",
    "0xa0adb22151b7555c2d9c178e6da0e975d65b6013",
  ]);

  if (posts[0].authorWallet !== lw && !ADMIN_WALLETS.has(lw)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await db.delete(postsTable).where(eq(postsTable.id, id));
  res.json({ ok: true });
});

export default router;
