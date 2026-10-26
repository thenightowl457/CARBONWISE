import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useCatalog } from "../hooks";
import { Field, aria, Notice, Busy } from "../components/ui";

export default function Profile() {
  const { user, setUser } = useAuth();
  const cat = useCatalog();
  const nav = useNavigate();
  const [f, setF] = useState({ name: user.name, region: user.region, distance_unit: user.distance_unit });
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState({ open: false, password: "", error: null });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null); setErrors({});
    try { setUser((await api("/auth/me", { method: "PATCH", body: f })).user); setMsg({ kind: "ok", text: "Saved. Your numbers now use the new settings." }); }
    catch (err) { setErrors(err.fields || {}); setMsg({ kind: "error", text: err.message }); } finally { setBusy(false); }
  };
  const remove = async (e) => {
    e.preventDefault();
    try { await api("/auth/me", { method: "DELETE", body: { password: del.password } }); setUser(null); nav("/"); }
    catch (err) { setDel({ ...del, error: err.message }); }
  };

  return (
    <div className="form-narrow">
      <h1>Profile & preferences</h1>
      <form className="card" onSubmit={save} noValidate>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <p className="muted small">Signed in as {user.email}</p>
        <Field id="name" label="Name" error={errors.name}><input {...aria("name", errors.name)} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field id="region" label="Region" hint="Changing region recalculates all your CO₂e using that region's emission factors." error={errors.region}>
          <select {...aria("region", errors.region, true)} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {Object.entries(cat?.regions || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></Field>
        <Field id="du" label="Preferred distance unit" hint="Used as the default when logging trips.">
          <select {...aria("du")} value={f.distance_unit} onChange={(e) => setF({ ...f, distance_unit: e.target.value })}><option value="km">Kilometres</option><option value="mi">Miles</option></select></Field>
        <button className="btn" disabled={busy}><Busy busy={busy}>Save changes</Busy></button>
      </form>

      <section className="card"><h2>Your data</h2>
        <p className="muted">We store your name, email, the activities you log and any scenarios you save. Nothing else.</p>
        <a className="btn secondary" href="/api/auth/export" download>Download my data (JSON)</a>
      </section>

      <section className="card"><h2>Delete account</h2>
        <p className="muted">Permanently deletes your account, activities and saved scenarios. This can't be undone.</p>
        {!del.open ? <button className="btn danger" onClick={() => setDel({ ...del, open: true })}>Delete my account…</button> : (
          <form onSubmit={remove}>
            {del.error && <Notice kind="error">{del.error}</Notice>}
            <Field id="dpw" label="Confirm with your password"><input id="dpw" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /></Field>
            <div className="actions"><button className="btn danger" disabled={!del.password}>Permanently delete</button><button type="button" className="btn secondary" onClick={() => setDel({ open: false, password: "", error: null })}>Cancel</button></div>
          </form>)}
      </section>
    </div>
  );
}
