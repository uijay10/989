import { createClient, type Client, type InValue } from "@libsql/client";

function resolveTursoConfig(): { url: string; authToken?: string } | null {
  const candidates = [
    process.env.TURSO_DATABASE_URL,
    process.env.TURSO_URL,
    process.env.TURSO,
  ].filter(Boolean) as string[];

  const url = candidates.find(v => v.startsWith("libsql://") || v.startsWith("https://"));
  const token = candidates.find(v => v.startsWith("eyJ"));

  if (!url) return null;
  return { url, authToken: token };
}

let _client: Client | null = null;

export function getTursoClient(): Client | null {
  const config = resolveTursoConfig();
  if (!config) return null;
  if (!_client) {
    _client = createClient(config);
  }
  return _client;
}

export async function ensureTursoPostsTable(): Promise<void> {
  const client = getTursoClient();
  if (!client) {
    console.warn("[turso] TURSO_DATABASE_URL not set — skipping Turso init");
    return;
  }
  await client.execute(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    section TEXT NOT NULL,
    author_wallet TEXT NOT NULL DEFAULT 'ai-system',
    author_name TEXT,
    author_type TEXT DEFAULT 'ai',
    source_url TEXT,
    ai_confidence REAL,
    importance TEXT,
    chain_tags TEXT,
    exchange_tags TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    expires_at TEXT,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    kol_like_points INTEGER DEFAULT 0,
    kol_comment_points INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    pin_queued INTEGER DEFAULT 0,
    event_start_time TEXT,
    event_end_time TEXT
  )`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts (source_url)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_posts_section_created ON posts (section, created_at DESC)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_posts_author_type_created ON posts (author_type, created_at DESC)`);
  console.log("[turso] posts table ready");
}

export type TursoInsertValues = {
  title: string;
  content: string;
  section: string;
  authorWallet?: string;
  authorName?: string | null;
  authorType?: string;
  sourceUrl?: string | null;
  aiConfidence?: number | null;
  importance?: string | null;
  chainTags?: string[] | null;
  exchangeTags?: string[] | null;
  expiresAt?: Date | null;
  views?: number;
  likes?: number;
  comments?: number;
  kolLikePoints?: number;
  kolCommentPoints?: number;
  isPinned?: boolean;
  pinQueued?: boolean;
  eventStartTime?: Date | null;
  eventEndTime?: Date | null;
};

