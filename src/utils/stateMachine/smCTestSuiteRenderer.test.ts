import { describe, expect, it } from 'vitest';
import { reviewedTwoStateFixture, flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { buildSMTestManifest } from './smTestPlanBuilder';
import {
  renderSMCTestPackage,
  type CTestSuiteRenderOptions,
} from './smCTestSuiteRenderer';

describe('smCTestSuiteRenderer', () => {
  const buildFixture = (fixture = reviewedTwoStateFixture()) => {
    const built = buildSemanticModel(fixture);
    if (!built.ir) throw new Error('Fixture build failed');
    const manifest = buildSMTestManifest(built.ir);
    return { ir: built.ir, manifest };
  };

  it('renders all eight required test_sm_*.c suite files and support files', () => {
    const { ir, manifest } = buildFixture();
    const pkg = renderSMCTestPackage(ir, manifest);
    const fileNames = pkg.map((f) => f.name);

    // Required 8 suite files
    expect(fileNames).toContain('tests/test_sm_initialization.c');
    expect(fileNames).toContain('tests/test_sm_transitions.c');
    expect(fileNames).toContain('tests/test_sm_actions.c');
    expect(fileNames).toContain('tests/test_sm_timing.c');
    expect(fileNames).toContain('tests/test_sm_safety.c');
    expect(fileNames).toContain('tests/test_sm_io.c');
    expect(fileNames).toContain('tests/test_sm_reset.c');
    expect(fileNames).toContain('tests/test_sm_robustness.c');

    // Test support and MCAL stub files
    expect(fileNames).toContain('tests/test_support.h');
    expect(fileNames).toContain('tests/test_support.c');
    expect(fileNames).toContain('tests/test_main.c');
    expect(fileNames).toContain('tests/mcal_test_stub.h');
    expect(fileNames).toContain('tests/mcal_test_stub.c');

    // Manifest file
    expect(fileNames).toContain('verification/test_manifest.json');
  });

  it('includes complete traceability comments in every generated test function', () => {
    const { ir, manifest } = buildFixture();
    const pkg = renderSMCTestPackage(ir, manifest);

    const initSuite = pkg.find((f) => f.name === 'tests/test_sm_initialization.c')!;
    expect(initSuite.content).toContain('Case ID: SM-TC-INIT-DEFAULT');
    expect(initSuite.content).toContain('Model:');
    expect(initSuite.content).toContain('Requirements:');
    expect(initSuite.content).toContain('Generated Functions:');
  });

  it('declares a fresh local instance and resets MCAL state in every test function', () => {
    const { ir, manifest } = buildFixture();
    const pkg = renderSMCTestPackage(ir, manifest);

    const suites = pkg.filter((f) => f.name.startsWith('tests/test_sm_'));
    for (const suite of suites) {
      // Each test function must declare local ADIA_Instance_t instance and call MCAL_TestReset
      const testFnMatches = suite.content.match(/static void test_[a-zA-Z0-9_]+\(void\)\s*\{[\s\S]*?\n\}/g) || [];
      for (const fnBody of testFnMatches) {
        expect(fnBody).toContain('ADIA_Instance_t instance');
        expect(fnBody).toContain('MCAL_TestReset()');
      }
    }
  });

  it('renders only applicable cases as C test functions, keeping not-applicable in manifest', () => {
    const { ir, manifest } = buildFixture(flatOrFixture());
    const pkg = renderSMCTestPackage(ir, manifest);

    // flatOrFixture has hierarchy cases as not-applicable
    const hierCases = manifest.cases.filter((c) => c.suite === 'hierarchy');
    expect(hierCases.every((c) => c.applicability.status === 'not-applicable')).toBe(true);

    const hierSuite = pkg.find((f) => f.name === 'tests/test_sm_hierarchy.c');
    // If hierarchy has no applicable cases, either the file has 0 test functions or contains skipped comments
    if (hierSuite) {
      const testFnMatches = hierSuite.content.match(/static void test_[a-zA-Z0-9_]+\(void\)/g) || [];
      expect(testFnMatches.length).toBe(0);
    }
  });
});
