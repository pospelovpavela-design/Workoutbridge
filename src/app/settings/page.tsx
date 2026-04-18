import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { providerTokens, webhookSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteStravaWebhook } from "@/lib/strava/webhook";

async function disconnectProvider(provider: string) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id!;

  if (provider === "strava") {
    const sub = await db.query.webhookSubscriptions.findFirst({
      where: eq(webhookSubscriptions.userId, userId),
    });
    if (sub?.stravaSubId) {
      await deleteStravaWebhook(sub.stravaSubId).catch(() => {});
      await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.userId, userId));
    }
  }

  await db
    .delete(providerTokens)
    .where(and(eq(providerTokens.userId, userId), eq(providerTokens.provider, provider)));

  redirect("/settings?disconnected=" + provider);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ disconnected?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { disconnected } = await searchParams;
  const userId = session.user.id!;

  const tokens = await db
    .select({ provider: providerTokens.provider, createdAt: providerTokens.createdAt })
    .from(providerTokens)
    .where(eq(providerTokens.userId, userId));

  const disconnectStrava = disconnectProvider.bind(null, "strava");
  const disconnectGarmin = disconnectProvider.bind(null, "garmin");

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {disconnected && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-gray-300">
          {disconnected === "strava" ? "Strava" : "Garmin Connect"} disconnected.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Connected Accounts
        </h2>
        <div className="space-y-2">
          <ProviderRow
            name="Strava"
            provider="strava"
            token={tokens.find((t) => t.provider === "strava")}
            disconnectAction={disconnectStrava}
          />
          <ProviderRow
            name="Garmin Connect"
            provider="garmin"
            token={tokens.find((t) => t.provider === "garmin")}
            disconnectAction={disconnectGarmin}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Nike Run Club
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 text-sm space-y-2">
          <p className="text-gray-300">
            Nike Run Club syncs automatically from Garmin once you link the accounts inside Garmin.
          </p>
          <a
            href="https://connect.garmin.com/modern/settings/connectedApps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-orange-400 hover:underline text-xs font-medium"
          >
            Open Garmin Connected Apps →
          </a>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Account</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-400">
          {session.user.email}
        </div>
      </section>
    </main>
  );
}

function ProviderRow({
  name,
  provider,
  token,
  disconnectAction,
}: {
  name: string;
  provider: string;
  token: { createdAt: Date | null } | undefined;
  disconnectAction: () => Promise<void>;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
      <div>
        <p className="font-medium text-sm">{name}</p>
        {token && (
          <p className="text-xs text-gray-600 mt-0.5">
            Connected{" "}
            {token.createdAt?.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </div>
      {token ? (
        <form action={disconnectAction}>
          <button type="submit" className="text-xs text-red-500 hover:underline">
            Disconnect
          </button>
        </form>
      ) : (
        <a
          href={`/connect/${provider}`}
          className="text-xs text-orange-400 hover:underline font-medium"
        >
          Connect
        </a>
      )}
    </div>
  );
}
