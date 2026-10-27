/**
 * Verifies the AUTOSAR SWC package generated from a state-machine chart with real tools and writes
 *   <out>/autosar/...                package, with doc/Verification_Report.md filled with the evidence
 *                                    and doc/SHA256SUMS regenerated to match
 *   <out>/verification_evidence.json the evidence (reproducible: no time, duration or temp path)
 * Exit code: 0 accepted, 1 not accepted, 2 bad arguments.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAutosarReport } from '../src/utils/stateMachine/autosar/autosarReport';
import { generateAutosarSwc, renderSha256Sums } from '../src/utils/stateMachine/autosar/autosarSwcGenerator';
import { runAutosarVerification, verifyAutosarPackage } from '../src/utils/stateMachine/autosar/autosarVerifier';

const USAGE = 'Usage: verify_autosar --chart <json> --out <dir> [--swc <name>] [--cycles n] [--seed n] [--gcc path] [--clang path] [--gcov path] [--make path] [--executed-at <iso>]';

interface Parsed {
  chart: string;
  out: string;
  swc?: string;
  cycles?: number;
  seed?: number;
  executedAt: string | null;
  tools: { gcc?: string; clang?: string; gcov?: string; make?: string };
}

const parseArgs = (args: readonly string[]): Parsed | string => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!/^--(chart|out|swc|cycles|seed|gcc|clang|gcov|make|executed-at)$/.test(key) || value === undefined) {
      return `Unknown or incomplete argument '${key}'.`;
    }
    values.set(key.slice(2), value);
  }
  const chart = values.get('chart');
  const out = values.get('out');
  if (chart === undefined || out === undefined) return '--chart and --out are required.';
  const integer = (name: string): number | undefined | string => {
    const raw = values.get(name);
    if (raw === undefined) return undefined;
    return /^\d+$/.test(raw) ? Number(raw) : `--${name} must be a non-negative integer.`;
  };
  const cycles = integer('cycles');
  const seed = integer('seed');
  if (typeof cycles === 'string') return cycles;
  if (typeof seed === 'string') return seed;
  if (cycles !== undefined && cycles < 1) return '--cycles must be at least 1.';
  return {
    chart,
    out,
    swc: values.get('swc'),
    cycles,
    seed,
    executedAt: values.get('executed-at') ?? null,
    tools: { gcc: values.get('gcc'), clang: values.get('clang'), gcov: values.get('gcov'), make: values.get('make') },
  };
};

export const runVerifyAutosar = async (
  args: readonly string[],
  log: (message: string) => void = console.log,
  errorLog: (message: string) => void = console.error,
): Promise<number> => {
  const parsed = parseArgs(args);
  if (typeof parsed === 'string') {
    errorLog(`${parsed}\n${USAGE}`);
    return 2;
  }
  let chart: Parameters<typeof runAutosarVerification>[0];
  try {
    const raw = JSON.parse(readFileSync(resolve(parsed.chart), 'utf8')) as Record<string, unknown>;
    chart = (raw.chart !== undefined && typeof raw.chart === 'object' ? raw.chart : raw) as typeof chart;
    if (!Array.isArray((chart as { states?: unknown }).states)) throw new Error('the JSON has no "states" array');
  } catch (error) {
    errorLog(`Cannot read chart '${parsed.chart}': ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }

  const tools = Object.fromEntries(Object.entries(parsed.tools).filter(([, value]) => value !== undefined)) as Parsed['tools'];
  const options = { tools, cycles: parsed.cycles, seed: parsed.seed, executedAt: parsed.executedAt, swcName: parsed.swc };
  const generated = generateAutosarSwc(chart, parsed.swc === undefined ? {} : { swcName: parsed.swc });
  const evidence = generated.errors.length > 0
    ? await runAutosarVerification(chart, options)
    : await verifyAutosarPackage(chart, generated.files, options);

  const out = resolve(parsed.out);
  mkdirSync(out, { recursive: true });
  let files = generated.files;
  if (generated.errors.length === 0) {
    const report = buildAutosarReport(chart, { swcName: evidence.swcName, evidence }).markdown;
    const withReport = files.map((file) => file.name === 'autosar/doc/Verification_Report.md' ? { ...file, content: report } : file);
    // The filled report replaces the generation-time one, so the sums are regenerated to stay consistent.
    files = withReport.map((file) => file.name === 'autosar/doc/SHA256SUMS' ? { ...file, content: renderSha256Sums(withReport) } : file);
    for (const file of files) {
      const target = join(out, file.name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
  } else {
    for (const error of generated.errors) errorLog(`${error.id}: ${error.message}`);
  }
  writeFileSync(join(out, 'verification_evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);

  log(`AUTOSAR SWC ${evidence.swcName} (fingerprint ${evidence.fingerprint ?? 'n/a'}): verdict ${evidence.verdict.toUpperCase()}`);
  for (const gate of evidence.gates) log(`  ${gate.status.toUpperCase().padEnd(8)} ${gate.id.padEnd(20)} ${gate.summary}`);
  log(`Evidence written to ${join(out, 'verification_evidence.json')}`);
  return evidence.verdict === 'accepted' ? 0 : 1;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runVerifyAutosar(process.argv.slice(2)).then((code) => process.exit(code), (error: unknown) => {
    console.error(error);
    process.exit(2);
  });
}
