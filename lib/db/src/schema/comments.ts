import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const commentsTable = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  wallet: text("wallet").notNull(),
  authorName: text("author_name"),
  authorAvatar: text("author_avatar"),
  content: text("content").notNull(),
  likes: integer("likes").notNull().default(0),
  replyTo: integer("reply_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commentLikesTable = pgTable("comment_likes", {
  id: serial("id").primaryKey(),
  commentId: integer("comment_id").notNull(),
  wallet: text("wallet").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Comment = typeof commentsTable.$inferSelect;
export type CommentLike = typeof commentLikesTable.$inferSelect;
