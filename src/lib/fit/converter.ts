import type { StravaActivity, StravaStream } from "../strava/client";

const SPORT_MAP: Record<string, string> = {
  Run: "Running",
  Ride: "Biking",
  Walk: "Walking",
  Swim: "Swimming",
  Hike: "Hiking",
  VirtualRide: "Biking",
  VirtualRun: "Running",
};

function isoZ(d: Date) {
  return d.toISOString();
}

export function convertToTcx(
  activity: StravaActivity,
  streams: Record<string, StravaStream>
): string {
  const startTime = new Date(activity.start_date);
  const sport = SPORT_MAP[activity.sport_type] ?? "Other";

  const timeStream = streams["time"]?.data ?? [];
  const latlngStream = streams["latlng"]?.data as unknown as [number, number][] ?? [];
  const altStream = streams["altitude"]?.data ?? [];
  const hrStream = streams["heartrate"]?.data ?? [];
  const cadenceStream = streams["cadence"]?.data ?? [];
  const wattsStream = streams["watts"]?.data ?? [];

  const trackpoints = timeStream.map((t, i) => {
    const ts = new Date(startTime.getTime() + t * 1000);
    const lat = latlngStream[i]?.[0];
    const lng = latlngStream[i]?.[1];
    const alt = altStream[i];
    const hr = hrStream[i];
    const cad = cadenceStream[i];
    const watts = wattsStream[i];

    return `      <Trackpoint>
        <Time>${isoZ(ts)}</Time>
        ${lat != null && lng != null ? `<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lng}</LongitudeDegrees></Position>` : ""}
        ${alt != null ? `<AltitudeMeters>${alt.toFixed(1)}</AltitudeMeters>` : ""}
        ${hr != null ? `<HeartRateBpm><Value>${Math.round(hr)}</Value></HeartRateBpm>` : ""}
        ${cad != null ? `<Cadence>${Math.round(cad)}</Cadence>` : ""}
        ${watts != null ? `<Extensions><ns3:TPX><ns3:Watts>${Math.round(watts)}</ns3:Watts></ns3:TPX></Extensions>` : ""}
      </Trackpoint>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="${sport}">
      <Id>${isoZ(startTime)}</Id>
      <Lap StartTime="${isoZ(startTime)}">
        <TotalTimeSeconds>${activity.elapsed_time}</TotalTimeSeconds>
        <DistanceMeters>${activity.distance.toFixed(1)}</DistanceMeters>
        ${activity.average_heartrate ? `<AverageHeartRateBpm><Value>${Math.round(activity.average_heartrate)}</Value></AverageHeartRateBpm>` : ""}
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpoints.join("\n")}
        </Track>
      </Lap>
      <Notes>${activity.name}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}
