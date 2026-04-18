import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ConnectStravaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });

  redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
