import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import { CAT } from "../hooks";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
ChartJS.defaults.font.family = "system-ui, sans-serif";
ChartJS.defaults.color = "#44514a";

const CATS = ["commute", "energy", "consumption"];

// Every chart has a text alternative + a visually-hidden data table (NFR-05).
function Accessible({ label, rows, children, className = "chart-box" }) {
  return (
    <>
      <div className={className} role="img" aria-label={label}>{children}</div>
      <div className="sr-only">
        <table><caption>{label}</caption>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

export function CategoryDoughnut({ byCategory }) {
  const vals = CATS.map((c) => byCategory[c] || 0);
  return (
    <Accessible label={`Emissions by category: ${CATS.map((c, i) => `${CAT[c].label} ${vals[i].toFixed(1)} kilograms`).join(", ")}`} rows={CATS.map((c, i) => [CAT[c].label, `${vals[i]} kg CO2e`])}>
      <Doughnut
        data={{ labels: CATS.map((c) => CAT[c].label), datasets: [{ data: vals, backgroundColor: CATS.map((c) => CAT[c].color), borderWidth: 2, borderColor: "#fff" }] }}
        options={{ maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed.toFixed(1)} kg CO₂e` } } } }}
      />
    </Accessible>
  );
}

const labelFor = (key, g) => {
  if (g === "month") return new Date(key + "-01T00:00:00").toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  const d = new Date(key + "T00:00:00");
  const s = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return g === "week" ? `Wk ${s}` : s;
};

export function TrendChart({ trend }) {
  const { buckets, granularity: g } = trend;
  const labels = buckets.map((b) => labelFor(b.key, g));
  return (
    <Accessible label={`Emissions trend by ${g}, stacked by category`} rows={buckets.map((b) => [b.key, b.has_data ? `${b.total_kg} kg CO2e` : "no data"])}>
      <Bar
        data={{ labels, datasets: ["commute", "energy", "consumption"].map((c) => ({ label: CAT[c].label, data: buckets.map((b) => b.by_category[c]), backgroundColor: CAT[c].color, stack: "s" })) }}
        options={{
          maintainAspectRatio: false,
          scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { stacked: true, beginAtZero: true, title: { display: true, text: "kg CO₂e" } } },
          plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { footer: (items) => (buckets[items[0].dataIndex].has_data ? `Total: ${buckets[items[0].dataIndex].total_kg} kg` : "No activity logged (not a measured zero)") } } },
        }}
      />
    </Accessible>
  );
}

// Two bars per category: e.g. baseline vs projected, or previous vs current.
export function CompareBars({ a, b, aLabel, bLabel, aColor = "#9aa79f", bColor = "#2f6b4f" }) {
  return (
    <Accessible className="chart-box short" label={`${aLabel} versus ${bLabel} by category`} rows={CATS.map((c) => [CAT[c].label, `${aLabel}: ${a[c]} kg`, `${bLabel}: ${b[c]} kg`])}>
      <Bar
        data={{ labels: CATS.map((c) => CAT[c].label), datasets: [{ label: aLabel, data: CATS.map((c) => a[c] || 0), backgroundColor: aColor }, { label: bLabel, data: CATS.map((c) => b[c] || 0), backgroundColor: bColor }] }}
        options={{ maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: "kg CO₂e" } }, x: { grid: { display: false } } }, plugins: { legend: { position: "bottom" } } }}
      />
    </Accessible>
  );
}
