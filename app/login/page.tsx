import { getGoogleOAuthConfig } from "@/lib/oauth-google";

const oauthMessages: Record<string, string> = {
  unconfigured: "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment.",
  invalid: "Google sign-in could not be completed. Try again.",
  state: "Sign-in session expired. Please try Google sign-in again.",
  token: "Could not complete Google sign-in. Try again.",
  profile: "Could not load your Google profile. Try again.",
  email: "Google did not return a verified email address.",
  conflict: "This email is already linked to a different Google account.",
  access_denied: "Google sign-in was cancelled.",
  server:
    "Sign-in failed on the server. In Vercel, set Production env vars: JWT_SECRET and POSTGRES_URL. Check Vercel → Logs if it persists.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    exists?: string;
    unverified?: string;
    oauth_only?: string;
    oauth?: string;
  }>;
}) {
  const params = await searchParams;
  const showGoogle = Boolean(getGoogleOAuthConfig());
  const err = params.error;
  const oauth = params.oauth;
  const oauthMsg = oauth ? oauthMessages[oauth] || `Google sign-in failed (${oauth}).` : null;

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <div className="card">
        <h2>My Investment Portfolio</h2>
        {err === "1" && <p className="error">Invalid email or password.</p>}
        {err === "server" && (
          <p className="error">Something went wrong. Please try again.</p>
        )}
        {params.exists === "1" && (
          <p className="muted">An account with this email already exists. Sign in below.</p>
        )}
        {params.unverified === "1" && (
          <p className="error">Verify your email before signing in. Check your inbox for the link we sent.</p>
        )}
        {params.oauth_only === "1" && (
          <p className="error">This account uses Google sign-in. Use the button below.</p>
        )}
        {oauthMsg && <p className="error">{oauthMsg}</p>}

        {showGoogle && (
          <>
            <a href="/api/auth/google" className="btn-google-link">
              Continue with Google
            </a>
            <div className="auth-divider">or</div>
          </>
        )}

        <form action="/api/auth/login" method="post">
          <input name="email" type="email" placeholder="Email address" required style={{ marginBottom: 10 }} />
          <input name="password" type="password" placeholder="Password" required style={{ marginBottom: 10 }} />
          <button type="submit">Sign in</button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Don&apos;t have an account? <a href="/signup">Create account</a>
        </p>
      </div>
    </div>
  );
}
