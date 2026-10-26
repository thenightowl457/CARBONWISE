import { useState } from "react";
import { qs } from "../api";
import { useFetch, fmtKg, todayStr, addDaysStr } from "../hooks";
import { CompareBars } from "../components/Charts";
import { Loading, ErrorBox, Notice, Stat } from "../components/ui";

export default function Progress() {
  const [days, setDays] = useState(30);
  const to = todayStr();
  const q = qs({ from: addDaysStr(to, -(days - 1)), to });
  const { data, error, loading, reload } = useFetch(`/progress?${q}`);
  const c = data?.comparison;
  const good = c?.delta_kg <= 0;
  return (
    <>
      <div className="page-head">
        <div><h1>Progress</h1><p>Compare your recent activity with the period just before it.</p></div>
        <div><label className="small muted" htmlFor="len">Compare the last</label><br />
          <select id="len" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto" }}>
            <option value={7}>7 days vs previous 7</option><option value={30}>30 days vs previous 30</option><option value={90}>90 days vs previous 90</option>
          </select></div>
      </div>
      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid g3">
            <Stat label="Previous period" value={fmtKg(data.previous.total_kg)} sub={`${data.previous.period.from} → ${data.previous.period.to}`} />
            <Stat label="Current period" value={fmtKg(data.current.total_kg)} sub={`${data.current.period.from} → ${data.current.period.to}`} />
            <div className="card stat"><div className="label">Change (observed estimate)</div>
              {c.comparable ? <>
                <div className={`value ${good ? "delta-good" : "delta-bad"}`}>{c.delta_kg > 0 ? "+" : ""}{fmtKg(c.delta_kg)}</div>
                <div className="small">{c.delta_pct != null && `${c.delta_pct > 0 ? "+" : ""}${c.delta_pct}%`}</div></>
                : <div className="value muted" style={{ fontSize: "1.2rem" }}>Not enough data to compare</div>}
            </div>
          </div>
          {data.caveats.map((t, i) => <Notice key={i} kind={i === 0 ? "info" : "warn"}>{t}</Notice>)}
          {c.comparable && (
            <section className="card" aria-labelledby="pc-h"><h2 id="pc-h">By category</h2>
              <CompareBars a={data.previous.by_category} b={data.current.by_category} aLabel="Previous" bLabel="Current" aColor="#b9c2bc" />
            </section>
          )}
          <section className="card" aria-labelledby="ms-h"><h2 id="ms-h">Milestones</h2>
            <div className="grid g2">
              {data.milestones.map((m) => (
                <div key={m.key} className={`milestone ${m.achieved ? "done" : ""}`}>
                  <span className="badge" aria-hidden="true">{m.achieved ? "✓" : "·"}</span>
                  <div><strong>{m.title}</strong><div className="small muted">{m.achieved ? "Reached" : `In progress: ${m.progress}`}</div></div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
