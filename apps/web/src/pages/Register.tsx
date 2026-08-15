import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.register(email, password, displayName);
      setRegistered(true);
      // Dev mode: the API returns the verification link (no SMTP configured —
      // the email is only printed to the server console). Show it so testers
      // can complete registration.
      if (res.devVerifyUrl) setDevVerifyUrl(res.devVerifyUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  if (registered) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Check your email</h1>
          <p>
            We sent a verification link to <strong>{email}</strong>. Click it to activate your account, then{" "}
            <Link to="/login">log in</Link>.
          </p>
          {devVerifyUrl && (
            <p style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <span style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)" }}>Dev mode (no email sent — click to verify)</span>
              <br />
              <a href={devVerifyUrl} className="support-link">
                {devVerifyUrl}
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>Sign up for SpotifAI</h1>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        <button type="submit" className="btn-primary">
          Sign up
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
