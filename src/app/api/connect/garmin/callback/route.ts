import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { db } from "@/db";
import { providerTokens } from "@/db/schema";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/dashboard?error=garmin_denied", req.url));
  }

  const tokenRes = await fetch("https://sso.garmin.com/sso/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.GARMIN_CLIENT_ID}:${process.env.GARMIN_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/garmin/callback`,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/dashboard?error=garmin_token", req.url));
  }

  const token = await tokenRes.json();
  const userId = session.user.id!;
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);

  await db
    .insert(providerTokens)
    .values({
      userId,
      provider: "garmin",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [providerTokens.userId, providerTokens.provider],
      set: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  return NextResponse.redirect(new URL("/dashboard?connected=garmin", req.url));
}
