import { config } from "dotenv";
config({ path: ".env.local" });

import { startSyncWorker } from "../src/lib/queue/syncWorker";

const worker = startSyncWorker();

console.log("[worker] Sync worker started — waiting for jobs…");

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, closing…");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[worker] SIGINT received, closing…");
  await worker.close();
  process.exit(0);
});
