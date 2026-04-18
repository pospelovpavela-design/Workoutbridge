import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] p-8">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">
          Sync smarter,<br />
          <span className="text-orange-500">run everywhere.</span>
        </h1>
        <p className="text-xl text-gray-400">
          Workoutbridge automatically moves your Strava workouts to Nike Running Club
          via Garmin Connect — set it up once, forget about it forever.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="bg-orange-500 text-white text-sm font-medium px-4 py-1.5 rounded-full">Strava</span>
          <span className="text-gray-600 text-xl">→</span>
          <span className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-full">Garmin Connect</span>
          <span className="text-gray-600 text-xl">→</span>
          <span className="bg-gray-700 text-white text-sm font-medium px-4 py-1.5 rounded-full">Nike Run Club</span>
        </div>

        <p className="text-gray-500 text-sm max-w-md mx-auto">
          We bridge Strava and Garmin via API. Garmin's native Nike integration
          then takes care of the rest — no hacks, no manual exports.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Get Started — it&apos;s free
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
