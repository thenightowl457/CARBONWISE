import { useState } from "react";

export const Notice = ({ kind = "info", children }) => (
  <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>
);

export function Loading({ label = "Loading…" }) {
  return <p className="center-note" role="status" aria-live="polite">{label}</p>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <Notice kind="error">
      <strong>Something went wrong.</strong> {error?.message || "Please try again."}{" "}
      {onRetry && <button className="btn small secondary" onClick={onRetry}>Retry</button>}
    </Notice>
  );
}

export const Empty = ({ title, children }) => (
  <div className="empty"><h3>{title}</h3><div>{children}</div></div>
);

export function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="hint" id={`${id}-hint`}>{hint}</div>}
      {error && <div className="err-text" id={`${id}-err`} role="alert">{error}</div>}
    </div>
  );
}
export const aria = (id, error, hint) => ({
  id, "aria-invalid": !!error || undefined,
  "aria-describedby": [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined,
});

export function Busy({ busy, children }) {
  return <>{busy && <span className="spinner" aria-hidden="true" />}{children}</>;
}

export function Confirm({ label, onConfirm, danger = true, small = true }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className={`btn secondary ${small ? "small" : ""}`} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span role="group" aria-label="Confirm">
      <span className="small">Sure? </span>
      <button className={`btn ${danger ? "danger" : ""} small`} onClick={() => { setAsking(false); onConfirm(); }}>Yes</button>{" "}
      <button className="btn secondary small" onClick={() => setAsking(false)}>No</button>
    </span>
  );
}

export const Stat = ({ label, value, unit, sub }) => (
  <div className="card stat">
    <div className="label">{label}</div>
    <div className="value">{value}{unit && <span className="unit"> {unit}</span>}</div>
    {sub && <div className="small muted">{sub}</div>}
  </div>
);
