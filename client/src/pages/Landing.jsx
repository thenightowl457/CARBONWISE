import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Built for students &amp; young professionals</span>
        <h1>Know your footprint. Shrink it, one choice at a time.</h1>
        <p>CarbonWise turns your everyday commute, home energy and consumption into an estimated CO₂e footprint, shows what matters most, and lets you test changes before you make them.</p>
        <div className="actions">
          <Link className="btn" to="/register">Create free account</Link>
          <Link className="btn secondary" to="/login">Log in</Link>
        </div>
        <div className="hero-stats">
          <div><b>3</b><span>categories tracked</span></div>
          <div><b>19</b><span>activity types</span></div>
          <div><b>Open</b><span>factor source shown per result</span></div>
        </div>
      </section>

      <div className="grid g3">
        <div className="card feature"><div className="ico" aria-hidden="true">✍️</div><h3>Log in seconds</h3><p className="muted">Record trips, bills and meals with simple, validated forms. Every number is traceable to an emission factor and source.</p></div>
        <div className="card feature"><div className="ico" aria-hidden="true">📊</div><h3>See what matters</h3><p className="muted">Category breakdowns and trends over any period show where your emissions really come from.</p></div>
        <div className="card feature"><div className="ico" aria-hidden="true">🌱</div><h3>Act on it</h3><p className="muted">Ranked, explained suggestions and a what-if simulator preview the impact before you change anything.</p></div>
      </div>

      <section className="card">
        <h2>How it works</h2>
        <ol className="steps">
          <li><strong>Log</strong><br /><span className="muted">Add commute, energy and consumption activities.</span></li>
          <li><strong>Understand</strong><br /><span className="muted">Your dashboard totals CO₂e per category and over time.</span></li>
          <li><strong>Simulate</strong><br /><span className="muted">Try "what if I took the metro twice a week?" without touching your records.</span></li>
          <li><strong>Track</strong><br /><span className="muted">Compare periods and unlock milestones as you improve.</span></li>
        </ol>
      </section>

      <div className="notice info"><strong>Honest numbers.</strong> Results are estimates, with the emission-factor source and version shown for each. We only store what you enter, and you can export or delete it whenever you like.</div>
    </>
  );
}
