/** Canonical app origin for links (emails, OAuth redirects). Prefer AUTH_URL in production. */
export function getAppBaseUrl(req: Request) {
  const env = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  return new URL(req.url).origin;
}
