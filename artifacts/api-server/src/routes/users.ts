import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { awardInviterBonus } from "../lib/invite-bonus";

const router: IRouter = Router();

function generateInviteCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

function fmtUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    wallet: u.wallet,
    username: u.username,
    avatar: u.avatar,
    points: u.points,
    energy: u.energy,
    tokens: (u as any).tokens ?? 0,
    lastSlotPull: (u as any).lastSlotPull?.toISOString() ?? null,
    lastPostAt: (u as any).lastPostAt?.toISOString() ?? null,
    spaceStatus: u.spaceStatus,
    spaceType: u.spaceType,
    inviteCode: u.inviteCode,
    inviteCount: u.inviteCount,
    invitedBy: u.invitedBy,
    lastCheckin: u.lastCheckin?.toISOString() ?? null,
    twitter: u.twitter,
    website: u.website,
    contact: (u as any).contact ?? null,
    contactPublic: (u as any).contactPublic ?? false,
    language: u.language,
    pinCount: u.pinCount,
    spaceRejectedAt: (u as any).spaceRejectedAt?.toISOString() ?? null,
    spaceRejectReason: (u as any).spaceRejectReason ?? null,
    dailyApplyCount: (u as any).dailyApplyCount ?? 0,
    lastApplyDate: (u as any).lastApplyDate ?? null,
    normalDailyPostCount: (u as any).normalDailyPostCount ?? 0,
    normalDailyPostDate: (u as any).normalDailyPostDate ?? null,
    tags: (u as any).tags ? JSON.parse((u as any).tags) : [],
    subscriptions: (u as any).subscriptions ? JSON.parse((u as any).subscriptions) : [],
    createdAt: u.createdAt.toISOString(),
  };
}

function rollTokenPrize(): number {
  const r = Math.random();
  if (r < 0.5) return Math.floor(100 + Math.random() * 201);  // 100-300 (50%)
  if (r < 0.8) return Math.floor(301 + Math.random() * 400);  // 301-700 (30%)
  return Math.floor(701 + Math.random() * 300);                // 701-1000 (20%)
}

router.get("/me", async (req, res) => {
  const wallet = req.query.wallet as string;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const users = await db.select().from(usersTable).where(eq(usersTable.wallet, wallet.toLowerCase())).limit(1);
  if (users.length === 0) return res.status(404).json({ error: "User not found" });

  res.json(fmtUser(users[0]));
});

router.get("/invited", async (req, res) => {
  const wallet = req.query.wallet as string;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const lw = wallet.toLowerCase();
  const invited = await db.select().from(usersTable).where(eq(usersTable.invitedBy, lw));
  res.json({ users: invited.map(u => ({
    wallet: u.wallet,
    username: u.username,
    avatar: u.avatar,
    spaceType: u.spaceType,
    createdAt: u.createdAt.toISOString(),
  })) });
});

router.post("/upsert", async (req, res) => {
  const { wallet, username, avatar, twitter, website, language, tags, inviteCode: usedCode } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const lw = wallet.toLowerCase();
  const existing = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);

  if (existing.length === 0) {
    const newCode = generateInviteCode();
    let inviterWallet: string | null = null;

    if (usedCode) {
      const inviters = await db.select().from(usersTable).where(eq(usersTable.inviteCode, usedCode.toUpperCase())).limit(1);
      if (inviters.length > 0) {
        inviterWallet = inviters[0].wallet;
        await db.update(usersTable)
          .set({ inviteCount: (inviters[0].inviteCount ?? 0) + 1 })
          .where(eq(usersTable.wallet, inviterWallet));
      }
    }

    const inserted = await db.insert(usersTable).values({
      wallet: lw,
      username: username ?? null,
      avatar: avatar ?? null,
      points: 0,
      energy: 0,
      inviteCode: newCode,
      inviteCount: 0,
      invitedBy: inviterWallet,
      twitter: twitter ?? null,
      website: website ?? null,
      language: language ?? "en",
    } as any).returning();
    return res.json(fmtUser(inserted[0]));
  }

  const updateData: Record<string, unknown> = {};
  if (username !== undefined) updateData.username = username;
  if (avatar !== undefined) updateData.avatar = avatar;
  if (twitter !== undefined) updateData.twitter = twitter;
  if (website !== undefined) updateData.website = website;
  if ((req.body as any).contact !== undefined) updateData.contact = (req.body as any).contact;
  if ((req.body as any).contactPublic !== undefined) updateData.contactPublic = (req.body as any).contactPublic;
  if ((req.body as any).discord !== undefined) updateData.discord = (req.body as any).discord;
  if ((req.body as any).telegram !== undefined) updateData.telegram = (req.body as any).telegram;
  if ((req.body as any).whitepaper !== undefined) updateData.whitepaper = (req.body as any).whitepaper;
  if ((req.body as any).bio !== undefined) updateData.bio = (req.body as any).bio;
  if (language !== undefined) updateData.language = language;
  if (tags !== undefined) updateData.tags = Array.isArray(tags) ? JSON.stringify(tags.slice(0, 2)) : null;
  const subs = (req.body as any).subscriptions;
  if (subs !== undefined) updateData.subscriptions = Array.isArray(subs) ? JSON.stringify(subs) : null;

  const updated = Object.keys(updateData).length > 0
    ? await db.update(usersTable).set(updateData).where(eq(usersTable.wallet, lw)).returning()
    : existing;

  res.json(fmtUser(updated[0]));
});

