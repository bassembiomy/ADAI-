import React, { lazy, Suspense } from 'react';

// The plotly.js alias supplies the supported Cartesian bundle and satisfies the
// React factory's peer dependency without installing unused mapping engines.
const CartesianPlot = lazy(async () => {
  const [{ default: createPlot }, { default: plotly }] = await Promise.all([
    import('react-plotly.js/factory'), import('plotly.js'),
  ]);
  return { default: createPlot(plotly) };
});
const ThreeDimensionalPlot = lazy(async () => {
  const [{ default: createPlot }, { default: plotly }] = await Promise.all([
    import('react-plotly.js/factory'), import('plotly.js-gl3d-dist-min'),
  ]);
  return { default: createPlot(plotly) };
});

const threeDimensionalTypes = new Set([
  'surface', 'scatter3d', 'mesh3d', 'cone', 'streamtube', 'isosurface', 'volume',
]);

export default function PlotlyRenderer(props: Record<string, any>) {
  const Plot = props.data?.some((trace: { type?: string }) =>
    threeDimensionalTypes.has(trace.type ?? 'scatter'))
    ? ThreeDimensionalPlot : CartesianPlot;
  return <Suspense fallback={<div role="status">Loading chart…</div>}>
    <Plot {...props} />
  </Suspense>;
}
