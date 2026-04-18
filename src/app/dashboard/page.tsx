import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { providerTokens, syncEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id!;

  const [tokens, recentSyncs] = await Promise.all([
    db.query.providerTokens.findMany({ where: eq(providerTokens.userId, userId) }),
    db.query.syncEvents.findMany({
      where: eq(syncEvents.userId, userId),
      orderBy: [desc(syncEvents.syncedAt)],
      limit: 10,
    }),
  ]);

  const stravaConnected = tokens.some((t) => t.provider === "strava");
  const garminConnected = tokens.some((t) => t.provider === "garmin");

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Connections</h2>
        <div className="grid grid-cols-2 gap-4">
          <ConnectionCard
            name="Strava"
            connected={stravaConnected}
            connectHref="/connect/strava"
            color="bg-orange-500"
          />
          <ConnectionCard
            name="Garmin Connect"
            connected={garminConnected}
            connectHref="/connect/garmin"
            color="bg-blue-600"
          />
        </div>
        {garminConnected && (
          <p className="text-sm text-gray-500">
            Make sure Nike Run Club is connected in{" "}
            <a
              href="https://connect.garmin.com/modern/settings/connectedApps"
              target="_blank"
              className="underline text-blue-600"
            >
              Garmin Connected Apps
            </a>
            .
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Recent Syncs</h2>
        {recentSyncs.length === 0 ? (
          <p className="text-gray-400 text-sm">No syncs yet. Connect your accounts to get started.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border">
            {recentSyncs.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-mono text-gray-600">#{s.stravaActivityId}</span>
                <StatusBadge status={s.status} />
                <span className="text-gray-400">{s.syncedAt?.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ConnectionCard({
  name, connected, connectHref, color,
}: {
  name: string;
  connected: boolean;
  connectHref: string;
  color: string;
}) {
  return (
    <div className="border rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${connected ? color : "bg-gray-300"}`} />
        <span className="font-medium">{name}</span>
      </div>
      {connected ? (
        <span className="text-xs text-green-600 font-medium">Connected</span>
      ) : (
        <a href={connectHref} className="text-xs text-blue-600 underline">Connect</a>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    pending: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}
