export function BarChart({ wines }) {
  const counts = {};
  wines.forEach((wine) => {
    counts[wine.region] = (counts[wine.region] || 0) + 1;
  });

  const regions = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...regions.map(([, count]) => count), 1);

  return (
    <div style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
      {regions.map(([region, count]) => (
        <div key={region} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ width: 90, fontSize: 9, letterSpacing: 0.5, color: "#2a4050", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{region}</div>
          <div style={{ height: 10, width: `${(count / max) * 100}%`, maxWidth: 120, background: "#0e1820", borderRight: "2px solid #1a3040", transition: "width 0.3s" }} />
          <div style={{ fontSize: 9, color: "#1e3040" }}>{count}</div>
        </div>
      ))}
    </div>
  );
}
