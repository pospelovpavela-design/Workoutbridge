import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { providerTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id!;
  const tokens = await db
    .select({ provider: providerTokens.provider, createdAt: providerTokens.createdAt })
    .from(providerTokens)
    .where(eq(providerTokens.userId, userId));

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Connected Accounts</h2>
        <div className="space-y-2">
          {["strava", "garmin"].map((provider) => {
            const token = tokens.find((t) => t.provider === provider);
            return (
              <div
                key={provider}
                className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-sm capitalize">{provider === "garmin" ? "Garmin Connect" : "Strava"}</p>
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
                  <form action={`/api/connections/${provider}/disconnect`} method="POST">
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:underline"
                    >
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
          })}
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
