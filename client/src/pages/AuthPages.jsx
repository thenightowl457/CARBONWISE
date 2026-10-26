import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { Field, aria, Notice, Busy } from "../components/ui";
import { useCatalog } from "../hooks";

function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: "", password: "" });
  const { busy, error, run } = useSubmit(async () => { await login(f.email, f.password); nav(loc.state?.from || "/dashboard", { replace: true }); });
  const fe = error?.fields || {};
  return (
    <div className="auth-wrap card">
      <h1>Welcome back</h1>
      <form onSubmit={run} noValidate>
        {error && !error.details.length && <Notice kind="error">{error.message}</Notice>}
        <Field id="email" label="Email" error={fe.email}><input {...aria("email", fe.email)} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field id="password" label="Password" error={fe.password}><input {...aria("password", fe.password)} type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <button className="btn" disabled={busy}><Busy busy={busy}>{busy ? "Logging in…" : "Log in"}</Busy></button>
      </form>
      <p className="small muted" style={{ marginTop: "1rem" }}>New here? <Link to="/register">Create an account</Link></p>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const cat = useCatalog();
  const [f, setF] = useState({ name: "", email: "", password: "", region: "IN" });
  const { busy, error, run } = useSubmit(async () => { await register(f); nav("/dashboard", { replace: true }); });
  const fe = error?.fields || {};
  return (
    <div className="auth-wrap card">
      <h1>Create your account</h1>
      <form onSubmit={run} noValidate>
        {error && !error.details.length && <Notice kind="error">{error.message}</Notice>}
        <Field id="name" label="Name" error={fe.name}><input {...aria("name", fe.name)} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field id="email" label="Email" error={fe.email}><input {...aria("email", fe.email)} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field id="password" label="Password" error={fe.password} hint="At least 8 characters, with a letter and a number."><input {...aria("password", fe.password, true)} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <Field id="region" label="Region" hint="Decides which emission factors are used (e.g. your electricity grid)." error={fe.region}>
          <select {...aria("region", fe.region, true)} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {Object.entries(cat?.regions || { IN: "India", GLOBAL: "Global average" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <button className="btn" disabled={busy}><Busy busy={busy}>{busy ? "Creating…" : "Sign up"}</Busy></button>
        <p className="small muted" style={{ marginTop: "1rem" }}>We only store your name, email and the activities you log. You can export or delete everything from your profile.</p>
      </form>
      <p className="small muted">Already registered? <Link to="/login">Log in</Link></p>
    </div>
  );
}
