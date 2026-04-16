import { pgTable, text, serial, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  section: text("section").notNull(),
  authorWallet: text("author_wallet").notNull(),
  authorName: text("author_name"),
  authorAvatar: text("author_avatar"),
  authorType: text("author_type"),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  kolLikePoints: integer("kol_like_points").notNull().default(0),
  kolCommentPoints: integer("kol_comment_points").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  pinnedUntil: timestamp("pinned_until"),
  pinQueued: boolean("pin_queued").notNull().default(false),
  pinQueuedAt: timestamp("pin_queued_at"),
  expiresAt: timestamp("expires_at"),
  sourceUrl: text("source_url"),
  aiConfidence: real("ai_confidence"),
  importance: text("importance"),
  eventStartTime: timestamp("event_start_time"),
  eventEndTime: timestamp("event_end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
