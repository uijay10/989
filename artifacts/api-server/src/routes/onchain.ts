import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { ensureOnchainCacheTable, readOnchainCache, runOnchainScrapeGuarded, type OnchainKind } from "../lib/onchain-scrapers";
import { ADMIN_WALLETS } from "../lib/admin-check";
import { verifyAdminToken } from "../lib/admin-token";

const router: IRouter = Router();

const KINDS: OnchainKind[] = ["etf", "launch", "whales"];

function isKind(s: string): s is OnchainKind {
  return (KINDS as string[]).includes(s);
}

// Auth gate for the paid refresh endpoint — DeepSeek calls cost money,
// so this must not be open to the public (denial-of-wallet vector).
function requireScrapeAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-scrape-key"] ?? req.query.key;
  const expectedKey = process.env.SCRAPE_INTERNAL_KEY;
  if (expectedKey && key === expectedKey) { next(); return; }

  const authHeader = String(req.headers.authorization ?? "");
  if (authHeader.startsWith("Bearer ")) {
    const wallet = verifyAdminToken(authHeader.slice(7));
    if (wallet && ADMIN_WALLETS.has(wallet)) { next(); return; }
    res.status(403).json({ ok: false, error: "Forbidden: invalid token" }); return;
  }
  const walletRaw = String(req.query.adminWallet ?? (req.body as Record<string, unknown>)?.adminWallet ?? "").toLowerCase();
  if (walletRaw && ADMIN_WALLETS.has(walletRaw)) { next(); return; }
  res.status(403).json({ ok: false, error: "Forbidden: missing scrape key or admin credentials" });
}

// Per-kind in-memory rate limit (one refresh per kind per minute, even when authed)
const lastRefreshAt = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 60_000;

router.get("/:kind", async (req, res) => {
  const kind = String(req.params.kind || "");
  if (!isKind(kind)) return res.status(400).json({ ok: false, error: "unknown kind" });
  await ensureOnchainCacheTable().catch(() => {});
  const cached = await readOnchainCache(kind);
  if (!cached) return res.json({ ok: true, kind, items: [], source: null, fetchedAt: null, stale: true });
  const ageMs = Date.now() - cached.fetchedAt.getTime();
  res.json({
    ok: true,
    kind,
    items: cached.data,
    source: cached.source,
    fetchedAt: cached.fetchedAt.toISOString(),
    ageMs,
    itemCount: cached.itemCount,
    stale: ageMs > 6 * 60 * 60 * 1000, // >6h stale
  });
});

router.post("/refresh/:kind", requireScrapeAuth, async (req, res) => {
  const kind = String(req.params.kind || "");
  if (!isKind(kind)) return res.status(400).json({ ok: false, error: "unknown kind" });
  const last = lastRefreshAt.get(kind) ?? 0;
  const since = Date.now() - last;
  if (since < REFRESH_COOLDOWN_MS) {
    return res.status(429).json({ ok: false, error: "rate_limited", retryAfterMs: REFRESH_COOLDOWN_MS - since });
  }
  lastRefreshAt.set(kind, Date.now());
  const out = await runOnchainScrapeGuarded(kind);
  res.json({ kind, ...out });
});

export default router;
