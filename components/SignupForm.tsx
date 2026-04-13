"use client";

import { useState } from "react";

export function SignupForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action="/api/auth/signup"
      method="post"
      onSubmit={() => {
        setIsSubmitting(true);
      }}
    >
      <input
        name="email"
        type="email"
        placeholder="Email address"
        required
        autoComplete="email"
        style={{ marginBottom: 10 }}
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        autoComplete="new-password"
        minLength={8}
        pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}"
        title="Use at least 8 characters, including uppercase, lowercase, and a number."
        style={{ marginBottom: 10 }}
      />
      <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
