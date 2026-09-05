import { describe, expect, it } from 'vitest';
import {
  compileAndRunCTrace,
  probeC99Toolchain,
  runInterpreterTrace,
} from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import { buildSemanticModel } from './smSemanticBuilder';
import { compareSemanticTraces } from './smTrace';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';

const selectedToolchain = probeC99Toolchain();

describe('X-Bridges Declared C Conformance', () => {
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
