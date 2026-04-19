import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents, providerTokens } from "@/db/schema";
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

  const token = await db.query.providerTokens.findFirst({
    where: and(
      eq(providerTokens.provider, "strava"),
      eq(providerTokens.athleteId, stravaAthleteId)
    ),
  });

  if (!token) return NextResponse.json({ ok: true });

  // Insert pending job — cron picks it up within 1 minute
  await db
    .insert(syncEvents)
    .values({ userId: token.userId, stravaActivityId, status: "pending" })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
