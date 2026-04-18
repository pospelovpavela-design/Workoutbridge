import { pgTable, uuid, text, bigint, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
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
    expiresAt: timestamp("expires_at"),
    athleteId: text("athlete_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique().on(t.userId, t.provider)]
);

// status: 'pending' | 'processing' | 'success' | 'error'
export const syncEvents = pgTable("sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stravaActivityId: bigint("strava_activity_id", { mode: "number" }).notNull(),
  activityName: text("activity_name"),
  garminActivityId: text("garmin_activity_id"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  errorMessage: text("error_message"),
  syncedAt: timestamp("synced_at").defaultNow(),
  lastAttemptedAt: timestamp("last_attempted_at"),
});

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stravaSubId: bigint("strava_sub_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow(),
});
