import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await api.forgotPassword(email);
    setMessage(res.message);
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>Reset your password</h1>
        {message ? (
          <p>{message}</p>
        ) : (
          <>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button type="submit" className="btn-primary">
              Send reset link
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </div>
  );
}
