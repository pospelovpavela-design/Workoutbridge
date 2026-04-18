import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { db } from "@/db";
import { providerTokens, webhookSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { registerStravaWebhook } from "@/lib/strava/webhook";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/dashboard?error=strava_denied", req.url));
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/dashboard?error=strava_token", req.url));
  }

  const token = await tokenRes.json();
  const userId = session.user.id!;
  const athleteId = String(token.athlete?.id);
  const expiresAt = new Date(token.expires_at * 1000);

  // Upsert provider token
  await db
    .insert(providerTokens)
    .values({
      userId,
      provider: "strava",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      athleteId,
    })
    .onConflictDoUpdate({
      target: [providerTokens.userId, providerTokens.provider],
      set: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
        athleteId,
        updatedAt: new Date(),
      },
    });

  // Register Strava webhook (idempotent — Strava returns existing sub if URL matches)
  try {
    const existingSub = await db.query.webhookSubscriptions.findFirst({
      where: eq(webhookSubscriptions.userId, userId),
    });

    if (!existingSub) {
      const subId = await registerStravaWebhook();
      if (subId) {
        await db.insert(webhookSubscriptions).values({ userId, stravaSubId: subId });
      }
    }
  } catch {
    // Webhook registration failure is non-fatal; user can still proceed
  }

  return NextResponse.redirect(new URL("/dashboard?connected=strava", req.url));
}
