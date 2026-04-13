import { getGoogleOAuthConfig } from "@/lib/oauth-google";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: err } = await searchParams;
  const showGoogle = Boolean(getGoogleOAuthConfig());

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <div className="card">
        <h2>Create account</h2>
        <p className="muted">Password: min 8 chars, with uppercase, lowercase, and one digit.</p>
        <p className="muted">
          After you submit, the next screen explains how to verify your email before you can sign in.
        </p>
        {err === "invalid" && (
          <p className="error">Please enter a valid email and a password that meets the rules.</p>
        )}
        {err === "server" && (
          <p className="error">
            Something went wrong. If you are on your own machine, ensure dependencies are installed (
            <code>npm install</code>) and try again.
          </p>
        )}
        {err === "email" && (
          <p className="error">We could not send the verification email. Check RESEND_API_KEY and EMAIL_FROM, then try again.</p>
        )}

        {showGoogle && (
          <>
            <a href="/api/auth/google" className="btn-google-link">
              Continue with Google
            </a>
            <div className="auth-divider">or</div>
          </>
        )}

        <form action="/api/auth/signup" method="post">
          <input name="email" type="email" placeholder="Email address" required style={{ marginBottom: 10 }} />
          <input name="password" type="password" placeholder="Password" required style={{ marginBottom: 10 }} />
          <button type="submit">Create account</button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  );
}
