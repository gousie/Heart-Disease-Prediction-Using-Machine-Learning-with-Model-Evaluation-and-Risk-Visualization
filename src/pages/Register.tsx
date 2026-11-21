import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, HeartPulse, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../services/api";
import type { User } from "../types";

export default function Register({ onLogin }: { onLogin: (u: User) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) return setError("Password must contain at least 6 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const user = await registerUser({
        name: form.name,
        email: form.email,
        password: form.password
      });
      onLogin(user);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page register-page">
      <section className="register-hero">
        <div className="auth-brand">
          <HeartPulse size={22} color="#2ecc71" /> HeartDisease<span>Predict</span>
        </div>
        <div>
          <p className="eyebrow">YOUR HEALTH ANALYTICS SPACE</p>
          <h1>
            Create your personal
            <br />
            <span>heart health workspace.</span>
          </h1>
          <p>Keep your patient information and analysis results organized in one place.</p>
        </div>
        <div className="register-art">
          <HeartPulse size={120} strokeWidth={1.1} />
        </div>
      </section>

      <section className="auth-panel auth-right">
        <div className="auth-box">
          <div className="mobile-heart">
            <HeartPulse size={28} />
          </div>
          <p className="form-kicker">GET STARTED</p>
          <h2>Create your account</h2>
          <p className="form-subtitle">No administrator account is required.</p>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={submit}>
            <label htmlFor="reg-name">Full name</label>
            <div className="input-wrap">
              <UserRound size={18} />
              <input
                id="reg-name"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your name"
                required
              />
            </div>

            <label htmlFor="reg-email">Email address</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
              />
            </div>

            <label htmlFor="reg-password">Password</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="reg-password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 6 characters"
                required
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <label htmlFor="reg-confirm">Confirm password</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="reg-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                placeholder="Repeat your password"
                required
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showConfirm ? "Hide password" : "Show password"}
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button className="primary-btn full" type="submit" disabled={loading}>
              {loading ? "Creating..." : <>Create account <ArrowRight size={18} /></>}
            </button>
          </form>
          <p className="switch-text">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
          <p className="medical-note">
            For educational and research use. This dashboard does not replace professional medical advice.
          </p>
        </div>
      </section>
    </main>
  );
}
