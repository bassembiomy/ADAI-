import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFORMANCE_MANIFEST,
  evaluateManifestCompliance,
  executableCasesForManifestRow,
  generateConformanceMatrixMarkdown,
  MANIFEST_EXECUTABLE_CASES,
  verifyConformanceManifest,
  type ConformanceRow,
} from './conformanceManifest';
import { EXECUTABLE_EVIDENCE, isExecutableCaseRegistered, type RegisteredExecutableCaseId } from './compliance/evidenceRegistry';
import type {
  EvidenceRunContext,
  ExecutableCaseRunOutcome,
} from './compliance/types';

const TEST_REVISION = 'manifest-test-revision';
const TEST_RUN_ID = 'manifest-test-run';

function outcomeFor(caseId: RegisteredExecutableCaseId): ExecutableCaseRunOutcome {
  const record = EXECUTABLE_EVIDENCE[caseId];
  return {
    caseId,
    testFile: record.testFile,
    testName: record.testName,
    fullName: record.testName,
    status: 'passed',
    revision: TEST_REVISION,
    runId: TEST_RUN_ID,
  };
}

/** Current passing runContext covering every registered executable case. */
function passingRunContext(): EvidenceRunContext {
  const outcomes: Record<string, ExecutableCaseRunOutcome> = {};
  for (const id of Object.keys(EXECUTABLE_EVIDENCE) as RegisteredExecutableCaseId[]) {
    outcomes[id] = outcomeFor(id);
  }
  return { revision: TEST_REVISION, runId: TEST_RUN_ID, outcomes };
}

function resultFor(report: ReturnType<typeof evaluateManifestCompliance>, rowId: string) {
  const result = report.results.find(r => r.id === rowId);
  expect(result).toBeDefined();
  return result!;
}

