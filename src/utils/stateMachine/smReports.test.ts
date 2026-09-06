import { describe, expect, it } from 'vitest';
import { analyzeSemanticModel } from '../smAnalysisEngine';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  flatOrFixture,
  historyFixture,
  nestedAndFixture,
} from './smFixtures';
import {
  DEFAULT_VERIFICATION_EVIDENCE,
  generateSemanticReport,
  renderStaticMetricsReport,
  renderTestingReport,
} from './smReports';
import { hybridXBridgesFixture } from './smFixtures';

const analyzedUnreachableFixture = () => {
  const model = flatOrFixture();
  model.states.push({
    ...model.states[1],
    id: 'unreachable',
    name: 'Unreachable',
    priority: 3,
  });
  model.layers[0].stateIds.push('unreachable');
  const built = buildSemanticModel(model);
  if (built.ir === undefined) {
    throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
  }
  return analyzeSemanticModel(built.ir);
};

describe('semantic state-machine reports', () => {
  it('uses one reachability result in every report section', () => {
    const report = generateSemanticReport(analyzedUnreachableFixture());

    expect(report.testing.reachabilityPercent).toBe(2 / 3 * 100);
    expect(report.testing.reachabilityPercent)
      .toBe(report.staticMetrics.reachabilityPercent);
    expect(report.testing.unreachableStateIds)
      .toEqual(report.staticMetrics.unreachableStateIds);
  });

  it('labels verification evidence honestly', () => {
    const rendered = renderTestingReport(analyzedUnreachableFixture(), {
      structural: 'pass',
      semantic: 'pass',
      hostCompile: 'pass',
      hostRuntime: 'pass',
      differential: 'pass',
      dynamicReachability: 'not-run',
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });

    expect(rendered).toContain('Embedded compilation: NOT RUN');
    expect(rendered).toContain('Target hardware: PENDING');
    expect(rendered).toContain('Differential trace: PASS');
    expect(rendered).not.toMatch(/MISRA[- ]C(?:\:2012)? compliant/i);
  });

  it('counts every child of a nested AND layer as reachable', () => {
    const built = buildSemanticModel(nestedAndFixture());
    if (built.ir === undefined) {
      throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    }

    const analysis = analyzeSemanticModel(built.ir);

    expect(analysis.semantic.unreachableStateIds).toEqual([]);
    expect(analysis.metrics.stateReachability).toBe(100);
  });

  it('follows history-first entry through the owner default path', () => {
    const model = historyFixture('shallow');
    model.states.find((state) => state.id === 'workspace')!.autostart = false;
    model.states.find((state) => state.id === 'outside')!.autostart = true;
    const built = buildSemanticModel(model);
    if (built.ir === undefined) {
      throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    }

    const analysis = analyzeSemanticModel(built.ir);

    expect(analysis.semantic.reachableStateIds).toContain('workspace');
    expect(analysis.semantic.reachableStateIds).toContain('parent_b');
  });

  it('does not traverse outgoing transitions from quiescent terminal states', () => {
    const model = flatOrFixture();
    model.states[0].isTerminalState = true;
    const built = buildSemanticModel(model);
    if (built.ir === undefined) {
      throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    }

    const analysis = analyzeSemanticModel(built.ir);

    expect(analysis.semantic.reachableStateIds).toEqual(['a']);
    expect(analysis.semantic.unreachableStateIds).toEqual(['b']);
    expect(analysis.criticalPaths.flatMap((path) => path.states)).not.toContain('B');
  });

  it('distinguishes static and dynamic reachability in testing reports', () => {
    const failedReport = renderTestingReport(analyzedUnreachableFixture(), {
      structural: 'pass',
      semantic: 'pass',
      hostCompile: 'fail',
      hostRuntime: 'not-run',
      differential: 'not-run',
      dynamicReachability: 'fail',
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });
    expect(failedReport).toContain('Execution mode: VALIDATION_FAILED');
    expect(failedReport).toContain('Dynamic executable reachability: FAIL');

    const verifiedReport = renderTestingReport(analyzedUnreachableFixture(), {
      structural: 'pass',
      semantic: 'pass',
      hostCompile: 'pass',
      hostRuntime: 'pass',
      differential: 'pass',
      dynamicReachability: 'pass',
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });
    expect(verifiedReport).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
    expect(verifiedReport).toContain('Dynamic executable reachability: PASS');

    const smokeOnly = renderTestingReport(analyzedUnreachableFixture(), {
      ...DEFAULT_VERIFICATION_EVIDENCE,
      hostCompile: 'pass',
      hostRuntime: 'pass',
    });
    expect(smokeOnly).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
    expect(smokeOnly).toContain('Dynamic executable reachability: NOT RUN');
    expect(smokeOnly).toContain('Compiled X-Bridges execution: NOT RUN');

    const staticReport = renderTestingReport(analyzedUnreachableFixture());
    expect(staticReport).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
    expect(staticReport).toContain('Dynamic executable reachability: NOT RUN');
  });

  it('reports deterministic X-Bridges code-generation evidence and limitations', () => {
    const model = hybridXBridgesFixture();
    const controller = model.states.find((state) => state.id === 'controller')!;
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'source', type: 'Constant', parameters: {
            value: 1,
            inputs: [],
            outputs: [{ id: 'y', direction: 'output', shape: 'scalar', dimensions: [], dataType: 'float32' }],
          },
        },
        {
          id: 'park', type: 'PARK_TRANSFORM', parameters: {
            inputs: [{ id: 'u', direction: 'input', shape: 'scalar', dimensions: [], dataType: 'float32' }],
            outputs: [{ id: 'y', direction: 'output', shape: 'scalar', dimensions: [], dataType: 'float32' }],
          },
        },
      ],
      edges: [
        { id: 'source-to-park', sourceNodeId: 'source', sourcePortId: 'y', targetNodeId: 'park', targetPortId: 'u' },
      ],
      mappings: [],
      solver: { kind: 'rk4', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };
    const built = buildSemanticModel(model);
    if (!built.ir) throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    const analysis = analyzeSemanticModel(built.ir);

    const report = generateSemanticReport(
      analysis,
      DEFAULT_VERIFICATION_EVIDENCE,
      built.ir,
    );
    expect(report.xBridges).toMatchObject({
      blockCount: 2,
      solvers: [{ stateId: 'controller', kind: 'rk4', stepSeconds: 0.002, substepsPerTick: 5 }],
      numericTypes: ['float32'],
      capabilityDependencies: ['math-library'],
      unsupportedCapabilities: [],
    });
    expect(report.xBridges.estimatedStaticMemoryLowerBoundBytes).toBeGreaterThan(0);
    expect(report.xBridges.memoryEstimateAccuracy)
      .toBe('lower-bound-excludes-padding');

    const testing = renderTestingReport(
      analysis,
      DEFAULT_VERIFICATION_EVIDENCE,
      built.ir,
    );
    expect(testing).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
    expect(testing).toContain('X-Bridges blocks: 2');
    expect(testing).toContain('Required target capabilities: math-library');
    expect(testing).toContain('Compiled X-Bridges execution: NOT RUN');

    const metrics = renderStaticMetricsReport(analysis, [], built.ir);
    expect(metrics).toContain('Estimated X-Bridges static memory lower bound:');
    expect(metrics).toContain('excludes target ABI padding and linker allocation');
    expect(metrics).toContain('Solver: controller: rk4, 0.002 s, 5 substeps/tick');
    expect(metrics).toContain('Numeric types: float32');
    expect(metrics).toContain('Unsupported embedded capabilities: None');
  });

  it('scopes unsupported capabilities to model-used operations, counts operation evaluations per tick, and renders state traceability', () => {
    const model = hybridXBridgesFixture();
    model.states[0].autostart = false;
    const controller = model.states.find((state) => state.id === 'controller')!;
    controller.autostart = true;
    const scalarPort = (id: string, direction: 'input' | 'output') => ({
      id, direction, shape: 'scalar' as const, dimensions: [], dataType: 'float32' as const,
    });
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'constant1', type: 'Constant', parameters: { value: 1, inputs: [], outputs: [scalarPort('y', 'output')] } },
        { id: 'constant2', type: 'Constant', parameters: { value: 2, inputs: [], outputs: [scalarPort('y', 'output')] } },
        { id: 'sum', type: 'Sum', parameters: { signs: '++', inputs: [scalarPort('a', 'input'), scalarPort('b', 'input')], outputs: [scalarPort('y', 'output')] } },
        { id: 'terminator', type: 'TERMINATOR', parameters: { inputs: [scalarPort('u', 'input')], outputs: [] } },
      ],
      edges: [
        { id: 'c1_sum', sourceNodeId: 'constant1', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'a' },
        { id: 'c2_sum', sourceNodeId: 'constant2', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'b' },
        { id: 'sum_term', sourceNodeId: 'sum', sourcePortId: 'y', targetNodeId: 'terminator', targetPortId: 'u' },
      ],
      mappings: [],
      solver: { kind: 'euler', stepSeconds: 0.0002 },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };
    const built = buildSemanticModel(model);
    if (!built.ir) throw new Error(`model build failed: ${JSON.stringify(built.diagnostics)}`);
    const analysis = analyzeSemanticModel(built.ir);

    const report = generateSemanticReport(analysis, DEFAULT_VERIFICATION_EVIDENCE, built.ir);
    expect(report.xBridges.unsupportedCapabilities).toEqual([]);
    expect(report.xBridges.operationEvaluationsPerTick).toBe(200);

    const testing = renderTestingReport(analysis, DEFAULT_VERIFICATION_EVIDENCE, built.ir);
    expect(testing).toContain('| State name | Model ID | C enum | Layer | X-Bridges |');
    expect(testing).toContain('| Controller | controller | SM_ST_CONTROLLER | root | yes |');
    expect(testing).not.toContain('LMS_ADAPTIVE_FILTER');
  });

  it('does not claim compiled X-Bridges execution from differential evidence alone', () => {
    const evidence = {
      ...DEFAULT_VERIFICATION_EVIDENCE,
      differential: 'pass' as const,
      hostCompile: 'not-run' as const,
      hostRuntime: 'not-run' as const,
    };

    const rendered = renderTestingReport(analyzedUnreachableFixture(), evidence);

    expect(rendered).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
    expect(rendered).toContain('Differential trace: PASS');
    expect(rendered).toContain('Compiled X-Bridges execution: NOT RUN');
  });

  it('renders complete honest evidence sections from canonical VerificationBundle', () => {
    const model = flatOrFixture();
    const built = buildSemanticModel(model);
    const analysis = analyzeSemanticModel(built.ir!);

    const bundle: any = {
      schemaVersion: 1,
      modelHash: 'model_hash_9876',
      generatedAt: '2026-09-06T12:00:00.000Z',
      overallStatus: 'PASS',
      acceptance: true,
      activities: {
        'structural': { activity: 'structural', status: 'PASS', summary: 'Structural validation passed', command: null, details: null },
        'semantic': { activity: 'semantic', status: 'PASS', summary: 'Semantic validation passed', command: null, details: null },
        'test-generation': { activity: 'test-generation', status: 'PASS', summary: 'Generated 14 test cases', command: null, details: { testCaseCount: 14 } },
        'host-compilation': {
          activity: 'host-compilation',
          status: 'PASS',
          summary: 'Host gcc compile passed',
          command: {
            executable: 'gcc',
            args: ['-std=c11', '-Wall'],
            cwd: '.',
            toolVersion: '13.2.0',
            exitCode: 0,
            signal: null,
            timedOut: false,
            stdout: '',
            stderr: '',
            startedAt: '',
            durationMs: 100,
            inputHashes: {},
            outputHashes: {},
          },
          details: null,
        },
        'host-runtime': { activity: 'host-runtime', status: 'PASS', summary: '14/14 tests passed', command: null, details: { totalTests: 14, passed: 14, failed: 0 } },
        'sanitizers': { activity: 'sanitizers', status: 'PASS', summary: 'ASan and UBSan clean', command: null, details: { asan: 'PASS', ubsan: 'PASS' } },
        'statement-coverage': { activity: 'statement-coverage', status: 'PASS', summary: '100% statement coverage', command: null, details: { measuredPercent: 100, covered: 50, total: 50, threshold: 100, uncovered: [] } },
        'branch-coverage': { activity: 'branch-coverage', status: 'PASS', summary: '100% branch coverage', command: null, details: { measuredPercent: 100, covered: 20, total: 20, threshold: 100, uncovered: [] } },
        'mcdc-coverage': { activity: 'mcdc-coverage', status: 'NOT_APPLICABLE', summary: 'Non-safety model', command: null, details: null },
        'differential': { activity: 'differential', status: 'PASS', summary: 'Trace match across 10 cycles', command: null, details: { totalCycles: 10, divergence: null, modelHash: 'model_hash_9876' } },
        'static-analysis': { activity: 'static-analysis', status: 'PASS', summary: '0 violations', command: null, details: { tool: 'Clang-Tidy', version: '18.1.0', rules: ['bugprone-*'], mandatoryCount: 0, requiredCount: 0, advisoryCount: 0, deviations: [], suppressions: [], locations: [] } },
        'misra-analysis': { activity: 'misra-analysis', status: 'PASS', summary: '0 violations', command: null, details: { tool: 'PC-Lint', version: '2.0', rules: ['MISRA C:2012'], mandatoryCount: 0, requiredCount: 0, advisoryCount: 0, deviations: [], suppressions: [], locations: [] } },
        'target-compilation': { activity: 'target-compilation', status: 'PASS', summary: 'Compiled for stm32f407', command: null, details: { targetId: 'stm32f407', packVersion: '1.0.0', packHash: 'pack_123', compiler: 'arm-none-eabi-gcc', compilerVersion: '13.2.1', outputFile: 'firmware.elf', outputHash: 'elf_hash_999', diagnostics: [] } },
        'hardware': { activity: 'hardware', status: 'PENDING', summary: 'Pending physical bench access', command: null, details: null },
      },
    };

    const rendered = renderTestingReport(analysis, bundle, built.ir);

    expect(rendered).toContain('Structural validation: PASS');
    expect(rendered).toContain('Host compilation: PASS');
    expect(rendered).toContain('gcc');
    expect(rendered).toContain('-std=c11');
    expect(rendered).toContain('Statement coverage: 100.0% (PASS)');
    expect(rendered).toContain('Branch coverage: 100.0% (PASS)');
    expect(rendered).toContain('MC/DC coverage: NOT_APPLICABLE');
    expect(rendered).toContain('Target compilation: PASS');
    expect(rendered).toContain('stm32f407');
    expect(rendered).toContain('elf_hash_999');
    expect(rendered).toContain('Target hardware: PENDING');
    expect(rendered).toContain('Overall acceptance: ACCEPTED');
  });

  it('renders divergence and uncovered details when verification fails', () => {
    const model = flatOrFixture();
    const built = buildSemanticModel(model);
    const analysis = analyzeSemanticModel(built.ir!);

    const failingBundle: any = {
      schemaVersion: 1,
      modelHash: 'model_hash_fail',
      generatedAt: '2026-09-06T12:00:00.000Z',
      overallStatus: 'FAIL',
      acceptance: false,
      activities: {
        'structural': { activity: 'structural', status: 'PASS', summary: 'Passed', command: null, details: null },
        'semantic': { activity: 'semantic', status: 'PASS', summary: 'Passed', command: null, details: null },
        'test-generation': { activity: 'test-generation', status: 'PASS', summary: 'Passed', command: null, details: null },
        'host-compilation': { activity: 'host-compilation', status: 'PASS', summary: 'Passed', command: null, details: null },
        'host-runtime': { activity: 'host-runtime', status: 'FAIL', summary: 'Assertion failure', command: null, details: { failed: 1 } },
        'sanitizers': { activity: 'sanitizers', status: 'PASS', summary: 'Clean', command: null, details: null },
        'statement-coverage': {
          activity: 'statement-coverage',
          status: 'FAIL',
          summary: '85% below 100% threshold',
          command: null,
          details: {
            measuredPercent: 85,
            covered: 85,
            total: 100,
            threshold: 100,
            uncovered: [{ file: 'sm_core.c', functionName: 'SM_Step', line: 42, kind: 'statement', reason: 'Unexecuted branch', requiredAction: 'Add stimulus vector' }],
          },
        },
        'branch-coverage': { activity: 'branch-coverage', status: 'PASS', summary: 'Passed', command: null, details: null },
        'mcdc-coverage': { activity: 'mcdc-coverage', status: 'NOT_APPLICABLE', summary: 'N/A', command: null, details: null },
        'differential': {
          activity: 'differential',
          status: 'FAIL',
          summary: 'Mismatch at cycle 3',
          command: null,
          details: {
            totalCycles: 5,
            divergence: {
              cycle: 3,
              field: 'variables.count',
              expected: 4,
              actual: 3,
              modelHash: 'model_hash_fail',
              replayCommand: 'npm run test:differential --replay',
            },
            modelHash: 'model_hash_fail',
          },
        },
        'static-analysis': { activity: 'static-analysis', status: 'NOT_RUN', summary: 'Not run', command: null, details: null },
        'misra-analysis': { activity: 'misra-analysis', status: 'NOT_RUN', summary: 'Not run', command: null, details: null },
        'target-compilation': { activity: 'target-compilation', status: 'NOT_RUN', summary: 'Not run', command: null, details: null },
        'hardware': { activity: 'hardware', status: 'PENDING', summary: 'Pending', command: null, details: null },
      },
    };

    const rendered = renderTestingReport(analysis, failingBundle, built.ir);

    expect(rendered).toContain('Overall acceptance: REJECTED');
    expect(rendered).toContain('Uncovered code locations:');
    expect(rendered).toContain('sm_core.c:42');
    expect(rendered).toContain('Divergence at cycle 3: variables.count (expected 4, got 3)');
    expect(rendered).toContain('npm run test:differential --replay');
  });
});
