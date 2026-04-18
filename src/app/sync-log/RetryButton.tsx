"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RetryButton({ syncEventId }: { syncEventId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRetry() {
    setLoading(true);
    await fetch("/api/sync/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncEventId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleRetry}
      disabled={loading}
      className="text-xs text-orange-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "…" : "Retry"}
    </button>
  );
}
