"use client";

import { loginRequestSchema } from "@knowflow/shared";
import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";

import { useAuth } from "../../components/auth-provider";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const input = loginRequestSchema.parse({
        username: formData.get("username"),
        password: formData.get("password"),
      });
      await login(input);
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-surface">
      <div className="login-panel">
        <div className="page-heading">
          <p className="eyebrow">Account</p>
          <h1>Sign in</h1>
        </div>
        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Username
            <input name="username" autoComplete="username" placeholder="admin" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          {error !== null && <div className="form-error">{error}</div>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </section>
  );
}
