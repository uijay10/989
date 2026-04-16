import { Router, type IRouter } from "express";
import { db, spaceApplicationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const DAILY_APPLY_LIMIT = 2;

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

router.post("/apply", async (req, res) => {
  const { wallet, type, twitter, tweetLink, projectName, projectTwitter, docsLink, github, linkedin } = req.body;
  if (!wallet || !type) return res.status(400).json({ error: "wallet and type required" });

  const lw = wallet.toLowerCase();

  const users = await db.select().from(usersTable).where(eq(usersTable.wallet, lw)).limit(1);
  const user = users[0];
  const today = todayDateStr();

  if (user) {
    const lastDate = (user as any).lastApplyDate ?? null;
    const count = (user as any).dailyApplyCount ?? 0;
    if (lastDate === today && count >= DAILY_APPLY_LIMIT) {
      return res.status(429).json({ error: "DAILY_APPLY_LIMIT", limit: DAILY_APPLY_LIMIT });
    }
  }

  await db.insert(spaceApplicationsTable).values({
    wallet: lw,
    type,
    twitter: twitter ?? null,
    tweetLink: tweetLink ?? null,
    projectName: projectName ?? null,
    projectTwitter: projectTwitter ?? null,
    docsLink: docsLink ?? null,
    github: github ?? null,
    linkedin: linkedin ?? null,
    status: "pending",
  });

  const existingDate = (user as any)?.lastApplyDate ?? null;
  const existingCount = (user as any)?.dailyApplyCount ?? 0;
  const newCount = existingDate === today ? existingCount + 1 : 1;

  const profileUpdate: Record<string, unknown> = {
    spaceStatus: "pending",
    dailyApplyCount: newCount,
    lastApplyDate: today,
  };
  if (projectName) profileUpdate.username = projectName;
  if (projectTwitter || twitter) profileUpdate.twitter = projectTwitter ?? twitter;
  const wb = (req.body as any).website;
  const dc = (req.body as any).discord;
  const tg = (req.body as any).telegram;
  const wp = (req.body as any).whitepaper;
  if (wb) profileUpdate.website = wb;
  if (dc) profileUpdate.discord = dc;
  if (tg) profileUpdate.telegram = tg;
  if (wp) profileUpdate.whitepaper = wp;

  await db.update(usersTable)
    .set(profileUpdate as any)
    .where(eq(usersTable.wallet, lw));

  res.json({ message: "Application submitted. Review will be completed within 24 hours." });
});

export default router;
