"use client";

interface SparklineProps {
  data:   number[];
  /** stroke color, defaults to var(--brand) */
  color?: string;
  width?:  number;
  height?: number;
  /** show a soft gradient fill under the line */
  fill?:  boolean;
}

export function Sparkline({
  data, color = "var(--brand)", width = 200, height = 48, fill = true,
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = 0;
  const range = max - min || 1;

  const pad = 2;
  const W   = width  - pad * 2;
  const H   = height - pad * 2;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * W;
    const y = pad + H - ((v - min) / range) * H;
    return [x, y] as [number, number];
  });

  // Build smooth SVG path via cubic bezier
  function toPath(points: [number, number][]): string {
    if (points.length === 0) return "";
    let d = `M ${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
  }

  const linePath = toPath(pts);
  const last     = pts[pts.length - 1];
  const fillPath = linePath
    + ` L ${last[0]},${pad + H} L ${pts[0][0]},${pad + H} Z`;

  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="overflow-visible"
    >
      {fill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0"    />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={fillPath} fill={`url(#${gradId})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* last-point dot */}
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}
