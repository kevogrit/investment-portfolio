import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { getUserByVerificationToken, markEmailVerified } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", req.url));
  }
  const user = await getUserByVerificationToken(token);
  if (!user) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", req.url));
  }
  if (!user.verification_token_expires) {
    return NextResponse.redirect(new URL("/verify-email?error=expired", req.url));
  }
  const exp = new Date(user.verification_token_expires).getTime();
  if (Number.isNaN(exp) || exp < Date.now()) {
    return NextResponse.redirect(new URL("/verify-email?error=expired", req.url));
  }
  await markEmailVerified(user.id);
  await createSession(user.id, user.email);
  return NextResponse.redirect(new URL("/", req.url));
}
