import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white p-8">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">
          Workout<span className="text-orange-500">bridge</span>
        </h1>
        <p className="text-xl text-gray-400">
          Automatically sync your Strava workouts to Nike Running Club
          via Garmin Connect — no manual work required.
        </p>

        <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
          <span className="bg-orange-500 text-white px-3 py-1 rounded-full">Strava</span>
          <span>→</span>
          <span className="bg-blue-600 text-white px-3 py-1 rounded-full">Garmin</span>
          <span>→</span>
          <span className="bg-gray-700 text-white px-3 py-1 rounded-full">Nike Run Club</span>
        </div>

        <p className="text-gray-500 text-sm">
          Connect once. We sync Strava to Garmin automatically.
          Garmin does the rest and pushes to Nike.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-6 py-3 rounded-lg transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
