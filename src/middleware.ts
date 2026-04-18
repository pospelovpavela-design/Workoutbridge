export { auth as middleware } from "@/lib/auth/session";

export const config = {
  matcher: ["/dashboard/:path*", "/connect/:path*", "/sync-log/:path*", "/settings/:path*"],
};
