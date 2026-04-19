import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq, and, lt, sql, count } from "drizzle-orm";
import { StravaClient } from "@/lib/strava/client";
import { GarminClient, GarminUploadError } from "@/lib/garmin/client";
import { convertToTcx } from "@/lib/fit/converter";
import { getValidStravaToken } from "@/lib/strava/token";

const BATCH = 10;

export const maxDuration = 55;

export async function POST(req: NextRequest) {
  void req;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id!;

  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(syncEvents)
    .where(and(eq(syncEvents.userId, userId), eq(syncEvents.status, "pending")));

  if (remaining === 0) return NextResponse.json({ processed: 0, remaining: 0 });

  const jobs = await db
    .select()
    .from(syncEvents)
    .where(and(eq(syncEvents.userId, userId), eq(syncEvents.status, "pending"), lt(syncEvents.attempts, 3)))
    .limit(BATCH);

  if (jobs.length === 0) return NextResponse.json({ processed: 0, remaining });

  // Mark as processing
  await db
    .update(syncEvents)
    .set({ status: "processing", lastAttemptedAt: new Date() })
    .where(
      sql`${syncEvents.id} = ANY(ARRAY[${sql.join(jobs.map((j) => sql`${j.id}::uuid`), sql`, `)}])`
    );

  const stravaToken = await getValidStravaToken(userId).catch(() => null);
  if (!stravaToken) {
    await db
      .update(syncEvents)
      .set({ status: "pending" })
      .where(sql`${syncEvents.id} = ANY(ARRAY[${sql.join(jobs.map((j) => sql`${j.id}::uuid`), sql`, `)}])`);
    return NextResponse.json({ error: "Strava not connected" }, { status: 400 });
  }

  const strava = new StravaClient(stravaToken);
  const garmin = new GarminClient();
  const errors: string[] = [];
  let processed = 0;

  for (const job of jobs) {
    try {
      const [activity, streams] = await Promise.all([
        strava.getActivity(job.stravaActivityId),
        strava.getActivityStreams(job.stravaActivityId),
      ]);

      const tcx = convertToTcx(activity, streams);
      let garminId: string;

      try {
        const result = await garmin.uploadActivity(tcx, `strava_${job.stravaActivityId}.tcx`);
        garminId = result.id;
      } catch (err) {
        if (err instanceof GarminUploadError && err.code === "duplicate") {
          await db
            .update(syncEvents)
            .set({ status: "success", garminActivityId: "duplicate", activityName: activity.name, attempts: job.attempts + 1 })
            .where(eq(syncEvents.id, job.id));
          processed++;
          continue;
        }
        throw err;
      }

      await db
        .update(syncEvents)
        .set({ status: "success", garminActivityId: garminId, activityName: activity.name, attempts: job.attempts + 1 })
        .where(eq(syncEvents.id, job.id));
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      const newAttempts = job.attempts + 1;
      await db
        .update(syncEvents)
        .set({ status: newAttempts >= 3 ? "error" : "pending", errorMessage: msg, attempts: newAttempts })
        .where(eq(syncEvents.id, job.id));
    }
  }

  const [{ newRemaining }] = await db
    .select({ newRemaining: count() })
    .from(syncEvents)
    .where(and(eq(syncEvents.userId, userId), eq(syncEvents.status, "pending")));

  return NextResponse.json({ processed, remaining: newRemaining, errors });
}
