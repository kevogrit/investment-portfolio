export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string; error?: string }>;
}) {
  const params = await searchParams;
  const pending = params.pending === "1";
  const err = params.error;

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <div className="card">
        <h2>Email verification</h2>
        {pending && (
          <>
            <p className="success">Check your inbox for a verification link. You must confirm your email before you can sign in.</p>
            <p className="muted" style={{ marginTop: 12 }}>
              Did not get the email? In production, set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code>. When developing locally without Resend, check the terminal where <code>npm run dev</code> is running — the verification URL is logged there.
            </p>
          </>
        )}
        {err === "invalid" && (
          <p className="error">This verification link is invalid or has already been used.</p>
        )}
        {err === "expired" && (
          <p className="error">This link has expired. Please sign up again or contact support.</p>
        )}
        <p style={{ marginTop: 16 }}>
          <a href="/login">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
