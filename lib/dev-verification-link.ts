import { getAppBaseUrlFromHeaders } from "@/lib/app-url";
import { getUserByEmail } from "@/lib/db";

/**
 * When developing without Resend, exposes a one-click verification URL (never in production).
 */
export async function getDevelopmentVerificationLink(email: string): Promise<string | null> {
  if (process.env.NODE_ENV !== "development") return null;
  if (process.env.RESEND_API_KEY) return null;

  const user = await getUserByEmail(email.trim().toLowerCase());
  if (!user?.verification_token || user.email_verified) return null;

  if (user.verification_token_expires) {
    const exp = new Date(user.verification_token_expires);
    if (!Number.isNaN(exp.getTime()) && exp < new Date()) return null;
  }

  const base = await getAppBaseUrlFromHeaders();
  return `${base}/api/auth/verify-email?token=${encodeURIComponent(user.verification_token)}`;
}
