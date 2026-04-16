import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo"),
  tagline: text("tagline"),
  chain: text("chain"),
  tags: text("tags"),
  website: text("website"),
  twitter: text("twitter"),
  ownerWallet: text("owner_wallet").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  pinnedUntil: timestamp("pinned_until"),
  status: text("status").notNull().default("pending"),
  latestPostTitle: text("latest_post_title"),
  latestPostAt: timestamp("latest_post_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
