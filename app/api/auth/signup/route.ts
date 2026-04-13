import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { createUser, getUserByEmail, savePortfolio } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { defaultPortfolio } from "@/lib/types";

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

function validPassword(p: string) {
  return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
}

/** Browsers open URLs with GET — send users to the real sign-up page. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/signup", req.url));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    if (!email || !password || !validPassword(password)) {
      return NextResponse.redirect(new URL("/signup?error=invalid", req.url));
    }
    const exists = await getUserByEmail(email);
    if (exists) return NextResponse.redirect(new URL("/login?exists=1", req.url));

    const hash = await bcrypt.hash(password, 10);
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
    const user = await createUser(email, hash, token, expires);
    await savePortfolio(user.id, defaultPortfolio());

    const base = getAppBaseUrl(req);
    const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    try {
      await sendVerificationEmail(email, verifyUrl);
    } catch (e) {
      console.error("send verification email", e);
      return NextResponse.redirect(new URL("/signup?error=email", req.url));
    }

    const verifyPending = new URL("/verify-email", req.url);
    verifyPending.searchParams.set("pending", "1");
    verifyPending.searchParams.set("email", email);
    return NextResponse.redirect(verifyPending);
  } catch (e) {
    console.error("signup error", e);
    return NextResponse.redirect(new URL("/signup?error=server", req.url));
  }
}
