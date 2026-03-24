import { COLOR_MAP } from "../data/wines";

export function ScatterPlot({ wines, selected, onSelect }) {
  const W = 680;
  const H = 420;
  const PAD = { l: 56, r: 24, t: 20, b: 52 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const maxSo2 = 45;
  const toX = (v) => PAD.l + (v / maxSo2) * iW;
  const toY = (v) => PAD.t + iH - (v / 4) * iH;

  const xTicks = [0, 10, 20, 30, 40];
  const yTicks = [0, 1, 2, 3, 4];
  const yLabels = ["ZERO-ZERO", "MINIMAL", "LOW", "MODERATE", "CONVENTIONAL"];

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", maxWidth: "100%" }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-sm">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {xTicks.map((v) => (
        <g key={v}>
          <line x1={toX(v)} y1={PAD.t} x2={toX(v)} y2={PAD.t + iH} stroke="#1e2430" strokeWidth="1" strokeDasharray="3,4" />
          <text x={toX(v)} y={PAD.t + iH + 18} textAnchor="middle" fill="#3a4458" fontSize="11" fontFamily="'IBM Plex Mono',monospace">{v}</text>
        </g>
      ))}
      {yTicks.map((v, i) => (
        <g key={v}>
          <line x1={PAD.l} y1={toY(v)} x2={PAD.l + iW} y2={toY(v)} stroke="#1e2430" strokeWidth="1" strokeDasharray="3,4" />
          <text x={PAD.l - 8} y={toY(v) + 4} textAnchor="end" fill="#2a3448" fontSize="9" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.5">{yLabels[i]}</text>
        </g>
      ))}

      <text x={PAD.l + iW / 2} y={H - 6} textAnchor="middle" fill="#3a4458" fontSize="10" fontFamily="'IBM Plex Mono',monospace" letterSpacing="2">
        TOTAL SO₂ (mg/L) →
      </text>
      <text transform={`translate(14,${PAD.t + iH / 2}) rotate(-90)`} textAnchor="middle" fill="#3a4458" fontSize="10" fontFamily="'IBM Plex Mono',monospace" letterSpacing="2">
        INTERVENTION →
      </text>

      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + iH} stroke="#1e2430" strokeWidth="1" />
      <line x1={PAD.l} y1={PAD.t + iH} x2={PAD.l + iW} y2={PAD.t + iH} stroke="#1e2430" strokeWidth="1" />

      {wines.map((w) => {
        const x = toX(w.so2);
        const y = toY(w.intervention);
        const r = 5 + (w.price / 95) * 10;
        const isSelected = selected?.id === w.id;
        const col = COLOR_MAP[w.color]?.dot ?? "#aaa";

        return (
          <g key={w.id} style={{ cursor: "pointer" }} onClick={() => onSelect(isSelected ? null : w)}>
            {isSelected && <circle cx={x} cy={y} r={r + 8} fill={col} opacity="0.15" filter="url(#glow)" />}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={col}
              opacity={selected && !isSelected ? 0.25 : 0.85}
              stroke={isSelected ? col : "none"}
              strokeWidth={isSelected ? 2 : 0}
              filter={isSelected ? "url(#glow-sm)" : "none"}
            />
            {isSelected && (
              <text x={x} y={y - r - 6} textAnchor="middle" fill={col} fontSize="9" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.5">
                {w.producer.split(" ")[0].toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
