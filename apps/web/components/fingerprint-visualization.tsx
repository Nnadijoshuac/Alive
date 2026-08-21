import { fingerprintLinks, fingerprintPoints } from "@/lib/fingerprint";

export function FingerprintVisualization({
  hash,
  label = "Visual fingerprint",
  compact = false,
}: {
  hash: string;
  label?: string;
  compact?: boolean;
}) {
  const points = fingerprintPoints(hash, compact ? 34 : 58);
  const links = fingerprintLinks(points, compact ? 18 : 14);
  return (
    <figure
      className={`fingerprint ${compact ? "fingerprint-compact" : ""}`}
      aria-label={`${label}. Deterministic constellation derived from the evidence commitment.`}
    >
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
        <g className="fingerprint-links">
          {links.map(([leftIndex, rightIndex]) => {
            const left = points[leftIndex];
            const right = points[rightIndex];
            return left && right ? (
              <line
                key={`${leftIndex}-${rightIndex}`}
                x1={left.x}
                y1={left.y}
                x2={right.x}
                y2={right.y}
              />
            ) : null;
          })}
        </g>
        <g>
          {points.map((point) => (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={point.radius}
              opacity={point.opacity}
            />
          ))}
        </g>
      </svg>
      <figcaption>
        <span>{label}</span>
        <code>{hash.slice(0, 18)}...</code>
      </figcaption>
    </figure>
  );
}
