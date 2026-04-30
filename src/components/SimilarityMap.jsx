import { COLOR_MAP } from "../data/wines.js";

const LABEL_LIMIT = 7;

function truncateLabel(value, maxLength = 22) {
  const chars = Array.from(value ?? "");
  if (chars.length <= maxLength) return value;
  return `${chars.slice(0, maxLength - 1).join("")}…`;
}

function estimateLabelWidth(value) {
  const chars = Array.from(value ?? "");
  const width = chars.reduce((sum, char) => {
    const isWide = /[^\u0000-\u00ff]/.test(char);
    return sum + (isWide ? 9.5 : 5.7);
  }, 0);
  return Math.min(178, Math.max(68, width + 18));
}

export function SimilarityMap({ target, items, selected, onSelect }) {
  const W = 760;
  const H = 420;
  const PAD = { l: 60, r: 28, t: 58, b: 54 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const prices = [
    target?.price,
    ...items.map((item) => item.wine.price),
  ].filter(Number.isFinite);
  const maxPrice = Math.max(...prices, 1);
  const minPrice = Math.min(...prices, 0);
  const maxScore = Math.max(...items.map((item) => item.score), 1);

  const toX = (value) => {
    if (!Number.isFinite(value)) return PAD.l + iW / 2;
    if (maxPrice === minPrice) return PAD.l + iW / 2;
    return PAD.l + ((value - minPrice) / (maxPrice - minPrice)) * iW;
  };

  const toY = (value) => PAD.t + iH - (value / maxScore) * iH;

  const xTicks = 4;
  const yTicks = 5;
  const selectedId = selected?.id;
  const nodes = items.map((item, index) => {
    const wine = item.wine;
    const x = toX(wine.price);
    const y = toY(item.score);
    const radius = 8 + Math.min(10, (item.metrics.grapeOverlap ?? 0) * 2);
    const color = COLOR_MAP[wine.color]?.dot ?? "#7eb8b0";
    const label = truncateLabel(wine.name);

    return {
      item,
      wine,
      index,
      x,
      y,
      radius,
      color,
      label,
      labelWidth: estimateLabelWidth(label),
      isSelected: selectedId === wine.id,
    };
  });

  const labelIds = new Set(
    nodes
      .slice()
      .sort((a, b) => {
        if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
        return b.item.score - a.item.score;
      })
      .slice(0, LABEL_LIMIT)
      .map((node) => node.wine.id),
  );

  const callouts = nodes
    .filter((node) => labelIds.has(node.wine.id))
    .map((node) => {
      const side = node.x > PAD.l + iW * 0.62 ? -1 : 1;
      return {
        node,
        side,
        desiredY: node.y - node.radius - 12,
        y: node.y - node.radius - 12,
      };
    })
    .sort((a, b) => a.desiredY - b.desiredY);

  const minLabelY = PAD.t + 12;
  const maxLabelY = PAD.t + iH - 8;
  const minGap = 20;
  callouts.forEach((callout, index) => {
    const previous = callouts[index - 1];
    callout.y = Math.max(minLabelY, callout.desiredY, previous ? previous.y + minGap : minLabelY);
  });
  const overflow = callouts.length ? callouts[callouts.length - 1].y - maxLabelY : 0;
  if (overflow > 0) {
    for (let index = callouts.length - 1; index >= 0; index -= 1) {
      const next = callouts[index + 1];
      callouts[index].y = Math.min(
        callouts[index].y - overflow,
        next ? next.y - minGap : maxLabelY,
      );
    }
  }

  return (
    <svg width={W} height={H} className="similarity-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Similar wine map">
      <defs>
        <filter id="similarity-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Array.from({ length: xTicks + 1 }, (_, index) => {
        const ratio = index / xTicks;
        const value = minPrice + (maxPrice - minPrice) * ratio;
        const x = PAD.l + iW * ratio;
        return (
          <g key={`x-${index}`}>
            <line x1={x} y1={PAD.t} x2={x} y2={PAD.t + iH} stroke="#142130" strokeWidth="1" strokeDasharray="4,5" />
            <text x={x} y={H - 14} fill="#304556" fontSize="10" textAnchor="middle">{Math.round(value)}</text>
          </g>
        );
      })}

      {Array.from({ length: yTicks + 1 }, (_, index) => {
        const ratio = index / yTicks;
        const value = maxScore * ratio;
        const y = PAD.t + iH - iH * ratio;
        return (
          <g key={`y-${index}`}>
            <line x1={PAD.l} y1={y} x2={PAD.l + iW} y2={y} stroke="#142130" strokeWidth="1" strokeDasharray="4,5" />
            <text x={PAD.l - 10} y={y + 4} fill="#304556" fontSize="10" textAnchor="end">{Math.round(value)}</text>
          </g>
        );
      })}

      <line x1={PAD.l} y1={PAD.t + iH} x2={PAD.l + iW} y2={PAD.t + iH} stroke="#1e3240" strokeWidth="1.5" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + iH} stroke="#1e3240" strokeWidth="1.5" />

      {Number.isFinite(target?.price) ? (
        <g>
          <line
            x1={toX(target.price)}
            y1={PAD.t}
            x2={toX(target.price)}
            y2={PAD.t + iH}
            stroke="#caa56a"
            strokeWidth="1.5"
            strokeDasharray="8,6"
          />
          <text x={toX(target.price)} y={PAD.t - 18} fill="#caa56a" fontSize="10" textAnchor="middle" letterSpacing="1">
            target price
          </text>
        </g>
      ) : null}

      <text x={PAD.l + iW / 2} y={H - 4} fill="#4e6678" fontSize="10" textAnchor="middle" letterSpacing="2">
        PRICE →
      </text>
      <text transform={`translate(18,${PAD.t + iH / 2}) rotate(-90)`} fill="#4e6678" fontSize="10" textAnchor="middle" letterSpacing="2">
        SIMILARITY SCORE →
      </text>

      {nodes.map((node) => {
        const { wine, x, y, radius, color, isSelected } = node;
        return (
          <g key={wine.id} className="similarity-node" onClick={() => onSelect(isSelected ? target : wine)}>
            <title>{`${wine.name} · score ${Math.round(node.item.score)} · ¥${wine.price ?? "n/a"}`}</title>
            {isSelected ? <circle cx={x} cy={y} r={radius + 10} fill={color} opacity="0.16" filter="url(#similarity-glow)" /> : null}
            <circle
              cx={x}
              cy={y}
              r={radius}
              fill={color}
              opacity={isSelected ? 0.95 : 0.82}
              stroke={isSelected ? "#f5f8fb" : "rgba(4, 7, 12, 0.75)"}
              strokeWidth={isSelected ? 2 : 1}
            />
          </g>
        );
      })}

      {callouts.map((callout) => {
        const { node, side, y } = callout;
        const anchorX = node.x + side * (node.radius + 2);
        const labelX = side > 0
          ? Math.min(node.x + node.radius + 16, W - PAD.r - node.labelWidth)
          : Math.max(PAD.l + 8 + node.labelWidth, node.x - node.radius - 16);
        const rectX = side > 0 ? labelX - 7 : labelX - node.labelWidth + 7;
        const textAnchor = side > 0 ? "start" : "end";
        const lineEndX = side > 0 ? rectX : rectX + node.labelWidth;

        return (
          <g key={`label-${node.wine.id}`} className="similarity-callout">
            <line
              x1={anchorX}
              y1={node.y}
              x2={lineEndX}
              y2={y - 4}
              stroke={node.isSelected ? "#d9e7ec" : "#365063"}
              strokeWidth={node.isSelected ? 1.2 : 0.8}
              opacity={node.isSelected ? 0.95 : 0.68}
            />
            <rect
              x={rectX}
              y={y - 15}
              width={node.labelWidth}
              height="18"
              rx="3"
              fill="#06101a"
              stroke={node.isSelected ? "#d9e7ec" : "#183044"}
              strokeWidth={node.isSelected ? 1 : 0.8}
            />
            <text
              x={labelX}
              y={y - 2}
              fill={node.isSelected ? "#eef4f7" : "#88a0ac"}
              fontSize="9"
              textAnchor={textAnchor}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
