import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./index";
import { companiesTable } from "./index";

export const reviewTargetTypeEnum = ["company", "user_owner", "user_foreman", "user_worker"] as const;

export const tradeReviewsTable = pgTable(
  "trade_reviews",
  {
    id: serial("id").primaryKey(),
    reviewerId: integer("reviewer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetCompanyId: integer("target_company_id").references(
      () => companiesTable.id,
      { onDelete: "cascade" },
    ),
    targetUserId: integer("target_user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("trade_reviews_target_company_idx").on(t.targetCompanyId),
    index("trade_reviews_target_user_idx").on(t.targetUserId),
    index("trade_reviews_reviewer_idx").on(t.reviewerId),
    index("trade_reviews_target_type_idx").on(t.targetType),
  ],
);

export const insertTradeReviewSchema = createInsertSchema(tradeReviewsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTradeReview = z.infer<typeof insertTradeReviewSchema>;
export type TradeReview = typeof tradeReviewsTable.$inferSelect;
