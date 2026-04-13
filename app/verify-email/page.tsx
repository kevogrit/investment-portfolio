import { DevVerifyLink } from "@/components/DevVerifyLink";
import { getDevelopmentVerificationLink } from "@/lib/dev-verification-link";

function safeEmailParam(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded)) return null;
    return decoded.toLowerCase();
  } catch {
    return null;
  }
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string; email?: string; error?: string }>;
}) {
  const params = await searchParams;
  const pending = params.pending === "1";
  const err = params.error;
  const email = safeEmailParam(params.email);

  const devVerifyHref = pending && email ? await getDevelopmentVerificationLink(email) : null;

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <div className="card">
        {pending ? (
          <>
            <h2>Check your email</h2>
            <p className="success" style={{ marginTop: 0 }}>
              We sent a verification link{email ? (
                <>
                  {" "}
                  to <strong>{email}</strong>
                </>
              ) : null}
              . You need to confirm your address before you can sign in.
            </p>
            <ol className="auth-steps">
              <li>Open the inbox for that email address.</li>
              <li>Click the verification link in our message (it expires after 48 hours).</li>
              <li>Return here and sign in on the next screen.</li>
            </ol>
            <p className="muted" style={{ marginTop: 14 }}>
              Didn&apos;t receive anything? Check spam or promotions. In production, ensure{" "}
              <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> are set in Vercel.
            </p>
            {devVerifyHref ? <DevVerifyLink href={devVerifyHref} /> : null}
            {!devVerifyHref && process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY ? (
              <p className="muted" style={{ marginTop: 12 }}>
                Without Resend, the verification URL is also printed in the terminal where{" "}
                <code>npm run dev</code> is running.
              </p>
            ) : null}
          </>
        ) : (
          <h2>Email verification</h2>
        )}

        {!pending && err === "invalid" && (
          <p className="error">This verification link is invalid or has already been used.</p>
        )}
        {!pending && err === "expired" && (
          <p className="error">This link has expired. Please sign up again or contact support.</p>
        )}
        <p style={{ marginTop: 20 }}>
          <a href="/login">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