describe('SysML release conformance manifest', () => {
  const rootDir = resolve(__dirname, '../../..');

  it('contains entries for all 32 SYSML conformance rows', () => {
    expect(CONFORMANCE_MANIFEST.rows).toHaveLength(32);
    const ids = CONFORMANCE_MANIFEST.rows.map(r => r.id);
    for (let i = 1; i <= 32; i++) {
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

  it('evaluates fail-closed without a runContext: zero COMPLIANT rows, unsupported row still NON_COMPLIANT, report stays valid', () => {
    const report = evaluateManifestCompliance(CONFORMANCE_MANIFEST);
    expect(report.totalFeatures).toBe(32);
    // Fail-closed contract: no current test-run evidence is bound, so no
    // non-unsupported row may read COMPLIANT.
    expect(report.compliantFeatures).toBe(0);
    expect(report.nonCompliantFeatures).toBe(1); // SYSML-029
    expect(report.valid).toBe(true);
    expect(resultFor(report, 'SYSML-029').status).toBe('NON_COMPLIANT');
  });

  it('binds every mapped manifest row to registered executable cases only', () => {
    const mappedRows = CONFORMANCE_MANIFEST.rows.filter(r => executableCasesForManifestRow(r.id).length > 0);
    expect(mappedRows.length).toBeGreaterThan(0);
    for (const row of CONFORMANCE_MANIFEST.rows) {
      for (const caseId of executableCasesForManifestRow(row.id)) {
        expect(isExecutableCaseRegistered(caseId)).toBe(true);
      }
    }
    expect(executableCasesForManifestRow('SYSML-029')).toHaveLength(0);
  });

  it('rates a supported bound row PARTIAL with the row named when no runContext is supplied', () => {
    const report = evaluateManifestCompliance(CONFORMANCE_MANIFEST);
    const result = resultFor(report, 'SYSML-006');
    expect(executableCasesForManifestRow('SYSML-006').length).toBeGreaterThan(0);
    expect(result.status).toBe('PARTIAL');
    expect(result.status).not.toBe('COMPLIANT');
    expect(result.missingEvidence).toContain('evidenceRunResults');
    expect(result.missingEvidence).toContain('manifestRow:SYSML-006');
  });

  it('rates a supported bound row COMPLIANT with a current passing runContext', () => {
    const report = evaluateManifestCompliance(CONFORMANCE_MANIFEST, passingRunContext());
    const result = resultFor(report, 'SYSML-006');
    expect(result.status).toBe('COMPLIANT');
    expect(result.missingEvidence).toHaveLength(0);
  });

  it('rates all bound rows COMPLIANT with a current passing runContext while unbound supported rows stay PARTIAL', () => {
    const boundRowIds = Object.keys(MANIFEST_EXECUTABLE_CASES);
    // Locks the binding against silent regressions: every bound row is
    // exercised here, and only bound rows may read COMPLIANT.
    expect(boundRowIds).toHaveLength(8);
    const report = evaluateManifestCompliance(CONFORMANCE_MANIFEST, passingRunContext());
    expect(report.totalFeatures).toBe(32);
    expect(report.compliantFeatures).toBe(boundRowIds.length);
    for (const rowId of boundRowIds) {
      expect(executableCasesForManifestRow(rowId).length).toBeGreaterThan(0);
      const result = resultFor(report, rowId);
      expect(result.status).toBe('COMPLIANT');
      expect(result.missingEvidence).toHaveLength(0);
    }
    const unboundSupported = CONFORMANCE_MANIFEST.rows.filter(
      r => r.status === 'supported' && executableCasesForManifestRow(r.id).length === 0,
    );
    expect(unboundSupported.length).toBeGreaterThan(0);
    for (const row of unboundSupported) {
      const result = resultFor(report, row.id);
      expect(result.status).toBe('PARTIAL');
      expect(result.status).not.toBe('COMPLIANT');
    }
  });

  it('never rates an unbound supported row COMPLIANT, even with a current passing runContext', () => {
    const report = evaluateManifestCompliance(CONFORMANCE_MANIFEST, passingRunContext());
    const result = resultFor(report, 'SYSML-001');
    expect(executableCasesForManifestRow('SYSML-001')).toHaveLength(0);
    expect(result.status).toBe('PARTIAL');
    expect(result.status).not.toBe('COMPLIANT');
    expect(result.missingEvidence).toContain('manifestRow:SYSML-001:noExecutableCases');
    expect(result.reasons.some(r => r.includes('SYSML-001'))).toBe(true);
  });

  it('rates a supported bound row PARTIAL on stale or failed outcomes', () => {
    const boundCases = executableCasesForManifestRow('SYSML-006');
    expect(boundCases.length).toBeGreaterThan(0);
    const failingCase = boundCases[0];

    const failedContext = passingRunContext();
    failedContext.outcomes[failingCase] = { ...failedContext.outcomes[failingCase], status: 'failed' };
    const failedReport = evaluateManifestCompliance(CONFORMANCE_MANIFEST, failedContext);
    const failedResult = resultFor(failedReport, 'SYSML-006');
    expect(failedResult.status).toBe('PARTIAL');
    expect(failedResult.status).not.toBe('COMPLIANT');
    expect(failedResult.missingEvidence).toContain(`case:${failingCase}`);

    const staleContext = passingRunContext();
    staleContext.outcomes[failingCase] = { ...staleContext.outcomes[failingCase], revision: 'older-revision' };
    const staleReport = evaluateManifestCompliance(CONFORMANCE_MANIFEST, staleContext);
    const staleResult = resultFor(staleReport, 'SYSML-006');
    expect(staleResult.status).toBe('PARTIAL');
    expect(staleResult.status).not.toBe('COMPLIANT');
    expect(staleResult.missingEvidence).toContain(`case:${failingCase}`);
  });

  it('leaves unsupported rows unaffected by runContext', () => {
    const without = resultFor(evaluateManifestCompliance(CONFORMANCE_MANIFEST), 'SYSML-029');
    const withRun = resultFor(evaluateManifestCompliance(CONFORMANCE_MANIFEST, passingRunContext()), 'SYSML-029');
    expect(without.status).toBe('NON_COMPLIANT');
    expect(withRun.status).toBe('NON_COMPLIANT');
  });
});
