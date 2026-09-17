import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('HILDashboard Plotly dependency', () => {
  it('uses the application Plotly renderer instead of the incompatible default bundle', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./HILDashboard.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).toContain("import Plot from '../doe/PlotlyRenderer';");
    expect(source).not.toContain("from 'react-plotly.js'");
  });
});
