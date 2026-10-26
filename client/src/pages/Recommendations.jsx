import { useState } from "react";
import { Link } from "react-router-dom";
import { useFetch, fmtKg, CAT } from "../hooks";
import { Loading, ErrorBox, Empty, Notice } from "../components/ui";

export default function Recommendations() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useFetch(`/recommendations?days=${days}`);
  return (
    <>
      <div className="page-head">
        <div><h1>Recommendations</h1><p>Rule-based suggestions from your own activity, ranked by estimated impact.</p></div>
        <div><label className="small muted" htmlFor="days">Based on activity from the last</label><br />
          <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto" }}>
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select></div>
      </div>
      {loading && <Loading label="Finding your best opportunities…" />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <Notice kind="info">{data.ranking_logic}</Notice>
          {data.items.length === 0 && (
            <div className="card"><Empty title={data.empty_reason === "no_data" ? "No activity to analyse yet" : "No suggestions right now"}>
              {data.empty_reason === "no_data"
                ? <><p>Log a few activities from the last {days} days and we'll suggest where you can cut the most.</p><Link className="btn" to="/activities/new">Add an activity</Link></>
                : <p>Nothing you've logged crosses the thresholds for our current suggestions. Try a longer period.</p>}
            </Empty></div>
          )}
          {data.items.map((r) => (
            <article key={r.rule_key} className="card rec" style={{ marginTop: "1rem" }} aria-labelledby={`r-${r.rule_key}`}>
              <div className="rank" aria-label={`Rank ${r.rank}`}>{r.rank}</div>
              <div>
                <h2 id={`r-${r.rule_key}`} style={{ marginBottom: ".2rem" }}>{r.title} <span className={`chip ${r.category}`}>{CAT[r.category].label}</span></h2>
                <p><strong>Do this:</strong> {r.action}</p>
                <p className="muted"><strong>Why you're seeing it:</strong> {r.why}</p>
                <details><summary>Assumptions & rule details</summary>
                  <ul className="small muted">{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}<li>Rule <code>{r.rule_key}</code> v{r.rule_version}</li></ul>
                </details>
              </div>
              <div className="impact">
                {r.estimated_reduction_kg != null ? <><b>−{fmtKg(r.estimated_reduction_kg)}</b><span className="small muted">{r.estimated_reduction_pct != null && `≈ ${r.estimated_reduction_pct}% of your total · `}per {days} days</span></> : <span className="small muted">Impact can't be estimated</span>}
                <div className="small muted">{r.impact_label}</div>
                <Link className="btn secondary small" style={{ marginTop: ".5rem" }} to="/simulator">Try in simulator</Link>
              </div>
            </article>
          ))}
        </>
      )}
    </>
  );
}
