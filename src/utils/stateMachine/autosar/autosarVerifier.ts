/**
 * Real verifier of an AUTOSAR SWC package (Node only: it spawns compilers and writes a temp directory;
 * it must never be imported from the renderer bundle). Every gate either runs for real and reports
 * what it observed, or is NOT RUN with a reason. Evidence contains no time, duration or temp path, so
 * two runs on the same model are byte-identical.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { ErrorItem } from '../../../types/sm_types';
import type { LegacyStateMachineModel } from '../smModel';
import { runSmFrontEnd } from '../smFrontEnd';
import { createRuntime, initializeRuntime, stepRuntime, type SemanticRuntime } from '../smInterpreter';
import type { SemanticModel } from '../smSemanticModel';
import { checkArxmlStructure } from './autosarArxmlCheck';
import {
  AUTOSAR_GATE_IDS,
  type AutosarGateEvidence,
  type AutosarGateId,
  type AutosarVerificationEvidence,
} from './autosarEvidence';
import { checkMisraSubset } from './autosarMisraChecker';
import { deriveAutosarPorts, type AutosarPort } from './autosarPorts';
import { generateAutosarSwc } from './autosarSwcGenerator';
import { AUTOSAR_GENERATOR_VERSION } from './autosarTrace';

export type { AutosarGateEvidence, AutosarGateId, AutosarVerificationEvidence } from './autosarEvidence';
export { AUTOSAR_GATE_IDS } from './autosarEvidence';

type Chart = Omit<LegacyStateMachineModel, 'hilConfig'> & { hilConfig?: unknown };
type PackageFile = { name: string; content: string };

export interface AutosarVerifierOptions {
  /** Gates to run (default: all). The others are reported NOT RUN. */
  gates?: readonly AutosarGateId[];
  tools?: { gcc?: string; clang?: string; gcov?: string; make?: string };
  /** Differential cycles (default 500). */
  cycles?: number;
  /** Seed of the pseudo-random input vectors (default 1). */
  seed?: number;
  /** ISO timestamp supplied by the caller; the verifier never reads the clock. */
  executedAt?: string | null;
  swcName?: string;
}

const DEFAULT_CYCLES = 500;
/** The component is re-initialised every this many cycles, so a latched fault does not hide the rest of the run. */
const EPISODE_CYCLES = 25;
const STRICT = ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror'];
const INCLUDES = ['-Iswc', '-Icore', '-Istubs'];
const COMMAND_TIMEOUT_MS = 300_000;

// ------------------------------------------------------------------ process helpers

interface RunResult {
  status: number | null;
  output: string;
  missing: boolean;
}

