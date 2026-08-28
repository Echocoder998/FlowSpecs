"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Login failed.");
      }

      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1>MCE Directory Admin</h1>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        <button type="submit" className="admin-primary-button" disabled={submitting || !password}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        {error && <p className="admin-error">{error}</p>}
      </form>
    </div>
  );
}
