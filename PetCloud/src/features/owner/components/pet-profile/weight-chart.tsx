"use client";

import { useState } from "react";

import { formatDate } from "@/lib/format";
import type { WeightEntry } from "@/types/pet";

const W = 720;
const H = 260;
const PAD = { top: 20, right: 60, bottom: 34, left: 46 };

const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Devuelve 4 marcas "redondas" que cubren el rango de pesos. */
function buildScale(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const lower = Math.floor((min - span * 0.15) * 2) / 2;
  const upper = Math.ceil((max + span * 0.15) * 2) / 2;
  const step = (upper - lower) / 3;

  return {
    min: lower,
    max: upper,
    ticks: [0, 1, 2, 3].map((i) => lower + step * i),
  };
}

export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (entries.length < 2) {
    return (
      <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
        Hacen falta al menos dos registros para dibujar la evolución del peso.
      </p>
    );
  }

  const scale = buildScale(entries.map((e) => e.pesoKg));
  const times = entries.map((e) => new Date(e.fecha).getTime());
  const tMin = times[0];
  const tSpan = times[times.length - 1] - tMin || 1;

  const points = entries.map((entry, i) => ({
    entry,
    x: PAD.left + ((times[i] - tMin) / tSpan) * PLOT_W,
    y:
      PAD.top +
      PLOT_H -
      ((entry.pesoKg - scale.min) / (scale.max - scale.min)) * PLOT_H,
  }));

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");
  const last = points[points.length - 1];
  const active = hovered !== null ? points[hovered] : null;

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * W;

    let nearest = 0;
    let bestDistance = Infinity;
    points.forEach((point, i) => {
      const distance = Math.abs(point.x - relativeX);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = i;
      }
    });
    setHovered(nearest);
  }

  return (
    <figure className="relative m-0">
      <figcaption className="text-muted-foreground mb-2 text-sm">
        Peso en kilos, por fecha de control
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Evolución del peso: de ${entries[0].pesoKg} kg en ${formatDate(entries[0].fecha)} a ${last.entry.pesoKg} kg en ${formatDate(last.entry.fecha)}.`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Grilla recesiva: hairline sólida, un paso de la superficie */}
        {scale.ticks.map((tick) => {
          const y =
            PAD.top +
            PLOT_H -
            ((tick - scale.min) / (scale.max - scale.min)) * PLOT_H;

          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Etiquetas del eje temporal */}
        {points.map((point) => (
          <text
            key={point.entry.id}
            x={point.x}
            y={H - 12}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {formatDate(point.entry.fecha).replace(/ \d{4}$/, "")}
          </text>
        ))}

        {/* Crosshair del hover */}
        {active ? (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Serie única: línea 2px, sin leyenda (el título ya dice qué se grafica) */}
        <path
          d={path}
          fill="none"
          className="stroke-brand-600"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point, i) => (
          <circle
            key={point.entry.id}
            cx={point.x}
            cy={point.y}
            r={i === hovered ? 6 : 4}
            className="fill-brand-600 stroke-card"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Etiqueta directa solo en el extremo */}
        <text
          x={last.x + 12}
          y={last.y + 4}
          className="fill-foreground text-[13px] font-semibold"
        >
          {last.entry.pesoKg} kg
        </text>
      </svg>

      {active ? (
        <div
          className="border-border bg-card pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border px-3 py-2 shadow-lg"
          style={{
            left: `${(active.x / W) * 100}%`,
            top: `${(active.y / H) * 100}%`,
            marginTop: "-12px",
          }}
        >
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {active.entry.pesoKg} kg
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDate(active.entry.fecha)}
          </p>
        </div>
      ) : null}
    </figure>
  );
}
