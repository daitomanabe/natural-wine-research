export function BarChart({ wines, selectedRegions = [], onRegionSelect }) {
  const selected = new Set(selectedRegions);
  const interactive = typeof onRegionSelect === "function";
  const counts = {};
  wines.forEach((wine) => {
    counts[wine.region] = (counts[wine.region] || 0) + 1;
  });

  const regions = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...regions.map(([, count]) => count), 1);

  return (
    <div className="bar-chart" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
      {regions.map(([region, count]) => (
        <button
          key={region}
          type="button"
          className={`bar-chart-row ${selected.has(region) ? "bar-chart-row-active" : ""}`}
          onClick={() => onRegionSelect?.(region)}
          disabled={!interactive}
          aria-pressed={selected.has(region)}
        >
          <span className="bar-chart-label" title={region}>
            {region}
          </span>
          <span className="bar-chart-track">
            <span className="bar-chart-fill" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="bar-chart-value">{count}</span>
        </button>
      ))}
    </div>
  );
}
