import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { evaluateCompliance } from './compliance/evaluator';
import {
  EXECUTABLE_EVIDENCE,
  buildOutcomesFromVitestReport,
  listExecutableEvidenceRecords,
  type RegisteredExecutableCaseId,
} from './compliance/evidenceRegistry';
import type {
  EvidenceRunContext,
  ExecutableCaseRunOutcome,
  FeatureComplianceDefinition,
} from './compliance/types';

const CORRECTIONS_TEST_FILE = 'src/engine/sysml/diagramInteractionCorrections.test.ts';

function resolveCurrentRevision(): string | null {
  try {
    const revision = execSync('git rev-parse HEAD', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return /^[0-9a-f]{40}$/.test(revision) ? revision : null;
  } catch {
    return null;
  }
}

interface LiveEvidence {
  revision: string;
  runId: string;
  outcomes: Record<string, ExecutableCaseRunOutcome>;
  summary: { passed: number; failed: number; skipped: number };
}

/**
 * Emits machine-readable case results by executing the corrections suite
 * through the real test runner (Vitest JSON reporter) and consumes them
 * into a revision- and run-bound evidence context.
 */
function collectLiveEvidence(): LiveEvidence {
  const revision = resolveCurrentRevision();
  if (!revision) {
    throw new Error('Cannot bind compliance evidence: current git revision is unavailable.');
  }
  const runId = randomUUID();
  const outputFile = join(tmpdir(), `adia-compliance-evidence-${runId}.json`);
  const vitestBin = resolve(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitestBin)) {
    throw new Error(`Cannot bind compliance evidence: Vitest binary not found at ${vitestBin}.`);
  }
  try {
    execFileSync(
      process.execPath,
      [vitestBin, 'run', resolve(process.cwd(), CORRECTIONS_TEST_FILE), '--reporter=json', '--outputFile', outputFile],
      { timeout: 240000, stdio: 'pipe', env: { ...process.env, ADIA_COMPLIANCE_EVIDENCE_CHILD: '1' } },
    );
  } catch (spawnError) {
    // A failing evidence suite still emits its JSON report; absent report means the runner itself broke.
    if (!existsSync(outputFile)) {
      throw new Error(
        `Evidence runner failed without emitting results: ${(spawnError as Error).message}`,
      );
    }
  }
  try {
    const report = JSON.parse(readFileSync(outputFile, 'utf8'));
    const outcomes = buildOutcomesFromVitestReport(report, { revision, runId });
    const summary = { passed: 0, failed: 0, skipped: 0 };
    for (const outcome of Object.values(outcomes)) {
      summary[outcome.status === 'passed' ? 'passed' : outcome.status === 'failed' ? 'failed' : 'skipped'] += 1;
    }
    return { revision, runId, outcomes, summary };
  } finally {
    try {
      unlinkSync(outputFile);
    } catch {
      // Best-effort temp cleanup only.
    }
  }
}

function buildDefinitionFromRecord(record: any): FeatureComplianceDefinition {
  return {
    id: record.id,
    name: record.feature,
    authority: record.authority,
    levels: {
      element: record.fourLevelCompliance.element.status,
      properties: record.fourLevelCompliance.properties.status,
      relationships: record.fourLevelCompliance.relationships.status,
      constraints: record.fourLevelCompliance.constraints.status,
    },
    evidence: {
      specificationSection: record.specification.section,
      sourceFile: record.implementation.sourceFiles[0],
      domainType: record.implementation.domainTypes[0],
      command: record.implementation.commands[0],
      validator: Array.isArray(record.implementation.validator)
        ? record.implementation.validator[0]
        : record.implementation.validator,
      persistence: record.implementation.persistenceMapping,
      projection: Array.isArray(record.implementation.projection)
        ? record.implementation.projection[0]
        : record.implementation.projection,
      tests: record.implementation.automatedTests,
      executableCases: record.implementation.executableCases,
      levelEvidenceCases: {
        element: record.fourLevelCompliance.element.executableCases,
        properties: record.fourLevelCompliance.properties.executableCases,
        relationships: record.fourLevelCompliance.relationships.executableCases,
        constraints: record.fourLevelCompliance.constraints.executableCases,
      },
    },
  };
}

