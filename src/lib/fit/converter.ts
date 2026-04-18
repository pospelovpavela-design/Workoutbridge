import type { StravaActivity, StravaStream } from "../strava/client";

const SPORT_MAP: Record<string, string> = {
  Run: "Running",
  Ride: "Biking",
  Walk: "Walking",
  Swim: "Swimming",
  Hike: "Hiking",
  VirtualRide: "Biking",
  VirtualRun: "Running",
  WeightTraining: "Other",
  Workout: "Other",
  Yoga: "Other",
  Crossfit: "Other",
  Rowing: "Other",
  StandUpPaddling: "Other",
};

function isoZ(d: Date) {
  return d.toISOString();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function convertToTcx(
  activity: StravaActivity,
  streams: Record<string, StravaStream>
): string {
  const startTime = new Date(activity.start_date);
  const sport = SPORT_MAP[activity.sport_type] ?? "Other";

  const timeStream = streams["time"]?.data ?? [];
  const latlngStream = (streams["latlng"]?.data ?? []) as unknown as [number, number][];
  const altStream = streams["altitude"]?.data ?? [];
  const hrStream = streams["heartrate"]?.data ?? [];
  const cadenceStream = streams["cadence"]?.data ?? [];
  const wattsStream = streams["watts"]?.data ?? [];
  const distStream = streams["distance"]?.data ?? [];

  const hasGps = latlngStream.length > 0;

  const trackpoints = timeStream.map((t, i) => {
    const ts = new Date(startTime.getTime() + t * 1000);
    const lat = hasGps ? latlngStream[i]?.[0] : undefined;
    const lng = hasGps ? latlngStream[i]?.[1] : undefined;
    const alt = altStream[i];
    const hr = hrStream[i];
    const cad = cadenceStream[i];
    const watts = wattsStream[i];
    const dist = distStream[i];

    const parts: string[] = [`        <Time>${isoZ(ts)}</Time>`];

    if (lat != null && lng != null) {
      parts.push(
        `        <Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lng}</LongitudeDegrees></Position>`
      );
    }
    if (alt != null) parts.push(`        <AltitudeMeters>${alt.toFixed(1)}</AltitudeMeters>`);
    if (dist != null) parts.push(`        <DistanceMeters>${dist.toFixed(1)}</DistanceMeters>`);
    if (hr != null) parts.push(`        <HeartRateBpm><Value>${Math.round(hr)}</Value></HeartRateBpm>`);
    if (cad != null) parts.push(`        <Cadence>${Math.round(cad)}</Cadence>`);
    if (watts != null) {
      parts.push(
        `        <Extensions><ns3:TPX><ns3:Watts>${Math.round(watts)}</ns3:Watts></ns3:TPX></Extensions>`
      );
    }

    return `      <Trackpoint>\n${parts.join("\n")}\n      </Trackpoint>`;
  });

  const lapParts: string[] = [
    `        <TotalTimeSeconds>${activity.elapsed_time}</TotalTimeSeconds>`,
    `        <DistanceMeters>${activity.distance.toFixed(1)}</DistanceMeters>`,
    `        <Intensity>Active</Intensity>`,
    `        <TriggerMethod>Manual</TriggerMethod>`,
  ];

  if (activity.average_heartrate) {
    lapParts.push(
      `        <AverageHeartRateBpm><Value>${Math.round(activity.average_heartrate)}</Value></AverageHeartRateBpm>`
    );
  }
  if (activity.calories) {
    lapParts.push(`        <Calories>${Math.round(activity.calories)}</Calories>`);
  }

  if (trackpoints.length > 0) {
    lapParts.push(`        <Track>\n${trackpoints.join("\n")}\n        </Track>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="${sport}">
      <Id>${isoZ(startTime)}</Id>
      <Lap StartTime="${isoZ(startTime)}">
${lapParts.join("\n")}
      </Lap>
      <Notes>${escapeXml(activity.name)}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}
