import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { providerTokens } from "@/db/schema";

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

  let userId: string | null = null;
  let nonce: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    userId = decoded.userId ?? null;
    nonce = decoded.nonce ?? null;
  } catch {
    return NextResponse.redirect(appUrl(req, "/dashboard?error=garmin_state"));
  }

  const cookieStore = await cookies();
  const storedNonce = cookieStore.get("garmin_oauth_nonce")?.value;
  cookieStore.delete("garmin_oauth_nonce");

  if (!storedNonce || storedNonce !== nonce || !userId) {
    return NextResponse.redirect(appUrl(req, "/dashboard?error=garmin_state"));
  }

  if (error || !code) {
    return NextResponse.redirect(appUrl(req, "/dashboard?error=garmin_denied"));
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
    return NextResponse.redirect(appUrl(req, "/dashboard?error=garmin_token"));
  }

  const token = await tokenRes.json();
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

  return NextResponse.redirect(appUrl(req, "/dashboard?connected=garmin"));
}
