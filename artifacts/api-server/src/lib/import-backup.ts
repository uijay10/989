import { db, postsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readArticlesBackupFile, type BackupArticle } from "./articles-backup";

type ImportOptions = {
  maxItems?: number;
  dryRun?: boolean;
  since?: Date;
  sections?: string[];
  keywords?: string[];
  includeAll?: boolean;
  targetSection?: string;
};

type ImportStats = {
  totalInFile: number;
  considered: number;
  inserted: number;
  skippedDuplicate: number;
  skippedInvalid: number;
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

async function insertArticleForce(a: BackupArticle, section: string, dryRun: boolean): Promise<boolean> {
  const title = a.title.trim();
  const content = (a.content ?? "").trim();
  if (!title) return false;

  if (dryRun) return true;

  const createdAt = safeDate(a.created_at) ?? new Date();
  const sourceUrl = (a.source_url ?? "").trim() || null;

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

function resolveTargetSection(a: BackupArticle, targetSection?: string): string {
  if (!targetSection) return normalizeSection(a.section);
  return targetSection;
}

export async function importBackupToDb(opts: ImportOptions = {}): Promise<ImportStats> {
  const maxItems = opts.maxItems ?? 50_000;
  const dryRun = opts.dryRun === true;
  const since = opts.since ?? null;
  const sections = new Set((opts.sections ?? []).map((s) => s.trim()).filter(Boolean));
  const keywords = (opts.keywords ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const includeAll = opts.includeAll === true;
  const targetSection = (opts.targetSection ?? "").trim() || null;

  const all = readArticlesBackupFile();
  const totalInFile = all.length;
  const items = all
    .filter((a) => (a.author_type ?? "ai") === "ai")
    .filter((a) => {
      if (!since) return true;
      const createdAt = safeDate(a.created_at);
      return createdAt ? createdAt >= since : true;
    })
    .filter((a) => {
      if (includeAll || sections.size === 0) return true;
      const s = normalizeSection(a.section);
      return sections.has(s) || sections.has("724news") || s === "724news";
    })
    .filter((a) => {
      if (includeAll || keywords.length === 0) return true;
      const text = `${a.title ?? ""}\n${a.content ?? ""}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    })
    .slice(0, maxItems);

  const stats: ImportStats = {
    totalInFile,
    considered: 0,
    inserted: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
  };

  for (const a of items) {
    stats.considered += 1;
    const section = resolveTargetSection(a, targetSection ?? undefined);
    if (!a.title || !a.title.trim()) {
      stats.skippedInvalid += 1;
      continue;
    }

    const ok = await insertArticleForce(a, section, dryRun);
    if (ok) {
      stats.inserted += 1;
    } else {
      stats.skippedDuplicate += 1;
    }
  }

  return stats;
}

