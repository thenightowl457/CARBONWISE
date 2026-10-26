import { useEffect, useState, useCallback } from "react";
import { api } from "./api";

// Fetch on mount / when path changes. While reloading we show a loading state rather
// than the previous period's numbers (NFR-04: never present stale values as current).
export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState({ data: null, error: null, loading: true });
    api(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false })
    );
    return () => { live = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

let catalogPromise;
export function useCatalog() {
  const [cat, setCat] = useState(null);
  useEffect(() => {
    catalogPromise ||= api("/meta/catalog");
    catalogPromise.then(setCat).catch(() => { catalogPromise = null; });
  }, []);
  return cat;
}

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const addDaysStr = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
export const fmtKg = (n) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${n.toFixed(1)} kg`);
export const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const CAT = {
  commute: { label: "Commute", color: "#3a7ca5" },
  energy: { label: "Energy", color: "#e0a030" },
  consumption: { label: "Consumption", color: "#5a9a62" },
};
