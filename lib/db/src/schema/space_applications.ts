import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const spaceApplicationsTable = pgTable("space_applications", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(),
  type: text("type").notNull(),
  twitter: text("twitter"),
  tweetLink: text("tweet_link"),
  projectName: text("project_name"),
  projectTwitter: text("project_twitter"),
  docsLink: text("docs_link"),
  github: text("github"),
  linkedin: text("linkedin"),
  status: text("status").notNull().default("pending"),
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSpaceApplicationSchema = createInsertSchema(spaceApplicationsTable).omit({ id: true, createdAt: true });
export type InsertSpaceApplication = z.infer<typeof insertSpaceApplicationSchema>;
export type SpaceApplication = typeof spaceApplicationsTable.$inferSelect;
