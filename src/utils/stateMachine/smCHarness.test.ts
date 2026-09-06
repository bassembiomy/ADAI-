import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  compileHostPackage,
  runHostTests,
  runSanitizers,
  type HostCompileRequest,
  type HostTestRunRequest,
  type SanitizerRunRequest,
} from './smCHarness';
import type { SMTestManifest } from './smTestManifest';

describe('smCHarness host and sanitizer execution', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `adia-harness-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'production'), { recursive: true });
    mkdirSync(join(testDir, 'tests'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const dummyManifest: SMTestManifest = {
    schemaVersion: 1,
    modelId: 'test_model',
    modelHash: 'test_hash',
    verification: {
      cStandard: 'c11',
      tickToleranceMs: 0,
      timerPolicy: 'logical-tick',
      resetPolicy: 'always-authorized',
      watchdogAfterCriticalFault: 'do-not-service',
      statementCoverageTarget: 100,
      branchCoverageTarget: 100,
      requireMcdc: false,
      repeatedExecutionCycles: 100_000,
      staticAnalysisToolId: null,
      misraToolId: null,
      targetId: null,
      invalidInputPolicies: {},
    },
    cases: [
      {
        id: 'tc_init_1',
        suite: 'initialization',
        name: 'Initial entry',
        applicability: { status: 'applicable' },
        operations: [],
        expectations: [],
        traceability: {
          modelId: 'test_model',
          stateIds: [],
          transitionIds: [],
          requirementIds: ['req_1'],
          generatedFunctions: [],
          testCaseId: 'tc_init_1',
        },
      },
      {
        id: 'tc_init_2',
        suite: 'initialization',
        name: 'Second check',
        applicability: { status: 'applicable' },
        operations: [],
        expectations: [],
        traceability: {
          modelId: 'test_model',
          stateIds: [],
          transitionIds: [],
          requirementIds: ['req_2'],
          generatedFunctions: [],
          testCaseId: 'tc_init_2',
        },
      },
    ],
  };

  it('returns NOT_RUN when the host compiler is missing', async () => {
    const result = await compileHostPackage({
      packageDirectory: testDir,
      compiler: 'non_existent_gcc_compiler_binary_xyz',
    });

    expect(result.activity).toBe('host-compilation');
    expect(result.status).toBe('NOT_RUN');
    expect(result.summary).toContain('not found');
  });

  it('includes standard mapping and all required warning flags in compilation', async () => {
    const fakeCompiler = join(testDir, 'fake_gcc.js');
    writeFileSync(
      fakeCompiler,
      `const fs = require('fs');\n` +
      `fs.writeFileSync('gcc_invoked_args.json', JSON.stringify(process.argv.slice(2)));\n` +
      `process.exit(0);\n`,
    );

    writeFileSync(join(testDir, 'production', 'source.c'), 'int prod = 1;');
    writeFileSync(join(testDir, 'tests', 'test.c'), 'int test = 1;');

    const result = await compileHostPackage({
      packageDirectory: testDir,
      compiler: process.execPath,
      compilerArgs: [fakeCompiler],
      cStandard: 'c90',
    });

    expect(result.activity).toBe('host-compilation');
    const recordedArgsFile = join(testDir, 'gcc_invoked_args.json');
    expect(existsSync(recordedArgsFile)).toBe(true);

    const recordedArgs: string[] = JSON.parse(readFileSync(recordedArgsFile, 'utf8'));

    // Check standard mapping
    expect(recordedArgs).toContain('-std=c90');

    // Check required flags
    expect(recordedArgs).toContain('-Wall');
    expect(recordedArgs).toContain('-Wextra');
    expect(recordedArgs).toContain('-Werror');
    expect(recordedArgs).toContain('-Wpedantic');
    expect(recordedArgs).toContain('-Wconversion');
    expect(recordedArgs).toContain('-Wsign-conversion');
    expect(recordedArgs).toContain('-Wshadow');
    expect(recordedArgs).toContain('-pedantic-errors');
    expect(recordedArgs).toContain('-DADIA_TESTING');

    // Check include directories
    expect(recordedArgs.some((arg) => arg.includes('production'))).toBe(true);
    expect(recordedArgs.some((arg) => arg.includes('tests'))).toBe(true);

    // Check sources
    expect(recordedArgs.some((arg) => arg.includes('source.c'))).toBe(true);
    expect(recordedArgs.some((arg) => arg.includes('test.c'))).toBe(true);
  });

  it('treats compiler warnings as errors and returns FAIL on compilation failure', async () => {
    const fakeCompiler = join(testDir, 'failing_gcc.js');
    writeFileSync(
      fakeCompiler,
      `console.error('error: variable unused [-Werror]'); process.exit(1);`,
    );

    const result = await compileHostPackage({
      packageDirectory: testDir,
      compiler: process.execPath,
      compilerArgs: [fakeCompiler],
    });

    expect(result.activity).toBe('host-compilation');
    expect(result.status).toBe('FAIL');
    expect(result.command?.exitCode).toBe(1);
    expect(result.command?.stderr).toContain('error: variable unused');
  });

  it('fails runtime execution when the runner exits non-zero', async () => {
    const runner = join(testDir, 'runner.js');
    writeFileSync(
      runner,
      `console.log('{"case_id":"tc_init_1","status":"FAIL"}'); process.exit(1);`,
    );

    const result = await runHostTests({
      packageDirectory: testDir,
      executablePath: runner,
      manifest: dummyManifest,
    });

    expect(result.activity).toBe('host-runtime');
    expect(result.status).toBe('FAIL');
  });

  it('fails runtime execution when required manifest test cases are missing or duplicate', async () => {
    // Missing tc_init_2
    const runner = join(testDir, 'runner_missing.js');
    writeFileSync(
      runner,
      `console.log('{"case_id":"tc_init_1","status":"PASS"}'); process.exit(0);`,
    );

    const result = await runHostTests({
      packageDirectory: testDir,
      executablePath: runner,
      manifest: dummyManifest,
    });

    expect(result.activity).toBe('host-runtime');
    expect(result.status).toBe('FAIL');
    expect(result.summary).toContain('Missing test cases: tc_init_2');
  });

  it('passes runtime execution when all manifest test cases pass cleanly with zero exit', async () => {
    const runner = join(testDir, 'runner_pass.js');
    writeFileSync(
      runner,
      `console.log('{"case_id":"tc_init_1","status":"PASS"}');\n` +
      `console.log('{"case_id":"tc_init_2","status":"PASS"}');\n` +
      `process.exit(0);\n`,
    );

    const result = await runHostTests({
      packageDirectory: testDir,
      executablePath: runner,
      manifest: dummyManifest,
    });

    expect(result.activity).toBe('host-runtime');
    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('All 2 test cases passed');
  });

  it('reports NOT_RUN when sanitizer support is not supported by compiler', async () => {
    const fakeCompiler = join(testDir, 'no_asan_gcc.js');
    writeFileSync(
      fakeCompiler,
      `console.error('gcc: error: unrecognized command-line option "-fsanitize=address"'); process.exit(1);`,
    );

    const result = await runSanitizers({
      packageDirectory: testDir,
      compiler: process.execPath,
      compilerArgs: [fakeCompiler],
    });

    expect(result.activity).toBe('sanitizers');
    expect(result.status).toBe('NOT_RUN');
    expect(result.summary).toContain('not supported');
  });

  it('fails sanitizers when ASan or UBSan detects an issue', async () => {
    const sanRunner = join(testDir, 'san_runner.js');
    writeFileSync(
      sanRunner,
      `console.error('==1234==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x123'); process.exit(1);`,
    );

    const result = await runSanitizers({
      packageDirectory: testDir,
      executablePath: sanRunner,
      manifest: dummyManifest,
    } as SanitizerRunRequest & { executablePath?: string });

    expect(result.activity).toBe('sanitizers');
    expect(result.status).toBe('FAIL');
    expect(result.summary).toContain('Sanitizer violation');
  });
});
