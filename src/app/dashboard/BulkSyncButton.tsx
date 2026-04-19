"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BulkSyncButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [queued, setQueued] = useState(0);
  const router = useRouter();

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch("/api/sync/bulk-import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setQueued(data.queued);
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-green-400">
        {queued > 0
          ? `${queued} activities queued — they will sync automatically.`
          : "All Strava activities are already queued or synced."}
      </p>
    );
  }

  if (state === "error") {
    return <p className="text-sm text-red-400">Failed to import. Make sure Strava is connected.</p>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white font-medium px-4 py-2 rounded-lg transition"
    >
      {state === "loading" ? "Fetching from Strava…" : "Import past workouts"}
    </button>
  );
}
