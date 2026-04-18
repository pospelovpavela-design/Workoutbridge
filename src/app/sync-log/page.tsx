import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import RetryButton from "./RetryButton";

type Status = "all" | "success" | "error" | "pending" | "processing";

export default async function SyncLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { status } = await searchParams;
  const filter = (status ?? "all") as Status;
  const userId = session.user.id!;

  const where =
    filter === "all"
      ? eq(syncEvents.userId, userId)
      : and(eq(syncEvents.userId, userId), eq(syncEvents.status, filter));

  const events = await db
    .select()
    .from(syncEvents)
    .where(where)
    .orderBy(desc(syncEvents.syncedAt))
    .limit(100);

  const tabs: { label: string; value: Status }[] = [
    { label: "All", value: "all" },
    { label: "Success", value: "success" },
    { label: "Error", value: "error" },
    { label: "Pending", value: "pending" },
  ];

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sync Log</h1>
        <span className="text-xs text-gray-600">{events.length} record{events.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <a
            key={tab.value}
            href={tab.value === "all" ? "/sync-log" : `/sync-log?status=${tab.value}`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              filter === tab.value
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="text-gray-600 text-sm py-10 text-center border border-gray-800 rounded-xl">
          No sync events {filter !== "all" ? `with status "${filter}"` : "yet"}.
        </p>
      ) : (
        <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
          {events.map((e) => (
            <li key={e.id} className="bg-gray-900 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                {/* Activity name + Strava link */}
                <div className="min-w-0">
                  <a
                    href={`https://www.strava.com/activities/${e.stravaActivityId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white hover:text-orange-400 transition truncate block"
                  >
                    {e.activityName ?? `Activity #${e.stravaActivityId}`}
                  </a>
                  <span className="text-xs text-gray-600 font-mono">#{e.stravaActivityId}</span>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={e.status} />

                  {/* Attempts counter */}
                  {e.attempts > 0 && (
                    <span className="text-xs text-gray-700" title="Sync attempts">
                      {e.attempts}/3
                    </span>
                  )}

                  {/* Timestamp */}
                  <span className="text-xs text-gray-600 w-20 text-right">
                    {e.syncedAt?.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>

                  {/* Retry button (only for error status) */}
                  {e.status === "error" && <RetryButton syncEventId={e.id} />}
                </div>
              </div>

              {/* Error message */}
              {e.errorMessage && (
                <p className="text-red-400 text-xs bg-red-950 rounded px-2 py-1.5 font-mono leading-relaxed">
                  {e.errorMessage}
                </p>
              )}

              {/* Garmin link on success */}
              {e.status === "success" && e.garminActivityId && e.garminActivityId !== "duplicate" && (
                <p className="text-xs text-green-600">
                  Uploaded to Garmin →{" "}
                  <a
                    href={`https://connect.garmin.com/modern/activity/${e.garminActivityId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-green-400"
                  >
                    view activity
                  </a>
                </p>
              )}
              {e.status === "success" && e.garminActivityId === "duplicate" && (
                <p className="text-xs text-gray-600">Already existed in Garmin</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    success: "bg-green-900 text-green-400",
    error: "bg-red-900 text-red-400",
    pending: "bg-yellow-900 text-yellow-400",
    processing: "bg-blue-900 text-blue-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status}
    </span>
  );
}
