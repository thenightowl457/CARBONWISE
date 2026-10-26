import { useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import { useFetch, useCatalog, fmtDate, CAT } from "../hooks";
import { Loading, ErrorBox, Empty, Confirm, Notice } from "../components/ui";

export default function Activities() {
  const [f, setF] = useState({ category: "", from: "", to: "", page: 1 });
  const { data, error, loading, reload } = useFetch(`/activities?${qs({ ...f, limit: 15 })}`);
  const [flash, setFlash] = useState(null);
  const bad = f.from && f.to && f.from > f.to;
  const set = (patch) => setF((x) => ({ ...x, page: 1, ...patch }));

  const del = async (id) => {
    try { await api(`/activities/${id}`, { method: "DELETE" }); setFlash({ kind: "ok", text: "Activity deleted." }); reload(); }
    catch (e) { setFlash({ kind: "error", text: e.message }); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const filtered = f.category || f.from || f.to;

  return (
    <>
      <div className="page-head">
        <div><h1>Activities</h1><p>Everything you've logged, with the CO₂e each entry adds.</p></div>
        <Link className="btn" to="/activities/new">+ Add activity</Link>
      </div>

      <div className="card">
        <div className="row mb" role="search" aria-label="Filter activities">
          <div className="field"><label htmlFor="fc">Category</label>
            <select id="fc" value={f.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">All categories</option>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ff">From</label><input id="ff" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-invalid={bad || undefined} /></div>
          <div className="field"><label htmlFor="ft">To</label><input id="ft" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-invalid={bad || undefined} /></div>
          {filtered && <button className="btn secondary" onClick={() => setF({ category: "", from: "", to: "", page: 1 })}>Clear</button>}
        </div>
        {bad && <div className="err-text" role="alert">Start date must be on or before the end date.</div>}
        {flash && <Notice kind={flash.kind}>{flash.text}</Notice>}

        {loading && <Loading />}
        {error && <ErrorBox error={error} onRetry={reload} />}
        {data && data.items.length === 0 && (
          <Empty title={filtered ? "No activities match these filters" : "No activities yet"}>
            {filtered ? <p>Try widening the dates or clearing the filters.</p> : <><p>Start by logging how you got around today, your last electricity bill, or what you ate.</p><Link className="btn" to="/activities/new">Add your first activity</Link></>}
          </Empty>
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Logged activities</caption>
                <thead><tr><th>Date</th><th>Activity</th><th className="num">Quantity</th><th className="num">CO₂e</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td>{fmtDate(a.activity_date)}</td>
                      <td><span className={`chip ${a.category}`}>{CAT[a.category].label}</span> {a.label}{a.notes && <div className="small muted">{a.notes}</div>}</td>
                      <td className="num">{a.quantity} {a.unit.replace("_14_2kg", " (14.2 kg)")}</td>
                      <td className="num">
                        {a.co2e_kg != null
                          ? <span title={`Factor ${a.factor.value} kg per ${a.factor.unit_basis} · v${a.factor.version} · ${a.factor.source}`}>{a.co2e_kg.toFixed(2)} kg</span>
                          : <span className="chip warn" title={a.unavailable}>unavailable</span>}
                      </td>
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        <Link className="btn secondary small" to={`/activities/${a.id}/edit`} aria-label={`Edit ${a.label} on ${a.activity_date}`}>Edit</Link>{" "}
                        <Confirm label="Delete" onConfirm={() => del(a.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: ".75rem", justifyContent: "space-between", alignItems: "center" }}>
              <span className="small muted">{data.total} {data.total === 1 ? "activity" : "activities"} · hover a CO₂e value to see the factor used</span>
              <span>
                <button className="btn secondary small" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Previous</button>{" "}
                <span className="small">Page {f.page} of {pages}</span>{" "}
                <button className="btn secondary small" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</button>
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
