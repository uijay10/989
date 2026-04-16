import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { verifyMessage } from "viem";

const SECRET = process.env.ADMIN_TOKEN_SECRET ?? (() => {
  const s = randomBytes(32).toString("hex");
  console.warn("[admin-token] ADMIN_TOKEN_SECRET not set; using ephemeral secret (tokens invalidated on restart)");
  return s;
})();

const TOKEN_TTL_MS = 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface Challenge {
  nonce: string;
  wallet: string;
  expiresAt: number;
}

const challenges = new Map<string, Challenge>();

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (now > v.expiresAt) challenges.delete(k);
  }
}

export function createChallenge(wallet: string): string {
  pruneExpired();
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  challenges.set(nonce, { nonce, wallet: wallet.toLowerCase(), expiresAt });
  return `Sign in to Web3Hub Admin\n\nWallet: ${wallet.toLowerCase()}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;
}

export async function verifyChallenge(wallet: string, message: string, signature: string): Promise<boolean> {
  pruneExpired();
  const nonceMatch = message.match(/Nonce: ([0-9a-f]{32})/);
  if (!nonceMatch) return false;
  const nonce = nonceMatch[1];
  const challenge = challenges.get(nonce);
  if (!challenge) return false;
  if (challenge.wallet !== wallet.toLowerCase()) return false;
  if (Date.now() > challenge.expiresAt) { challenges.delete(nonce); return false; }

  try {
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (valid) challenges.delete(nonce);
    return valid;
  } catch {
    return false;
  }
}

export function issueAdminToken(wallet: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${wallet.toLowerCase()}:${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyAdminToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    const parts = payload.split(":");
    const exp = Number(parts[parts.length - 1]);
    if (Date.now() > exp) return null;
    return parts.slice(0, -1).join(":");
  } catch {
    return null;
  }
}
