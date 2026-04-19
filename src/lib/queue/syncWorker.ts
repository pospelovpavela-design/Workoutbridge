import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { StravaClient } from "@/lib/strava/client";
import { GarminClient, GarminUploadError } from "@/lib/garmin/client";
import { convertToTcx } from "@/lib/fit/converter";
import { getValidStravaToken } from "@/lib/strava/token";
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

      const stravaToken = await getValidStravaToken(userId);

      const strava = new StravaClient(stravaToken);
      const [activity, streams] = await Promise.all([
        strava.getActivity(stravaActivityId),
        strava.getActivityStreams(stravaActivityId),
      ]);

      const tcxContent = convertToTcx(activity, streams);
      const garmin = new GarminClient();

      let garminActivityId: string;
      try {
        const result = await garmin.uploadActivity(
          tcxContent,
          `strava_${stravaActivityId}.tcx`
        );
        garminActivityId = result.id;
      } catch (err) {
        if (err instanceof GarminUploadError && err.code === "duplicate") {
          await db
            .update(syncEvents)
            .set({ status: "success", garminActivityId: "duplicate" })
            .where(
              and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId))
            );
          return;
        }
        if (err instanceof GarminUploadError && err.code === "auth") {
          throw err;
        }
        throw err;
      }

      await db
        .update(syncEvents)
        .set({ status: "success", garminActivityId })
        .where(
          and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId))
        );
    },
    { connection }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { userId, stravaActivityId } = job.data;
    await db
      .update(syncEvents)
      .set({ status: "error", errorMessage: err.message })
      .where(
        and(eq(syncEvents.userId, userId), eq(syncEvents.stravaActivityId, stravaActivityId))
      );
  });

  return worker;
}
