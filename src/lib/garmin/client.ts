import axios from "axios";
import FormData from "form-data";

const UPLOAD_URL = "https://connectapi.garmin.com/upload-service/upload";

export class GarminClient {
  constructor(private accessToken: string) {}

  async uploadFitFile(fitBuffer: Buffer, filename: string): Promise<{ id: string }> {
    const form = new FormData();
    form.append("file", fitBuffer, { filename, contentType: "application/octet-stream" });

    const { data } = await axios.post(UPLOAD_URL, form, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "NK": "NT",
        ...form.getHeaders(),
      },
    });

    return { id: data?.detailedImportResult?.uploadId ?? data?.uploadId };
  }

  static async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const { data } = await axios.post(
      "https://connectapi.garmin.com/oauth-service/oauth/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        auth: {
          username: process.env.GARMIN_CLIENT_ID!,
          password: process.env.GARMIN_CLIENT_SECRET!,
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    return data;
  }
}
