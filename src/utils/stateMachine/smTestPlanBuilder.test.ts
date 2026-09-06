import { describe, expect, it } from 'vitest';
import {
  historyFixture,
  nestedAndFixture,
  parallelHistoryFixture,
  reviewedTwoStateFixture,
} from './smFixtures';
import type { StateMachineModelV5 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import type { SemanticModel } from './smSemanticModel';
import type { SMTestCase, SMTestManifest } from './smTestManifest';
import { buildSMTestManifest } from './smTestPlanBuilder';

const build = (model: StateMachineModelV5): SemanticModel => {
  const built = buildSemanticModel(model);
  if (!built.ir || built.diagnostics.some((d) => d.severity === 'error')) {
    throw new Error(
      `Fixture failed semantic build: ${built.diagnostics.map((d) => `${d.code}: ${d.message}`).join(', ')}`,
    );
  }
  return built.ir;
};

const caseIds = (manifest: SMTestManifest): string[] => manifest.cases.map((c) => c.id);

const findCase = (manifest: SMTestManifest, id: string): SMTestCase => {
  const found = manifest.cases.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Test case '${id}' not found in manifest. Available: ${caseIds(manifest).join(', ')}`);
  }
  return found;
};

describe('smTestPlanBuilder', () => {
  describe('reviewed two-state fixture', () => {
    it('generates a complete canonical test manifest with all required suites and cases', () => {
      const ir = build(reviewedTwoStateFixture());
      const manifest = buildSMTestManifest(ir);

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.modelId).toBe((ir as any).id ?? 'state_machine');
      expect(manifest.modelHash).toBe(ir.modelHash);
      expect(manifest.verification).toEqual(ir.verification);

      const ids = caseIds(manifest);

      // Initialization suite
      expect(ids).toContain('SM-TC-INIT-NULL-INSTANCE');
      expect(ids).toContain('SM-TC-INIT-DEFAULT');
      expect(ids).toContain('SM-TC-INIT-MEMSET-GARBAGE');

      // Transitions suite
      expect(ids).toContain('SM-TC-TRANS-STATE_1-STATE_2-TRUE');
      expect(ids).toContain('SM-TC-TRANS-STATE_1-STATE_2-FALSE');

      const transCase = findCase(manifest, 'SM-TC-TRANS-STATE_1-STATE_2-TRUE');
      expect(transCase.expectations).toContainEqual({
        kind: 'variable',
        variableId: 'y',
        value: 10,
      });
      expect(transCase.expectations).toContainEqual({
        kind: 'active-state',
        layerId: 'root',
        stateId: 'State_2',
      });

      // Actions suite
      expect(ids).toContain('SM-TC-ACT-STATE_2-ENTRY');

      // Timing suite (500 +/- 50ms tolerance)
      expect(ids).toContain('SM-TC-TIME-NOMINAL-500MS');
      expect(ids).toContain('SM-TC-TIME-LOWER-450MS');
      expect(ids).toContain('SM-TC-TIME-UPPER-550MS');
      expect(ids).toContain('SM-TC-TIME-REJECT-449MS');
      expect(ids).toContain('SM-TC-TIME-REJECT-551MS');
      expect(ids).toContain('SM-TC-TIME-SATURATION');

      // Safety suite
      expect(ids).toContain('SM-TC-SAFE-CORRUPT-STATE');
      expect(ids).toContain('SM-TC-SAFE-CORRUPT-SLOT');
      expect(ids).toContain('SM-TC-SAFE-LATCHED-BLOCKING');
      expect(ids).toContain('SM-TC-SAFE-OUTPUTS-APPLIED');
      expect(ids).toContain('SM-TC-SAFE-WATCHDOG-POLICY');

      // IO suite
      expect(ids).toContain('SM-TC-IO-READ-X');
      expect(ids).toContain('SM-TC-IO-WRITE-Y');
      expect(ids).toContain('SM-TC-IO-INPUT-POLICY-READ_X');

      // Reset suite
      expect(ids).toContain('SM-TC-RESET-AUTHORIZED');
      expect(ids).toContain('SM-TC-RESET-FAULT-RECOVERY');
      expect(ids).toContain('SM-TC-RESET-NULL-INSTANCE');

      // Robustness suite
      expect(ids).toContain('SM-TC-ROB-NULL-STEP');
      expect(ids).toContain('SM-TC-ROB-REPEATED-CYCLES');

      // Hierarchy suite: for flat model, hierarchy cases must be present with not-applicable status
      const hierCases = manifest.cases.filter((c) => c.suite === 'hierarchy');
      expect(hierCases.length).toBeGreaterThan(0);
      expect(hierCases.every((c) => c.applicability.status === 'not-applicable')).toBe(true);
    });
  });

  describe('conditional hierarchy fixtures', () => {
    it('generates applicable hierarchy cases for shallow and deep history fixtures', () => {
      const shallowIr = build(historyFixture('shallow'));
      const shallowManifest = buildSMTestManifest(shallowIr);
      const shallowHier = shallowManifest.cases.filter((c) => c.suite === 'hierarchy');
      expect(shallowHier.some((c) => c.applicability.status === 'applicable')).toBe(true);
      expect(caseIds(shallowManifest).some((id) => id.includes('HISTORY'))).toBe(true);

      const deepIr = build(historyFixture('deep'));
      const deepManifest = buildSMTestManifest(deepIr);
      const deepHier = deepManifest.cases.filter((c) => c.suite === 'hierarchy');
      expect(deepHier.some((c) => c.applicability.status === 'applicable')).toBe(true);
    });

    it('generates applicable hierarchy cases for parallel AND regions', () => {
      const parallelIr = build(nestedAndFixture());
      const parallelManifest = buildSMTestManifest(parallelIr);
      const parallelCases = parallelManifest.cases.filter((c) => c.suite === 'hierarchy');
      expect(parallelCases.some((c) => c.applicability.status === 'applicable' && c.id.includes('PARALLEL'))).toBe(true);
    });

    it('generates applicable hierarchy cases for parallel history fixtures', () => {
      const timingIr = build(parallelHistoryFixture('timing-boundary'));
      const timingManifest = buildSMTestManifest(timingIr);
      expect(timingManifest.cases.length).toBeGreaterThan(0);
    });
  });

  describe('traceability mapping', () => {
    it('binds valid requirement IDs, state IDs, and generated functions to every test case', () => {
      const ir = build(reviewedTwoStateFixture());
      const manifest = buildSMTestManifest(ir);

      for (const testCase of manifest.cases) {
        expect(testCase.traceability).toBeDefined();
        expect(testCase.traceability.modelId).toBe((ir as any).id ?? 'state_machine');
        expect(testCase.traceability.testCaseId).toBe(testCase.id);
        expect(testCase.traceability.requirementIds.length).toBeGreaterThan(0);
        expect(testCase.traceability.generatedFunctions.length).toBeGreaterThan(0);
      }
    });
  });
});
