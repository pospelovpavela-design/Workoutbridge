import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { providerTokens, syncEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
// Garmin uses email/password from env vars — no OAuth DB token needed
import Link from "next/link";
import { BulkSyncButton } from "./BulkSyncButton";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { connected, error } = await searchParams;
  const userId = session.user.id!;

  const [tokens, recentSyncs] = await Promise.all([
    db.select().from(providerTokens).where(eq(providerTokens.userId, userId)),
    db
      .select()
      .from(syncEvents)
      .where(eq(syncEvents.userId, userId))
      .orderBy(desc(syncEvents.syncedAt))
      .limit(10),
  ]);

  const stravaConnected = tokens.some((t) => t.provider === "strava");
  const garminConfigured = !!(process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD);
  const allConnected = stravaConnected && garminConfigured;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {session.user.email}
        </p>
      </div>

      {connected && (
        <div className="bg-green-950 border border-green-800 rounded-xl p-4 text-sm text-green-300">
          {connected === "strava" ? "Strava" : "Garmin Connect"} connected successfully.
        </div>
      )}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">
          Connection failed. Please try again.
        </div>
      )}
      {!allConnected && !connected && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl p-4 text-sm text-orange-300">
          Connect both accounts below to start syncing your workouts automatically.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Connections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ConnectionCard
            name="Strava"
            connected={stravaConnected}
            connectHref="/connect/strava"
            dotColor="bg-orange-500"
          />
          <GarminCard configured={garminConfigured} />
        </div>
        {garminConfigured && <NrcOnboardingCard />}
      </section>

      {stravaConnected && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Past Workouts</h2>
          <p className="text-xs text-gray-600">Queue all your Strava history for a one-time sync to Garmin → NRC.</p>
          <BulkSyncButton />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recent Syncs</h2>
          {recentSyncs.length > 0 && (
            <Link href="/sync-log" className="text-xs text-orange-400 hover:underline">
              View all
            </Link>
          )}
        </div>
        {recentSyncs.length === 0 ? (
          <p className="text-gray-600 text-sm py-6 text-center border border-gray-800 rounded-xl">
            No syncs yet — connect your accounts and go for a run!
          </p>
        ) : (
          <ul className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
            {recentSyncs.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm bg-gray-900">
                <span className="font-mono text-gray-400 text-xs">#{s.stravaActivityId}</span>
                <StatusBadge status={s.status} />
                <span className="text-gray-600 text-xs">
                  {s.syncedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ConnectionCard({
  name,
  connected,
  connectHref,
  dotColor,
}: {
  name: string;
  connected: boolean;
  connectHref: string;
  dotColor: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? dotColor : "bg-gray-700"}`} />
        <span className="font-medium text-sm">{name}</span>
      </div>
      {connected ? (
        <span className="text-xs text-green-500 font-medium">Connected</span>
      ) : (
        <Link href={connectHref} className="text-xs text-orange-400 hover:underline font-medium">
          Connect
        </Link>
      )}
    </div>
  );
}

function GarminCard({ configured }: { configured: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full ${configured ? "bg-blue-500" : "bg-gray-700"}`} />
        <span className="font-medium text-sm">Garmin Connect</span>
      </div>
      {configured ? (
        <span className="text-xs text-green-500 font-medium">Configured</span>
      ) : (
        <span className="text-xs text-gray-500">Add GARMIN_EMAIL + GARMIN_PASSWORD to .env.local</span>
      )}
    </div>
  );
}

function NrcOnboardingCard() {
  return (
    <div className="mt-3 bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Last step</span>
        <span className="h-px flex-1 bg-gray-800" />
      </div>
      <p className="text-sm text-gray-300">
        Link <strong className="text-white">Nike Run Club</strong> inside Garmin Connect to complete the chain.
        Garmin will automatically push every new activity to NRC — no extra steps needed.
      </p>
      <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
        <li>Open Garmin Connect app or website</li>
        <li>Go to <span className="text-gray-400">More → Connected Apps</span></li>
        <li>Find <span className="text-gray-400">Nike Run Club</span> and tap Connect</li>
        <li>Sign in to your Nike account</li>
      </ol>
      <a
        href="https://connect.garmin.com/modern/settings/connectedApps"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs font-medium text-orange-400 hover:underline"
      >
        Open Garmin Connected Apps →
      </a>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    success: "bg-green-900 text-green-400",
    error: "bg-red-900 text-red-400",
    pending: "bg-yellow-900 text-yellow-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status}
    </span>
  );
}
