import { getGarminSessionCookie, invalidateGarminSession } from "./auth";

const UPLOAD_URL = "https://connect.garmin.com/modern/proxy/upload-service/upload/.tcx";

export class GarminUploadError extends Error {
  constructor(
    message: string,
    public readonly code: "duplicate" | "invalid_file" | "rate_limit" | "auth" | "unknown"
  ) {
    super(message);
    this.name = "GarminUploadError";
  }
}

export class GarminClient {
  async uploadActivity(content: string, filename: string): Promise<{ id: string }> {
    let cookie: string;
    try {
      cookie = await getGarminSessionCookie();
    } catch (err) {
      throw new GarminUploadError(
        err instanceof Error ? err.message : "Garmin auth failed",
        "auth"
      );
    }

    const form = new FormData();
    form.append("file", new Blob([content], { type: "application/octet-stream" }), filename);

    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Cookie: cookie,
        NK: "NT",
        "X-App-Ver": "4.7.0.0",
        "User-Agent": "Mozilla/5.0 (Workoutbridge)",
      },
      body: form,
    });

    if (res.status === 401 || res.status === 403) {
      invalidateGarminSession();
      throw new GarminUploadError("Garmin session expired — will retry with fresh login", "auth");
    }
    if (res.status === 429) throw new GarminUploadError("Garmin rate limit exceeded", "rate_limit");

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const result = data?.detailedImportResult as Record<string, unknown> | undefined;
    const failures = result?.failures as { messages?: { content: string }[] }[] | undefined;

    if (failures?.length) {
      const msg = failures[0]?.messages?.[0]?.content ?? "";
      if (msg.toLowerCase().includes("duplicate")) {
        throw new GarminUploadError("Activity already exists in Garmin", "duplicate");
      }
      throw new GarminUploadError(`Garmin rejected file: ${msg}`, "invalid_file");
    }

    if (!res.ok) throw new GarminUploadError(`Garmin upload failed: ${res.status}`, "unknown");

    const id = String(result?.uploadId ?? data?.uploadId ?? "");
    if (!id) throw new GarminUploadError("No upload ID returned by Garmin", "unknown");
    return { id };
  }
}
