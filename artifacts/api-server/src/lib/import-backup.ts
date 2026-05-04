import { db, postsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readArticlesBackupFile, type BackupArticle } from "./articles-backup";

type ImportOptions = {
  maxItems?: number;
  dryRun?: boolean;
  since?: Date;
  sections?: string[];
};

type ImportStats = {
  totalInFile: number;
  considered: number;
  inserted: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  dualPublished: number;
};

function normalizeSection(section?: string | null): string {
  const s = (section ?? "").trim();
  return s || "724news";
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function existsBySourceUrl(sourceUrl: string, section: string): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT 1 FROM posts WHERE source_url = ${sourceUrl} AND section = ${section} LIMIT 1`,
  );
  return (rows.rows as unknown[]).length > 0;
}

async function existsByTitle(section: string, title: string, since: Date): Promise<boolean> {
  const norm = title.trim().toLowerCase();
  if (!norm) return false;
  const rows = await db.execute(sql`
    SELECT 1
    FROM posts
    WHERE section = ${section}
      AND created_at >= ${since}
      AND LOWER(TRIM(title)) = ${norm}
    LIMIT 1
  `);
  return (rows.rows as unknown[]).length > 0;
}

async function insertArticle(a: BackupArticle, section: string, dryRun: boolean): Promise<boolean> {
  const title = a.title.trim();
  const content = (a.content ?? "").trim();
  if (!title) return false;

  const sourceUrl = (a.source_url ?? "").trim() || null;
  if (sourceUrl) {
    if (await existsBySourceUrl(sourceUrl, section)) return false;
  } else {
    // Best-effort dedup for legacy lines without source_url: exact title match in same section.
    // Use a wide window so repeated imports don't duplicate content.
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    if (await existsByTitle(section, title, since)) return false;
  }

  if (dryRun) return true;

  const createdAt = safeDate(a.created_at) ?? new Date();

  // Insert minimal required fields; keep legacy metadata if present.
  await db.execute(sql`
    INSERT INTO ${postsTable} (
      title, content, section,
      author_wallet, author_name, author_type,
      views, likes, comments, kol_like_points, kol_comment_points,
      is_pinned, pin_queued,
      expires_at, source_url, ai_confidence, importance,
      event_start_time, event_end_time,
      created_at
    ) VALUES (
      ${title},
      ${content || title},
      ${section},
      ${"ai-system"},
      ${a.author_name ?? null},
      ${"ai"},
      0, 0, 0, 0, 0,
      false, false,
      ${null},
      ${sourceUrl},
      ${null},
      ${null},
      ${null},
      ${null},
      ${createdAt}
    )
  `);

  return true;
}

export async function importBackupToDb(opts: ImportOptions = {}): Promise<ImportStats> {
  const maxItems = opts.maxItems ?? 50_000;
  const dryRun = opts.dryRun === true;
  const since = opts.since ?? null;
  const sections = new Set((opts.sections ?? []).map((s) => s.trim()).filter(Boolean));

  const all = readArticlesBackupFile();
  const totalInFile = all.length;
  const items = all
    .filter((a) => (a.author_type ?? "ai") === "ai")
    .filter((a) => {
      if (!since) return true;
      const createdAt = safeDate(a.created_at);
      return createdAt ? createdAt >= since : false;
    })
    .filter((a) => {
      if (sections.size === 0) return true;
      const s = normalizeSection(a.section);
      return sections.has(s) || sections.has("724news");
    })
    .slice(0, maxItems);

  const stats: ImportStats = {
    totalInFile,
    considered: 0,
    inserted: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    dualPublished: 0,
  };

  for (const a of items) {
    stats.considered += 1;
    const section = normalizeSection(a.section);
    if (!a.title || !a.title.trim()) {
      stats.skippedInvalid += 1;
      continue;
    }

    // Dual publish: original section + always 724news
    const sections = section === "724news" ? ["724news"] : [section, "724news"];

    let insertedAny = false;
    for (const s of sections) {
      const ok = await insertArticle(a, s, dryRun);
      if (ok) {
        stats.inserted += 1;
        insertedAny = true;
      } else {
        stats.skippedDuplicate += 1;
      }
    }
    if (insertedAny && sections.length === 2) stats.dualPublished += 1;
  }

  return stats;
}

