import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { buildGoogleAuthorizeUrl, getGoogleOAuthConfig } from "@/lib/oauth-google";

const STATE_COOKIE = "oauth_google_state";

export async function GET(req: Request) {
  if (!getGoogleOAuthConfig()) {
    return NextResponse.redirect(new URL("/login?oauth=unconfigured", req.url));
  }
  const base = getAppBaseUrl(req);
  const redirectUri = `${base}/api/auth/google/callback`;
  const state = randomBytes(24).toString("hex");
  const authorizeUrl = buildGoogleAuthorizeUrl({ redirectUri, state });
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