const run = (command: string, args: readonly string[], cwd: string): RunResult => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
  });
  const missing = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error !== undefined && !missing ? String(result.error.message) : ''}`,
    missing,
  };
};

const toolName = (path: string): string => basename(path);

const sha256File = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex');

/** First informative output line with temp-directory paths removed, so evidence stays reproducible. */
const firstLines = (text: string, root: string, count = 2): string =>
  text.split('\n').map((line) => line.split(root).join('<pkg>').trim()).filter((line) => line !== '').slice(0, count).join(' / ');

const percent = (value: number): number => Math.round(value * 100) / 100;

// ------------------------------------------------------------------ context

interface Context {
  swc: string;
  chart: Chart;
  files: readonly PackageFile[];
  /** Package directory inside the temp dir (all commands run here with relative paths). */
  pkg: string;
  tmp: string;
  tools: { gcc: string; clang: string; gcov: string; make: string };
  cycles: number;
  seed: number;
}

const sourcesIn = (files: readonly PackageFile[], dirs: readonly string[]): string[] =>
  files.map((file) => file.name.replace(/^autosar\//, ''))
    .filter((name) => name.endsWith('.c') && dirs.some((dir) => name.startsWith(`${dir}/`)))
    .sort();

const notRun = (id: string, summary: string, tool: string | null = null): AutosarGateEvidence =>
  ({ id, status: 'not-run', summary, tool, toolVersion: null, command: null, metrics: {} });

const result = (
  id: string,
  ok: boolean,
  summary: string,
  extra: Partial<AutosarGateEvidence> = {},
): AutosarGateEvidence =>
  ({ id, status: ok ? 'pass' : 'fail', summary, tool: null, toolVersion: null, command: null, metrics: {}, ...extra });

const versionCache = new Map<string, string | null>();
/** Version line of a tool, or null when it cannot be executed. */
const versionOf = (tool: string, cwd: string): string | null => {
  const cached = versionCache.get(tool);
  if (cached !== undefined) return cached;
  const probe = run(tool, ['--version'], cwd);
  const line = probe.missing || probe.status !== 0 ? null : (probe.output.split('\n')[0] ?? '').trim();
  const version = line === null || line === '' ? null : line;
  versionCache.set(tool, version);
  return version;
};

const unavailable = (id: string, tool: string): AutosarGateEvidence =>
  notRun(id, `${toolName(tool)} not found or not executable (${tool}); the gate was not run.`, toolName(tool));

const cc = (flags: readonly string[], sources: readonly string[], out: string, libs: readonly string[] = ['-lm']): string[] =>
  [...flags, ...INCLUDES, ...sources, ...libs, '-o', out];

const commandLine = (tool: string, args: readonly string[]): string => [toolName(tool), ...args].join(' ');

// ------------------------------------------------------------------ gates

const gateGeneration = (ctx: Context): AutosarGateEvidence => {
  const regenerated = generateAutosarSwc(ctx.chart, { swcName: ctx.swc });
  if (regenerated.errors.length > 0) {
    return result('generation', false, `Generator reported ${regenerated.errors.length} error(s): ${regenerated.errors.slice(0, 3).map((error: ErrorItem) => error.id).join(', ')}.`);
  }
  const expected = new Map(regenerated.files.map((file) => [file.name, file.content]));
  const given = new Map(ctx.files.map((file) => [file.name, file.content]));
  for (const name of [...expected.keys()].sort()) {
    if (!given.has(name)) return result('generation', false, `Package lacks ${name}, which the generator produces.`);
    if (given.get(name) !== expected.get(name)) return result('generation', false, `${name} differs from the generator output for this model.`);
  }
  for (const name of [...given.keys()].sort()) {
    if (!expected.has(name)) return result('generation', false, `Package contains ${name}, which the generator does not produce.`);
  }
  return result('generation', true, `Generator reproduces all ${expected.size} package files byte-for-byte from the model (${regenerated.warnings.length} warnings).`, {
    metrics: { files: expected.size, warnings: regenerated.warnings.length },
  });
};

const gateMisra = (ctx: Context): AutosarGateEvidence => {
  const sources = ctx.files.filter((file) => /^autosar\/(swc|core)\/[^/]+\.(c|h)$/.test(file.name));
  const findings = checkMisraSubset(sources);
  const summary = findings.length === 0
    ? `0 findings from the textual MISRA C:2012 subset checker over ${sources.length} files (not a qualified MISRA tool).`
    : `${findings.length} finding(s), first: ${findings[0].rule} ${findings[0].file}:${findings[0].line}.`;
  return result('misra-subset', findings.length === 0, summary, { metrics: { findings: findings.length, files: sources.length } });
};

const gateArxml = (ctx: Context): AutosarGateEvidence => {
  const arxml = ctx.files.filter((file) => file.name.endsWith('.arxml'));
  if (arxml.length !== 1) return result('arxml-structure', false, `Expected exactly one ARXML file, found ${arxml.length}.`);
  const check = checkArxmlStructure(arxml[0].content);
  const summary = check.errors.length === 0
    ? `ARXML well-formed; all ${check.references} DEST references resolve (${check.elements} elements; not an XSD validation).`
    : `${check.errors.length} ARXML error(s), first: ${check.errors[0]}`;
  return result('arxml-structure', check.errors.length === 0, summary, {
    metrics: { errors: check.errors.length, references: check.references, elements: check.elements },
  });
};

const gateHostBuild = (ctx: Context): AutosarGateEvidence => {
  const version = versionOf(ctx.tools.gcc, ctx.pkg);
  if (version === null) return unavailable('host-build', ctx.tools.gcc);
  const sources = sourcesIn(ctx.files, ['swc', 'core', 'stubs', 'test']);
  const args = cc([...STRICT, '-DADIA_TESTING', '-O0'], sources, 'build/host_test');
  mkdirSync(join(ctx.pkg, 'build'), { recursive: true });
  const built = run(ctx.tools.gcc, args, ctx.pkg);
  const ok = built.status === 0;
  return result('host-build', ok,
    ok ? `Strict build (${STRICT.join(' ')}) of ${sources.length} sources succeeded.` : `Build failed: ${firstLines(built.output, ctx.tmp)}`,
    { tool: toolName(ctx.tools.gcc), toolVersion: version, command: commandLine(ctx.tools.gcc, args), metrics: { sources: sources.length } });
};

const gateUnitTest = (ctx: Context): AutosarGateEvidence => {
  const gccVersion = versionOf(ctx.tools.gcc, ctx.pkg);
  if (gccVersion === null) return unavailable('unit-test', ctx.tools.gcc);
  const makeVersion = versionOf(ctx.tools.make, ctx.pkg);
  if (makeVersion === null) return unavailable('unit-test', ctx.tools.make);
  const args = ['-s', 'test', `CC=${toolName(ctx.tools.gcc)}`];
  const executed = run(ctx.tools.make, ['-s', 'test', `CC=${ctx.tools.gcc}`], ctx.pkg);
  const ok = executed.status === 0 && executed.output.includes('ALL TESTS PASSED');
  return result('unit-test', ok,
    ok ? 'The generated host test (built with -DADIA_TESTING by the package Makefile) ran and printed ALL TESTS PASSED.'
      : `Generated test did not pass (exit ${executed.status}): ${firstLines(executed.output, ctx.tmp)}`,
    { tool: toolName(ctx.tools.make), toolVersion: makeVersion, command: commandLine(ctx.tools.make, args) });
};

const gateCoverage = (ctx: Context): AutosarGateEvidence => {
  const gccVersion = versionOf(ctx.tools.gcc, ctx.pkg);
  if (gccVersion === null) return unavailable('coverage', ctx.tools.gcc);
  const gcovVersion = versionOf(ctx.tools.gcov, ctx.pkg);
  if (gcovVersion === null) return unavailable('coverage', ctx.tools.gcov);
  const sources = sourcesIn(ctx.files, ['swc', 'core', 'stubs', 'test']);
  const swcSource = `swc/${ctx.swc}.c`;
  mkdirSync(join(ctx.pkg, 'build'), { recursive: true });
  const buildArgs = cc([...STRICT, '-DADIA_TESTING', '-O0', '--coverage'], sources, 'build/cov_test');
  const gcovArgs = ['-b', '-o', 'build', `build/cov_test-${ctx.swc}.gcda`];
  const command = [commandLine(ctx.tools.gcc, buildArgs), './build/cov_test', commandLine(ctx.tools.gcov, gcovArgs)].join(' && ');
  const base = { tool: toolName(ctx.tools.gcov), toolVersion: gcovVersion, command };
  const built = run(ctx.tools.gcc, buildArgs, ctx.pkg);
  if (built.status !== 0) return result('coverage', false, `Coverage build failed: ${firstLines(built.output, ctx.tmp)}`, base);
  const executed = run(join(ctx.pkg, 'build', 'cov_test'), [], ctx.pkg);
  if (executed.status !== 0 || !executed.output.includes('ALL TESTS PASSED')) {
    return result('coverage', false, `Instrumented test did not pass (exit ${executed.status}).`, base);
  }
  const report = run(ctx.tools.gcov, gcovArgs, ctx.pkg);
  const section = report.output.split(/File '/).find((chunk) => chunk.startsWith(`${swcSource}'`)) ?? '';
  const lines = /Lines executed:([\d.]+)%/.exec(section);
  const taken = /Taken at least once:([\d.]+)%/.exec(section);
  if (lines === null) return result('coverage', false, `gcov produced no line coverage for ${swcSource}.`, base);
  const linesPercent = percent(Number(lines[1]));
  const branchesTakenPercent = taken === null ? 100 : percent(Number(taken[1]));
  const ok = linesPercent === 100 && branchesTakenPercent >= 90;
  return result('coverage', ok,
    `${swcSource}: ${linesPercent}% lines executed, ${branchesTakenPercent}% branches taken at least once (required: 100% and at least 90%).`,
    { ...base, metrics: { linesPercent, branchesTakenPercent } });
};

