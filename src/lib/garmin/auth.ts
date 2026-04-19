const SSO_EMBED_BASE = "https://sso.garmin.com/sso/embed";
const SSO_SIGNIN_URL = "https://sso.garmin.com/sso/signin";
const CONNECT_MODERN = "https://connect.garmin.com/modern";

const SSO_PARAMS = {
  id: "gauth-widget",
  embedWidget: "true",
  gauthHost: "https://sso.garmin.com/sso",
  service: CONNECT_MODERN,
  source: "https://connect.garmin.com/signin/",
  redirectAfterAccountLoginUrl: CONNECT_MODERN,
  redirectAfterAccountCreationUrl: CONNECT_MODERN,
};

function getSetCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
  const combined = res.headers.get("set-cookie") ?? "";
  if (!combined) return [];
  return combined.split(/,\s*(?=[A-Za-z0-9_-]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean);
}

let cached: { cookie: string; until: number } | null = null;

export function invalidateGarminSession() {
  cached = null;
}

export async function getGarminSessionCookie(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.cookie;

  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set GARMIN_EMAIL and GARMIN_PASSWORD in .env.local");
  }

  const queryStr = new URLSearchParams(SSO_PARAMS).toString();

  // Step 1: Get CSRF token from embed page
  const embedRes = await fetch(`${SSO_EMBED_BASE}?${queryStr}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Workoutbridge)" },
  });
  const html = await embedRes.text();
  const csrf = html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error("Garmin CSRF token not found — login page may have changed");
  const embedCookies = getSetCookies(embedRes);

  // Step 2: Submit credentials
  const signinRes = await fetch(SSO_SIGNIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: embedCookies.join("; "),
      Origin: "https://sso.garmin.com",
      Referer: `${SSO_EMBED_BASE}?${queryStr}`,
      "User-Agent": "Mozilla/5.0 (Workoutbridge)",
    },
    body: new URLSearchParams({ ...SSO_PARAMS, username: email, password, _csrf: csrf, embed: "true" }),
    redirect: "manual",
  });

  const location = signinRes.headers.get("location") ?? "";
  const ticket = location.match(/[?&]ticket=(ST-[^&]+)/)?.[1];
  if (!ticket) {
    const body = await signinRes.text().catch(() => "");
    const badCreds =
      body.toLowerCase().includes("invalid") ||
      body.toLowerCase().includes("incorrect") ||
      signinRes.status === 200;
    throw new Error(
      badCreds
        ? "Garmin login failed: check GARMIN_EMAIL and GARMIN_PASSWORD"
        : `Garmin SSO unexpected response (status ${signinRes.status})`
    );
  }

  // Step 3: Follow ticket redirect chain to get session cookies
  let cookies: string[] = [];
  let nextUrl: string | null = `${CONNECT_MODERN}?ticket=${ticket}`;
  let hops = 0;
  while (nextUrl && hops < 6) {
    const r: Response = await fetch(nextUrl, {
      headers: { Cookie: cookies.join("; "), "User-Agent": "Mozilla/5.0 (Workoutbridge)" },
      redirect: "manual",
    });
    cookies = [...new Set([...cookies, ...getSetCookies(r)])];
    nextUrl = r.headers.get("location");
    hops++;
  }

  const cookieStr = cookies.join("; ");
  cached = { cookie: cookieStr, until: Date.now() + 23 * 60 * 60 * 1000 };
  return cookieStr;
}
