import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "portfolio_session";

function jwtSecret() {
  const raw =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "dev-only-jwt-secret-change-me-for-local-testing"
      : undefined);
  if (!raw) {
    throw new Error("JWT_SECRET is required in production");
  }
  return new TextEncoder().encode(raw);
}

export async function createSession(userId: number, email: string) {
  const token = await new SignJWT({ sub: String(userId), email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function clearSession() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return {
      userId,
      email: String(payload.email || ""),
    };
  } catch {
    return null;
  }
}
