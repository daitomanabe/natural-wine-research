import { COLOR_MAP } from "../data/wines";

export function RadarMini({ wine }) {
  const axes = [
    { label: "SO₂ FREE", val: 1 - wine.so2 / 45 },
    { label: "WHOLE\nCLUSTER", val: wine.wholeCluster / 100 },
    { label: "SKIN\nCONTACT", val: Math.min(wine.skinDays / 180, 1) },
    { label: "INDIGENOUS\nYEAST", val: wine.indigenousYeast ? 1 : 0 },
    { label: "UN-\nFILTERED", val: wine.filtration === "none" ? 1 : wine.filtration === "light" ? 0.5 : 0 },
  ];

  const N = axes.length;
  const R = 52;
  const CX = 68;
  const CY = 68;
  const rings = [0.25, 0.5, 0.75, 1];

  const pts = (vals) => vals.map((v, i) => {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    return [CX + Math.cos(angle) * v * R, CY + Math.sin(angle) * v * R];
  });

  const axisPts = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return [CX + Math.cos(a) * R, CY + Math.sin(a) * R];
  });

  const col = COLOR_MAP[wine.color]?.dot ?? "#aaa";
  const polyPts = pts(axes.map((a) => a.val));

  return (
    <svg width={136} height={136}>
      {rings.map((r) => (
        <polygon
          key={r}
          points={Array.from({ length: N }, (_, i) => {
            const a = (i / N) * Math.PI * 2 - Math.PI / 2;
            return `${CX + Math.cos(a) * R * r},${CY + Math.sin(a) * R * r}`;
          }).join(" ")}
          fill="none"
          stroke="#1e2430"
          strokeWidth="1"
        />
      ))}
      {axisPts.map(([x, y], i) => <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#1e2430" strokeWidth="1" />)}
      <polygon points={polyPts.map(([x, y]) => `${x},${y}`).join(" ")} fill={col} fillOpacity="0.25" stroke={col} strokeWidth="1.5" />
      {polyPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} fill={col} />)}
      {axisPts.map(([x, y], i) => {
        const dx = x - CX;
        const dy = y - CY;
        const lx = CX + dx * 1.32;
        const ly = CY + dy * 1.32;

        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="#3a5060" fontSize="6.5" fontFamily="'IBM Plex Mono',monospace">
            {axes[i].label.split("\n").map((ln, j) => <tspan key={j} x={lx} dy={j === 0 ? 0 : 8}>{ln}</tspan>)}
          </text>
        );
      })}
    </svg>
  );
}
