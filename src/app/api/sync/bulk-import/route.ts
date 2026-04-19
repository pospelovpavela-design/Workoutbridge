import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { StravaClient } from "@/lib/strava/client";
import { getValidStravaToken } from "@/lib/strava/token";

const MAX_PAGES = 10; // up to 2000 activities

export async function POST(req: NextRequest) {
  void req;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id!;

  const stravaToken = await getValidStravaToken(userId).catch(() => null);
  if (!stravaToken) return NextResponse.json({ error: "Strava not connected" }, { status: 400 });

  const strava = new StravaClient(stravaToken);

  // Fetch existing sync events to avoid duplicates
  const existing = await db
    .select({ stravaActivityId: syncEvents.stravaActivityId })
    .from(syncEvents)
    .where(eq(syncEvents.userId, userId));
  const existingIds = new Set(existing.map((e) => e.stravaActivityId));

  // Fetch all activities from Strava (paginated)
  const allActivities = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await strava.listActivities(page);
    if (batch.length === 0) break;
    allActivities.push(...batch);
    if (batch.length < 200) break;
  }

  const toSync = allActivities.filter((a) => !existingIds.has(a.id));
  if (toSync.length === 0) return NextResponse.json({ queued: 0 });

  await db
    .insert(syncEvents)
    .values(
      toSync.map((a) => ({
        userId,
        stravaActivityId: a.id,
        activityName: a.name,
        status: "pending" as const,
      }))
    )
    .onConflictDoNothing();

  return NextResponse.json({ queued: toSync.length });
}
