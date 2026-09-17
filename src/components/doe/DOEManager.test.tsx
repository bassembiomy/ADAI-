import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-plotly.js', () => ({
  default: () => null
}));

import { DOEManager } from './DOEManager';
import { fitRSM } from '../../engine/doe/statistics';
import { validateDOEModelResult } from '../../engine/doe/integration';
import type { DOEModelResult } from '../../engine/doe/types';

describe('DOEManager UI component & persistence', () => {
  const sampleHeaders = ['X1', 'X2', 'Yield'];
  const sampleData = [
    [-1, -1, 10],
    [1, -1, 20],
    [-1, 1, 30],
    [1, 1, 40],
    [0, 0, 25],
    [0, 0, 25.2],
    [0, 0, 24.8],
    [-1.414, 0, 12],
    [1.414, 0, 22],
    [0, -1.414, 14],
    [0, 1.414, 32]
  ];

  it('renders design matrix table with headers and data rows', () => {
    const html = renderToStaticMarkup(
      <DOEManager
        headers={sampleHeaders}
        data={sampleData}
      />
    );

    expect(html).toContain('data-testid="doe-manager"');
    expect(html).toContain('doe-workspace');
    expect(html).toContain('engineering-table');
    expect(html).toContain('data-testid="doe-matrix-table"');
    expect(html).toContain('X1');
    expect(html).toContain('X2');
    expect(html).toContain('Yield');
    expect(html).toContain('Design Matrix (11 Runs × 2 Factors)');
    expect(html).toContain('data-testid="cell-0-0"');
  });

  it('renders model tabs and solver triggers', () => {
    const html = renderToStaticMarkup(
      <DOEManager
        headers={sampleHeaders}
        data={sampleData}
        activeModel="RSM"
      />
    );

    expect(html).toContain('data-testid="tab-rsm"');
    expect(html).toContain('data-testid="tab-gmdh"');
    expect(html).toContain('data-testid="tab-taguchi"');
    expect(html).toContain('data-testid="solve-btn"');
  });

  it('disables export buttons when no model is calculated', () => {
    const html = renderToStaticMarkup(
      <DOEManager
        headers={sampleHeaders}
        data={sampleData}
        results={null}
      />
    );

    expect(html).toContain('data-testid="export-xbridges-btn"');
    expect(html).toContain('data-testid="export-vlab-btn"');
    expect(html).toContain('cursor-not-allowed');
    expect(html).toContain('data-testid="no-results-placeholder"');
  });

  it('enables export buttons and displays equation & metrics when results are provided', () => {
    const rsmResult = fitRSM({ headers: sampleHeaders, data: sampleData });
    expect(rsmResult.diagnostics.every(d => d.severity !== 'error')).toBe(true);

    const html = renderToStaticMarkup(
      <DOEManager
        headers={sampleHeaders}
        data={sampleData}
        results={rsmResult}
      />
    );

    expect(html).toContain('data-testid="doe-results-summary"');
    expect(html).toContain('data-testid="model-equation"');
    expect(html).toContain('R²:');
    // Export buttons should not have cursor-not-allowed
    expect(html).not.toContain('cursor-not-allowed');
  });

  it('renders diagnostic badges with codes and messages', () => {
    const mockResultWithDiag: DOEModelResult = {
      modelType: 'RSM',
      factorNames: ['X1'],
      responseName: 'Y',
      diagnostics: [
        { code: 'INSUFFICIENT_RUNS', severity: 'error', message: 'Design has only 2 rows, minimum 3 required.' },
        { code: 'NEAR_SINGULAR_MATRIX', severity: 'warning', message: 'Condition number exceeds safe threshold.' }
      ]
    };

    const html = renderToStaticMarkup(
      <DOEManager
        headers={['X1', 'Y']}
        data={[[1, 2], [3, 4]]}
        results={mockResultWithDiag}
      />
    );

    expect(html).toContain('data-testid="doe-diagnostics"');
    expect(html).toContain('data-testid="diagnostic-badge-INSUFFICIENT_RUNS"');
    expect(html).toContain('INSUFFICIENT_RUNS');
    expect(html).toContain('Design has only 2 rows, minimum 3 required.');
    expect(html).toContain('data-testid="diagnostic-badge-NEAR_SINGULAR_MATRIX"');
  });

  it('persists and round-trips DOE state in workspace payload adhering to schemaVersion: 1', () => {
    const rsmResult = fitRSM({ headers: sampleHeaders, data: sampleData });

    // Workspace save structure
    const workspacePayload = {
      projectName: 'DOE Verification Project',
      version: '1.0.0',
      doe: {
        schemaVersion: 1,
        headers: sampleHeaders,
        data: sampleData,
        activeModel: 'RSM' as const,
        results: rsmResult
      }
    };

    const serialized = JSON.stringify(workspacePayload);
    const restored = JSON.parse(serialized);

    expect(restored.doe.schemaVersion).toBe(1);
    expect(restored.doe.headers).toEqual(sampleHeaders);
    expect(restored.doe.data).toEqual(sampleData);
    expect(restored.doe.activeModel).toBe('RSM');
    expect(restored.doe.results.deployment.schemaVersion).toBe(1);

    // Validate restored deployment model
    const diagnostics = validateDOEModelResult(restored.doe.results);
    const errors = diagnostics.filter(d => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('validates and catches malformed deployment payloads gracefully', () => {
    const malformedResult: any = {
      modelType: 'RSM',
      factorNames: ['X1'],
      responseName: 'Y',
      deployment: {
        schemaVersion: 999, // Invalid
        modelType: 'RSM',
        factorOrder: ['X1'],
        responseName: 'Y',
        trainingRowCount: 1,
        metrics: {},
        rsm: { intercept: NaN, terms: [] }
      }
    };

    const diags = validateDOEModelResult(malformedResult);
    const errorCodes = diags.filter(d => d.severity === 'error').map(d => d.code);
    expect(errorCodes).toContain('INVALID_SCHEMA_VERSION');
    expect(errorCodes).toContain('NON_FINITE_COEFFICIENT');
  });
});
