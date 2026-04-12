/**
 * Sends verification email via Resend when RESEND_API_KEY is set.
 * Without it, logs the link (configure Resend for production).
 */
export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Portfolio <onboarding@resend.dev>";

  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Verify your email",
        html: `<p>Thanks for signing up. <a href="${verifyUrl}">Verify your email address</a> to finish creating your account.</p><p>If you did not sign up, you can ignore this message.</p>`,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Resend error: ${res.status} ${t}`);
    }
    return;
  }

  console.warn("[email] RESEND_API_KEY is not set. Verification link:", verifyUrl);
}
