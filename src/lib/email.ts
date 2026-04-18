import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function sendSyncFailureEmail(
  userId: string,
  stravaActivityId: number,
  errorMessage: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return;

  const html = `
    <p>Hi,</p>
    <p>We were unable to sync your Strava activity <strong>#${stravaActivityId}</strong> to Garmin Connect after 3 attempts.</p>
    <p><strong>Error:</strong> ${errorMessage}</p>
    <p>You can retry the sync from your <a href="${process.env.NEXTAUTH_URL}/sync-log">Sync Log</a>.</p>
    <p>— Workoutbridge</p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Sync failed for activity #${stravaActivityId}`,
      html,
    }),
  });
}
