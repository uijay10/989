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
  reason: "same_source_url" | "same_title" | "same_content" | "similar_content";
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

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function simhash64(text: string): bigint {
  const vec = new Array<number>(64).fill(0);
  const tokens = text.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
  for (const tok of tokens) {
    const w = tok.length >= 6 ? 2 : 1;
    const a = fnv1a32(tok);
    const b = fnv1a32(tok.split("").reverse().join(""));
    const x = (BigInt(a) << 32n) | BigInt(b);
    for (let i = 0; i < 64; i += 1) {
      const bit = (x >> BigInt(i)) & 1n;
      vec[i] += bit === 1n ? w : -w;
    }
  }
  let out = 0n;
  for (let i = 0; i < 64; i += 1) {
    if (vec[i] > 0) out |= 1n << BigInt(i);
  }
  return out;
}

function popcnt64(x: bigint): number {
  let v = x;
  let c = 0;
  while (v !== 0n) {
    v &= v - 1n;
    c += 1;
  }
  return c;
}

function hamming64(a: bigint, b: bigint): number {
  return popcnt64(a ^ b);
}

function pickKeep(rows: PostRow[]): PostRow {
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

export async function dedupAiPosts(
  opts: DedupOptions = {},
): Promise<DedupResult> {
  const days = Math.min(3650, Math.max(1, Number(opts.days ?? 90)));
  const dryRun = opts.dryRun !== false;
  const maxScan = Math.min(
    200_000,
    Math.max(100, Number(opts.maxScan ?? 50_000)),
  );
  const maxDeletes = Math.min(
    50_000,
    Math.max(1, Number(opts.maxDeletes ?? 5_000)),
  );

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
  const simBuckets = new Map<string, PostRow[]>();

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

      if (nc.length >= 220) {
        const sh = simhash64(nc);
        for (let b = 0; b < 4; b += 1) {
          const chunk = Number((sh >> BigInt(b * 16)) & 0xffffn);
          const key = `${section}|sim|${b}|${chunk}`;
          const arr = simBuckets.get(key) ?? [];
          arr.push(p);
          simBuckets.set(key, arr);
        }
      }
    }
  }

  const decisions: DedupDecision[] = [];
  const plannedDeletes = new Set<number>();

  const addDecisions = (
    map: Map<string, PostRow[]>,
    reason: DedupDecision["reason"],
  ) => {
    for (const [key, group] of map.entries()) {
      if (group.length <= 1) continue;

      const alive = group.filter((g) => !plannedDeletes.has(g.id));
      if (alive.length <= 1) continue;

      const keep = pickKeep(alive);
      const deleteIds = alive.filter((g) => g.id !== keep.id).map((g) => g.id);

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

  if (plannedDeletes.size < maxDeletes) {
    const seenPair = new Set<string>();
    for (const [key, group] of simBuckets.entries()) {
      if (group.length <= 1) continue;
      const alive = group.filter((g) => !plannedDeletes.has(g.id));
      if (alive.length <= 1) continue;

      const withHash = alive
        .map((p) => {
          const nc = normContent((p.content ?? "").trim());
          return { p, nc, sh: simhash64(nc) };
        })
        .filter((x) => x.nc.length >= 220);

      if (withHash.length <= 1) continue;

      for (let i = 0; i < withHash.length; i += 1) {
        for (let j = i + 1; j < withHash.length; j += 1) {
          const a = withHash[i]!;
          const b = withHash[j]!;
          const pairKey =
            a.p.id < b.p.id ? `${a.p.id}-${b.p.id}` : `${b.p.id}-${a.p.id}`;
          if (seenPair.has(pairKey)) continue;
          seenPair.add(pairKey);

          const d = hamming64(a.sh, b.sh);
          if (d > 3) continue;

          const keep = pickKeep([a.p, b.p]);
          const del = keep.id === a.p.id ? b.p : a.p;
          if (plannedDeletes.has(del.id)) continue;

          plannedDeletes.add(del.id);
          decisions.push({
            keepId: keep.id,
            deleteIds: [del.id],
            reason: "similar_content",
            key: `${key}|ham<=3`,
            section: keep.section,
            keepCreatedAt: keep.created_at,
          });

          if (plannedDeletes.size >= maxDeletes) break;
        }
        if (plannedDeletes.size >= maxDeletes) break;
      }
      if (plannedDeletes.size >= maxDeletes) break;
    }
  }

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
