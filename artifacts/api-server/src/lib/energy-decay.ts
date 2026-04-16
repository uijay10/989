import cron from "node-cron";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { gt } from "drizzle-orm";
import { eq } from "drizzle-orm";

const ADMIN_ENERGY_THRESHOLD = 99_000_000_000_000;
const DECAY_RATE = 0.05;
const DECAY_HOURS = 48;
const CLEAR_HOURS = 168;

export async function runEnergyDecay(): Promise<void> {
  const now = Date.now();
  try {
    const users = await db
      .select()
      .from(usersTable)
      .where(gt(usersTable.energy, 0));

    let decayed = 0;
    let cleared = 0;

    for (const user of users) {
      if ((user.energy ?? 0) >= ADMIN_ENERGY_THRESHOLD) continue;

      const lastPost = user.lastPostAt ? new Date(user.lastPostAt).getTime() : null;
      const hoursSincePost = lastPost != null ? (now - lastPost) / 3_600_000 : Infinity;

      if (hoursSincePost >= CLEAR_HOURS) {
        await db
          .update(usersTable)
          .set({ energy: 0 })
          .where(eq(usersTable.wallet, user.wallet));
        cleared++;
      } else if (hoursSincePost >= DECAY_HOURS) {
        const decay = Math.floor((user.energy ?? 0) * DECAY_RATE);
        if (decay > 0) {
          await db
            .update(usersTable)
            .set({ energy: Math.max(0, (user.energy ?? 0) - decay) })
            .where(eq(usersTable.wallet, user.wallet));
          decayed++;
        }
      }
    }

    console.log(
      `[energy-decay] ${new Date().toISOString()} — checked ${users.length} users, decayed ${decayed}, cleared ${cleared}`
    );
  } catch (err) {
    console.error("[energy-decay] error:", err);
  }
}

export function startEnergyDecayCron(): void {
  cron.schedule(
    "0 0 * * *",
    () => {
      runEnergyDecay();
    },
    { timezone: "UTC" }
  );
  console.log("[energy-decay] cron scheduled: daily at 00:00 UTC");
}
