import { describe, expect, it } from 'vitest';
import { resolveVerificationConfig } from './smSemanticBuilder';
import {
  deserializeSMTestManifest,
  serializeSMTestManifest,
  sortSMTestCases,
  validateSMTestManifest,
  type SMTestCase,
  type SMTestExpectation,
  type SMTestManifest,
  type SMTestOperation,
} from './smTestManifest';

describe('smTestManifest', () => {
  const sampleOperations: readonly SMTestOperation[] = [
    { kind: 'init' },
    { kind: 'set-variable', variableId: 'var_x', value: 42 },
    { kind: 'set-input', mappingId: 'map_sensor', rawValue: true },
    { kind: 'step', deltaMs: 10 },
    { kind: 'set-timer', stateId: 'state_active', valueMs: 500 },
    { kind: 'repeat-step', cycles: 5, deltaMs: 10 },
    {
      kind: 'corrupt-field',
      field: 'activeState',
      targetId: 'state_active',
      invalidValue: 999,
    },
    { kind: 'reset', authorized: true },
  ];

  const sampleExpectations: readonly SMTestExpectation[] = [
    { kind: 'active-state', layerId: 'layer_root', stateId: 'state_idle' },
    { kind: 'inactive-state', stateId: 'state_active' },
    { kind: 'active-slot', slot: 0, stateId: 'state_idle' },
    { kind: 'variable', variableId: 'var_x', value: 42 },
    { kind: 'timer', stateId: 'state_idle', expectedMs: 0 },
    { kind: 'error', code: null },
    { kind: 'fault-latched', latched: false },
    { kind: 'transition-fired', transitionId: 't_init' },
    { kind: 'action-executed', action: 'total = 10;', order: 1 },
    { kind: 'mcal-call', functionName: 'Dio_WriteChannel', channel: 1, value: 1, order: 1 },
    { kind: 'mcal-call-count', functionName: 'Dio_WriteChannel', count: 1 },
    { kind: 'watchdog-kicks', count: 1 },
  ];

  const sampleCase: SMTestCase = {
    id: 'SM-TC-INIT-001',
    suite: 'initialization',
    name: 'Default initialization of root layer and variables',
    applicability: { status: 'applicable' },
    operations: sampleOperations,
    expectations: sampleExpectations,
    traceability: {
      modelId: 'test_model',
      stateIds: ['state_idle', 'state_active'],
      transitionIds: ['t_init'],
      requirementIds: ['TEST-INIT-001'],
      generatedFunctions: ['SM_Init', 'SM_Step'],
      testCaseId: 'SM-TC-INIT-001',
    },
  };

  const sampleManifest: SMTestManifest = {
    schemaVersion: 1,
    modelId: 'test_model',
    modelHash: 'abcdef0123456789',
    verification: resolveVerificationConfig(),
    cases: [sampleCase],
  };

  it('validates a well-formed canonical test manifest', () => {
    const diagnostics = validateSMTestManifest(sampleManifest);
    expect(diagnostics).toEqual([]);
  });

  it('serializes and deserializes cleanly across JSON round-trip without losing data', () => {
    const json = serializeSMTestManifest(sampleManifest);
    expect(typeof json).toBe('string');
    const restored = deserializeSMTestManifest(json);
    expect(restored).toEqual(sampleManifest);
  });

  it('sorts test cases deterministically by canonical suite order and ID', () => {
    const case1: SMTestCase = {
      ...sampleCase,
      id: 'SM-TC-ROB-002',
      suite: 'robustness',
    };
    const case2: SMTestCase = {
      ...sampleCase,
      id: 'SM-TC-INIT-002',
      suite: 'initialization',
    };
    const case3: SMTestCase = {
      ...sampleCase,
      id: 'SM-TC-TRANS-001',
      suite: 'transitions',
    };
    const case4: SMTestCase = {
      ...sampleCase,
      id: 'SM-TC-INIT-001',
      suite: 'initialization',
    };

    const sorted = sortSMTestCases([case1, case2, case3, case4]);
    expect(sorted.map((c) => c.id)).toEqual([
      'SM-TC-INIT-001',
      'SM-TC-INIT-002',
      'SM-TC-TRANS-001',
      'SM-TC-ROB-002',
    ]);
  });

  it('rejects manifests with invalid schema version or missing fields', () => {
    const invalid = {
      ...sampleManifest,
      schemaVersion: 2,
    };
    const diagnostics = validateSMTestManifest(invalid as any);
    expect(diagnostics.some((d) => d.includes('schemaVersion'))).toBe(true);
  });

  it('records not-applicable status with rationale', () => {
    const naCase: SMTestCase = {
      ...sampleCase,
      id: 'SM-TC-HIER-001',
      suite: 'hierarchy',
      applicability: {
        status: 'not-applicable',
        reason: 'Model has flat topology with no sub-states or history nodes.',
      },
      operations: [],
      expectations: [],
    };
    expect(naCase.applicability.status).toBe('not-applicable');
    if (naCase.applicability.status === 'not-applicable') {
      expect(naCase.applicability.reason).toContain('flat topology');
    }
  });
});
