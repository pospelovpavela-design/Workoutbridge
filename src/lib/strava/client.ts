import axios from "axios";

const BASE = "https://www.strava.com/api/v3";

export type StravaStream = {
  type: string;
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
};

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  calories?: number;
};

export class StravaClient {
  constructor(private accessToken: string) {}

  async getActivity(id: number): Promise<StravaActivity> {
    const { data } = await axios.get(`${BASE}/activities/${id}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return data;
  }

  async getActivityStreams(id: number): Promise<Record<string, StravaStream>> {
    const keys = "time,latlng,altitude,heartrate,cadence,watts,distance";
    const { data } = await axios.get(`${BASE}/activities/${id}/streams`, {
      params: { keys, key_by_type: true },
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return data;
  }

  static async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
  }> {
    const { data } = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return data;
  }
}
