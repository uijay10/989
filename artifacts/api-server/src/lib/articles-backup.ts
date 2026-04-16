import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
  // Keep legacy default, but don't assume a fixed cwd in hosted environments.
  return resolve(process.cwd(), "../../articles_backup.json");
}

function findUpwards(startDir: string, filename: string, maxHops: number): string | null {
  let dir = startDir;
  for (let i = 0; i <= maxHops; i += 1) {
    const candidate = resolve(dir, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function readArticlesBackupFile(pathOverride?: string): BackupArticle[] {
  const explicit = (pathOverride ?? process.env.ARTICLES_BACKUP_FILE ?? "").trim();
  if (explicit && existsSync(explicit)) {
    const raw = readFileSync(explicit, "utf-8");
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

  const candidates = [
    defaultBackupPath(),
    resolve(process.cwd(), "articles_backup.json"),
    resolve(process.cwd(), "../articles_backup.json"),
    resolve(process.cwd(), "../../articles_backup.json"),
    resolve(process.cwd(), "../../../articles_backup.json"),
  ].filter(Boolean);

  const upward = findUpwards(process.cwd(), "articles_backup.json", 10);
  const path = candidates.find((p) => existsSync(p)) ?? upward ?? "";
  if (!path) return [];

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

