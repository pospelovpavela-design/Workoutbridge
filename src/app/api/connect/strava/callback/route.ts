import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { providerTokens, webhookSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerStravaWebhook } from "@/lib/strava/webhook";

function appUrl(req: NextRequest, path: string) {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "")
    ?? `https://${req.headers.get("x-forwarded-host") ?? "localhost:3000"}`;
  return `${base}${path}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const stateParam = searchParams.get("state");

  // Decode state to get userId (set in ConnectStravaPage)
  let userId: string | null = null;
  let nonce: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    userId = decoded.userId ?? null;
    nonce = decoded.nonce ?? null;
  } catch {
    return NextResponse.redirect(appUrl(req, "/dashboard?error=strava_state"));
  }

  // Verify nonce against cookie to prevent CSRF
  const cookieStore = await cookies();
  const storedNonce = cookieStore.get("strava_oauth_nonce")?.value;
  cookieStore.delete("strava_oauth_nonce");

  if (!storedNonce || storedNonce !== nonce || !userId) {
    return NextResponse.redirect(appUrl(req, "/dashboard?error=strava_state"));
  }

  if (error || !code) {
    return NextResponse.redirect(appUrl(req, "/dashboard?error=strava_denied"));
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
    return NextResponse.redirect(appUrl(req, "/dashboard?error=strava_token"));
  }

  const token = await tokenRes.json();
  const athleteId = String(token.athlete?.id);
  const expiresAt = new Date(token.expires_at * 1000);

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

  // Register Strava webhook (non-fatal if it fails)
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
    // Non-fatal — user can still use the app
  }

  return NextResponse.redirect(appUrl(req, "/dashboard?connected=strava"));
}
