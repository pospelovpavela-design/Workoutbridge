import Link from "next/link";
import { auth, signOut } from "@/lib/auth/session";

export default async function Nav() {
  const session = await auth();

  return (
    <nav className="border-b border-gray-800 bg-gray-950 px-6 py-3 flex items-center justify-between">
      <Link href={session ? "/dashboard" : "/"} className="font-bold text-white text-lg">
        Workout<span className="text-orange-500">bridge</span>
      </Link>

      {session ? (
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition">
            Dashboard
          </Link>
          <Link href="/sync-log" className="text-sm text-gray-400 hover:text-white transition">
            Sync Log
          </Link>
          <Link href="/settings" className="text-sm text-gray-400 hover:text-white transition">
            Settings
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-red-400 transition"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-400 hover:text-white transition">
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg transition"
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
