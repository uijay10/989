/**
 * Title fingerprint for client-side dedup (7×24、事件列表、重要动态等共用).
 * Strips noise (dates, digits, stopwords) and keeps up to 8 keywords.
 */

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function semanticTitleKey(raw: string): string {
  const t = normalizeText(raw || "")
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ");

  const stop = new Set([
    "a","an","and","are","as","at","be","by","for","from","has","have","in","into","is","it","its","of","on","or","s","says","to","the","this","that","these","those","with","will","vs","via",
    "best","top","latest","update","news","revealed","reveals","lead","leads","goes","live","launch","launched","crosses","cross","potential","deadline","act","committee","senate","us","u","u.s",
    "今日","最新","快讯","速报","公告","消息","更新","曝光","透露","宣布",
  ]);

  const parts = t.split(/[\s-]+/g).filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    if (p.length <= 2) continue;
    if (stop.has(p)) continue;
    if (!kept.includes(p)) kept.push(p);
    if (kept.length >= 8) break;
  }
  return kept.join("-");
}

/** Same rule as EventList display dedup: semantic fingerprint + source hostname. */
export function semanticDedupKey(title: string, sourceUrl?: string | null): string | null {
  const sem = semanticTitleKey(title || "");
  if (!sem) return null;
  let host = "";
  const rawUrl = sourceUrl ?? "";
  if (rawUrl) {
    try {
      host = new URL(rawUrl).hostname.toLowerCase();
    } catch {
      host = rawUrl.toLowerCase();
    }
  }
  return `sem:${sem}::${host}`;
}
