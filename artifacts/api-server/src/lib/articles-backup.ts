import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type BackupArticle = {
  id: number | string;
  title: string;
  content?: string;
  section?: string;
  author_type?: string | null;
  author_name?: string | null;
  source_url?: string | null;
  created_at?: string | null;
};

function defaultBackupPath(): string {
  // api-server runs from artifacts/api-server; repo root is two levels up
  return resolve(process.cwd(), "../../articles_backup.json");
}

export function readArticlesBackupFile(pathOverride?: string): BackupArticle[] {
  const path = (pathOverride ?? process.env.ARTICLES_BACKUP_FILE ?? defaultBackupPath()).trim();
  if (!path) return [];
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);

  const items: BackupArticle[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as BackupArticle;
      if (!obj || typeof obj.title !== "string" || obj.title.trim() === "") continue;
      items.push(obj);
    } catch {
      // Ignore malformed lines (best-effort backup)
    }
  }
  return items;
}

