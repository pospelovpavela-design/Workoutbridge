import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq, and, lt, or, sql } from "drizzle-orm";
import { StravaClient } from "@/lib/strava/client";
import { GarminClient, GarminUploadError } from "@/lib/garmin/client";
import { convertToTcx } from "@/lib/fit/converter";
import { getValidStravaToken, getValidGarminToken } from "@/lib/strava/token";
import { sendSyncFailureEmail } from "@/lib/email";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 5;
const STUCK_AFTER_MS = 5 * 60 * 1000; // 5 min

export const maxDuration = 55; // Vercel max for hobby plan

export async function GET(req: NextRequest) {
  // Vercel sends Authorization: Bearer <CRON_SECRET>; also accept x-cron-secret for local testing
  const authHeader = req.headers.get("authorization");
  const manualSecret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const validBearer = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const validManual = manualSecret === process.env.CRON_SECRET;
  if (!validBearer && !validManual) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);

  // Pick up pending jobs OR stuck processing jobs
  const jobs = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        or(
          eq(syncEvents.status, "pending"),
          and(eq(syncEvents.status, "processing"), lt(syncEvents.lastAttemptedAt, stuckBefore))
        ),
        lt(syncEvents.attempts, MAX_ATTEMPTS)
      )
    )
    .limit(BATCH_SIZE)
    .for("update", { skipLocked: true });

  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // Mark all as processing atomically
  await db
    .update(syncEvents)
    .set({ status: "processing", lastAttemptedAt: new Date() })
    .where(
      sql`${syncEvents.id} = ANY(ARRAY[${sql.join(jobs.map((j) => sql`${j.id}::uuid`), sql`, `)}])`
    );

  const results = await Promise.allSettled(jobs.map((job) => processJob(job)));

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ processed: jobs.length, succeeded, failed });
}

async function processJob(job: typeof syncEvents.$inferSelect) {
  const { id, userId, stravaActivityId, attempts } = job;

  try {
    const [stravaToken, garminToken] = await Promise.all([
      getValidStravaToken(userId),
      getValidGarminToken(userId),
    ]);

    const strava = new StravaClient(stravaToken);
    const [activity, streams] = await Promise.all([
      strava.getActivity(stravaActivityId),
      strava.getActivityStreams(stravaActivityId),
    ]);

    const tcxContent = convertToTcx(activity, streams);
    const garmin = new GarminClient(garminToken);

    let garminActivityId: string;
    try {
      const result = await garmin.uploadActivity(tcxContent, `strava_${stravaActivityId}.tcx`);
      garminActivityId = result.id;
    } catch (err) {
      if (err instanceof GarminUploadError && err.code === "duplicate") {
        await db
          .update(syncEvents)
          .set({ status: "success", garminActivityId: "duplicate", activityName: activity.name, attempts: attempts + 1 })
          .where(eq(syncEvents.id, id));
        return;
      }
      throw err;
    }

    await db
      .update(syncEvents)
      .set({ status: "success", garminActivityId, activityName: activity.name, attempts: attempts + 1 })
      .where(eq(syncEvents.id, id));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const newAttempts = attempts + 1;
    const isExhausted = newAttempts >= MAX_ATTEMPTS;

    await db
      .update(syncEvents)
      .set({
        status: isExhausted ? "error" : "pending",
        errorMessage,
        attempts: newAttempts,
      })
      .where(eq(syncEvents.id, id));

    if (isExhausted) {
      await sendSyncFailureEmail(userId, stravaActivityId, errorMessage).catch(() => {});
    }

    throw err;
  }
}
