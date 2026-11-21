import { FormEvent, useState } from "react";
import { Activity, ArrowRight, Eye, EyeOff, HeartPulse, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser } from "../services/api";
import type { User } from "../types";
import HeartVisual from "../components/HeartVisual";

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await loginUser({ email, password });
      onLogin(user);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.message || "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel auth-left">
        <div className="auth-brand">
          <HeartPulse size={22} /> HeartDisease<span>Predict</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow"><Activity size={14} /> HEART DISEASE RISK ANALYTICS</p>
          <h1>Understand your heart health with <span>clear data.</span></h1>
          <p>
            Sign in to clean a dataset, compare bias and variance, chart numeric and categorical patterns, and download a report with engineered feature columns.
          </p>
          <ul className="login-points login-points-on-dark">
            <li><ShieldCheck size={16} /> Private account, saved in this browser</li>
            <li><Activity size={16} /> Regression, bias–variance, and category charts</li>
            <li><HeartPulse size={16} /> Console PDF ends with new feature columns</li>
          </ul>
        </div>
        <HeartVisual />
      </section>

      <section className="auth-panel auth-right">
        <div className="auth-box">
          <p className="form-kicker">WELCOME BACK</p>
          <h2>Sign in to your account</h2>
          <p className="form-subtitle">Access your heart disease analytics dashboard.</p>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={submit}>
            <label htmlFor="login-email">Email address</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
            </div>
            <label htmlFor="login-password">Password</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input id="login-password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button className="primary-btn full" disabled={loading}>
              {loading ? "Signing in..." : <>Sign in <ArrowRight size={18} /></>}
            </button>
          </form>
          <p className="switch-text">Don't have an account? <Link to="/register">Create account</Link></p>
          <p className="medical-note">For educational and research use. This dashboard does not replace professional medical advice.</p>
        </div>
      </section>
    </main>
  );
}
