import React from 'react';
import Plot from './PlotlyRenderer';
import { tDistCritical } from '../../engine/doe/statistics';
import type { DOEModelResult } from '../../engine/doe/types';
import { evaluateDOEModelDetailed } from '../../engine/doe/modelEvaluator';

export type PlotType =
  | 'surface'
  | 'contour'
  | 'pareto'
  | 'residuals'
  | 'taguchi_delta'
  | 'pred_vs_act'
  | 'taguchi_main_sn'
  | 'taguchi_main_mean';

export interface PlotlyPlotsProps {
  type: PlotType;
  data: number[][];
  results: DOEModelResult | any;
  factors: { x: number; y: number };
  headers: string[];
  holdValues: number[];
  modelType?: 'RSM' | 'GMDH' | 'Taguchi';
}

export interface PreparedPlotlyOutput {
  plotData: any[];
  layout: Record<string, any>;
  diagnosticState?: string;
}

/**
 * Pure function to construct Plotly traces and layout configuration.
 */
export function preparePlotlyDataAndLayout({
  type,
  data,
  results,
  factors,
  headers,
  holdValues,
  modelType = 'RSM'
}: PlotlyPlotsProps): PreparedPlotlyOutput {
  if (!results || !data || data.length === 0) {
    return {
      plotData: [],
      layout: {},
      diagnosticState: 'No Model Calculated'
    };
  }

  // 1. Pareto Chart
  if (type === 'pareto') {
    const coeffTable = results.details?.coeffTable || results.coeffTable;
    if (!coeffTable || !Array.isArray(coeffTable)) {
      return {
        plotData: [],
        layout: {},
        diagnosticState: 'Pareto chart requires coefficient table with t-statistics.'
      };
    }
    const n = data.length;
    const p = coeffTable.length || 1;
    const dfErr = results.details?.df_error || Math.max(1, n - p);
    const critT = tDistCritical(dfErr, 0.05);

    const sortedEffects = coeffTable
      .filter((c: any) => c.term !== 'Intercept')
      .map((c: any) => ({ term: c.term, absT: Math.abs(c.t) }))
      .sort((a: any, b: any) => a.absT - b.absT);

    const trace = {
      x: sortedEffects.map((s: any) => s.absT),
      y: sortedEffects.map((s: any) => s.term),
      type: 'bar',
      orientation: 'h',
      marker: {
        color: sortedEffects.map((s: any) => s.absT > critT ? '#10b981' : '#444'),
        line: { color: '#000', width: 1 }
      },
      name: 'Effect Magnitude'
    };

    return {
      plotData: [trace],
      layout: {
        template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
        autosize: true,
        margin: { l: 120, r: 40, t: 40, b: 40 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(0,0,0,0.2)',
        font: { color: '#888', size: 10 },
        title: {
          text: `Pareto Chart of Standardized Effects (α=0.05, df=${dfErr})`,
          font: { size: 12, color: '#f97316' }
        },
        xaxis: { title: 'Absolute T-Value', gridcolor: '#222' },
        yaxis: { title: 'Factor Term', gridcolor: '#222' },
        shapes: [
          {
            type: 'line',
            x0: critT,
            x1: critT,
            y0: -0.5,
            y1: sortedEffects.length - 0.5,
            line: { color: '#ef4444', width: 2, dash: 'dash' }
          }
        ],
        annotations: [
          {
            x: critT,
            y: Math.max(0, sortedEffects.length - 1),
            text: `t_crit = ${critT.toFixed(3)}`,
            showarrow: false,
            font: { color: '#ef4444', size: 9 },
            xanchor: 'left',
            xshift: 5
          }
        ]
      }
    };
  }

  // 2. Residual Diagnostics
  if (type === 'residuals') {
    const res = results.residuals;
    const fits = results.predictions || results.fits || [];
    if (!res || res.length === 0) {
      return {
        plotData: [],
        layout: {},
        diagnosticState: 'No residuals calculated.'
      };
    }

    const sortedRes = [...res].sort((a, b) => a - b);
    const n = res.length;
    const pValues = sortedRes.map((_: number, i: number) => (i + 0.5) / n);
    const zScores = pValues.map((p: number) => {
      const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)));
      const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
      return p > 0.5 ? z : -z;
    });

    const normalTrace = {
      x: sortedRes,
      y: zScores,
      mode: 'markers',
      type: 'scatter',
      name: 'Normal Probability',
      marker: { color: '#f97316' }
    };

    const fitsTrace = {
      x: fits,
      y: res,
      mode: 'markers',
      type: 'scatter',
      name: 'Residual vs Fits',
      xaxis: 'x2',
      yaxis: 'y2',
      marker: { color: '#10b981' }
    };

    const histTrace = {
      x: res,
      type: 'histogram',
      name: 'Histogram',
      xaxis: 'x3',
      yaxis: 'y3',
      marker: { color: '#f97316' }
    };

    return {
      plotData: [normalTrace, fitsTrace, histTrace],
      layout: {
        grid: { rows: 2, columns: 2, pattern: 'independent' },
        template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(0,0,0,0.1)',
        font: { color: '#888', size: 10 },
        showlegend: false,
        annotations: [
          { text: 'Normal Probability Plot', xref: 'paper', yref: 'paper', x: 0, y: 1.1, showarrow: false, font: { color: '#f97316' } },
          { text: 'Residual vs Fits', xref: 'paper', yref: 'paper', x: 0.6, y: 1.1, showarrow: false, font: { color: '#10b981' } },
          { text: 'Histogram of Residuals', xref: 'paper', yref: 'paper', x: 0, y: 0.4, showarrow: false, font: { color: '#f97316' } }
        ],
        xaxis: { title: 'Residual', gridcolor: '#222' },
        yaxis: { title: 'Z-Score', gridcolor: '#222' },
        xaxis2: { title: 'Fitted Value', gridcolor: '#222' },
        yaxis2: { title: 'Residual', gridcolor: '#222' },
        xaxis3: { title: 'Residual', gridcolor: '#222' },
        yaxis3: { title: 'Frequency', gridcolor: '#222' }
      }
    };
  }

  // 3. Predicted vs Actual
  if (type === 'pred_vs_act') {
    const act = results.actuals || data.map(r => r[headers.length - 1]);
    const fits = results.predictions || results.fits || [];
    const minVal = Math.min(...act, ...fits);
    const maxVal = Math.max(...act, ...fits);

    const min = Number.isFinite(minVal) ? minVal : 0;
    const max = Number.isFinite(maxVal) ? maxVal : 1;

    const trace = {
      x: act,
      y: fits,
      mode: 'markers',
      type: 'scatter',
      name: 'Observations',
      marker: { color: '#f97316', size: 8, line: { color: '#000', width: 1 } }
    };

    const line = {
      x: [min, max],
      y: [min, max],
      mode: 'lines',
      type: 'scatter',
      name: 'Ideal (45°)',
      line: { color: '#666', dash: 'dash', width: 1 }
    };

    return {
      plotData: [trace, line],
      layout: {
        template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(0,0,0,0.1)',
        font: { color: '#888', size: 10 },
        title: { text: 'Predicted vs Actual Response', font: { size: 12, color: '#f97316' } },
        xaxis: { title: 'Actual Value', gridcolor: '#222', scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Predicted Value', gridcolor: '#222' }
      }
    };
  }

  // 4. Taguchi Delta Plot
  if (type === 'taguchi_delta') {
    const factorLevels = results.details?.factorLevels || results.factorLevels || [];
    const deltaTrace = {
      x: factorLevels.map((f: any) => f.factorName || f.factor),
      y: factorLevels.map((f: any) => f.delta),
      type: 'bar',
      marker: { color: '#f97316' },
      name: 'Delta (Max-Min)'
    };

    return {
      plotData: [deltaTrace],
      layout: {
        template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(0,0,0,0.1)',
        font: { color: '#888', size: 10 },
        title: { text: 'Response Table Delta (Factor Significance)', font: { size: 12, color: '#f97316' } },
        xaxis: { title: 'Factor', gridcolor: '#222' },
        yaxis: { title: 'Delta (S/N)', gridcolor: '#222' }
      }
    };
  }

  // 5. Taguchi Main Effects Plot (S/N or Mean)
  if (type === 'taguchi_main_sn' || type === 'taguchi_main_mean') {
    const isSN = type === 'taguchi_main_sn';
    const factorLevels = results.details?.factorLevels || results.factorLevels || [];
    const K = factorLevels.length;
    if (K === 0) {
      return {
        plotData: [],
        layout: {},
        diagnosticState: 'No Factor Levels Found'
      };
    }

    const traces: any[] = [];
    const layoutAxes: any = {};
    const grandMean = isSN
      ? (results.details?.grandMeanSN ?? results.grandMeanSN ?? 0)
      : (results.details?.grandMeanY ?? results.grandMeanY ?? 0);

    factorLevels.forEach((fl: any, idx: number) => {
      const factorName = fl.factorName || fl.factor;
      const sortedMeans = [...fl.means].sort((a: any, b: any) => a.level - b.level);
      const x = sortedMeans.map((m: any) => `L${m.level}`);
      const y = sortedMeans.map((m: any) => isSN ? (m.snr ?? m.meanSN ?? 0) : m.meanY);

      traces.push({
        x,
        y,
        type: 'scatter',
        mode: 'lines+markers',
        name: factorName,
        xaxis: 'x' + (idx + 1),
        yaxis: 'y',
        line: {
          color: isSN ? '#f97316' : '#10b981',
          width: 3
        },
        marker: {
          color: isSN ? '#f97316' : '#10b981',
          size: 10,
          line: { color: '#000', width: 1 }
        },
        showlegend: false
      });

      layoutAxes[`xaxis${idx + 1}`] = {
        title: factorName,
        titlefont: { size: 10, color: '#aaa', family: 'Inter, sans-serif' },
        tickfont: { size: 9, color: '#888' },
        gridcolor: '#222',
        zeroline: false,
        domain: [idx / K + 0.02, (idx + 1) / K - 0.02]
      };
    });

    return {
      plotData: traces,
      layout: {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(0,0,0,0.1)',
        font: { color: '#888', family: 'Inter, sans-serif' },
        margin: { l: 60, r: 20, b: 50, t: 50 },
        title: {
          text: isSN ? 'Main Effects Plot for SN Ratios' : 'Main Effects Plot for Means',
          font: { size: 13, color: '#f97316' }
        },
        yaxis: {
          title: isSN ? 'Mean S/N Ratio (dB)' : 'Mean Response',
          gridcolor: '#222',
          tickfont: { size: 9, color: '#aaa' },
          zeroline: false
        },
        ...layoutAxes,
        shapes: [
          {
            type: 'line',
            x0: 0,
            x1: 1,
            xref: 'paper',
            y0: grandMean,
            y1: grandMean,
            yref: 'y',
            line: { color: '#666', width: 1.5, dash: 'dash' }
          }
        ],
        annotations: [
          {
            xref: 'paper',
            yref: 'y',
            x: 0.98,
            y: grandMean,
            text: `Grand Mean: ${grandMean.toFixed(3)}`,
            showarrow: false,
            font: { color: '#888', size: 9 },
            yanchor: 'bottom',
            xanchor: 'right'
          }
        ],
        autosize: true
      }
    };
  }

  // 6. Surface & Contour Plots
  const idxX = factors.x;
  const idxY = factors.y;

  const xVals = data.map(r => r[idxX] ?? 0);
  const yVals = data.map(r => r[idxY] ?? 0);
  let minX = Math.min(...xVals);
  let maxX = Math.max(...xVals);
  let minY = Math.min(...yVals);
  let maxY = Math.max(...yVals);

  // Handle degenerate bounds (equal min and max)
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const gridRes = 40;
  const stepX = (maxX - minX) / gridRes;
  const stepY = (maxY - minY) / gridRes;
  const xRange = Array.from({ length: gridRes + 1 }, (_, i) => minX + i * stepX);
  const yRange = Array.from({ length: gridRes + 1 }, (_, i) => minY + i * stepY);

  const resolvedModelType = modelType || results?.modelType || results?.type || 'RSM';
  const gmdhModel = results?.details?.model || results?.model;
  const gmdhDeployment = (results?.deployment?.modelType === 'GMDH' ? results.deployment : null)
    || (results?.canonicalResult?.deployment?.modelType === 'GMDH' ? results.canonicalResult.deployment : null);

  if (resolvedModelType === 'GMDH' && !gmdhModel && !gmdhDeployment) {
    return {
      plotData: [],
      layout: {},
      diagnosticState: 'GMDH model object not found in results.'
    };
  }

  const k = headers.length - 1;
  const zGrid: number[][] = [];
  const beta = results?.details?.physicalCoefficients || results?.details?.Beta || results?.Beta;

  for (let j = 0; j < yRange.length; j++) {
    const rowZ: number[] = [];
    for (let i = 0; i < xRange.length; i++) {
      const currentFactors = [...holdValues];
      while (currentFactors.length < k) currentFactors.push(0);
      currentFactors[idxX] = xRange[i];
      currentFactors[idxY] = yRange[j];

      let z = NaN;
      if (resolvedModelType === 'RSM' && beta) {
        let val = beta[0];
        for (let f = 0; f < k; f++) val += (beta[f + 1] || 0) * currentFactors[f];
        for (let f = 0; f < k; f++) val += (beta[k + 1 + f] || 0) * currentFactors[f] * currentFactors[f];
        let idx = 2 * k + 1;
        for (let f = 0; f < k; f++) {
          for (let g = f + 1; g < k; g++) {
            val += (beta[idx] || 0) * currentFactors[f] * currentFactors[g];
            idx++;
          }
        }
        z = val;
      } else if (resolvedModelType === 'GMDH') {
        if (gmdhModel && typeof gmdhModel.predict === 'function') {
          try {
            const pred = gmdhModel.predict(currentFactors.slice(0, k));
            z = Number.isFinite(pred) ? pred : NaN;
          } catch {
            z = NaN;
          }
        } else if (gmdhDeployment) {
          const evalRes = evaluateDOEModelDetailed(gmdhDeployment, currentFactors.slice(0, k));
          z = evalRes.success && Number.isFinite(evalRes.value) ? evalRes.value : NaN;
        }
      } else if (resolvedModelType === 'Taguchi') {
        const factorLevels = results?.details?.factorLevels || results?.factorLevels || [];
        const grandMean = results?.details?.grandMeanY ?? results?.grandMean ?? 0;
        let val = grandMean;
        factorLevels.forEach((fl: any, fIdx: number) => {
          const curVal = currentFactors[fIdx];
          if (fl.means && fl.means.length > 0) {
            const sorted = [...fl.means].sort((a: any, b: any) => Math.abs(a.level - curVal) - Math.abs(b.level - curVal));
            if (sorted[0]) val += (sorted[0].meanY - grandMean);
          }
        });
        z = val;
      }
      rowZ.push(Number.isFinite(z) ? z : NaN);
    }
    zGrid.push(rowZ);
  }

  const hasFiniteZ = zGrid.some(row => row.some(val => Number.isFinite(val)));
  if (!hasFiniteZ) {
    return {
      plotData: [],
      layout: {},
      diagnosticState: 'Surface plot could not be rendered: model returned non-finite predictions.'
    };
  }

  const plotData: any[] = [
    {
      z: zGrid,
      x: xRange,
      y: yRange,
      type: type === 'surface' ? 'surface' : 'contour',
      colorscale: 'Viridis',
      showscale: true,
      opacity: type === 'surface' ? 0.95 : 1,
      contours: type === 'contour' ? {
        coloring: 'heatmap',
        showlabels: true,
        labelfont: { size: 10, color: '#fff' }
      } : type === 'surface' ? {
        z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: false } }
      } : undefined
    }
  ];

  if (type === 'surface') {
    plotData.push({
      x: xVals,
      y: yVals,
      z: data.map(r => r[data[0].length - 1]),
      mode: 'markers',
      type: 'scatter3d',
      marker: {
        size: 5,
        color: '#f97316',
        opacity: 1,
        line: { width: 1, color: '#fff' }
      },
      name: 'Actual Data'
    });
  }

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#888', family: 'Inter, sans-serif' },
    margin: { l: 20, r: 20, b: 20, t: 40 },
    title: {
      text: type === 'surface' ? '3D Response Surface' : 'Contour Plot',
      font: { size: 14, color: '#f97316' }
    },
    scene: {
      xaxis: { title: { text: headers[idxX] || `X${idxX + 1}`, font: { color: '#f97316' } }, gridcolor: '#222' },
      yaxis: { title: { text: headers[idxY] || `X${idxY + 1}`, font: { color: '#10b981' } }, gridcolor: '#222' },
      zaxis: { title: { text: headers[headers.length - 1] || 'Response', font: { color: '#3b82f6' } }, gridcolor: '#222' },
      camera: { eye: { x: 1.6, y: 1.6, z: 1.4 } }
    },
    autosize: true
  };

  return {
    plotData,
    layout
  };
}

/**
 * PlotlyPlots React Component.
 */
export const PlotlyPlots: React.FC<PlotlyPlotsProps> = (props) => {
  const { plotData, layout, diagnosticState } = preparePlotlyDataAndLayout(props);

  if (diagnosticState) {
    return (
      <div className="flex items-center justify-center h-full text-[#666] font-mono text-sm">
        {diagnosticState}
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Plot
        data={plotData}
        layout={layout}
        useResizeHandler={true}
        className="w-full h-full"
        config={{ displayModeBar: true, responsive: true }}
      />
    </div>
  );
};