const gateStaticAnalysis = (ctx: Context): AutosarGateEvidence => {
  const version = versionOf(ctx.tools.gcc, ctx.pkg);
  if (version === null) return unavailable('static-analysis', ctx.tools.gcc);
  const sources = sourcesIn(ctx.files, ['swc', 'core']);
  const flags = [...STRICT, '-fanalyzer', ...INCLUDES];
  let failure = '';
  for (const source of sources) {
    const analysed = run(ctx.tools.gcc, [...flags, '-c', source, '-o', '/dev/null'], ctx.pkg);
    if (analysed.status !== 0) {
      failure = `${source}: ${firstLines(analysed.output, ctx.tmp)}`;
      break;
    }
  }
  const command = `${commandLine(ctx.tools.gcc, [...flags, '-c', '<source>', '-o', '/dev/null'])} (sources: ${sources.join(' ')})`;
  return result('static-analysis', failure === '',
    failure === '' ? `gcc -fanalyzer -Werror reported no defect in ${sources.length} swc/core sources.` : `Analyzer finding: ${failure}`,
    { tool: toolName(ctx.tools.gcc), toolVersion: version, command, metrics: { sources: sources.length } });
};

const gateSanitizers = (ctx: Context): AutosarGateEvidence => {
  const version = versionOf(ctx.tools.gcc, ctx.pkg);
  if (version === null) return unavailable('sanitizers', ctx.tools.gcc);
  const sources = sourcesIn(ctx.files, ['swc', 'core', 'stubs', 'test']);
  const flags = [...STRICT, '-DADIA_TESTING', '-g', '-fsanitize=address,undefined', '-fno-sanitize-recover=all'];
  const args = cc(flags, sources, 'build/san_test');
  mkdirSync(join(ctx.pkg, 'build'), { recursive: true });
  const base = { tool: toolName(ctx.tools.gcc), toolVersion: version, command: `${commandLine(ctx.tools.gcc, args)} && ./build/san_test` };
  const built = run(ctx.tools.gcc, args, ctx.pkg);
  if (built.status !== 0) return result('sanitizers', false, `Sanitizer build failed: ${firstLines(built.output, ctx.tmp)}`, base);
  const executed = run(join(ctx.pkg, 'build', 'san_test'), [], ctx.pkg);
  const ok = executed.status === 0 && executed.output.includes('ALL TESTS PASSED');
  return result('sanitizers', ok,
    ok ? 'The generated test passed under AddressSanitizer and UndefinedBehaviorSanitizer (-fno-sanitize-recover=all).'
      : `Sanitizer run failed (exit ${executed.status}): ${firstLines(executed.output, ctx.tmp)}`, base);
};

