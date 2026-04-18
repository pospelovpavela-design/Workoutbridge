import axios, { AxiosError } from "axios";

const UPLOAD_URL = "https://connectapi.garmin.com/upload-service/upload";

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
  constructor(private accessToken: string) {}

  async uploadActivity(content: string, filename: string): Promise<{ id: string }> {
    const form = new FormData();
    const blob = new Blob([content], { type: "application/octet-stream" });
    form.append("file", blob, filename);

    let data: Record<string, unknown>;
    try {
      const res = await axios.post(UPLOAD_URL, form, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          NK: "NT",
        },
      });
      data = res.data;
    } catch (err) {
      const axErr = err as AxiosError<{ detailedImportResult?: { failures?: { messages?: { content: string }[] }[] } }>;
      const status = axErr.response?.status;

      if (status === 401 || status === 403) throw new GarminUploadError("Garmin token invalid", "auth");
      if (status === 429) throw new GarminUploadError("Garmin rate limit exceeded", "rate_limit");

      // Garmin returns 202 with a failure in the body for duplicate/bad file
      // but may also return 400 for parse errors
      const failures = axErr.response?.data?.detailedImportResult?.failures;
      if (failures?.length) {
        const msg = failures[0]?.messages?.[0]?.content ?? "";
        if (msg.toLowerCase().includes("duplicate")) {
          throw new GarminUploadError("Activity already exists in Garmin", "duplicate");
        }
        throw new GarminUploadError(`Garmin rejected file: ${msg}`, "invalid_file");
      }

      throw new GarminUploadError(`Garmin upload failed: ${axErr.message}`, "unknown");
    }

    // Check for failure embedded in a 2xx response (Garmin's quirk)
    const result = data?.detailedImportResult as Record<string, unknown> | undefined;
    const failures = result?.failures as { messages?: { content: string }[] }[] | undefined;
    if (failures?.length) {
      const msg = failures[0]?.messages?.[0]?.content ?? "";
      if (msg.toLowerCase().includes("duplicate")) {
        throw new GarminUploadError("Activity already exists in Garmin", "duplicate");
      }
      throw new GarminUploadError(`Garmin rejected file: ${msg}`, "invalid_file");
    }

    const id = String(result?.uploadId ?? data?.uploadId ?? "");
    if (!id) throw new GarminUploadError("No upload ID returned by Garmin", "unknown");
    return { id };
  }
}