export async function tursoInsertPost(values: TursoInsertValues): Promise<{ id: number } | null> {
  const client = getTursoClient();
  if (!client) return null;
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `INSERT INTO posts (
      title, content, section, author_wallet, author_name, author_type,
      source_url, ai_confidence, importance, chain_tags, exchange_tags,
      created_at, expires_at, views, likes, comments,
      kol_like_points, kol_comment_points, is_pinned, pin_queued,
      event_start_time, event_end_time
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      values.title.slice(0, 200),
      (values.content ?? "").slice(0, 2000),
      values.section,
      values.authorWallet ?? "ai-system",
      values.authorName ?? null,
      values.authorType ?? "ai",
      values.sourceUrl?.slice(0, 500) ?? null,
      values.aiConfidence ?? null,
      values.importance ?? null,
      values.chainTags ? JSON.stringify(values.chainTags) : null,
      values.exchangeTags ? JSON.stringify(values.exchangeTags) : null,
      now,
      values.expiresAt?.toISOString() ?? null,
      values.views ?? 0,
      values.likes ?? 0,
      values.comments ?? 0,
      values.kolLikePoints ?? 0,
      values.kolCommentPoints ?? 0,
      values.isPinned ? 1 : 0,
      values.pinQueued ? 1 : 0,
      values.eventStartTime?.toISOString() ?? null,
      values.eventEndTime?.toISOString() ?? null,
    ] as InValue[],
  });
  const id = Number(result.lastInsertRowid);
  return id ? { id } : null;
}

export async function tursoCheckUrlExists(sourceUrl: string, section: string): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  try {
    const result = await client.execute({
      sql: `SELECT id FROM posts WHERE source_url = ? AND section = ? LIMIT 1`,
      args: [sourceUrl, section] as InValue[],
    });
    return result.rows.length > 0;
  } catch { return false; }
}

export async function tursoGetExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const client = getTursoClient();
  if (!client) return new Set();
  try {
    const placeholders = urls.map(() => "?").join(", ");
    const result = await client.execute({
      sql: `SELECT source_url FROM posts WHERE source_url IN (${placeholders})`,
      args: urls as InValue[],
    });
    return new Set(result.rows.map(r => r.source_url as string));
  } catch { return new Set(); }
}

export async function tursoGetExistingTitles(titles: string[]): Promise<Set<string>> {
  if (titles.length === 0) return new Set();
  const client = getTursoClient();
  if (!client) return new Set();
  try {
    const normalized = titles.map(t => t.toLowerCase().trim());
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const placeholders = normalized.map(() => "?").join(", ");
    const result = await client.execute({
      sql: `SELECT lower(trim(title)) AS norm_title FROM posts WHERE lower(trim(title)) IN (${placeholders}) AND created_at > ?`,
      args: [...normalized as InValue[], cutoff],
    });
    return new Set(result.rows.map(r => r.norm_title as string));
  } catch { return new Set(); }
}

export async function tursoExactTitleDup(section: string, normTitle: string): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await client.execute({
      sql: `SELECT id FROM posts WHERE section = ? AND lower(trim(title)) = ? AND created_at > ? LIMIT 1`,
      args: [section, normTitle, cutoff] as InValue[],
    });
    return result.rows.length > 0;
  } catch { return false; }
}

export async function tursoRecentTitles(section: string, days: number): Promise<string[]> {
  const client = getTursoClient();
  if (!client) return [];
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = await client.execute({
      sql: `SELECT title FROM posts WHERE section = ? AND created_at > ? ORDER BY created_at DESC LIMIT 400`,
      args: [section, cutoff] as InValue[],
    });
    return result.rows.map(r => r.title as string);
  } catch { return []; }
}

export async function tursoProjectBurstDup(section: string, projectName: string): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  try {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const result = await client.execute({
      sql: `SELECT id FROM posts WHERE section = ? AND lower(trim(author_name)) = ? AND created_at > ? LIMIT 1`,
      args: [section, projectName.toLowerCase().trim(), cutoff] as InValue[],
    });
    return result.rows.length > 0;
  } catch { return false; }
}

export type TursoFeedRow = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  section: string;
  author_name: string | null;
  source_url: string | null;
  importance: string | null;
};

export async function tursoQueryFeed(opts: {
  category?: string;
  limit?: number;
  offset?: number;
  chainList?: string[];
  exchangeList?: string[];
}): Promise<{ rows: TursoFeedRow[]; total: number }> {
  const client = getTursoClient();
  if (!client) return { rows: [], total: 0 };

  const { category = "all", limit = 30, offset = 0, chainList = [], exchangeList = [] } = opts;
  const conditions: string[] = ["author_type = 'ai'"];
  const args: InValue[] = [];

  if (category !== "all") {
    const cats = category.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (cats.length === 1) {
      const c = cats[0]!;
      if (c === "724news") {
        conditions.push("(section = '724news' OR section = 'flash')");
      } else if (c === "flash") {
        conditions.push("(section = 'flash' OR section = '724news')");
      } else {
        conditions.push("section = ?");
        args.push(c);
      }
    } else {
      const placeholders = cats.map(() => "?").join(", ");
      conditions.push(`section IN (${placeholders})`);
      args.push(...cats as InValue[]);
    }
  }

  if (chainList.length > 0) {
    const chainClauses = chainList.map(() =>
      `EXISTS (SELECT 1 FROM json_each(chain_tags) WHERE value = ?)`
    );
    conditions.push(`(${chainClauses.join(" OR ")})`);
    args.push(...chainList as InValue[]);
  }

  if (exchangeList.length > 0) {
    const exClauses = exchangeList.map(() =>
      `EXISTS (SELECT 1 FROM json_each(exchange_tags) WHERE value = ?)`
    );
    conditions.push(`(${exClauses.join(" OR ")})`);
    args.push(...exchangeList as InValue[]);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const [countResult, dataResult] = await Promise.all([
    client.execute({ sql: `SELECT COUNT(*) as cnt FROM posts ${whereClause}`, args: [...args] }),
    client.execute({
      sql: `SELECT id, title, content, created_at, section, author_name, source_url, importance FROM posts ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset] as InValue[],
    }),
  ]);

  const total = Number(countResult.rows[0]?.cnt ?? 0);
  const rows = dataResult.rows.map(r => ({
    id: Number(r.id),
    title: r.title as string,
    content: r.content as string,
    created_at: r.created_at as string,
    section: r.section as string,
    author_name: r.author_name as string | null,
    source_url: r.source_url as string | null,
    importance: r.importance as string | null,
  }));

  return { rows, total };
}

export type TursoPostsQueryOpts = {
  section?: string;
  sections?: string;
  authorType?: string;
  authorWallet?: string;
  importance?: string;
  pinnedOnly?: boolean;
  q?: string;
  chain?: string;
  exchange?: string;
  limit?: number;
  offset?: number;
};

