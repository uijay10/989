import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";

export type DedupOptions = {
  days?: number;
  dryRun?: boolean;
  maxScan?: number;
  maxDeletes?: number;
};

export type DedupDecision = {
  keepId: number;
  deleteIds: number[];
  reason: "same_source_url" | "same_title" | "same_content";
  key: string;
  section: string;
  keepCreatedAt: string;
};

export type DedupResult = {
  scanned: number;
  candidates: number;
  decisions: DedupDecision[];
  wouldDelete: number;
  deleted: number;
};

type PostRow = {
  id: number;
  section: string;
  title: string;
  content: string | null;
  source_url: string | null;
  created_at: string;
};

function normTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 220);
}

function normContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”‘’]/g, "'")
    .trim()
    .slice(0, 1200);
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function pickKeep(rows: PostRow[]): PostRow {
  // Prefer having a source_url; otherwise keep newest created_at, then highest id.
  const sorted = [...rows].sort((a, b) => {
    const aHas = a.source_url ? 1 : 0;
    const bHas = b.source_url ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    const at = Date.parse(a.created_at) || 0;
    const bt = Date.parse(b.created_at) || 0;
    if (bt !== at) return bt - at;
    return b.id - a.id;
  });
  return sorted[0]!;
}

export async function dedupAiPosts(opts: DedupOptions = {}): Promise<DedupResult> {
  const days = Math.min(3650, Math.max(1, Number(opts.days ?? 90)));
  const dryRun = opts.dryRun !== false;
  const maxScan = Math.min(200_000, Math.max(100, Number(opts.maxScan ?? 50_000)));
  const maxDeletes = Math.min(50_000, Math.max(1, Number(opts.maxDeletes ?? 5_000)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT id, section, title, content, source_url, created_at
    FROM posts
    WHERE author_wallet = 'ai-system'
      AND author_type = 'ai'
      AND created_at >= ${since}
    ORDER BY created_at DESC
    LIMIT ${maxScan}
  `);

  const posts = rows.rows as unknown as PostRow[];

  const byUrl = new Map<string, PostRow[]>();
  const byTitle = new Map<string, PostRow[]>();
  const byContent = new Map<string, PostRow[]>();

  for (const p of posts) {
    const section = (p.section ?? "").trim();
    if (!section) continue;
    const title = (p.title ?? "").trim();
    if (!title) continue;

    const url = (p.source_url ?? "").trim();
    if (url) {
      const k = `${section}|url|${url}`;
      const arr = byUrl.get(k) ?? [];
      arr.push(p);
      byUrl.set(k, arr);
      continue;
    }

    const kt = `${section}|title|${normTitle(title)}`;
    const at = byTitle.get(kt) ?? [];
    at.push(p);
    byTitle.set(kt, at);

    const c = (p.content ?? "").trim();
    if (c) {
      const nc = normContent(c);
      if (nc.length >= 80) {
        const kc = `${section}|content|${hash(nc)}`;
        const ac = byContent.get(kc) ?? [];
        ac.push(p);
        byContent.set(kc, ac);
      }
    }
  }

  const decisions: DedupDecision[] = [];
  const plannedDeletes = new Set<number>();

  const addDecisions = (map: Map<string, PostRow[]>, reason: DedupDecision["reason"]) => {
    for (const [key, group] of map.entries()) {
      if (group.length <= 1) continue;

      // If we've already planned to delete all but one, skip re-deciding.
      const alive = group.filter((g) => !plannedDeletes.has(g.id));
      if (alive.length <= 1) continue;

      const keep = pickKeep(alive);
      const deleteIds = alive
        .filter((g) => g.id !== keep.id)
        .map((g) => g.id);

      for (const id of deleteIds) plannedDeletes.add(id);
      decisions.push({
        keepId: keep.id,
        deleteIds,
        reason,
        key,
        section: keep.section,
        keepCreatedAt: keep.created_at,
      });

      if (plannedDeletes.size >= maxDeletes) break;
    }
  };

  addDecisions(byUrl, "same_source_url");
  if (plannedDeletes.size < maxDeletes) addDecisions(byContent, "same_content");
  if (plannedDeletes.size < maxDeletes) addDecisions(byTitle, "same_title");

  const deleteIds = [...plannedDeletes].slice(0, maxDeletes);

  if (dryRun || deleteIds.length === 0) {
    return {
      scanned: posts.length,
      candidates: decisions.length,
      decisions,
      wouldDelete: deleteIds.length,
      deleted: 0,
    };
  }

  await db.execute(sql`DELETE FROM posts WHERE id = ANY(${deleteIds}::int[])`);

  return {
    scanned: posts.length,
    candidates: decisions.length,
    decisions,
    wouldDelete: deleteIds.length,
    deleted: deleteIds.length,
  };
}

