import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

export default async function ConnectStravaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Encode userId in state to avoid calling auth() in the callback
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ nonce, userId: session.user.id })).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set("strava_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });

  redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
