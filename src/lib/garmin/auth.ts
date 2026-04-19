const SSO_LOGIN_URL = "https://sso.garmin.com/sso/signin";
const CONNECT_MODERN = "https://connect.garmin.com/modern/";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SSO_PARAMS = new URLSearchParams({
  service: CONNECT_MODERN,
  webhost: CONNECT_MODERN,
  source: "https://connect.garmin.com/signin/",
  redirectAfterAccountLoginUrl: CONNECT_MODERN,
  redirectAfterAccountCreationUrl: CONNECT_MODERN,
  gauthHost: "https://sso.garmin.com/sso",
  locale: "en_US",
  id: "gauth-widget",
  clientId: "GarminConnect",
  rememberMeShown: "true",
  rememberMeChecked: "false",
  createAccountShown: "true",
  openCreateAccount: "false",
  displayNameShown: "false",
  consumeServiceTicket: "false",
  initialFocus: "true",
  embedWidget: "false",
  generateExtraServiceTicket: "true",
  generateTwoExtraServiceTickets: "false",
  generateNoServiceTicket: "false",
  globalOptInShown: "true",
  globalOptInChecked: "false",
  mobile: "false",
  connectLegalTerms: "true",
  showTermsOfUse: "false",
  showPrivacyPolicy: "false",
  locationPromptShown: "true",
  showPassword: "true",
  useCustomHeader: "false",
  mfaRequired: "false",
});

function getSetCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
  const combined = res.headers.get("set-cookie") ?? "";
  if (!combined) return [];
  return combined.split(/,\s*(?=[A-Za-z0-9_-]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean);
}

function extractCsrf(html: string): string | null {
  // Handle any attribute order in the input tag
  const match =
    html.match(/<input[^>]+name="_csrf"[^>]*value="([^"]+)"/i) ??
    html.match(/<input[^>]+value="([^"]+)"[^>]*name="_csrf"/i);
  return match?.[1] ?? null;
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

  // Step 1: Load SSO login page to get CSRF token + cookies
  const loginPageUrl = `${SSO_LOGIN_URL}?${SSO_PARAMS}`;
  const pageRes = await fetch(loginPageUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
  });
  const html = await pageRes.text();
  const csrf = extractCsrf(html);
  if (!csrf) {
    const preview = html.slice(0, 300).replace(/\s+/g, " ");
    throw new Error(`Garmin CSRF not found (status ${pageRes.status}). Page preview: ${preview}`);
  }
  const pageCookies = getSetCookies(pageRes);

  // Step 2: Submit credentials
  const body = new URLSearchParams({
    username: email,
    password,
    _csrf: csrf,
    embed: "false",
    displayNameShown: "false",
  });
  for (const [k, v] of SSO_PARAMS.entries()) body.set(k, v);

  const signinRes = await fetch(SSO_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: pageCookies.join("; "),
      Origin: "https://sso.garmin.com",
      Referer: loginPageUrl,
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body,
    redirect: "manual",
  });

  const location = signinRes.headers.get("location") ?? "";
  const ticket = location.match(/[?&]ticket=(ST-[^&]+)/)?.[1];
  if (!ticket) {
    const signinBody = await signinRes.text().catch(() => "");
    const badCreds =
      signinBody.toLowerCase().includes("invalid") ||
      signinBody.toLowerCase().includes("incorrect") ||
      signinBody.toLowerCase().includes("password") ||
      signinRes.status === 200;
    throw new Error(
      badCreds
        ? "Garmin login failed: check GARMIN_EMAIL and GARMIN_PASSWORD"
        : `Garmin SSO unexpected response (status ${signinRes.status}, location: ${location || "none"})`
    );
  }

  // Step 3: Exchange ticket for Connect session
  let cookies: string[] = [];
  let nextUrl: string | null = `${CONNECT_MODERN}?ticket=${ticket}`;
  let hops = 0;
  while (nextUrl && hops < 8) {
    const r: Response = await fetch(nextUrl, {
      headers: {
        Cookie: cookies.join("; "),
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
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
