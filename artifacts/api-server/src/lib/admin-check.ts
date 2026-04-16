import type { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "./admin-token";

export const ADMIN_WALLETS = new Set([
  "0xbe4548c1458be01838f1faafd69d335f0567399a",
  "0x65fc40db57e872720294b7acbb2cdd88ca401929",
  "0xf9ba6e907e252de62d563db41bcdea7a37ea03c6",
  "0xc1a420c0ac06d16dfb17c5ebd61caecd93840afd",
  "0x246104d684b52e87c3e1e5b1cfbd274451e421bc",
  "0xd9520bd2592529fa5bd34643c57c08bdc0c9a6b0",
  "0xf3c14704107b4fee7384fa1bfba9a82975a3c12c",
  "0xf49a301350a2665e9150e8d9b2686a25a39ffecf",
  "0x8ce881fd733879e419e7d78248c4e41f48c5b3b2",
  "0x46cfbb9407eddf3954ca027bd7ac802402b61b95",
  "0x5de63ba702c04906d368f6c17fc78acff06094fe",
  "0x8818aa3fbc1c2963651bc604554f7f4725a51704",
  "0x4b0b18f3f51d860b46d05229591e450a6a4850f9",
  "0x394cf5ff2a1bffff5e475ff2ab6566a63a8258d10",
  "0xa0adb22151b7555c2d9c178e6da0e975d65b6013",
]);

function extractWalletFromBody(body: unknown): string {
  if (body && typeof body === "object" && "adminWallet" in body) {
    return String((body as Record<string, unknown>).adminWallet ?? "");
  }
  return "";
}

/**
 * Checks Authorization: Bearer <token> first (issued by POST /api/admin/token).
 * Falls back to wallet-in-query/body for backward compatibility with existing admin routes.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const wallet = verifyAdminToken(token);
    if (wallet && ADMIN_WALLETS.has(wallet)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden: invalid or expired admin token" });
    return;
  }
  const wallet = String(req.query.adminWallet ?? extractWalletFromBody(req.body) ?? "").toLowerCase();
  if (!wallet || !ADMIN_WALLETS.has(wallet)) {
    res.status(403).json({ error: "Forbidden: admin only" });
    return;
  }
  next();
}

/**
 * Strict Bearer-token-only middleware for sensitive AI endpoints.
 * Does NOT accept wallet from query/body — requires server-issued token.
 */
export function requireAdminStrict(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(403).json({ error: "Forbidden: admin token required" });
    return;
  }
  const token = authHeader.slice(7);
  const wallet = verifyAdminToken(token);
  if (!wallet || !ADMIN_WALLETS.has(wallet)) {
    res.status(403).json({ error: "Forbidden: invalid or expired admin token" });
    return;
  }
  next();
}
