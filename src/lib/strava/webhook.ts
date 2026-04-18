export async function registerStravaWebhook(): Promise<number | null> {
  const callbackUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/strava`;

  // Check if subscription already exists
  const listRes = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`
  );
  if (listRes.ok) {
    const existing = await listRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return existing[0].id as number;
    }
  }

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}

export async function deleteStravaWebhook(subId: number): Promise<void> {
  await fetch(
    `https://www.strava.com/api/v3/push_subscriptions/${subId}?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`,
    { method: "DELETE" }
  );
}
