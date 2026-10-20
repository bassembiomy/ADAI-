import React from 'react';

export interface SimTracePlotProps {
  alias: string;
  times: number[];
  values: (number | null)[];
  width?: number;
  height?: number;
}

const fmt = (n: number): string => String(Math.round(n * 10000) / 10000);

/** Dependency-free line plot of one signal; null samples are skipped. */
export function SimTracePlot({ alias, times, values, width = 240, height = 70 }: SimTracePlotProps) {
  const pts: { t: number; v: number }[] = [];
  for (let i = 0; i < values.length && i < times.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) pts.push({ t: times[i], v });
  }
  if (pts.length === 0) {
    return <div className="text-[11px] text-neutral-500">{alias}: no samples</div>;
  }
  const pad = 4;
  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const vMin = Math.min(...pts.map(p => p.v));
  const vMax = Math.max(...pts.map(p => p.v));
  const x = (t: number) => pad + (tMax === tMin ? 0 : ((t - tMin) / (tMax - tMin)) * (width - 2 * pad));
  const y = (v: number) => (vMax === vMin ? height / 2 : height - pad - ((v - vMin) / (vMax - vMin)) * (height - 2 * pad));
  const points = pts.map(p => `${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  return (
    <figure className="flex flex-col gap-0.5 text-[11px] text-neutral-400">
      <figcaption className="font-mono text-neutral-300">{alias}</figcaption>
      <div className="flex items-center gap-2">
        <svg role="img" aria-label={`Trace of ${alias}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          className="rounded border border-neutral-800 bg-neutral-950">
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-orange-300" />
        </svg>
        <div className="flex flex-col justify-between self-stretch">
          <span>max {fmt(vMax)}</span>
          <span>min {fmt(vMin)}</span>
        </div>
      </div>
    </figure>
  );
}
