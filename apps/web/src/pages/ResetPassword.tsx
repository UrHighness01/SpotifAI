import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export function ResetPassword() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Reset your password</h1>
          <div className="auth-error">Missing reset token. Use the link from your email.</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Password reset</h1>
          <p>
            Your password has been updated. <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>Choose a new password</h1>
        {error && <div className="auth-error">{error}</div>}
        <label>
          New password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        <button type="submit" className="btn-primary">
          Reset password
        </button>
      </form>
    </div>
  );
}
