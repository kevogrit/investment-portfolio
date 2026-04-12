import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  createGoogleUser,
  getUserByEmail,
  getUserByGoogleSub,
  linkGoogleToUser,
  savePortfolio,
} from "@/lib/db";
import { defaultPortfolio } from "@/lib/types";
import { exchangeGoogleCode, fetchGoogleUserProfile } from "@/lib/oauth-google";

const STATE_COOKIE = "oauth_google_state";

function redirectWithCookieClear(req: Request, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url));
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

function redirectHomeWithCookieClear(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectWithCookieClear(req, `/login?oauth=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return redirectWithCookieClear(req, "/login?oauth=invalid");
  }

  const cookieStore = cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;
  if (!expected || expected !== state) {
    return redirectWithCookieClear(req, "/login?oauth=state");
  }

  const base = getAppBaseUrl(req);
  const redirectUri = `${base}/api/auth/google/callback`;

  let accessToken: string;
  try {
    accessToken = await exchangeGoogleCode(code, redirectUri);
  } catch (e) {
    console.error("google token", e);
    return redirectWithCookieClear(req, "/login?oauth=token");
  }

  let profile: Awaited<ReturnType<typeof fetchGoogleUserProfile>>;
  try {
    profile = await fetchGoogleUserProfile(accessToken);
  } catch (e) {
    console.error("google profile", e);
    return redirectWithCookieClear(req, "/login?oauth=profile");
  }

  if (!profile.email || !profile.verified_email) {
    return redirectWithCookieClear(req, "/login?oauth=email");
  }

  const email = profile.email.trim().toLowerCase();
  const sub = profile.id;

  const bySub = await getUserByGoogleSub(sub);
  if (bySub) {
    await createSession(bySub.id, bySub.email);
    return redirectHomeWithCookieClear(req);
  }

  const byEmail = await getUserByEmail(email);
  if (byEmail) {
    if (byEmail.google_sub && byEmail.google_sub !== sub) {
      return redirectWithCookieClear(req, "/login?oauth=conflict");
    }
    await linkGoogleToUser(byEmail.id, sub);
    await createSession(byEmail.id, byEmail.email);
    return redirectHomeWithCookieClear(req);
  }

  const user = await createGoogleUser(email, sub);
  await savePortfolio(user.id, defaultPortfolio());
  await createSession(user.id, user.email);
  return redirectHomeWithCookieClear(req);
}