const ADMIN_WALLETS_SET = new Set([
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

router.get("/list", async (req, res) => {
  const { type, search } = req.query as { type?: string; search?: string };
  const validTypes = ["project", "kol", "developer"];

  let users = await db.select().from(usersTable);

  users = users.filter(u => !ADMIN_WALLETS_SET.has(u.wallet.toLowerCase()));
  users = users.filter(u => u.spaceStatus === "approved" || u.spaceStatus === "active");

  if (type && validTypes.includes(type)) {
    users = users.filter(u => u.spaceType === type);
  }

  if (search) {
    const q = search.toLowerCase();
    users = users.filter(u =>
      (u.username ?? "").toLowerCase().includes(q) ||
      u.wallet.toLowerCase().includes(q)
    );
  }

  users.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({ users: users.map(u => ({
    wallet: u.wallet,
    username: u.username,
    avatar: u.avatar,
    spaceType: u.spaceType,
    twitter: u.twitter,
    website: u.website,
    tags: (u as any).tags ? JSON.parse((u as any).tags) : [],
    createdAt: u.createdAt.toISOString(),
  })) });
});

router.post("/slot-pull", async (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const lw = wallet.toLowerCase();
  const users = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
  if (users.length === 0) return res.status(404).json({ error: "User not found" });

  const u = users[0];
  const now = new Date();
  const lastPull = (u as any).lastSlotPull as Date | null;

  if (lastPull) {
    const diff = now.getTime() - lastPull.getTime();
    if (diff < 24 * 60 * 60 * 1000) {
      const next = new Date(lastPull.getTime() + 24 * 60 * 60 * 1000);
      return res.json({ success: false, tokens: (u as any).tokens ?? 0, nextPull: next.toISOString(), message: "Already pulled today" });
    }
  }

  const earned = rollTokenPrize();
  const newTokens = ((u as any).tokens ?? 0) + earned;
  const nextPull = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ tokens: newTokens, lastSlotPull: now } as any)
    .where(eq(usersTable.wallet, lw));

  // Award inviter 15% of slot prize (fire-and-forget)
  awardInviterBonus(lw, earned);

  res.json({ success: true, tokens: newTokens, earned, nextPull: nextPull.toISOString() });
});

router.post("/checkin", async (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const lw = wallet.toLowerCase();
  const users = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
  if (users.length === 0) return res.status(404).json({ error: "User not found" });

  const u = users[0];
  const now = new Date();
  const last = u.lastCheckin;

  if (last) {
    const diff = now.getTime() - last.getTime();
    if (diff < 24 * 60 * 60 * 1000) {
      const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
      return res.json({ success: false, points: u.points, nextCheckin: next.toISOString(), message: "Already checked in today" });
    }
  }

  const updated = await db.update(usersTable)
    .set({ points: u.points + 1000, lastCheckin: now })
    .where(eq(usersTable.wallet, lw))
    .returning();

  const nextCheckin = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  res.json({ success: true, points: updated[0].points, nextCheckin: nextCheckin.toISOString(), message: "+1000 points!" });
});

export default router;
