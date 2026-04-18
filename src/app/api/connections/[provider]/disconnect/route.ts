import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { db } from "@/db";
import { providerTokens, webhookSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteStravaWebhook } from "@/lib/strava/webhook";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = await params;
  if (provider !== "strava" && provider !== "garmin") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const userId = session.user.id!;

  if (provider === "strava") {
    // Cancel Strava webhook subscription if no other users share it
    const sub = await db.query.webhookSubscriptions.findFirst({
      where: eq(webhookSubscriptions.userId, userId),
    });
    if (sub?.stravaSubId) {
      await deleteStravaWebhook(sub.stravaSubId);
      await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.userId, userId));
    }
  }

  await db
    .delete(providerTokens)
    .where(and(eq(providerTokens.userId, userId), eq(providerTokens.provider, provider)));

  return NextResponse.redirect(new URL("/settings", req.url));
}
