import { useState, Fragment } from "react";
import { api, qs } from "../api";
import { useFetch, useCatalog, todayStr, CAT } from "../hooks";
import { Loading, ErrorBox, Notice, Field, aria, Busy } from "../components/ui";

export default function Admin() {
  const [tab, setTab] = useState("factors");
  const tabs = [["factors", "Emission factors"], ["rules", "Recommendation rules"], ["log", "Change log"]];
  return (
    <>
      <div className="page-head"><div><h1>Admin</h1><p>Maintain shared calculation and recommendation settings. Personal activity data is not shown here.</p></div></div>
      <div className="pill-tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "factors" && <Factors />}
      {tab === "rules" && <Rules />}
      {tab === "log" && <Log />}
    </>
  );
}

function Factors() {
  const cat = useCatalog();
  const [current, setCurrent] = useState(true);
  const [region, setRegion] = useState("IN");
  const [category, setCategory] = useState("");
  const { data, error, loading, reload } = useFetch(`/admin/emission-factors?${qs({ current: current ? "true" : "", region, category })}`);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ value: "", source: "", valid_from: todayStr(), notes: "" });
  const [errs, setErrs] = useState({});
  const [top, setTop] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (f) => { setEdit(f.id); setForm({ value: String(f.value), source: "", valid_from: todayStr(), notes: "" }); setErrs({}); setTop(null); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setTop(null);
    try {
      await api(`/admin/emission-factors/${edit}`, { method: "PATCH", body: { value: Number(form.value), source: form.source, valid_from: form.valid_from, notes: form.notes || undefined } });
      setEdit(null); reload();
    } catch (err) { err.details?.length ? setErrs(err.fields) : setTop(err.message); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <div className="row mb">
        <div className="field"><label htmlFor="fr">Region</label><select id="fr" value={region} onChange={(e) => setRegion(e.target.value)}>{Object.entries(cat?.regions || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="fcat">Category</label><select id="fcat" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All</option>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <label style={{ display: "flex", gap: ".4rem", alignItems: "center", flex: "0 0 auto" }}><input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} /> Current versions only</label>
      </div>
      <p className="small muted">Editing a factor never changes history: it closes the current version and creates a new one from the effective date. Past activities keep the version in force on their date.</p>
      {loading && <Loading />}{error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <div className="table-wrap"><table>
          <thead><tr><th>Activity</th><th className="num">kg CO₂e / unit</th><th>Unit</th><th>Ver.</th><th>Effective</th><th>Source</th><th /></tr></thead>
          <tbody>
            {data.items.map((f) => (
              <Fragment key={f.id}>
                <tr className={f.valid_to ? "dim" : ""}>
                  <td><span className={`chip ${f.category}`}>{CAT[f.category].label}</span> {f.activity_type}</td>
                  <td className="num">{f.value}</td><td>{f.unit_basis}</td><td>v{f.version}</td>
                  <td>{f.valid_from}{f.valid_to ? ` → ${f.valid_to}` : " →"}</td><td className="small">{f.source}</td>
                  <td>{!f.valid_to && <button className="btn secondary small" onClick={() => open(f)}>New version</button>}</td>
                </tr>
                {edit === f.id && (
                  <tr><td colSpan={7} style={{ background: "var(--green-soft)" }}>
                    <form onSubmit={save} noValidate>
                      {top && <Notice kind="error">{top}</Notice>}
                      <div className="row">
                        <Field id="ev" label={`New value (kg per ${f.unit_basis})`} error={errs.value}><input {...aria("ev", errs.value)} type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
                        <Field id="es" label="Source / reference" error={errs.source}><input {...aria("es", errs.source)} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. DEFRA 2025, table 7" /></Field>
                        <Field id="ed" label="Effective from" error={errs.valid_from}><input {...aria("ed", errs.valid_from)} type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
                      </div>
                      <div className="actions"><button className="btn small" disabled={busy}><Busy busy={busy}>Create version {f.version + 1}</Busy></button><button type="button" className="btn secondary small" onClick={() => setEdit(null)}>Cancel</button></div>
                    </form></td></tr>
                )}
              </Fragment>
            ))}
          </tbody></table></div>
      )}
    </section>
  );
}

