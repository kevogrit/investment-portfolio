"use client";

import { useState } from "react";

export function DevVerifyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="auth-dev-verify">
      <p className="auth-dev-verify__title">Local development — no email sent</p>
      <p className="muted auth-dev-verify__hint">
        With <code>RESEND_API_KEY</code> unset, use this link to verify (same as the one in your terminal):
      </p>
      <div className="auth-dev-verify__row">
        <a className="auth-dev-verify__link" href={href}>
          Verify email (dev)
        </a>
        <button
          type="button"
          className="secondary auth-dev-verify__copy"
          onClick={() => {
            void navigator.clipboard.writeText(href).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

