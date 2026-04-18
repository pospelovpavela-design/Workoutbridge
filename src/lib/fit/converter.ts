import { FitWriter } from "fit-file-writer";
import type { StravaActivity, StravaStream } from "../strava/client";

const SPORT_MAP: Record<string, string> = {
  Run: "running",
  Ride: "cycling",
  Walk: "walking",
  Swim: "swimming",
  Hike: "hiking",
  VirtualRide: "cycling",
  VirtualRun: "running",
};

export function convertToFit(
  activity: StravaActivity,
  streams: Record<string, StravaStream>
): Buffer {
  const writer = new FitWriter();

  const startTime = new Date(activity.start_date);
  const sport = SPORT_MAP[activity.sport_type] ?? "generic";
  const timeStream = streams["time"]?.data ?? [];
  const latlngStream = streams["latlng"]?.data as unknown as [number, number][] ?? [];
  const altStream = streams["altitude"]?.data ?? [];
  const hrStream = streams["heartrate"]?.data ?? [];
  const cadenceStream = streams["cadence"]?.data ?? [];
  const wattsStream = streams["watts"]?.data ?? [];

  writer.writeFileId({
    type: "activity",
    manufacturer: "development",
    product: 0,
    time_created: startTime,
  });

  writer.writeActivity({
    timestamp: startTime,
    total_timer_time: activity.elapsed_time,
    num_sessions: 1,
    type: "manual",
    event: "activity",
    event_type: "stop",
  });

  writer.writeSession({
    timestamp: startTime,
    start_time: startTime,
    sport,
    total_elapsed_time: activity.elapsed_time,
    total_timer_time: activity.moving_time,
    total_distance: activity.distance,
    total_ascent: Math.round(activity.total_elevation_gain),
    avg_heart_rate: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    avg_cadence: activity.average_cadence ? Math.round(activity.average_cadence) : undefined,
    avg_power: activity.average_watts ? Math.round(activity.average_watts) : undefined,
    event: "session",
    event_type: "stop",
  });

  writer.writeLap({
    timestamp: startTime,
    start_time: startTime,
    total_elapsed_time: activity.elapsed_time,
    total_distance: activity.distance,
    event: "lap",
    event_type: "stop",
  });

  for (let i = 0; i < timeStream.length; i++) {
    const ts = new Date(startTime.getTime() + timeStream[i] * 1000);
    const record: Record<string, unknown> = { timestamp: ts };

    if (latlngStream[i]) {
      record.position_lat = latlngStream[i][0];
      record.position_long = latlngStream[i][1];
    }
    if (altStream[i] !== undefined) record.altitude = altStream[i];
    if (hrStream[i] !== undefined) record.heart_rate = Math.round(hrStream[i]);
    if (cadenceStream[i] !== undefined) record.cadence = Math.round(cadenceStream[i]);
    if (wattsStream[i] !== undefined) record.power = Math.round(wattsStream[i]);

    writer.writeRecord(record);
  }

  return Buffer.from(writer.finish());
}
