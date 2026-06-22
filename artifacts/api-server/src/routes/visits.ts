import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// POST /visits — record wallet connection (dedup within 1 hour)
router.post("/visits", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const wallet = String(body?.wallet ?? "").toLowerCase().trim();
    if (!wallet || !wallet.startsWith("0x") || wallet.length < 10) {
      res.status(400).json({ error: "invalid wallet" });
      return;
    }
    const ip = getClientIp(req);

    const nowMs = Date.now();
    await db.execute(sql`
      INSERT INTO user_visit_logs (wallet, ip_address, visited_at)
      SELECT ${wallet}, ${ip}, ${nowMs}
      WHERE NOT EXISTS (
        SELECT 1 FROM user_visit_logs
        WHERE wallet = ${wallet}
          AND visited_at > ${nowMs - 3600000}
      )
    `);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /visits/duration — update duration_minutes on the most recent visit for a wallet
router.patch("/visits/duration", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const wallet = String(body?.wallet ?? "").toLowerCase().trim();
    const minutes = Math.round(Number(body?.minutes ?? 0));
    if (!wallet || !wallet.startsWith("0x") || wallet.length < 10) {
      res.status(400).json({ error: "invalid wallet" });
      return;
    }
    if (minutes < 0 || minutes > 1440) {
      res.status(400).json({ error: "minutes out of range" });
      return;
    }

    await db.execute(sql`
      UPDATE user_visit_logs
      SET duration_minutes = ${minutes}
      WHERE id = (
        SELECT id FROM user_visit_logs
        WHERE wallet = ${wallet}
        ORDER BY visited_at DESC
        LIMIT 1
      )
    `);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /admin/visit-logs — admin only, returns real visit records
router.get("/admin/visit-logs", async (req, res) => {
  try {
    const adminWallet = String(req.query.adminWallet ?? "").toLowerCase();
    const { ADMIN_WALLETS } = await import("../lib/admin-check");
    if (!adminWallet || !ADMIN_WALLETS.has(adminWallet)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const result = await db.execute(sql`
      SELECT wallet, ip_address, visited_at, duration_minutes
      FROM user_visit_logs
      ORDER BY visited_at DESC
      LIMIT ${limit}
    `);
    res.json({ logs: result.rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
