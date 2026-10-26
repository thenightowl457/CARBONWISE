import { useState } from "react";
import { todayStr, addDaysStr } from "../hooks";

const PRESETS = [
  ["month", "This month"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["year", "This year"], ["custom", "Custom range"],
];
export function presetRange(key) {
  const t = todayStr();
  if (key === "month") return { from: t.slice(0, 8) + "01", to: t };
  if (key === "year") return { from: t.slice(0, 5) + "01-01", to: t };
  return { from: addDaysStr(t, -(Number(key) - 1)), to: t };
}

export default function PeriodPicker({ value, onChange, initial = "30", label = "Reporting period" }) {
  const [preset, setPreset] = useState(initial);
  const [custom, setCustom] = useState(value);
  const err = preset === "custom" && custom.from > custom.to ? "Start date must be on or before the end date." : null;
  const pick = (k) => {
    setPreset(k);
    if (k !== "custom") onChange(presetRange(k));
  };
  const setC = (patch) => {
    const n = { ...custom, ...patch };
    setCustom(n);
    if (n.from && n.to && n.from <= n.to) onChange(n);
  };
  return (
    <div>
      <div className="period" role="group" aria-label={label}>
        <div>
          <label className="small muted" htmlFor="period-preset">{label}</label><br />
          <select id="period-preset" value={preset} onChange={(e) => pick(e.target.value)}>
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {preset === "custom" && (
          <>
            <div><label className="small muted" htmlFor="p-from">From</label><br />
              <input id="p-from" type="date" value={custom.from} max={custom.to} onChange={(e) => setC({ from: e.target.value })} aria-invalid={!!err || undefined} /></div>
            <div><label className="small muted" htmlFor="p-to">To</label><br />
              <input id="p-to" type="date" value={custom.to} min={custom.from} onChange={(e) => setC({ to: e.target.value })} aria-invalid={!!err || undefined} /></div>
          </>
        )}
      </div>
      {err && <div className="err-text" role="alert">{err}</div>}
    </div>
  );
}
