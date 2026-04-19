import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents, providerTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { StravaClient } from "@/lib/strava/client";
import { GarminClient, GarminUploadError } from "@/lib/garmin/client";
import { convertToTcx } from "@/lib/fit/converter";
import { getValidStravaToken } from "@/lib/strava/token";

// Strava webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Strava webhook event (POST)
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.object_type !== "activity" || body.aspect_type !== "create") {
    return NextResponse.json({ ok: true });
  }

  const stravaAthleteId = String(body.owner_id);
  const stravaActivityId = body.object_id as number;

  const token = await db.query.providerTokens.findFirst({
    where: and(
      eq(providerTokens.provider, "strava"),
      eq(providerTokens.athleteId, stravaAthleteId)
    ),
  });

  if (!token) return NextResponse.json({ ok: true });
  const userId = token.userId;

  // Insert pending (deduplicated) — cron fallback if inline sync fails
  await db
    .insert(syncEvents)
    .values({ userId, stravaActivityId, status: "pending" })
    .onConflictDoNothing();

  // Process immediately (don't wait — respond to Strava quickly)
  processActivity(userId, stravaActivityId).catch(() => {});

  return NextResponse.json({ ok: true });
}

async function processActivity(userId: string, stravaActivityId: number) {
  const job = await db.query.syncEvents.findFirst({
    where: and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId)),
  });
  if (!job || job.status !== "pending") return;

  await db
    .update(syncEvents)
    .set({ status: "processing", lastAttemptedAt: new Date() })
    .where(and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId)));

  try {
    const stravaToken = await getValidStravaToken(userId);
    const strava = new StravaClient(stravaToken);
    const [activity, streams] = await Promise.all([
      strava.getActivity(stravaActivityId),
      strava.getActivityStreams(stravaActivityId),
    ]);

    const tcx = convertToTcx(activity, streams);
    const garmin = new GarminClient();

    let garminId: string;
    try {
      const result = await garmin.uploadActivity(tcx, `strava_${stravaActivityId}.tcx`);
      garminId = result.id;
    } catch (err) {
      if (err instanceof GarminUploadError && err.code === "duplicate") {
        await db
          .update(syncEvents)
          .set({ status: "success", garminActivityId: "duplicate", activityName: activity.name, attempts: (job.attempts ?? 0) + 1 })
          .where(and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId)));
        return;
      }
      throw err;
    }

    await db
      .update(syncEvents)
      .set({ status: "success", garminActivityId: garminId, activityName: activity.name, attempts: (job.attempts ?? 0) + 1 })
      .where(and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(syncEvents)
      .set({ status: "pending", errorMessage: msg, attempts: (job.attempts ?? 0) + 1 })
      .where(and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId)));
  }
}
