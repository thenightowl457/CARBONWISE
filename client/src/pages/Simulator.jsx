import { useState } from "react";
import { api, qs } from "../api";
import { useFetch, useCatalog, fmtKg, CAT } from "../hooks";
import PeriodPicker, { presetRange } from "../components/PeriodPicker";
import { CompareBars } from "../components/Charts";
import { Loading, ErrorBox, Notice, Busy, Stat, Confirm } from "../components/ui";

const blank = (type = "scale") => ({ type, activity_type: "car_petrol", percent: -30, from: "car_petrol", to: "metro", fraction: 50, quantity: 20, unit: "km", _k: Math.random() });

export default function Simulator() {
  const cat = useCatalog();
  const [range, setRange] = useState(presetRange("30"));
  const [adj, setAdj] = useState([blank()]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const saved = useFetch("/simulations");
  const base = useFetch(`/dashboard/summary?${qs(range)}`);

  const types = cat ? cat.categories.flatMap((c) => c.types.map((t) => ({ ...t, category: c.category }))) : [];
  const byKey = Object.fromEntries(types.map((t) => [t.activity_type, t]));
  const patch = (i, p) => { setAdj((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x))); setResult(null); };
  const TypeSelect = ({ id, value, onChange, onlyBase, label }) => (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {cat.categories.map((c) => (
        <optgroup key={c.category} label={CAT[c.category].label}>
          {c.types.filter((t) => !onlyBase || t.base_unit === onlyBase).map((t) => <option key={t.activity_type} value={t.activity_type}>{t.label}</option>)}
        </optgroup>
      ))}
    </select>
  );

  const payload = (extra = {}) => ({
    from: range.from, to: range.to, ...extra,
    adjustments: adj.map((a) => a.type === "scale" ? { type: "scale", activity_type: a.activity_type, percent: Number(a.percent) }
      : a.type === "shift" ? { type: "shift", from: a.from, to: a.to, fraction: Number(a.fraction) / 100 }
      : { type: "add", activity_type: a.activity_type, quantity: Number(a.quantity), unit: a.unit }),
  });

  const run = async (extra) => {
    setBusy(true); setError(null);
    try { setResult(await api("/simulations", { method: "POST", body: payload(extra) })); if (extra?.save) saved.reload(); }
    catch (e) { setError(e); setResult(null); } finally { setBusy(false); }
  };
  const reset = () => { setAdj([blank()]); setResult(null); setError(null); };

  if (!cat) return <Loading />;
  const r = result;
  const dClass = r && (r.delta_kg <= 0 ? "delta-good" : "delta-bad");

  return (
    <>
      <div className="page-head">
        <div><h1>What-if simulator</h1><p>Test a change against your real activity. <strong>Nothing here changes your saved records.</strong></p></div>
        <PeriodPicker value={range} onChange={(v) => { setRange(v); setResult(null); }} initial="30" label="Baseline period" />
      </div>

      <div className="grid g-main">
        <section className="card" aria-labelledby="changes-h">
          <h2 id="changes-h">Changes to test</h2>
          {adj.map((a, i) => (
            <fieldset key={a._k} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: ".75rem", marginBottom: ".75rem" }}>
              <legend className="small"><strong>Change {i + 1}</strong></legend>
              <div className="row">
                <div className="field"><label htmlFor={`t${i}`}>Type of change</label>
                  <select id={`t${i}`} value={a.type} onChange={(e) => patch(i, { type: e.target.value })}>
                    <option value="scale">Do more / less of something</option><option value="shift">Replace one activity with another</option><option value="add">Add a new activity</option>
                  </select></div>
                {a.type === "scale" && <>
                  <div className="field"><label htmlFor={`a${i}`}>Activity</label><TypeSelect id={`a${i}`} value={a.activity_type} onChange={(v) => patch(i, { activity_type: v })} /></div>
                  <div className="field"><label htmlFor={`p${i}`}>Change in quantity (%)</label><input id={`p${i}`} type="number" min={-100} max={1000} value={a.percent} onChange={(e) => patch(i, { percent: e.target.value })} /></div>
                </>}
                {a.type === "shift" && <>
                  <div className="field"><label htmlFor={`f${i}`}>Replace this…</label><TypeSelect id={`f${i}`} value={a.from} onChange={(v) => patch(i, { from: v, to: byKey[v].base_unit === byKey[a.to].base_unit ? a.to : types.find((t) => t.base_unit === byKey[v].base_unit && t.activity_type !== v).activity_type })} /></div>
                  <div className="field"><label htmlFor={`to${i}`}>…with this</label><TypeSelect id={`to${i}`} value={a.to} onlyBase={byKey[a.from].base_unit} onChange={(v) => patch(i, { to: v })} /></div>
                  <div className="field"><label htmlFor={`fr${i}`}>Share replaced (%)</label><input id={`fr${i}`} type="number" min={0} max={100} value={a.fraction} onChange={(e) => patch(i, { fraction: e.target.value })} /></div>
                </>}
                {a.type === "add" && <>
                  <div className="field"><label htmlFor={`aa${i}`}>Activity</label><TypeSelect id={`aa${i}`} value={a.activity_type} onChange={(v) => patch(i, { activity_type: v, unit: byKey[v].units[0] })} /></div>
                  <div className="field"><label htmlFor={`q${i}`}>Quantity</label><input id={`q${i}`} type="number" min={0} step="any" value={a.quantity} onChange={(e) => patch(i, { quantity: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`u${i}`}>Unit</label><select id={`u${i}`} value={a.unit} onChange={(e) => patch(i, { unit: e.target.value })}>{byKey[a.activity_type].units.map((u) => <option key={u}>{u}</option>)}</select></div>
                </>}
              </div>
              {adj.length > 1 && <button className="btn link" onClick={() => { setAdj(adj.filter((_, j) => j !== i)); setResult(null); }}>Remove this change</button>}
            </fieldset>
          ))}
          <div className="actions">
            <button className="btn secondary" onClick={() => setAdj([...adj, blank()])} disabled={adj.length >= 10}>+ Add another change</button>
            <button className="btn" onClick={() => run()} disabled={busy}><Busy busy={busy}>{busy ? "Calculating…" : "Run simulation"}</Busy></button>
            <button className="btn secondary" onClick={reset}>Reset</button>
          </div>
          {error && <><Notice kind="error">{error.message}{error.details?.length > 0 && <ul>{error.details.map((d, i) => <li key={i}>{d.field}: {d.message}</li>)}</ul>}</Notice></>}
        </section>

        <section className="card" aria-labelledby="base-h">
          <h2 id="base-h">Your baseline</h2>
          {base.loading && <Loading />}
          {base.error && <ErrorBox error={base.error} onRetry={base.reload} />}
          {base.data && <>
            <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>{fmtKg(base.data.total_kg)}</p>
            <p className="small muted">CO₂e from {base.data.activity_count} logged activities, {range.from} → {range.to}</p>
            {base.data.activity_count === 0 && <Notice kind="warn">No activity in this period, so the baseline is 0. You can still add hypothetical activities.</Notice>}
          </>}
        </section>
      </div>

      {r && (
        <section className="card" aria-labelledby="res-h" aria-live="polite" style={{ marginTop: "1rem" }}>
          <h2 id="res-h">Result <span className="chip warn">Hypothetical, not saved to your activities</span></h2>
          <div className="grid g3">
            <Stat label="Baseline" value={fmtKg(r.baseline_kg)} />
            <Stat label="Projected" value={fmtKg(r.projected_kg)} />
            <div className="card stat"><div className="label">Change</div>
              <div className={`value ${dClass}`}>{r.delta_kg > 0 ? "+" : ""}{fmtKg(r.delta_kg)}</div>
              <div className="small">{r.delta_pct != null ? <span className={dClass}>{r.delta_pct > 0 ? "+" : ""}{r.delta_pct}%</span> : <span className="muted">{r.delta_pct_note}</span>}</div></div>
          </div>
          <div style={{ marginTop: "1rem" }}><CompareBars a={r.by_category.baseline} b={r.by_category.projected} aLabel="Baseline" bLabel="Projected" /></div>
          <h3 style={{ marginTop: "1rem" }}>Impact of each change (on its own)</h3>
          <ul>{r.adjustments.map((a, i) => <li key={i}>{a.description}: <strong className={a.delta_kg <= 0 ? "delta-good" : "delta-bad"}>{a.delta_kg > 0 ? "+" : ""}{fmtKg(a.delta_kg)}</strong></li>)}</ul>
          <details><summary>Assumptions</summary><ul className="small muted">{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
          <div className="row" style={{ marginTop: "1rem" }}>
            <div className="field"><label htmlFor="sn">Save this scenario for later (optional)</label><input id="sn" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metro twice a week" /></div>
            <button className="btn secondary" disabled={busy || !name.trim()} onClick={() => run({ save: true, name: name.trim() })}>Save scenario</button>
          </div>
          {r.saved_id && <Notice kind="ok">Scenario saved.</Notice>}
        </section>
      )}

      <section className="card" aria-labelledby="sv-h" style={{ marginTop: "1rem" }}>
        <h2 id="sv-h">Saved scenarios</h2>
        {saved.loading && <Loading />}
        {saved.data && saved.data.items.length === 0 && <p className="muted">None yet. Run a simulation and give it a name to keep it here.</p>}
        {saved.data && saved.data.items.length > 0 && (
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Period</th><th className="num">Baseline</th><th className="num">Projected</th><th /></tr></thead><tbody>
            {saved.data.items.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td>{s.period_from} → {s.period_to}</td><td className="num">{fmtKg(s.baseline_kg)}</td><td className="num">{fmtKg(s.projected_kg)}</td>
                <td className="right"><Confirm label="Delete" onConfirm={async () => { await api(`/simulations/${s.id}`, { method: "DELETE" }); saved.reload(); }} /></td></tr>
            ))}</tbody></table></div>
        )}
        <p className="small muted">Saved values are a snapshot from when you ran them; re-run for current numbers.</p>
      </section>
    </>
  );
}
