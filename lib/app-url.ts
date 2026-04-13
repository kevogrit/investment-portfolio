/**
 * Base URL for this request (OAuth redirect_uri, verification links in email, etc.).
 *
 * If we always used `AUTH_URL` (production domain), users on a **preview** or **deployment
 * `*.vercel.app` URL** would get: cookie set on one host, Google redirect_uri pointing at
 * another → `oauth=state` ("session expired") and redirects to the wrong site.
 *
 * Rule: use the **actual request host** whenever it differs from the configured canonical
 * host. Use canonical only when the request already hits that host (production on custom domain).
 */
export function getAppBaseUrl(req: Request) {
  const requestOrigin = new URL(req.url).origin;
  const requestHost = new URL(req.url).hostname;

  const env = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!env) return requestOrigin;

  const canonical = env.replace(/\/$/, "");
  let canonicalHost: string;
  try {
    canonicalHost = new URL(canonical).hostname;
  } catch {
    return requestOrigin;
  }

  if (requestHost === canonicalHost) {
    return canonical;
  }

  return requestOrigin;
}
