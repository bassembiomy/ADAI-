import { describe, expect, it } from 'vitest';
import {
  compileAndRunCTrace,
  compileGeneratedCSyntax,
  probeC99Toolchain,
  runInterpreterTrace,
} from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import { buildSemanticModel } from './smSemanticBuilder';
import { compareSemanticTraces } from './smTrace';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';

const selectedToolchain = probeC99Toolchain();

const conformanceNode = (caseId: keyof typeof XB_EXECUTABLE_C_CASES, nodeId: string) => {
  const controller = XB_EXECUTABLE_C_CASES[caseId].fixture.model.states
    .find((state) => state.id === 'controller');
  const node = controller?.xBridgesModel?.nodes.find((candidate) => candidate.id === nodeId);
  expect(node, `${caseId}:${nodeId}`).toBeDefined();
  return node!;
};

describe('X-Bridges Declared C Conformance', () => {
  it('declares the continuous DELAY fixture as a fixed one-step scalar delay', () => {
    expect(conformanceNode('T14-C99-CONTINUOUS', 'del1').parameters).toMatchObject({
      delay_length: 1,
      initial_condition: 0,
      inputs: [{ id: 'u', shape: 'scalar', dimensions: [] }],
      outputs: [{ id: 'y', shape: 'scalar', dimensions: [] }],
    });
  });

  it('declares fixed 1-input, 1-output, 1-state transfer-function dimensions', () => {
    expect(conformanceNode('T10-C99-DISCRETE-REALIZATION', 'tf1').parameters).toMatchObject({
      inputs: [{ id: 'u', shape: 'vector', dimensions: [1] }],
      outputs: [
        { id: 'y', shape: 'vector', dimensions: [1] },
        { id: 'x', shape: 'vector', dimensions: [1] },
      ],
    });
  });

  it('generates the advertised vector RATE_LIMITER conformance fixture', () => {
    const testCase = XB_EXECUTABLE_C_CASES['T10-C99-DISCONTINUOUS'];
    expect(() => runInterpreterTrace(testCase.fixture)).not.toThrow();
    const built = buildSemanticModel(testCase.fixture.model);
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    const artifacts = generateCArtifacts(built.ir!, { includeTestShims: true });
    const generatedC = artifacts.files
      .filter((file) => file.name.endsWith('.c'))
      .map((file) => file.content)
      .join('\n');
    expect(generatedC).toContain('isnan(');
    expect(generatedC).not.toContain('isnanf(');
    expect(compileGeneratedCSyntax(artifacts, true)).toEqual({ success: true, errors: [] });
  });

  it('classifies a missing explicitly selected compiler as a blocked toolchain', () => {
    const compiler = `adia-missing-c99-compiler-${process.pid}`;
    const result = probeC99Toolchain({ compiler });

    expect(result).toMatchObject({
      status: 'BLOCKED',
      compiler,
      selectionSource: 'explicit',
      phase: 'compile-link',
    });
    expect(result.detail).toContain(compiler);
  });

  it('records the compile-link-run result for the selected host toolchain', () => {
    const result = probeC99Toolchain();

    expect(result.compiler.length).toBeGreaterThan(0);
    expect(['explicit', 'environment', 'default']).toContain(result.selectionSource);
    if (result.status === 'AVAILABLE') {
      expect(result.probeOutput).toBe('ADIA_C99_PREFLIGHT_OK');
      expect(result.version.length).toBeGreaterThan(0);
    } else {
      expect(['compile-link', 'run']).toContain(result.phase);
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(XB_EXECUTABLE_C_CASES))(
    'builds and generates %s before any toolchain-dependent execution',
    { timeout: 60_000 },
    (id, testCase) => {
      const built = buildSemanticModel(testCase.fixture.model);
      expect(
        built.diagnostics.filter((item) => item.severity === 'error'),
        `Invalid conformance fixture ${id}`,
      ).toEqual([]);
      expect(built.ir).toBeDefined();
      // Run generation before an environment-only skip so generator defects remain visible.
      expect(() => generateCArtifacts(built.ir!, { includeTestShims: true })).not.toThrow();
    },
  );

  describe.skipIf(selectedToolchain.status === 'BLOCKED')(
    'compiled C trace parity',
    () => {
      it.each(Object.entries(XB_EXECUTABLE_C_CASES))(
        'compiles and executes %s matching canonical interpreter trace',
        { timeout: 60_000 },
        (id, testCase) => {
          const expected = runInterpreterTrace(testCase.fixture);
          if (selectedToolchain.status !== 'AVAILABLE') {
            throw new Error('compiled C suite ran without an available toolchain');
          }
          const actual = compileAndRunCTrace(testCase.fixture, {
            toolchainPreflight: selectedToolchain,
          });
          const diff = compareSemanticTraces(expected, actual, testCase.tolerance);
          expect(diff, `Mismatch in case ${id}: ${JSON.stringify(diff)}`).toBeNull();
        },
      );
    },
  );
});
