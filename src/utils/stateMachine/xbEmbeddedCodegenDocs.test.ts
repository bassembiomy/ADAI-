import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const documentation = readFileSync(
  resolve(process.cwd(), 'docs/XBRIDGES_EMBEDDED_CODEGEN.md'),
  'utf8',
);

describe('X-Bridges embedded code-generation documentation', () => {
  it('documents every newly executable capability family and its routing shape boundary', () => {
    expect(documentation).toContain('Extended logic and bitwise');
    expect(documentation).toContain('Signal routing');
    expect(documentation).toContain('Trigonometric and hyperbolic');
    expect(documentation).toContain('Discontinuities');
    expect(documentation).toMatch(/scalar inputs to\s+a vector output/);
    expect(documentation).toMatch(/vector input to\s+scalar outputs/);
  });

  it('does not retain the superseded unsupported-family claim', () => {
    expect(documentation).not.toMatch(
      /extended logic\/bitwise,\s*switches\/muxes[\s\S]*standalone\s+trigonometric family/,
    );
  });
});
