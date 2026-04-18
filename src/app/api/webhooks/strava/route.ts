import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents, webhookSubscriptions } from "@/db/schema";
import { syncQueue } from "@/lib/queue/syncWorker";
import { eq } from "drizzle-orm";

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

  // Find which user this athlete belongs to
  const sub = await db.query.webhookSubscriptions.findFirst({
    where: eq(webhookSubscriptions.stravaSubId, body.subscription_id),
    with: { user: true },
  });

  if (!sub) return NextResponse.json({ ok: true });

  const userId = sub.userId;

  // Create a pending sync record
  await db.insert(syncEvents).values({
    userId,
    stravaActivityId,
    status: "pending",
  });

  // Enqueue the sync job
  await syncQueue.add("sync", { userId, stravaActivityId }, {
    jobId: `${userId}-${stravaActivityId}`,
    removeOnComplete: true,
  });

  return NextResponse.json({ ok: true });
}