const gateSecondCompiler = (ctx: Context): AutosarGateEvidence => {
  const version = versionOf(ctx.tools.clang, ctx.pkg);
  if (version === null) return unavailable('second-compiler', ctx.tools.clang);
  const sources = sourcesIn(ctx.files, ['swc', 'core', 'stubs', 'test']);
  const flags = ['-std=c99', '-Wall', '-Wextra', '-pedantic', '-Werror', '-DADIA_TESTING'];
  const args = cc(flags, sources, 'build/clang_test');
  mkdirSync(join(ctx.pkg, 'build'), { recursive: true });
  const base = { tool: toolName(ctx.tools.clang), toolVersion: version, command: `${commandLine(ctx.tools.clang, args)} && ./build/clang_test` };
  const built = run(ctx.tools.clang, args, ctx.pkg);
  if (built.status !== 0) return result('second-compiler', false, `clang build failed: ${firstLines(built.output, ctx.tmp)}`, base);
  const executed = run(join(ctx.pkg, 'build', 'clang_test'), [], ctx.pkg);
  const ok = executed.status === 0 && executed.output.includes('ALL TESTS PASSED');
  return result('second-compiler', ok,
    ok ? `clang builds the package without warnings (${flags.join(' ')}) and the generated test passed.`
      : `clang-built test failed (exit ${executed.status}): ${firstLines(executed.output, ctx.tmp)}`, base);
};