const EMPTY_RULE = { rule_key: "", activity_type: "car_petrol", actionType: "shift", to: "metro", fraction: 50, min_quantity: 20, title: "", action_text: "", rationale: "You logged {qty} {unit} over the last {days} days ({co2e} kg CO2e).", priority: 5, enabled: true };

function Rules() {
  const cat = useCatalog();
  const { data, error, loading, reload } = useFetch("/admin/recommendation-rules");
  const [edit, setEdit] = useState(null); // rule id or "new"
  const [f, setF] = useState(EMPTY_RULE);
  const [errs, setErrs] = useState({});
  const [top, setTop] = useState(null);
  const [busy, setBusy] = useState(false);
  const types = cat ? cat.categories.flatMap((c) => c.types) : [];
  const baseOf = (t) => types.find((x) => x.activity_type === t)?.base_unit;

  const openEdit = (r) => {
    const a = r.params.action;
    setF({ rule_key: r.rule_key, activity_type: r.params.activity_type, actionType: a.type, to: a.to || "metro", fraction: Math.round(a.fraction * 100), min_quantity: r.params.min_quantity, title: r.title, action_text: r.action_text, rationale: r.rationale, priority: r.priority, enabled: r.enabled });
    setEdit(r.id); setErrs({}); setTop(null);
  };
  const toggle = async (r) => { await api(`/admin/recommendation-rules/${r.id}`, { method: "PATCH", body: { enabled: !r.enabled } }); reload(); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setTop(null);
    const params = { activity_type: f.activity_type, min_quantity: Number(f.min_quantity), window_days: 30, action: f.actionType === "shift" ? { type: "shift", to: f.to, fraction: Number(f.fraction) / 100 } : { type: "reduce", fraction: Number(f.fraction) / 100 } };
    const body = { title: f.title, params, action_text: f.action_text, rationale: f.rationale, priority: Number(f.priority), enabled: f.enabled };
    try {
      if (edit === "new") await api("/admin/recommendation-rules", { method: "POST", body: { rule_key: f.rule_key, ...body } });
      else await api(`/admin/recommendation-rules/${edit}`, { method: "PATCH", body });
      setEdit(null); reload();
    } catch (err) { err.details?.length ? setErrs(err.fields) : setTop(err.message); } finally { setBusy(false); }
  };
  const set = (p) => setF({ ...f, ...p });
  const err = (k) => errs[k] || Object.entries(errs).find(([x]) => x.startsWith(k))?.[1];

  return (
    <section className="card">
      <div className="row mb" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="small muted" style={{ margin: 0 }}>Rules fire when the logged quantity for an activity crosses the threshold. Impact = estimated reduction using current factors.</p>
        <button className="btn" onClick={() => { setF(EMPTY_RULE); setEdit("new"); setErrs({}); setTop(null); }}>+ New rule</button>
      </div>
      {loading && <Loading />}{error && <ErrorBox error={error} onRetry={reload} />}

      {edit && (
        <form onSubmit={save} noValidate className="card" style={{ background: "var(--green-soft)", marginBottom: "1rem" }}>
          <h3>{edit === "new" ? "New rule" : `Edit rule ${f.rule_key}`}</h3>
          {top && <Notice kind="error">{top}</Notice>}
          <div className="row mb">
            {edit === "new" && <Field id="rk" label="Rule key" error={err("rule_key")} hint="lowercase_with_underscores"><input {...aria("rk", err("rule_key"), true)} value={f.rule_key} onChange={(e) => set({ rule_key: e.target.value })} /></Field>}
            <Field id="rt" label="Title" error={err("title")}><input {...aria("rt", err("title"))} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          </div>
          <div className="row mb">
            <Field id="ra" label="When the user logs…" error={err("params.activity_type")}><select id="ra" value={f.activity_type} onChange={(e) => set({ activity_type: e.target.value })} disabled={edit !== "new"}>{types.map((t) => <option key={t.activity_type} value={t.activity_type}>{t.label}</option>)}</select></Field>
            <Field id="rm" label={`…at least (${baseOf(f.activity_type)} per 30 days)`} error={err("params.min_quantity")}><input {...aria("rm", err("params.min_quantity"))} type="number" min={0} step="any" value={f.min_quantity} onChange={(e) => set({ min_quantity: e.target.value })} /></Field>
            <Field id="rat" label="Suggest to…"><select id="rat" value={f.actionType} onChange={(e) => set({ actionType: e.target.value })}><option value="shift">Replace with another activity</option><option value="reduce">Reduce use</option></select></Field>
            {f.actionType === "shift" && <Field id="rto" label="Replace with" error={err("params.action.to")}><select id="rto" value={f.to} onChange={(e) => set({ to: e.target.value })}>{types.filter((t) => t.activity_type !== f.activity_type).map((t) => <option key={t.activity_type} value={t.activity_type}>{t.label}</option>)}</select></Field>}
            <Field id="rf" label="Share (%)" error={err("params.action.fraction")}><input {...aria("rf", err("params.action.fraction"))} type="number" min={1} max={100} value={f.fraction} onChange={(e) => set({ fraction: e.target.value })} /></Field>
          </div>
          <Field id="rac" label="Action text" error={err("action_text")}><input {...aria("rac", err("action_text"))} value={f.action_text} onChange={(e) => set({ action_text: e.target.value })} /></Field>
          <Field id="rr" label="Rationale (shown as 'why you're seeing this')" error={err("rationale")} hint="Placeholders: {qty} {unit} {co2e} {days}"><input {...aria("rr", err("rationale"), true)} value={f.rationale} onChange={(e) => set({ rationale: e.target.value })} /></Field>
          <div className="row mb">
            <Field id="rp" label="Priority (tie-breaker, 0-100)" error={err("priority")}><input {...aria("rp", err("priority"))} type="number" value={f.priority} onChange={(e) => set({ priority: e.target.value })} /></Field>
            <label style={{ display: "flex", gap: ".4rem", alignItems: "center", flex: "0 0 auto" }}><input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enabled</label>
          </div>
          <div className="actions"><button className="btn" disabled={busy}><Busy busy={busy}>Save rule</Busy></button><button type="button" className="btn secondary" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}

      {data && (
        <div className="table-wrap"><table>
          <thead><tr><th>Rule</th><th>Trigger</th><th>Action</th><th className="num">Priority</th><th>Ver.</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((r) => (
            <tr key={r.id} className={r.enabled ? "" : "dim"}>
              <td><strong>{r.title}</strong><div className="small muted"><code>{r.rule_key}</code></div></td>
              <td className="small">{r.params.activity_type} ≥ {r.params.min_quantity} / {r.params.window_days}d</td>
              <td className="small">{r.params.action.type === "shift" ? `Shift ${Math.round(r.params.action.fraction * 100)}% → ${r.params.action.to}` : `Reduce ${Math.round(r.params.action.fraction * 100)}%`}</td>
              <td className="num">{r.priority}</td><td>v{r.version}</td>
              <td><span className={`chip ${r.enabled ? "" : "off"}`}>{r.enabled ? "Enabled" : "Disabled"}</span></td>
              <td style={{ whiteSpace: "nowrap" }}><button className="btn secondary small" onClick={() => openEdit(r)}>Edit</button> <button className="btn secondary small" onClick={() => toggle(r)}>{r.enabled ? "Disable" : "Enable"}</button></td>
            </tr>))}</tbody></table></div>
      )}
    </section>
  );
}

function Log() {
  const { data, error, loading, reload } = useFetch("/admin/change-log");
  return (
    <section className="card">
      <h2>Recent changes</h2>
      {loading && <Loading />}{error && <ErrorBox error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <p className="muted">No changes recorded yet.</p>}
      {data && data.items.length > 0 && (
        <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>
          {data.items.map((c) => (
            <tr key={c.id}><td className="small">{new Date(c.created_at).toLocaleString()}</td><td className="small">{c.user_email || "—"}</td>
              <td>{c.entity.replace("_", " ")} #{c.entity_id} · {c.action}</td>
              <td className="small muted">{c.details?.value != null ? `value ${c.details.previous_value ?? ""} → ${c.details.value}; ` : ""}{c.details?.source || c.details?.changes ? JSON.stringify(c.details.source || c.details.changes).slice(0, 120) : ""}</td></tr>
          ))}</tbody></table></div>
      )}
    </section>
  );
}
