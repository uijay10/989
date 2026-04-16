import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const INVITE_RATE = 0.15;

/**
 * Award the inviter 15% of the tokens just earned by the invitee.
 * Looks up the invitee's `invitedBy` code → finds the inviter → adds bonus.
 * Safe to call fire-and-forget (does not throw).
 */
export async function awardInviterBonus(
  inviteeWallet: string,
  earnedTokens: number
): Promise<void> {
  try {
    const bonus = Math.floor(earnedTokens * INVITE_RATE);
    if (bonus <= 0) return;

    const inviteeRows = await db
      .select({ invitedBy: usersTable.invitedBy })
      .from(usersTable)
      .where(eq(usersTable.wallet, inviteeWallet))
      .limit(1);

    const inviteCode = inviteeRows[0]?.invitedBy;
    if (!inviteCode) return;

    const inviterRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.inviteCode, inviteCode))
      .limit(1);

    const inviter = inviterRows[0];
    if (!inviter) return;

    await db
      .update(usersTable)
      .set({ tokens: ((inviter as any).tokens ?? 0) + bonus } as any)
      .where(eq(usersTable.wallet, inviter.wallet));
  } catch {
    // Non-critical — never block the main response
  }
}
