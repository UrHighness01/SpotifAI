import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }
    // Scrub the token from the URL/history immediately — it's only needed for this one request.
    window.history.replaceState(null, "", window.location.pathname);
    api
      .verifyEmail(token)
      .then((res) => {
        setStatus("ok");
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-form">
        <h1>Email verification</h1>
        {status === "pending" && <p>Verifying…</p>}
        {status === "ok" && (
          <p>
            {message} <Link to="/login">Log in</Link>
          </p>
        )}
        {status === "error" && <div className="auth-error">{message}</div>}
      </div>
    </div>
  );
}
