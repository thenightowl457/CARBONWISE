import { useState } from "react";
import { Link } from "react-router-dom";
import { useFetch, fmtKg, CAT } from "../hooks";
import { qs } from "../api";
import PeriodPicker, { presetRange } from "../components/PeriodPicker";
import { CategoryDoughnut, TrendChart } from "../components/Charts";
import { Loading, ErrorBox, Notice, Stat, Empty } from "../components/ui";
import { useAuth } from "../auth";

export default function Dashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState(presetRange("30"));
  const summary = useFetch(`/dashboard/summary?${qs(range)}`);
  const recs = useFetch("/recommendations?days=30");
  const prog = useFetch("/progress");
  const s = summary.data;

  return (
    <>
      <div className="page-head">
        <div><h1>Welcome back, {user.name.split(" ")[0]}</h1><p>Your estimated footprint for the selected period.</p></div>
        <PeriodPicker value={range} onChange={setRange} initial="30" />
      </div>

      {summary.loading && <Loading label="Calculating your footprint…" />}
      {summary.error && <ErrorBox error={summary.error} onRetry={summary.reload} />}

      {s && s.activity_count === 0 && (
        <div className="card"><Empty title="No activities in this period">
          <p>Log your first commute, energy bill or meal and your dashboard will come alive.</p>
          <Link className="btn" to="/activities/new">Add an activity</Link>
        </Empty></div>
      )}

      {s && s.activity_count > 0 && (
        <>
          <div className="grid g3">
            <Stat label="Total estimated" value={s.total_kg >= 1000 ? s.total_tonnes.toFixed(2) : s.total_kg.toFixed(1)} unit={s.total_kg >= 1000 ? "t CO₂e" : "kg CO₂e"} sub={`${s.period.from} → ${s.period.to}`} />
            <Stat label="Biggest category" value={CAT[Object.entries(s.by_category).sort((a, b) => b[1] - a[1])[0][0]].label} sub={fmtKg(Math.max(...Object.values(s.by_category)))} />
            <Stat label="Days with data" value={`${s.coverage.days_with_data}/${s.coverage.days_in_range}`} sub={`${s.activity_count} activities logged`} />
          </div>
          {s.coverage.note && <Notice kind="warn">{s.coverage.note}</Notice>}
          {s.unavailable_note && <Notice kind="warn">{s.unavailable_note}</Notice>}

          <div className="grid g-main" style={{ marginTop: "1rem" }}>
            <section className="card" aria-labelledby="trend-h">
              <h2 id="trend-h">Trend</h2>
              <TrendChart trend={s.trend} />
              <p className="small muted">{s.trend.note}</p>
            </section>
            <section className="card" aria-labelledby="cat-h">
              <h2 id="cat-h">By category</h2>
              <CategoryDoughnut byCategory={s.by_category} />
              <div className="legend">{Object.entries(s.by_category).map(([c, v]) => <span key={c}><span className="dot" style={{ background: CAT[c].color }} />{CAT[c].label}: <strong>{fmtKg(v)}</strong></span>)}</div>
            </section>
          </div>
        </>
      )}

      <div className="grid g2" style={{ marginTop: "1rem" }}>
        <section className="card" aria-labelledby="rec-h">
          <h2 id="rec-h">Top ways to reduce</h2>
          {recs.loading && <Loading />}
          {recs.error && <ErrorBox error={recs.error} onRetry={recs.reload} />}
          {recs.data && recs.data.items.length === 0 && <p className="muted">{recs.data.empty_reason === "no_data" ? "Log some activities in the last 30 days to get personalised suggestions." : "Nothing to suggest right now. Nice work!"}</p>}
          {recs.data?.items.slice(0, 3).map((r) => (
            <div key={r.rule_key} style={{ padding: ".6rem 0", borderTop: "1px solid var(--line)" }}>
              <strong>{r.title}</strong>
              <div className="small muted">{r.estimated_reduction_kg != null ? `Est. save ≈ ${fmtKg(r.estimated_reduction_kg)} / 30 days` : r.impact_label}</div>
            </div>
          ))}
          <p style={{ marginTop: ".5rem" }}><Link to="/recommendations">See all recommendations →</Link></p>
        </section>

        <section className="card" aria-labelledby="prog-h">
          <h2 id="prog-h">Progress</h2>
          {prog.loading && <Loading />}
          {prog.error && <ErrorBox error={prog.error} onRetry={prog.reload} />}
          {prog.data && (prog.data.comparison.comparable ? (
            <p>Last 30 days vs the 30 before:{" "}
              <strong className={prog.data.comparison.delta_kg <= 0 ? "delta-good" : "delta-bad"}>
                {prog.data.comparison.delta_kg > 0 ? "+" : ""}{fmtKg(prog.data.comparison.delta_kg)}
                {prog.data.comparison.delta_pct != null && ` (${prog.data.comparison.delta_pct > 0 ? "+" : ""}${prog.data.comparison.delta_pct}%)`}
              </strong></p>
          ) : <p className="muted">Needs logged activities in both periods to compare.</p>)}
          {prog.data && <p className="small muted">{prog.data.milestones.filter((m) => m.achieved).length} of {prog.data.milestones.length} milestones reached.</p>}
          <Link to="/progress">View progress →</Link>
        </section>
      </div>
      {user.region && <p className="small muted" style={{ marginTop: "1rem" }}>{s?.estimate_note} Region for factors: <strong>{user.region}</strong>.</p>}
    </>
  );
}
