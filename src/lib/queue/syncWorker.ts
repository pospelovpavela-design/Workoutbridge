import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/db";
import { syncEvents, providerTokens } from "@/db/schema";
import { StravaClient } from "@/lib/strava/client";
import { GarminClient } from "@/lib/garmin/client";
import { convertToFit } from "@/lib/fit/converter";
import { eq, and } from "drizzle-orm";

export const SYNC_QUEUE = "strava-garmin-sync";

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const syncQueue = new Queue(SYNC_QUEUE, { connection });

export function startSyncWorker() {
  const worker = new Worker(
    SYNC_QUEUE,
    async (job) => {
      const { userId, stravaActivityId } = job.data as {
        userId: string;
        stravaActivityId: number;
      };

      await db
        .update(syncEvents)
        .set({ status: "pending" })
        .where(
          and(
            eq(syncEvents.userId, userId),
            eq(syncEvents.stravaActivityId, stravaActivityId)
          )
        );

      const [stravaToken, garminToken] = await Promise.all([
        db.query.providerTokens.findFirst({
          where: and(eq(providerTokens.userId, userId), eq(providerTokens.provider, "strava")),
        }),
        db.query.providerTokens.findFirst({
          where: and(eq(providerTokens.userId, userId), eq(providerTokens.provider, "garmin")),
        }),
      ]);

      if (!stravaToken || !garminToken) throw new Error("Missing provider tokens");

      const strava = new StravaClient(stravaToken.accessToken);
      const [activity, streams] = await Promise.all([
        strava.getActivity(stravaActivityId),
        strava.getActivityStreams(stravaActivityId),
      ]);

      const fitBuffer = convertToFit(activity, streams);

      const garmin = new GarminClient(garminToken.accessToken);
      const { id: garminActivityId } = await garmin.uploadFitFile(
        fitBuffer,
        `strava_${stravaActivityId}.fit`
      );

      await db
        .update(syncEvents)
        .set({ status: "success", garminActivityId })
        .where(
          and(
            eq(syncEvents.userId, userId),
            eq(syncEvents.stravaActivityId, stravaActivityId)
          )
        );
    },
    {
      connection,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { userId, stravaActivityId } = job.data;
    await db
      .update(syncEvents)
      .set({ status: "error", errorMessage: err.message })
      .where(
        and(
          eq(syncEvents.userId, userId),
          eq(syncEvents.stravaActivityId, stravaActivityId)
        )
      );
  });

  return worker;
}
