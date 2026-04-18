import { pgTable, uuid, text, bigint, timestamptz, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  createdAt: timestamptz("created_at").defaultNow(),
});

export const providerTokens = pgTable(
  "provider_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'strava' | 'garmin'
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamptz("expires_at"),
    athleteId: text("athlete_id"),
    createdAt: timestamptz("created_at").defaultNow(),
    updatedAt: timestamptz("updated_at").defaultNow(),
  },
  (t) => [unique().on(t.userId, t.provider)]
);

export const syncEvents = pgTable("sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stravaActivityId: bigint("strava_activity_id", { mode: "number" }).notNull(),
  garminActivityId: text("garmin_activity_id"),
  status: text("status").notNull(), // 'pending' | 'success' | 'error'
  errorMessage: text("error_message"),
  syncedAt: timestamptz("synced_at").defaultNow(),
});

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stravaSubId: bigint("strava_sub_id", { mode: "number" }),
  createdAt: timestamptz("created_at").defaultNow(),
});
