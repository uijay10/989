import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientWallet: text("recipient_wallet").notNull(),
  type: text("type").notNull(),
  fromWallet: text("from_wallet"),
  fromName: text("from_name"),
  postId: integer("post_id"),
  postTitle: text("post_title"),
  postSection: text("post_section"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
