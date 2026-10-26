import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../api";
import { useCatalog, todayStr, CAT } from "../hooks";
import { useAuth } from "../auth";
import { Field, aria, Notice, Busy, Loading, ErrorBox } from "../components/ui";

const UNIT_LABEL = { cylinder_14_2kg: "cylinder (14.2 kg)", mi: "miles", km: "km" };

export default function ActivityForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const { user } = useAuth();
  const cat = useCatalog();
  const [f, setF] = useState({ category: "commute", activity_type: "", quantity: "", unit: "", activity_date: todayStr(), notes: "" });
  const [errors, setErrors] = useState({});
  const [top, setTop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(editing);

  const types = cat?.categories.find((c) => c.category === f.category)?.types || [];
  const def = types.find((t) => t.activity_type === f.activity_type);

  useEffect(() => {
    if (!editing) return;
    api(`/activities/${id}`).then(({ activity: a }) => setF({ category: a.category, activity_type: a.activity_type, quantity: String(a.quantity), unit: a.unit, activity_date: a.activity_date, notes: a.notes || "" }))
      .catch(setLoadErr).finally(() => setLoading(false));
  }, [id, editing]);

  // default the activity type & unit once the catalog is there / the category changes
  useEffect(() => {
    if (!cat || editing) return;
    if (!types.find((t) => t.activity_type === f.activity_type)) {
      const t = types[0];
      setF((x) => ({ ...x, activity_type: t.activity_type, unit: t.units.includes(user.distance_unit) ? user.distance_unit : t.units[0] }));
    }
  }, [cat, f.category]); // eslint-disable-line

  const onType = (v) => {
    const t = types.find((x) => x.activity_type === v);
    setF({ ...f, activity_type: v, unit: t.units.includes(f.unit) ? f.unit : t.units.includes(user.distance_unit) ? user.distance_unit : t.units[0] });
  };

  // light client checks for instant feedback; the server is the source of truth
  const validate = () => {
    const e = {};
    const q = Number(f.quantity);
    if (f.quantity === "" || Number.isNaN(q)) e.quantity = "Enter a number";
    else if (q <= 0) e.quantity = "Quantity must be greater than 0";
    if (!f.activity_date) e.activity_date = "Pick a date";
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e); setTop(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { category: f.category, activity_type: f.activity_type, quantity: Number(f.quantity), unit: f.unit, activity_date: f.activity_date, notes: f.notes || null };
      await api(editing ? `/activities/${id}` : "/activities", { method: editing ? "PATCH" : "POST", body });
      nav("/activities");
    } catch (err) {
      if (err.details?.length) setErrors(err.fields);
      else setTop(err.message);
    } finally { setBusy(false); }
  };

  if (loading || !cat) return <Loading />;
  if (loadErr) return <ErrorBox error={loadErr} />;

  return (
    <div className="form-narrow">
      <h1>{editing ? "Edit activity" : "Add activity"}</h1>
      <form className="card" onSubmit={submit} noValidate>
        {top && <Notice kind="error">{top}</Notice>}
        <Field id="category" label="Category" error={errors.category}>
          <select {...aria("category", errors.category)} value={f.category} disabled={editing} onChange={(e) => setF({ ...f, category: e.target.value, activity_type: "" })}>
            {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field id="activity_type" label="What did you do?" error={errors.activity_type} hint={def?.note}>
          <select {...aria("activity_type", errors.activity_type, def?.note)} value={f.activity_type} onChange={(e) => onType(e.target.value)}>
            {types.map((t) => <option key={t.activity_type} value={t.activity_type}>{t.label}</option>)}
          </select>
        </Field>
        <div className="row mb">
          <Field id="quantity" label="Quantity" error={errors.quantity}>
            <input {...aria("quantity", errors.quantity)} type="number" inputMode="decimal" step="any" min="0" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          </Field>
          <Field id="unit" label="Unit" error={errors.unit}>
            <select {...aria("unit", errors.unit)} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
              {(def?.units || []).map((u) => <option key={u} value={u}>{UNIT_LABEL[u] || u}</option>)}
            </select>
          </Field>
        </div>
        <Field id="activity_date" label="Date" error={errors.activity_date} hint="The day this should be counted on.">
          <input {...aria("activity_date", errors.activity_date, true)} type="date" value={f.activity_date} max={todayStr()} onChange={(e) => setF({ ...f, activity_date: e.target.value })} />
        </Field>
        <Field id="notes" label="Notes (optional)" error={errors.notes}>
          <input {...aria("notes", errors.notes)} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="actions">
          <button className="btn" disabled={busy}><Busy busy={busy}>{busy ? "Saving…" : "Save"}</Busy></button>
          <Link className="btn secondary" to="/activities">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
