"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "running" | "done" | "error";

export function ProcessAllButton({ total }: { total: number }) {
  const [state, setState] = useState<State>("idle");
  const [done, setDone] = useState(0);
  const [outOf] = useState(total);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  async function run() {
    setState("running");
    let completed = 0;
    let consecutiveEmpty = 0;

    while (true) {
      try {
        const res = await fetch("/api/sync/run-batch", { method: "POST" });
        const data = await res.json() as { processed: number; remaining: number; errors?: string[] };

        if (!res.ok) {
          setErrorMsg((data as { error?: string }).error ?? "Server error");
          setState("error");
          return;
        }

        // Done — nothing left
        if (data.remaining === 0 && data.processed === 0) break;

        if (data.processed > 0) {
          consecutiveEmpty = 0;
          completed += data.processed;
          setDone(completed);
        } else {
          // Jobs in queue but all failed this batch
          consecutiveEmpty++;
          if (consecutiveEmpty >= 2) {
            const lastError = data.errors?.[0] ?? "Jobs are failing — check Sync Log for details";
            setErrorMsg(lastError);
            setState("error");
            return;
          }
        }

        if (data.remaining === 0) break;
      } catch {
        setErrorMsg("Network error — check your connection");
        setState("error");
        return;
      }
    }

    setState("done");
    router.refresh();
  }

  if (state === "done" || (state === "idle" && outOf === 0)) {
    return <p className="text-sm text-green-400">All workouts synced to Garmin!</p>;
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2 font-mono text-xs">
          {errorMsg}
        </p>
        <button onClick={run} className="text-sm text-orange-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (state === "running") {
    const pct = outOf > 0 ? Math.round((done / outOf) * 100) : 0;
    return (
      <div className="space-y-2">
        <p className="text-sm text-orange-300">
          Syncing {done} / {outOf} workouts… {pct}%
        </p>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-orange-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
        <p className="text-xs text-gray-600">Keep this tab open — syncing in batches of 10</p>
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
