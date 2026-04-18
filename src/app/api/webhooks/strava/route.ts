import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents, providerTokens } from "@/db/schema";
import { syncQueue } from "@/lib/queue/syncWorker";
import { eq, and } from "drizzle-orm";

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

  // Find the user who owns this athlete ID
  const token = await db.query.providerTokens.findFirst({
    where: and(
      eq(providerTokens.provider, "strava"),
      eq(providerTokens.athleteId, stravaAthleteId)
    ),
  });

  if (!token) return NextResponse.json({ ok: true });

  const userId = token.userId;

  // Deduplicate: skip if already queued
  const existing = await db.query.syncEvents.findFirst({
    where: and(
      eq(syncEvents.userId, userId),
      eq(syncEvents.stravaActivityId, stravaActivityId)
    ),
  });
  if (existing) return NextResponse.json({ ok: true });

  await db.insert(syncEvents).values({ userId, stravaActivityId, status: "pending" });

  await syncQueue.add("sync", { userId, stravaActivityId }, {
    jobId: `${userId}-${stravaActivityId}`,
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });

  return NextResponse.json({ ok: true });
}
