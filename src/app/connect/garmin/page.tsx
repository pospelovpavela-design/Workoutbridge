import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ConnectGarminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = new URLSearchParams({
    client_id: process.env.GARMIN_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/garmin/callback`,
    response_type: "code",
    scope: "CONNECT_WRITE",
  });

  redirect(`https://sso.garmin.com/sso/oauth2/authorize?${params}`);
}