const gateReproducible = (ctx: Context): AutosarGateEvidence => {
  const version = versionOf(ctx.tools.gcc, ctx.pkg);
  if (version === null) return unavailable('reproducible-build', ctx.tools.gcc);
  const sources = sourcesIn(ctx.files, ['swc', 'core']);
  const flags = ['-std=c99', '-O2', ...INCLUDES];
  const command = `${commandLine(ctx.tools.gcc, [...flags, '-c', '<source>', '-o', 'obj/<source>.o'])} (sources: ${sources.join(' ')}; built in two different directories)`;
  const base = { tool: toolName(ctx.tools.gcc), toolVersion: version, command };
  const objects: Buffer[][] = [];
  for (const label of ['reproducible_first_directory', 'second_dir']) {
    const directory = join(ctx.tmp, label);
    cpSync(ctx.pkg, directory, { recursive: true });
    const built: Buffer[] = [];
    mkdirSync(join(directory, 'obj'), { recursive: true });
    for (const source of sources) {
      const out = `obj/${source.replace(/\//g, '_')}.o`;
      const compiled = run(ctx.tools.gcc, [...flags, '-c', source, '-o', out], directory);
      if (compiled.status !== 0) return result('reproducible-build', false, `Build failed for ${source}: ${firstLines(compiled.output, ctx.tmp)}`, base);
      built.push(readFileSync(join(directory, out)));
    }
    objects.push(built);
  }
  const differing = sources.filter((_source, index) => !objects[0][index].equals(objects[1][index]));
  return result('reproducible-build', differing.length === 0,
    differing.length === 0 ? `${sources.length} object files are byte-identical when built in two different directories.`
      : `Object files differ between two builds: ${differing.join(', ')}`,
    { ...base, metrics: { objects: sources.length, differing: differing.length } });
};

// ------------------------------------------------------------------ differential gate

/** mulberry32: small, fast, fully specified 32-bit PRNG (the vectors are generated in TS and handed to C as a table). */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const INTEGER_RANGES: Record<string, [number, number]> = {
  sint8: [-128, 127],
  uint8: [0, 255],
  sint16: [-32768, 32767],
  uint16: [0, 65535],
  sint32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  // 64-bit variables are evaluated in double precision by the core: stay inside the exact range.
  sint64: [-(2 ** 53 - 1), 2 ** 53 - 1],
  uint64: [0, 2 ** 53 - 1],
};

const FLOAT_BOUNDARIES = [0, 1, -1, 0.5, -0.5, 100, -100, 1000000, -1000000, 0.0009765625, -0.0009765625];

/** Deterministic type-correct value: boundaries (20 %), small magnitudes near typical thresholds (30 %), uniform (50 %). */
const drawValue = (platformType: string, random: () => number): number => {
  const selector = random();
  const pick = random();
  if (platformType === 'boolean') return pick < 0.5 ? 0 : 1;
  // 5 %: exactly zero, so divisors of zero are drawn on purpose (the model faults, the core must too).
  if (selector < 0.05 && platformType !== 'boolean') return 0;
  if (platformType === 'float32' || platformType === 'float64') {
    if (selector < 0.2) return FLOAT_BOUNDARIES[Math.floor(pick * FLOAT_BOUNDARIES.length)];
    if (selector < 0.5) return (Math.floor(pick * 801) - 400) / 4;
    // k / 1024 with |k| <= 2^20 is exactly representable in float32 and float64.
    return (Math.floor(pick * 2097153) - 1048576) / 1024;
  }
  const [min, max] = INTEGER_RANGES[platformType] ?? INTEGER_RANGES.sint32;
  if (selector < 0.2) {
    const boundaries = [min, min + 1, max - 1, max, 0, 1, -1].filter((value) => value >= min && value <= max);
    return boundaries[Math.floor(pick * boundaries.length)];
  }
  if (selector < 0.5) {
    const low = Math.max(min, -200);
    const high = Math.min(max, 200);
    return low + Math.floor(pick * (high - low + 1));
  }
  return min + Math.floor(pick * (max - min + 1));
};