export type TursoPostRow = {
  id: number;
  title: string;
  content: string;
  section: string;
  author_wallet: string;
  author_name: string | null;
  author_type: string | null;
  views: number;
  likes: number;
  comments: number;
  kol_like_points: number;
  kol_comment_points: number;
  is_pinned: number;
  pin_queued: number;
  created_at: string;
  source_url: string | null;
  ai_confidence: number | null;
  importance: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  expires_at: string | null;
  chain_tags: string | null;
  exchange_tags: string | null;
};

export async function tursoQueryPosts(opts: TursoPostsQueryOpts): Promise<{ rows: TursoPostRow[]; total: number; totalAll: number }> {
  const client = getTursoClient();
  if (!client) return { rows: [], total: 0, totalAll: 0 };

  const { section, sections, authorType, authorWallet, importance, pinnedOnly, q, chain, exchange, limit = 30, offset = 0 } = opts;

  const conditions: string[] = [];
  const args: InValue[] = [];

  if (authorType) { conditions.push("author_type = ?"); args.push(authorType); }
  if (authorWallet) { conditions.push("author_wallet = ?"); args.push(authorWallet.toLowerCase()); }
  if (importance) { conditions.push("importance = ?"); args.push(importance); }
  if (pinnedOnly) { conditions.push("is_pinned = 1"); }

  if (sections) {
    const secArr = sections.split(",").map(s => s.trim()).filter(Boolean);
    const ph = secArr.map(() => "?").join(", ");
    conditions.push(`section IN (${ph})`);
    args.push(...secArr as InValue[]);
  } else if (section) {
    conditions.push("section = ?");
    args.push(section);
  }

  if (q) {
    conditions.push("(lower(title) LIKE ? OR lower(content) LIKE ?)");
    args.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }

  if (chain) {
    conditions.push(`EXISTS (SELECT 1 FROM json_each(chain_tags) WHERE value = ?)`);
    args.push(chain);
  }
  if (exchange) {
    conditions.push(`EXISTS (SELECT 1 FROM json_each(exchange_tags) WHERE value = ?)`);
    args.push(exchange);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const allConditions = conditions.filter(c => !c.startsWith("importance") && !c.startsWith("is_pinned"));
  const whereAll = allConditions.length ? `WHERE ${allConditions.join(" AND ")}` : "";
  const allArgs = args.slice(0, allConditions.reduce((acc, _, i) => acc + (conditions[i]?.match(/\?/g)?.length ?? 0), 0));

  const [countRes, countAllRes, dataRes] = await Promise.all([
    client.execute({ sql: `SELECT COUNT(*) as cnt FROM posts ${whereClause}`, args: [...args] }),
    client.execute({ sql: `SELECT COUNT(*) as cnt FROM posts ${whereAll}`, args: allArgs }),
    client.execute({
      sql: `SELECT id, title, content, section, author_wallet, author_name, author_type, views, likes, comments, kol_like_points, kol_comment_points, is_pinned, pin_queued, created_at, source_url, ai_confidence, importance, event_start_time, event_end_time, expires_at, chain_tags, exchange_tags FROM posts ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset] as InValue[],
    }),
  ]);

  const total = Number(countRes.rows[0]?.cnt ?? 0);
  const totalAll = Number(countAllRes.rows[0]?.cnt ?? 0);
  const rows = dataRes.rows.map(r => ({
    id: Number(r.id),
    title: r.title as string,
    content: r.content as string,
    section: r.section as string,
    author_wallet: r.author_wallet as string,
    author_name: r.author_name as string | null,
    author_type: r.author_type as string | null,
    views: Number(r.views ?? 0),
    likes: Number(r.likes ?? 0),
    comments: Number(r.comments ?? 0),
    kol_like_points: Number(r.kol_like_points ?? 0),
    kol_comment_points: Number(r.kol_comment_points ?? 0),
    is_pinned: Number(r.is_pinned ?? 0),
    pin_queued: Number(r.pin_queued ?? 0),
    created_at: r.created_at as string,
    source_url: r.source_url as string | null,
    ai_confidence: r.ai_confidence != null ? Number(r.ai_confidence) : null,
    importance: r.importance as string | null,
    event_start_time: r.event_start_time as string | null,
    event_end_time: r.event_end_time as string | null,
    expires_at: r.expires_at as string | null,
    chain_tags: r.chain_tags as string | null,
    exchange_tags: r.exchange_tags as string | null,
  }));

  return { rows, total, totalAll };
}

export async function tursoGetLastAiPostAt(): Promise<Date | null> {
  const client = getTursoClient();
  if (!client) return null;
  try {
    const result = await client.execute({
      sql: `SELECT created_at FROM posts WHERE author_type = 'ai' ORDER BY created_at DESC LIMIT 1`,
      args: [],
    });
    const last = result.rows[0]?.created_at as string | null;
    return last ? new Date(last) : null;
  } catch { return null; }
}
