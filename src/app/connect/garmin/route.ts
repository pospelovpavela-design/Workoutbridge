import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ nonce, userId: session.user.id })).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set("garmin_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.GARMIN_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/garmin/callback`,
    response_type: "code",
    scope: "CONNECT_WRITE",
    state,
  });

  return NextResponse.redirect(`https://sso.garmin.com/sso/oauth2/authorize?${params}`);
}
