import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function SyncLogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id!;
  const events = await db
    .select()
    .from(syncEvents)
    .where(eq(syncEvents.userId, userId))
    .orderBy(desc(syncEvents.syncedAt))
    .limit(100);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Sync Log</h1>

      {events.length === 0 ? (
        <p className="text-gray-600 text-sm py-10 text-center border border-gray-800 rounded-xl">
          No sync events yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
          {events.map((e) => (
            <li key={e.id} className="bg-gray-900 px-4 py-3 text-sm grid grid-cols-3 gap-4 items-center">
              <span className="font-mono text-gray-400 text-xs">#{e.stravaActivityId}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                  e.status === "success"
                    ? "bg-green-900 text-green-400"
                    : e.status === "error"
                    ? "bg-red-900 text-red-400"
                    : "bg-yellow-900 text-yellow-400"
                }`}
              >
                {e.status}
              </span>
              <span className="text-gray-600 text-xs text-right">
                {e.syncedAt?.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {e.errorMessage && (
                <p className="col-span-3 text-red-400 text-xs bg-red-950 rounded px-2 py-1 mt-1">
                  {e.errorMessage}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