const cNumber = (value: number): string => {
  const text = Object.is(value, -0) ? '0' : String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

const isFloatType = (platformType: string): boolean => platformType === 'float32' || platformType === 'float64';

const printSpec = (port: AutosarPort): { format: string; cast: string } => {
  if (isFloatType(port.platformType)) return { format: '%.17g', cast: 'double' };
  if (port.platformType === 'uint64') return { format: '%llu', cast: 'unsigned long long' };
  if (port.platformType === 'sint64') return { format: '%lld', cast: 'long long' };
  if (port.platformType.startsWith('uint') || port.platformType === 'boolean') return { format: '%lu', cast: 'unsigned long' };
  return { format: '%ld', cast: 'long' };
};

interface DifferentialColumn {
  name: string;
  float: boolean;
}

const renderDriver = (
  swc: string,
  required: readonly AutosarPort[],
  provided: readonly AutosarPort[],
  vectors: readonly number[][],
  cycles: number,
): string => {
  const row = (index: string): string[] => {
    const specs = provided.map(printSpec);
    return [
      `    (void)printf("R,%u,%u,%u${specs.map((spec) => `,${spec.format}`).join('')}\\n", ${index}, (unsigned)Rte_Stub_PP_SmStatus_ActiveState_Value, (unsigned)(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U)${provided.map((port, position) => `, (${specs[position].cast})Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value`).join('')});`,
    ];
  };
  return [
    '/* Generated by the ADIA AUTOSAR verifier: drives the SWC through the RTE stub with seeded input vectors. Not part of the package. */',
    '#include <stdio.h>',
    `#include "${swc}.h"`,
    `#include "Rte_${swc}_Stub.h"`,
    '',
    ...required.map((port, position) =>
      `static const double vector_${position}[${Math.max(cycles, 1)}] = {${vectors[position].map(cNumber).join(', ')}};`),
    '',
    'int main(void)',
    '{',
    '    unsigned int cycle;',
    '    Rte_Stub_Reset();',
    `    ${swc}_Init();`,
    ...row('0U'),
    `    for (cycle = 0U; cycle < ${cycles}U; cycle++) {`,
    `        if ((cycle > 0U) && ((cycle % ${EPISODE_CYCLES}U) == 0U)) {`,
    '            Rte_Stub_Reset();',
    `            ${swc}_Init();`,
    ...row('cycle').map((line) => `        ${line}`),
    '        }',
    ...required.map((port, position) => port.platformType === 'boolean'
      ? `        Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value = (vector_${position}[cycle] != 0.0) ? TRUE : FALSE;`
      : `        Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value = (${port.platformType})vector_${position}[cycle];`),
    `        ${swc}_MainFunction();`,
    ...row('cycle + 1U').map((line) => `    ${line}`),
    '    }',
    '    return 0;',
    '}',
    '',
  ].join('\n');
};

const withinTolerance = (expected: number, actual: number, float: boolean): boolean => {
  if (expected === actual) return true;
  if (!float || !Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  return Math.abs(expected - actual) <= 1e-12 * Math.max(Math.abs(expected), Math.abs(actual));
};

const gateDifferential = (ctx: Context): AutosarGateEvidence => {
  const version = versionOf(ctx.tools.gcc, ctx.pkg);
  if (version === null) return unavailable('differential', ctx.tools.gcc);
  const frontEnd = runSmFrontEnd(ctx.chart, { stripHil: true });
  const ir: SemanticModel | undefined = frontEnd.ir;
  if (ir === undefined || frontEnd.errors.length > 0) {
    return result('differential', false, 'The model has errors, so the ADIA interpreter oracle cannot be built.');
  }
  const ports = deriveAutosarPorts(ir);
  const random = mulberry32(ctx.seed);
  const vectors: number[][] = ports.required.map(() => []);

  // Oracle: ADIA's semantic interpreter, stepped exactly like the SWC cycle (inputs, step(period), outputs).
  const stateNumber = new Map(Object.values(ir.states)
    .sort((left, right) => left.activityIndex - right.activityIndex)
    .map((state, index) => [state.id, index + 1]));
  const runtime = createRuntime(ir);
  // A latched model error is a fault: the core exits every state and enters the safe state (safety mode), which is
  // the configuration the interpreter itself defines in enterFaultConfiguration. The interpreter applies it for
  // timing and X-Bridges errors but not for a RUNTIME_EVALUATION_ERROR (it freezes the configuration); the oracle
  // maps that case to the fault configuration. Reported as a known divergence of the interpreter.
  const faultState = ir.safetyMode && ir.safeStateId !== null ? (stateNumber.get(ir.safeStateId) ?? -1) : 0;
  const observe = (target: SemanticRuntime): number[] => [
    target.error !== null
      ? faultState
      : target.activeSlots[0] === null || target.activeSlots[0] === undefined ? 0 : (stateNumber.get(target.activeSlots[0]) ?? -1),
    target.error === null ? 0 : 1,
    ...ports.provided.map((port) => Number(target.data[port.variableId])),
  ];
  initializeRuntime(runtime);
  const expected: number[][] = [observe(runtime)];
  let faultCycles = 0;
  for (let cycle = 0; cycle < ctx.cycles; cycle += 1) {
    if (cycle > 0 && cycle % EPISODE_CYCLES === 0) {
      initializeRuntime(runtime);
      expected.push(observe(runtime));
    }
    const drawn = ports.required.map((port) => drawValue(port.platformType, random));
    ports.required.forEach((port, position) => {
      vectors[position].push(drawn[position]);
      runtime.data[port.variableId] = port.platformType === 'boolean' ? drawn[position] !== 0 : drawn[position];
    });
    stepRuntime(runtime, ir.tickMs);
    if (runtime.error !== null) faultCycles += 1;
    expected.push(observe(runtime));
  }

  // Device under test: the generated C through the RTE stub.
  const driverPath = 'build/adia_diff_driver.c';
  mkdirSync(join(ctx.pkg, 'build'), { recursive: true });
  writeFileSync(join(ctx.pkg, driverPath), renderDriver(ctx.swc, ports.required, ports.provided, vectors, ctx.cycles));
  const sources = [...sourcesIn(ctx.files, ['swc', 'core', 'stubs']), driverPath];
  const args = cc([...STRICT, '-DADIA_TESTING', '-O0'], sources, 'build/diff_driver');
  const base = {
    tool: toolName(ctx.tools.gcc),
    toolVersion: version,
    command: `${commandLine(ctx.tools.gcc, args)} && ./build/diff_driver`,
  };
  const built = run(ctx.tools.gcc, args, ctx.pkg);
  if (built.status !== 0) return result('differential', false, `Differential driver build failed: ${firstLines(built.output, ctx.tmp)}`, base);
  const executed = run(join(ctx.pkg, 'build', 'diff_driver'), [], ctx.pkg);
  if (executed.status !== 0) return result('differential', false, `Differential driver failed (exit ${executed.status}): ${firstLines(executed.output, ctx.tmp)}`, base);
  const rows = executed.output.split('\n').filter((line) => line.startsWith('R,'));
  if (rows.length !== expected.length) {
    return result('differential', false, `Driver printed ${rows.length} records, expected ${expected.length}.`, base);
  }

  const columns: DifferentialColumn[] = [
    { name: 'ActiveState', float: false },
    { name: 'ErrorStatus', float: false },
    ...ports.provided.map((port) => ({ name: port.portName, float: isFloatType(port.platformType) })),
  ];
  let mismatches = 0;
  let first = '';
  rows.forEach((line, cycle) => {
    const fields = line.split(',').slice(2).map(Number);
    columns.forEach((column, position) => {
      if (!withinTolerance(expected[cycle][position], fields[position], column.float)) {
        mismatches += 1;
        if (first === '') {
          first = `first at cycle ${cycle}: ${column.name} interpreter=${expected[cycle][position]} generated C=${fields[position]}`;
        }
      }
    });
  });
  const metrics = { cycles: ctx.cycles, mismatches, signals: columns.length, seed: ctx.seed, faultCycles };
  const faults = ` ${faultCycles} cycle(s) ran in the latched-fault state (ErrorStatus and fault configuration compared).`;
  return result('differential', mismatches === 0,
    mismatches === 0
      ? `${ctx.cycles} seeded cycles (seed ${ctx.seed}): generated C and the ADIA interpreter agree on ${columns.length} signals (integers exact, floats bit-exact or within 1e-12 relative; re-initialised every ${EPISODE_CYCLES} cycles).${faults}`
      : `${mismatches} mismatch(es) in ${ctx.cycles} cycles (seed ${ctx.seed}); ${first}.${faults}`,
    { ...base, metrics });
};

// ------------------------------------------------------------------ driver

const GATES: Record<AutosarGateId, (ctx: Context) => AutosarGateEvidence> = {
  generation: gateGeneration,
  'misra-subset': gateMisra,
  'arxml-structure': gateArxml,
  'host-build': gateHostBuild,
  'unit-test': gateUnitTest,
  coverage: gateCoverage,
  'static-analysis': gateStaticAnalysis,
  sanitizers: gateSanitizers,
  'second-compiler': gateSecondCompiler,
  differential: gateDifferential,
  'reproducible-build': gateReproducible,
};

const sortedRecord = (entries: Array<[string, string]>): Record<string, string> =>
  Object.fromEntries(entries.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)));