describe('Diagram Interaction Corrections Compliance Gate (Task 5: executable evidence binding)', () => {
  const evidencePath = resolve(__dirname, '../../../docs/sysml/compliance-evidence.json');
  const rawData = readFileSync(evidencePath, 'utf8');
  const evidenceFile = JSON.parse(rawData);

  const TARGET_IDS = [
    'UML-PORT-STANDARD-001',
    'SYSML-PORT-CREATE-001',
    'SYSML-IBD-DELEGATION-001',
    'SYSML-REQ-TESTCASE-001',
    'ADIA-VERIFICATIONCASE-NORMALIZATION-001',
    'SYSML-REQ-SATISFY-STATE-001',
    'CAMEO-DIAGRAM-ACTIVATE-001',
  ];

  const EXPECTED_AUTHORITIES: Record<string, string> = {
    'UML-PORT-STANDARD-001': 'UML_FOUNDATION',
    'SYSML-PORT-CREATE-001': 'OMG_SYSML_1_6',
    'SYSML-IBD-DELEGATION-001': 'OMG_SYSML_1_6',
    'SYSML-REQ-TESTCASE-001': 'OMG_SYSML_1_6',
    'ADIA-VERIFICATIONCASE-NORMALIZATION-001': 'ADIA_EXTENSION',
    'SYSML-REQ-SATISFY-STATE-001': 'OMG_SYSML_1_6',
    'CAMEO-DIAGRAM-ACTIVATE-001': 'CAMEO_TOOLING',
  };

  let live: LiveEvidence;
  let liveContext: EvidenceRunContext;

  beforeAll(() => {
    live = collectLiveEvidence();
    liveContext = { revision: live.revision, runId: live.runId, outcomes: live.outcomes };
  }, 240000);

  it('contains all 7 diagram interaction correction records with separated semantic authorities', () => {
    const ids = evidenceFile.evidence.map((e: any) => e.id);
    for (const targetId of TARGET_IDS) {
      expect(ids).toContain(targetId);
      const record = evidenceFile.evidence.find((e: any) => e.id === targetId);
      expect(record.authority).toBe(EXPECTED_AUTHORITIES[targetId]);
      expect(record.implementation.executableCases).toBeDefined();
      expect(record.implementation.executableCases.length).toBeGreaterThan(0);
    }
  });

  it('maps every evidence ID to a concrete test file and full test name in the registry', () => {
    const records = listExecutableEvidenceRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.testFile).toMatch(/\.test\.tsx?$/);
      expect(record.testName.length).toBeGreaterThan(0);
      expect(record.authority).toBeDefined();
      expect(record.specificationSection.length).toBeGreaterThan(0);
      expect(record.implementation.sourceFiles.length).toBeGreaterThan(0);
    }
  });

  it('resolves every registered test binding to an existing test on disk', () => {
    for (const record of listExecutableEvidenceRecords()) {
      const fullPath = resolve(process.cwd(), record.testFile);
      expect(existsSync(fullPath), `Test file must exist: ${record.testFile}`).toBe(true);
      const content = readFileSync(fullPath, 'utf8');
      expect(
        content.includes(record.testName),
        `Test "${record.testName}" must exist in ${record.testFile}`,
      ).toBe(true);
    }
  });

  it('records executable evidence bindings and result identity for every target record', () => {
    for (const targetId of TARGET_IDS) {
      const record = evidenceFile.evidence.find((e: any) => e.id === targetId);
      expect(record).toBeDefined();
      expect(Array.isArray(record.executableEvidence)).toBe(true);
      const boundCaseIds = record.executableEvidence.map((e: any) => e.caseId);
      for (const caseId of record.implementation.executableCases) {
        expect(boundCaseIds, `${targetId} must bind case ${caseId}`).toContain(caseId);
      }
      for (const binding of record.executableEvidence) {
        const registered = (EXECUTABLE_EVIDENCE as Record<string, { testFile: string; testName: string }>)[
          binding.caseId
        ];
        expect(registered, `Case ${binding.caseId} must be registered`).toBeDefined();
        expect(binding.testFile).toBe(registered.testFile);
        expect(binding.testName).toBe(registered.testName);
      }
      expect(record.verification).toBeDefined();
      expect(typeof record.verification.runId).toBe('string');
      expect(record.verification.runId.length).toBeGreaterThan(0);
    }
  });

  it('executes the evidence suite live: every registered case reports a current-revision passing result', () => {
    const missing = (Object.keys(EXECUTABLE_EVIDENCE) as RegisteredExecutableCaseId[]).filter(
      id => live.outcomes[id] === undefined,
    );
    expect(missing, `All registered cases must execute: missing ${missing.join(', ')}`).toEqual([]);
    for (const [caseId, outcome] of Object.entries(live.outcomes)) {
      expect(outcome.status, `Case ${caseId} must pass`).toBe('passed');
      expect(outcome.revision).toBe(live.revision);
      expect(outcome.runId).toBe(live.runId);
    }
  });

  for (const targetId of TARGET_IDS) {
    it(`evaluates ${targetId} as COMPLIANT only with current passing executable evidence`, () => {
      const record = evidenceFile.evidence.find((e: any) => e.id === targetId);
      expect(record).toBeDefined();

      const definition = buildDefinitionFromRecord(record);
      const result = evaluateCompliance(definition, liveContext);
      expect(result.missingEvidence).toEqual([]);
      expect(result.reasons).toEqual([]);
      expect(result.status).toBe('COMPLIANT');
      expect(record.overallStatus).toBe(result.status);
    });
  }

  it('rejects self-declared compliance when executable cases are stripped or unregistered', () => {
    const record = evidenceFile.evidence.find((e: any) => e.id === 'SYSML-PORT-CREATE-001');
    const tamperedDef: FeatureComplianceDefinition = {
      id: record.id,
      name: record.feature,
      authority: record.authority,
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'PASS',
      },
      evidence: {
        specificationSection: record.specification.section,
        sourceFile: record.implementation.sourceFiles[0],
        domainType: record.implementation.domainTypes[0],
        command: record.implementation.commands[0],
        validator: record.implementation.validator[0],
        projection: record.implementation.projection[0],
        persistence: record.implementation.persistenceMapping,
        tests: record.implementation.automatedTests,
        executableCases: ['ABSENT_CASE_ID'],
        levelEvidenceCases: {
          element: ['ABSENT_CASE_ID'],
          properties: ['ABSENT_CASE_ID'],
          relationships: ['ABSENT_CASE_ID'],
          constraints: ['ABSENT_CASE_ID'],
        },
      },
    };
    const result = evaluateCompliance(tamperedDef, liveContext);
    expect(result.status).not.toBe('COMPLIANT');
    expect(result.missingEvidence).toContain('case:ABSENT_CASE_ID');
  });

  describe('Executable evidence run-result binding (fail closed)', () => {
    const baseEvidence = {
      specificationSection: 'OMG SysML 1.6 Clause 9.3.2.12',
      sourceFile: 'src/engine/sysml/domain/ports.ts',
      domainType: 'ProxyPortDefinition',
      command: 'createOwnedPort',
      validator: 'validatePort',
      persistence: 'SysmlRepository.definitions[blockId].ports',
      projection: 'projectLegacyDiagram',
      tests: ['src/engine/sysml/diagramInteractionCorrections.test.ts'],
      executableCases: ['PORT_PROXY_INTERFACE_TYPING'],
      levelEvidenceCases: {
        element: ['PORT_PROXY_INTERFACE_TYPING'],
        properties: ['PORT_PROXY_INTERFACE_TYPING'],
        relationships: ['PORT_PROXY_INTERFACE_TYPING'],
        constraints: ['PORT_PROXY_INTERFACE_TYPING'],
      },
    };

    function makeDefinition(): FeatureComplianceDefinition {
      return {
        id: 'SYSML-EVIDENCE-BINDING',
        name: 'EvidenceBinding',
        authority: 'OMG_SYSML_1_6',
        levels: {
          element: 'PASS',
          properties: 'PASS',
          relationships: 'PASS',
          constraints: 'PASS',
        },
        evidence: { ...baseEvidence },
      };
    }

    function makeOutcome(overrides: Partial<ExecutableCaseRunOutcome>): ExecutableCaseRunOutcome {
      const registered = EXECUTABLE_EVIDENCE.PORT_PROXY_INTERFACE_TYPING;
      return {
        caseId: 'PORT_PROXY_INTERFACE_TYPING',
        testFile: registered.testFile,
        testName: registered.testName,
        fullName: `${registered.testName} (full)`,
        status: 'passed',
        revision: 'abc123',
        runId: 'run-1',
        ...overrides,
      };
    }

    function makeContext(outcome: ExecutableCaseRunOutcome | undefined): EvidenceRunContext {
      return {
        revision: 'abc123',
        runId: 'run-1',
        outcomes: outcome ? { PORT_PROXY_INTERFACE_TYPING: outcome } : {},
      };
    }

    it('fails closed when the executable result is missing from the run', () => {
      const result = evaluateCompliance(makeDefinition(), makeContext(undefined));
      expect(result.status).not.toBe('COMPLIANT');
      expect(result.missingEvidence).toContain('case:PORT_PROXY_INTERFACE_TYPING');
      expect(result.reasons.some(r => r.includes('PORT_PROXY_INTERFACE_TYPING'))).toBe(true);
    });

    it('fails closed when the executable result was skipped', () => {
      const result = evaluateCompliance(
        makeDefinition(),
        makeContext(makeOutcome({ status: 'skipped' })),
      );
      expect(result.status).not.toBe('COMPLIANT');
      expect(result.missingEvidence).toContain('case:PORT_PROXY_INTERFACE_TYPING');
      expect(result.reasons.some(r => r.toLowerCase().includes('skipped'))).toBe(true);
    });

    it('fails closed when the executable result failed', () => {
      const result = evaluateCompliance(
        makeDefinition(),
        makeContext(makeOutcome({ status: 'failed' })),
      );
      expect(result.status).not.toBe('COMPLIANT');
      expect(result.missingEvidence).toContain('case:PORT_PROXY_INTERFACE_TYPING');
      expect(result.reasons.some(r => r.toLowerCase().includes('failed'))).toBe(true);
    });

    it('fails closed when the passing result belongs to another revision (stale evidence)', () => {
      const result = evaluateCompliance(
        makeDefinition(),
        makeContext(makeOutcome({ revision: 'stale-revision-000' })),
      );
      expect(result.status).not.toBe('COMPLIANT');
      expect(result.missingEvidence).toContain('case:PORT_PROXY_INTERFACE_TYPING');
      expect(result.reasons.some(r => r.toLowerCase().includes('stale'))).toBe(true);
    });

    it('fails closed when the result run identity does not match the current run', () => {
      const result = evaluateCompliance(
        makeDefinition(),
        makeContext(makeOutcome({ runId: 'another-run' })),
      );
      expect(result.status).not.toBe('COMPLIANT');
      expect(result.missingEvidence).toContain('case:PORT_PROXY_INTERFACE_TYPING');
    });

    it('fails closed when the result points at a missing test binding', () => {
      const result = evaluateCompliance(
        makeDefinition(),
        makeContext(makeOutcome({ testFile: 'src/engine/sysml/deleted.test.ts' })),
      );
      expect(result.status).not.toBe('COMPLIANT');
      expect(result.missingEvidence).toContain('case:PORT_PROXY_INTERFACE_TYPING');
    });

    it('grants COMPLIANT only for a passing result on the current revision and run', () => {
      const result = evaluateCompliance(makeDefinition(), makeContext(makeOutcome({})));
      expect(result.status).toBe('COMPLIANT');
      expect(result.missingEvidence).toEqual([]);
      expect(result.reasons).toEqual([]);
    });

    it('fails closed when no run results are supplied for declared executable cases', () => {
      const result = evaluateCompliance(makeDefinition(), undefined);
      expect(result.status).not.toBe('COMPLIANT');
    });
  });
});
