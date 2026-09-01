// The two activity charts, drawn by hand in SVG.
//
// The mockup draws them as plain <svg> and nothing here needs a chart library:
// no axes to negotiate, no legend, no zoom. Twelve numbers in, one path out —
// a charting dependency would ship ~100 KB to the client to do exactly this.

const W = 400;
const H = 120;
const TOP = 8;
const BASE = 112;
const LABEL_Y = 119;
const PAD = 10;

export interface Point {
  /** Bucket name — the same key the insight strip quotes ("W7"). */
  key: string;
  value: number;
  /** Hover text; formatting money and dates stays out of the chart. */
  title: string;
}

/** Four labels, evenly spaced, however many buckets the period produced. */
function labelledIndexes(n: number): Set<number> {
  if (n <= 4) return new Set(Array.from({ length: n }, (_, i) => i));
  return new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]);
}

function Grid() {
  return (
    <>
      {[30, 60, 90].map((y) => (
        <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#F1F5F9" strokeWidth="1" />
      ))}
    </>
  );
}

function Labels({ points }: { points: Point[] }) {
  const shown = labelledIndexes(points.length);
  const step = W / points.length;
  return (
    <>
      {points.map((p, i) =>
        shown.has(i) ? (
          <text
            key={p.key}
            x={i * step + step / 2}
            y={LABEL_Y}
            fontSize="9"
            fill="#94A3B8"
            textAnchor="middle"
          >
            {p.key}
          </text>
        ) : null,
      )}
    </>
  );
}

/** Completed orders: one bar per bucket, opacity carrying the magnitude. */
export function BarSeries({ points, label }: { points: Point[]; label: string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = W / points.length;
  const barW = Math.min(26, step * 0.68);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={label}>
      <Grid />
      {points.map((p, i) => {
        const h = Math.max((p.value / max) * (BASE - TOP), 2);
        return (
          <rect
            key={p.key}
            x={i * step + (step - barW) / 2}
            y={BASE - h}
            width={barW}
            height={h}
            rx="3"
            fill="#16A34A"
            opacity={0.35 + 0.65 * (p.value / max)}
          >
            <title>{p.title}</title>
          </rect>
        );
      })}
      <Labels points={points} />
    </svg>
  );
}

/** Spend: a filled area under a line, with the peak bucket picked out. */
export function AreaSeries({ points, label }: { points: Point[]; label: string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD + i * ((W - 2 * PAD) / (n - 1)));
  const y = (value: number) => BASE - (value / max) * (BASE - TOP);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L ${x(n - 1)},${BASE} L ${x(0)},${BASE} Z`;
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={label}>
      <Grid />
      <path d={area} fill="#ED1C2E" opacity="0.12" />
      <path
        d={line}
        stroke="#ED1C2E"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={p.key}
          cx={x(i)}
          cy={y(p.value)}
          r={i === peak ? 4 : 3}
          fill="#ED1C2E"
          stroke={i === peak ? "#fff" : undefined}
          strokeWidth={i === peak ? 2 : undefined}
        >
          <title>{p.title}</title>
        </circle>
      ))}
      <Labels points={points} />
    </svg>
  );
}
