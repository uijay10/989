import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

router.post("/visits", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const wallet = String(body?.wallet ?? "").toLowerCase().trim();
    if (!wallet || !wallet.startsWith("0x") || wallet.length < 10) {
      res.status(400).json({ error: "invalid wallet" });
      return;
    }
    const ip = getClientIp(req);

    await db.execute(sql`
      INSERT INTO user_visit_logs (wallet, ip_address, visited_at)
      SELECT ${wallet}, ${ip}, NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM user_visit_logs
        WHERE wallet = ${wallet}
          AND visited_at > NOW() - INTERVAL '1 hour'
      )
    `);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

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
      SELECT wallet, ip_address, visited_at
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
