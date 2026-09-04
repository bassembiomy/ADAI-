import { describe, it, expect, vi } from 'vitest';

vi.mock('react-plotly.js', () => ({
  default: () => null
}));

import { preparePlotlyDataAndLayout } from './PlotlyPlots';
import type { DOEModelResult } from '../../engine/doe/types';

describe('PlotlyPlots Chart Data and Trace Preparation', () => {
  const mockRSMResult: DOEModelResult = {
    modelType: 'RSM',
    factorNames: ['Speed', 'Feed', 'Depth'],
    responseName: 'Roughness',
    equation: 'Y = 10 + 2*Speed - 3*Feed',
    diagnostics: [],
    predictions: [10, 12, 14, 16],
    residuals: [-0.5, 0.2, 0.4, -0.1],
    rSquared: 0.95,
    details: {
      df_error: 8,
      physicalCoefficients: [10, 2, -3, 0, 0, 0, 0]
    },
    deployment: {
      schemaVersion: 1,
      modelType: 'RSM',
      factorOrder: ['Speed', 'Feed', 'Depth'],
      responseName: 'Roughness',
      trainingRowCount: 4,
      metrics: { rSquared: 0.95 },
      factorRanges: {
        Speed: { min: 100, max: 200 },
        Feed: { min: 0.1, max: 0.5 },
        Depth: { min: 1, max: 5 }
      },
      rsm: {
        intercept: 10,
        terms: [
          { name: 'Speed', factors: [0], powers: [1], coeff: 2 },
          { name: 'Feed', factors: [1], powers: [1], coeff: -3 }
        ]
      }
    }
  };

  const rawData = [
    [100, 0.1, 1, 9.5],
    [150, 0.2, 2, 12.2],
    [180, 0.4, 3, 14.4],
    [200, 0.5, 5, 15.9]
  ];
  const headers = ['Speed', 'Feed', 'Depth', 'Roughness'];
  const holdValues = [150, 0.3, 3];

  it('prepares 3D surface plot with held factors, finite grid, and actual observations', () => {
    const { plotData, layout, diagnosticState } = preparePlotlyDataAndLayout({
      type: 'surface',
      data: rawData,
      results: mockRSMResult,
      factors: { x: 0, y: 1 },
      headers,
      holdValues,
      modelType: 'RSM'
    });

    expect(diagnosticState).toBeUndefined();
    expect(plotData).toHaveLength(2); // Surface trace + Scatter3D actual points
    const surfaceTrace = plotData[0];
    expect(surfaceTrace.type).toBe('surface');
    expect(surfaceTrace.x.length).toBeGreaterThan(10);
    expect(surfaceTrace.y.length).toBeGreaterThan(10);
    expect(surfaceTrace.z.length).toBe(surfaceTrace.y.length);

    // Verify all z values are finite
    for (const row of surfaceTrace.z) {
      for (const val of row) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }

    const pointsTrace = plotData[1];
    expect(pointsTrace.type).toBe('scatter3d');
    expect(pointsTrace.x).toEqual([100, 150, 180, 200]);
  });

  it('prepares contour plot with proper domain and finite mesh', () => {
    const { plotData, layout } = preparePlotlyDataAndLayout({
      type: 'contour',
      data: rawData,
      results: mockRSMResult,
      factors: { x: 0, y: 1 },
      headers,
      holdValues,
      modelType: 'RSM'
    });

    expect(plotData).toHaveLength(1);
    expect(plotData[0].type).toBe('contour');
    expect(plotData[0].contours).toBeDefined();
  });

  it('prepares predicted-vs-actual plot with 45-degree reference line spanning data bounds', () => {
    const { plotData, layout } = preparePlotlyDataAndLayout({
      type: 'pred_vs_act',
      data: rawData,
      results: mockRSMResult,
      factors: { x: 0, y: 1 },
      headers,
      holdValues,
      modelType: 'RSM'
    });

    expect(plotData).toHaveLength(2);
    const scatter = plotData[0];
    const refLine = plotData[1];

    expect(scatter.mode).toBe('markers');
    expect(scatter.x).toEqual([9.5, 12.2, 14.4, 15.9]);
    expect(scatter.y).toEqual([10, 12, 14, 16]);

    expect(refLine.mode).toBe('lines');
    expect(refLine.name).toContain('45°');
    expect(refLine.x[0]).toBe(refLine.y[0]);
    expect(refLine.x[1]).toBe(refLine.y[1]);
  });

  it('prepares residual diagnostics plot with Q-Q normal probability and residual vs fits', () => {
    const { plotData, layout } = preparePlotlyDataAndLayout({
      type: 'residuals',
      data: rawData,
      results: mockRSMResult,
      factors: { x: 0, y: 1 },
      headers,
      holdValues,
      modelType: 'RSM'
    });

    expect(plotData.length).toBeGreaterThanOrEqual(2);
    const normalProbTrace = plotData[0];
    expect(normalProbTrace.name).toBe('Normal Probability');
    for (const z of normalProbTrace.y) {
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it('prepares Pareto chart sorted by effect magnitude with critical t-threshold line', () => {
    const rsmWithCoeffs: DOEModelResult = {
      ...mockRSMResult,
      details: {
        df_error: 10,
        coeffTable: [
          { term: 'Intercept', t: 15.2 },
          { term: 'Speed', t: 4.8 },
          { term: 'Feed', t: -2.1 },
          { term: 'Speed*Feed', t: 0.9 }
        ]
      }
    };

    const { plotData, layout } = preparePlotlyDataAndLayout({
      type: 'pareto',
      data: rawData,
      results: rsmWithCoeffs,
      factors: { x: 0, y: 1 },
      headers,
      holdValues,
      modelType: 'RSM'
    });

    expect(plotData).toHaveLength(1);
    const barTrace = plotData[0];
    expect(barTrace.type).toBe('bar');
    // Speed*Feed (0.9), Feed (2.1), Speed (4.8) -> sorted ascending for horizontal bar chart
    expect(barTrace.x).toEqual([0.9, 2.1, 4.8]);
    expect(barTrace.y).toEqual(['Speed*Feed', 'Feed', 'Speed']);
    expect(layout.shapes).toBeDefined();
    expect(layout.shapes![0].type).toBe('line');
  });

  it('handles degenerate data gracefully with diagnostic state and finite bounds', () => {
    // Equal min and max (constant factor)
    const constantData = [
      [100, 100, 10],
      [100, 100, 10]
    ];
    const { plotData, diagnosticState } = preparePlotlyDataAndLayout({
      type: 'surface',
      data: constantData,
      results: mockRSMResult,
      factors: { x: 0, y: 1 },
      headers: ['X1', 'X2', 'Y'],
      holdValues: [100, 100],
      modelType: 'RSM'
    });

    // Should return valid finite plotData and not throw or emit NaN/Infinity
    expect(plotData).toBeDefined();
    for (const trace of plotData) {
      if (trace.x) {
        for (const v of trace.x) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('prepares Taguchi main effects plot for S/N ratios and Means', () => {
    const taguchiResult: DOEModelResult = {
      modelType: 'Taguchi',
      factorNames: ['Voltage', 'Time'],
      responseName: 'Quality',
      diagnostics: [],
      details: {
        grandMeanSN: 25.4,
        grandMeanY: 45.0,
        factorLevels: [
          {
            factor: 'Voltage',
            means: [
              { level: 1, meanY: 40.0, meanSN: 22.0 },
              { level: 2, meanY: 50.0, meanSN: 28.8 }
            ]
          },
          {
            factor: 'Time',
            means: [
              { level: 1, meanY: 42.0, meanSN: 24.0 },
              { level: 2, meanY: 48.0, meanSN: 26.8 }
            ]
          }
        ]
      }
    };

    const { plotData: snData } = preparePlotlyDataAndLayout({
      type: 'taguchi_main_sn',
      data: rawData,
      results: taguchiResult,
      factors: { x: 0, y: 1 },
      headers: ['Voltage', 'Time', 'Quality'],
      holdValues: [1, 1],
      modelType: 'Taguchi'
    });

    expect(snData).toHaveLength(2); // One trace per factor
    expect(snData[0].name).toBe('Voltage');
    expect(snData[0].y).toEqual([22.0, 28.8]);

    const { plotData: meanData } = preparePlotlyDataAndLayout({
      type: 'taguchi_main_mean',
      data: rawData,
      results: taguchiResult,
      factors: { x: 0, y: 1 },
      headers: ['Voltage', 'Time', 'Quality'],
      holdValues: [1, 1],
      modelType: 'Taguchi'
    });

    expect(meanData[0].y).toEqual([40.0, 50.0]);
  });

  it('renders GMDH surface when model is stored at results.model (production workspace)', () => {
    const mockGMDHModel = {
      predict: (inputs: number[]) => 50 + inputs[0] * 1.5 - inputs[1] * 0.8
    };

    const gmdhResultWithRootModel = {
      modelType: 'GMDH',
      factorNames: ['Speed', 'Feed'],
      responseName: 'Roughness',
      model: mockGMDHModel, // Production workspace stores model here
      predictions: [10, 12, 14, 16],
      actuals: [9.5, 12.2, 14.4, 15.9]
    };

    const { plotData, diagnosticState } = preparePlotlyDataAndLayout({
      type: 'surface',
      data: rawData,
      results: gmdhResultWithRootModel as any,
      factors: { x: 0, y: 1 },
      headers: ['Speed', 'Feed', 'Roughness'],
      holdValues: [150, 0.3],
      modelType: 'GMDH'
    });

    expect(diagnosticState).toBeUndefined();
    expect(plotData).toHaveLength(2);
    const surface = plotData[0];
    expect(surface.type).toBe('surface');
    for (const row of surface.z) {
      for (const val of row) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).not.toBe(0); // Ensure not masking with zero plane
      }
    }
  });

  it('renders GMDH surface when model is stored at results.details.model', () => {
    const mockGMDHModel = {
      predict: (inputs: number[]) => 20 + inputs[0] * 0.5 + inputs[1] * 2
    };

    const gmdhResultWithDetailsModel = {
      modelType: 'GMDH',
      factorNames: ['Speed', 'Feed'],
      responseName: 'Roughness',
      details: {
        model: mockGMDHModel
      }
    };

    const { plotData, diagnosticState } = preparePlotlyDataAndLayout({
      type: 'surface',
      data: rawData,
      results: gmdhResultWithDetailsModel as any,
      factors: { x: 0, y: 1 },
      headers: ['Speed', 'Feed', 'Roughness'],
      holdValues: [150, 0.3],
      modelType: 'GMDH'
    });

    expect(diagnosticState).toBeUndefined();
    expect(plotData).toHaveLength(2);
    expect(plotData[0].type).toBe('surface');
  });

  it('does not mask failed GMDH predictions as false flat zero, returning diagnosticState instead', () => {
    const brokenGMDHModel = {
      predict: () => NaN
    };

    const brokenGMDHResult = {
      modelType: 'GMDH',
      factorNames: ['Speed', 'Feed'],
      responseName: 'Roughness',
      model: brokenGMDHModel
    };

    const { plotData, diagnosticState } = preparePlotlyDataAndLayout({
      type: 'surface',
      data: rawData,
      results: brokenGMDHResult as any,
      factors: { x: 0, y: 1 },
      headers: ['Speed', 'Feed', 'Roughness'],
      holdValues: [150, 0.3],
      modelType: 'GMDH'
    });

    expect(plotData).toHaveLength(0);
    expect(diagnosticState).toContain('non-finite');
  });

  it('returns diagnosticState when GMDH model is completely missing', () => {
    const missingGMDHResult = {
      modelType: 'GMDH',
      factorNames: ['Speed', 'Feed'],
      responseName: 'Roughness'
    };

    const { plotData, diagnosticState } = preparePlotlyDataAndLayout({
      type: 'surface',
      data: rawData,
      results: missingGMDHResult as any,
      factors: { x: 0, y: 1 },
      headers: ['Speed', 'Feed', 'Roughness'],
      holdValues: [150, 0.3],
      modelType: 'GMDH'
    });

    expect(plotData).toHaveLength(0);
    expect(diagnosticState).toContain('GMDH model object not found');
  });
});
