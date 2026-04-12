import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db";

export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/login", req.url));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const user = await getUserByEmail(email);
    if (!user) return NextResponse.redirect(new URL("/login?error=1", req.url));
    if (!user.password_hash) {
      return NextResponse.redirect(new URL("/login?oauth_only=1", req.url));
    }
    if (!user.email_verified) {
      return NextResponse.redirect(new URL("/login?unverified=1", req.url));
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return NextResponse.redirect(new URL("/login?error=1", req.url));
    await createSession(user.id, user.email);
    return NextResponse.redirect(new URL("/", req.url));
  } catch (e) {
    console.error("login error", e);
    return NextResponse.redirect(new URL("/login?error=server", req.url));
  }
}
