import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({ syncEventId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const userId = session.user.id!;

  const event = await db.query.syncEvents.findFirst({
    where: and(eq(syncEvents.id, parsed.data.syncEventId), eq(syncEvents.userId, userId)),
  });

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (event.status !== "error") return NextResponse.json({ error: "Only failed syncs can be retried" }, { status: 400 });

  await db
    .update(syncEvents)
    .set({ status: "pending", attempts: 0, errorMessage: null })
    .where(eq(syncEvents.id, event.id));

  return NextResponse.json({ ok: true });
}
