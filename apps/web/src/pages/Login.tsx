import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setResendSent(false);
    try {
      await api.login(email, password);
      await refresh();
      navigate("/");
    } catch (err) {
      const anyErr = err as Error & { code?: string };
      if (anyErr.code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerification(true);
      }
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const onResend = async () => {
    await api.resendVerification(email);
    setResendSent(true);
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>Log in to SpotifAI</h1>
        {error && <div className="auth-error">{error}</div>}
        {needsVerification && (
          <p>
            {resendSent ? (
              "Verification email resent — check your inbox."
            ) : (
              <>
                Didn't get the link?{" "}
                <button type="button" onClick={onResend} className="link-btn">
                  Resend verification email
                </button>
              </>
            )}
          </p>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" className="btn-primary">
          Log in
        </button>
        <p className="auth-switch">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="auth-switch">
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
