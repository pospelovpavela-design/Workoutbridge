"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "running" | "done" | "error";

export function ProcessAllButton({ total }: { total: number }) {
  const [state, setState] = useState<State>("idle");
  const [done, setDone] = useState(0);
  const [outOf, setOutOf] = useState(total);
  const router = useRouter();

  async function run() {
    setState("running");
    let completed = done;
    let remaining = outOf;

    while (remaining > 0) {
      try {
        const res = await fetch("/api/sync/run-batch", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (data.processed === 0) break;
        completed += data.processed;
        remaining = data.remaining;
        setDone(completed);
        setOutOf(completed + remaining);
      } catch {
        setState("error");
        return;
      }
    }

    setState("done");
    router.refresh();
  }

  if (outOf === 0 || state === "done") {
    return <p className="text-sm text-green-400">All workouts synced to Garmin!</p>;
  }

  if (state === "error") {
    return (
      <p className="text-sm text-red-400">
        Error during sync. Check Sync Log for details.{" "}
        <button onClick={run} className="underline">Retry</button>
      </p>
    );
  }

  if (state === "running") {
    const pct = outOf > 0 ? Math.round((done / outOf) * 100) : 0;
    return (
      <div className="space-y-2">
        <p className="text-sm text-orange-300">
          Syncing {done} / {outOf} workouts…
        </p>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-orange-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={run}
      className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-medium px-4 py-2 rounded-lg transition"
    >
      Sync {outOf} past workouts →
    </button>
  );
}
