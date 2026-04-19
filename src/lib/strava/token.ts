import { db } from "@/db";
import { providerTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function getValidStravaToken(userId: string): Promise<string> {
  const row = await db.query.providerTokens.findFirst({
    where: and(eq(providerTokens.userId, userId), eq(providerTokens.provider, "strava")),
  });

  if (!row) throw new Error("Strava not connected");

  const isExpired = row.expiresAt && row.expiresAt.getTime() - Date.now() < 60_000;

  if (!isExpired) return row.accessToken;

  // Refresh
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
    }),
  });

  if (!res.ok) throw new Error("Failed to refresh Strava token");

  const fresh = await res.json();
  const expiresAt = new Date(fresh.expires_at * 1000);

  await db
    .update(providerTokens)
    .set({ accessToken: fresh.access_token, refreshToken: fresh.refresh_token, expiresAt, updatedAt: new Date() })
    .where(and(eq(providerTokens.userId, userId), eq(providerTokens.provider, "strava")));

  return fresh.access_token;
}