const sortedMetrics = (metrics: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(metrics).sort((left, right) => (left[0] < right[0] ? -1 : 1)));

const detectSwcName = (files: readonly PackageFile[]): string | undefined => {
  for (const file of files) {
    const match = /^autosar\/swc\/([A-Za-z][A-Za-z0-9_]*)\.c$/.exec(file.name);
    if (match !== null) return match[1];
  }
  return undefined;
};

export const verifyAutosarPackage = async (
  chart: Chart,
  files: readonly PackageFile[],
  options: AutosarVerifierOptions = {},
): Promise<AutosarVerificationEvidence> => {
  const swc = options.swcName ?? detectSwcName(files) ?? 'AdiaSwc';
  const cycles = options.cycles ?? DEFAULT_CYCLES;
  if (!Number.isInteger(cycles) || cycles < 1) throw new RangeError(`cycles must be a positive integer, got ${cycles}`);
  const seed = options.seed ?? 1;
  if (!Number.isInteger(seed) || seed < 0) throw new RangeError(`seed must be a non-negative integer, got ${seed}`);
  const selected = new Set<string>(options.gates ?? AUTOSAR_GATE_IDS);

  const tmp = mkdtempSync(join(tmpdir(), 'adia-autosar-verify-'));
  try {
    const pkg = join(tmp, 'pkg');
    mkdirSync(pkg, { recursive: true });
    for (const file of files) {
      const target = join(pkg, file.name.replace(/^autosar\//, ''));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
    const context: Context = {
      swc,
      chart,
      files,
      pkg,
      tmp,
      tools: {
        gcc: options.tools?.gcc ?? 'gcc',
        clang: options.tools?.clang ?? 'clang',
        gcov: options.tools?.gcov ?? 'gcov',
        make: options.tools?.make ?? 'make',
      },
      cycles,
      seed,
    };
    const gates = AUTOSAR_GATE_IDS.map((id): AutosarGateEvidence => {
      if (!selected.has(id)) return notRun(id, 'Not selected for this run.');
      const gate = GATES[id](context);
      return { ...gate, metrics: sortedMetrics(gate.metrics) };
    });
    const fingerprintMatch = files
      .map((file) => /ADIA-FINGERPRINT: ([0-9a-f]{16})/.exec(file.content))
      .find((match): match is RegExpExecArray => match !== null);
    const versionMatch = files
      .map((file) => /ADIA-AUTOSAR-GENERATOR: (\S+)/.exec(file.content))
      .find((match): match is RegExpExecArray => match !== null);
    return {
      swcName: swc,
      fingerprint: fingerprintMatch?.[1] ?? null,
      generatorVersion: versionMatch?.[1] ?? AUTOSAR_GENERATOR_VERSION,
      fileSha256: sortedRecord(files.map((file): [string, string] => [file.name, sha256File(file.content)])),
      gates,
      verdict: gates.every((gate) => gate.status === 'pass') ? 'accepted' : 'not-accepted',
      executedAt: options.executedAt ?? null,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

/** Generates the package and verifies it. A model that cannot be generated yields a failed `generation` gate. */
export const runAutosarVerification = async (
  chart: Chart,
  options: AutosarVerifierOptions = {},
): Promise<AutosarVerificationEvidence> => {
  const generated = generateAutosarSwc(chart, options.swcName === undefined ? {} : { swcName: options.swcName });
  if (generated.errors.length > 0) {
    return {
      swcName: options.swcName ?? 'AdiaSwc',
      fingerprint: null,
      generatorVersion: AUTOSAR_GENERATOR_VERSION,
      fileSha256: {},
      gates: AUTOSAR_GATE_IDS.map((id) => id === 'generation'
        ? result(id, false, `Generator reported ${generated.errors.length} error(s): ${generated.errors.slice(0, 3).map((error) => error.id).join(', ')}.`)
        : notRun(id, 'Not run: the model could not be generated.')),
      verdict: 'not-accepted',
      executedAt: options.executedAt ?? null,
    };
  }
  return verifyAutosarPackage(chart, generated.files, options);
};
