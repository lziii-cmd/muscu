import { cn } from "@/lib/utils";

/*
 * Graphiques en SVG pur.
 *
 * Pas de bibliothèque de graphiques : les besoins sont des courbes et des
 * barres simples, et le SVG se rend côté serveur, sans JavaScript envoyé au
 * client. Sur une connexion mobile sénégalaise facturée au volume, économiser
 * une centaine de kilo-octets par page est un choix produit, pas une coquetterie.
 */

function buildPath(values: number[], width: number, height: number, padding = 2): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M ${padding} ${height / 2} L ${width - padding} ${height / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - padding * 2) / (values.length - 1);

  return values
    .map((value, index) => {
      const x = padding + index * stepX;
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  labels,
  className,
  tone = "accent",
}: {
  values: number[];
  labels?: string[];
  className?: string;
  tone?: "accent" | "success" | "warning";
}) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length < 2) {
    return <p className="text-sm text-faint">Pas encore assez de points pour tracer une courbe.</p>;
  }

  const width = 320;
  const height = 64;
  const stroke =
    tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--accent)";

  const last = usable[usable.length - 1];
  const first = usable[0];
  const rising = last >= first;

  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={
          labels
            ? `Évolution de ${labels[0]} à ${labels[labels.length - 1]} : ${rising ? "en hausse" : "en baisse"}`
            : "Courbe d'évolution"
        }
      >
        <path
          d={buildPath(usable, width, height)}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {labels && labels.length > 1 ? (
        <figcaption className="mt-1 flex justify-between text-[10px] text-faint">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

export interface SeriesPoint {
  label: string;
  value: number;
}

/** Courbe avec axe, pour les pages où l'échelle compte (poids, mensurations). */
export function LineChart({
  series,
  unit,
  band,
  className,
}: {
  series: SeriesPoint[];
  unit?: string;
  /** Bande de référence facultative, ex. la cible de perte hebdomadaire. */
  band?: { from: number; to: number; label: string };
  className?: string;
}) {
  if (series.length < 2) {
    return <p className="text-sm text-faint">Pas encore assez de points pour tracer une courbe.</p>;
  }

  const width = 640;
  const height = 200;
  const padding = { top: 12, right: 8, bottom: 22, left: 40 };

  const values = series.map((point) => point.value);
  const allValues = band ? [...values, band.from, band.to] : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const stepX = innerWidth / (series.length - 1);

  const yOf = (value: number) => padding.top + innerHeight - ((value - min) / span) * innerHeight;

  const path = series
    .map((point, index) => {
      const x = padding.left + index * stepX;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${yOf(point.value).toFixed(1)}`;
    })
    .join(" ");

  const ticks = [min, min + span / 2, max];

  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full"
        role="img"
        aria-label={`Évolution de ${series[0].label} à ${series[series.length - 1].label}`}
      >
        {band ? (
          <rect
            x={padding.left}
            y={yOf(Math.max(band.from, band.to))}
            width={innerWidth}
            height={Math.abs(yOf(band.from) - yOf(band.to))}
            fill="var(--success)"
            opacity="0.08"
          />
        ) : null}

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 6}
              y={yOf(tick) + 3}
              textAnchor="end"
              className="fill-[var(--text-faint)] text-[9px] tabular-nums"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {series.map((point, index) => (
          <circle
            key={`${point.label}-${index}`}
            cx={padding.left + index * stepX}
            cy={yOf(point.value)}
            r="2.5"
            fill="var(--accent)"
          />
        ))}

        <text
          x={padding.left}
          y={height - 6}
          className="fill-[var(--text-faint)] text-[9px]"
        >
          {series[0].label}
        </text>
        <text
          x={width - padding.right}
          y={height - 6}
          textAnchor="end"
          className="fill-[var(--text-faint)] text-[9px]"
        >
          {series[series.length - 1].label}
        </text>
      </svg>

      {unit || band ? (
        <figcaption className="mt-1 flex flex-wrap gap-3 text-[11px] text-faint">
          {unit ? <span>{unit}</span> : null}
          {band ? (
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-success/30" aria-hidden />
              {band.label}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Diagramme en barres horizontales, pour les répartitions. */
export function BarList({
  items,
  unit,
}: {
  items: { label: string; value: number; tone?: "accent" | "success" | "warning" | "danger" }[];
  unit?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const tones = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted">{item.label}</span>
            <span className="tabular-nums">
              {item.value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div
              className={cn("h-full rounded-full", tones[item.tone ?? "accent"])}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
