import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFORMANCE_MANIFEST,
  generateConformanceMatrixMarkdown,
  verifyConformanceManifest,
  type ConformanceRow,
} from './conformanceManifest';

describe('SysML release conformance manifest', () => {
  const rootDir = resolve(__dirname, '../../..');

  it('contains entries for all 30 SYSML conformance rows', () => {
    expect(CONFORMANCE_MANIFEST.rows).toHaveLength(30);
    const ids = CONFORMANCE_MANIFEST.rows.map(r => r.id);
    for (let i = 1; i <= 30; i++) {
      const expectedId = `SYSML-${String(i).padStart(3, '0')}`;
      expect(ids).toContain(expectedId);
    }
  });

  it('verifies that all implementation and automated evidence files exist on disk', () => {
    const report = verifyConformanceManifest(rootDir);
    expect(report.valid).toBe(true);
    expect(report.missingFiles).toHaveLength(0);
  });

  it('ensures core profile capabilities are supported or partial before promotion with zero remaining blockers', () => {
    const supportedRows = CONFORMANCE_MANIFEST.rows.filter(r => r.status === 'supported');
    expect(supportedRows.length).toBeGreaterThanOrEqual(28);

    const unsupportedRows = CONFORMANCE_MANIFEST.rows.filter(r => r.status === 'unsupported');
    expect(unsupportedRows).toHaveLength(1);
    expect(unsupportedRows[0].id).toBe('SYSML-029');
    expect(unsupportedRows[0].remainingLimitation).toMatch(/SysML v2/i);
  });

  it('generates the normative markdown table matching docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md', () => {
    const markdown = generateConformanceMatrixMarkdown(CONFORMANCE_MANIFEST);
    expect(markdown).toContain('# ADIA SysML Profile Conformance Matrix');
    expect(markdown).toContain('SYSML-001');
    expect(markdown).toContain('SYSML-029');
    expect(markdown).toContain('supported');
    expect(markdown).toContain('unsupported');

    // Check that generated markdown matches the file in docs/
    const matrixDocPath = resolve(rootDir, 'docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md');
    expect(existsSync(matrixDocPath)).toBe(true);
    const fileContent = readFileSync(matrixDocPath, 'utf-8');
    expect(fileContent.replace(/\r\n/g, '\n').trim()).toBe(markdown.replace(/\r\n/g, '\n').trim());
  });
});
