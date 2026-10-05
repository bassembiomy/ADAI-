import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type BaselineReportData,
  type SizeBaselineResult,
  type OperationMetric,
  getSystemInfo,
  getGitCommit,
  getWorkingTreeStatus,
  generateMarkdownReport,
} from './metrics';

const SIZES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const MEMORY_CEILING_MB = 4096;
const SIZE_TIMEOUT_MS = 180_000; // 3 minutes per size
const PHASE_TIMEOUT_MS = 60_000;

function readSidecarPhases(size: number): Record<string, OperationMetric> {
  const sidecarPath = resolve(process.cwd(), `artifacts/scalability/worker-${size}-phases.jsonl`);
  const phases: Record<string, OperationMetric> = {};
  if (!existsSync(sidecarPath)) return phases;

  try {
    const lines = readFileSync(sidecarPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry.metric?.phase) {
        phases[entry.metric.phase] = entry.metric;
      }
    }
  } catch {
    // Non-blocking sidecar read
  }
  return phases;
}

async function runChildBenchmark(
  size: number,
  seed: number,
  topology: string,
  timeoutMs: number
): Promise<SizeBaselineResult> {
  return new Promise<SizeBaselineResult>((resolveResult) => {
    console.log(`\n============================================================`);
    console.log(`[runBaseline] Launching isolated worker for size: ${size.toLocaleString()} elements (ceiling: ${MEMORY_CEILING_MB}MB)...`);
    console.log(`============================================================`);

    const workerPath = resolve(process.cwd(), 'scripts/scalability/benchWorker.ts');
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${MEMORY_CEILING_MB}`,
        '--expose-gc',
        './node_modules/tsx/dist/cli.mjs',
        workerPath,
        `--size=${size}`,
        `--seed=${seed}`,
        `--topology=${topology}`,
        `--samples=3`,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${MEMORY_CEILING_MB} --expose-gc`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[runBaseline] Process for size ${size} timed out after ${timeoutMs / 1000}s. Killing...`);
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutData += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;
      process.stderr.write(text);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);

      // Check for bench result JSON
      const startTag = '__BENCH_RESULT_START__';
      const endTag = '__BENCH_RESULT_END__';
      const startIdx = stdoutData.indexOf(startTag);
      const endIdx = stdoutData.indexOf(endTag);

      let parsedResult: SizeBaselineResult | undefined;
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        try {
          const jsonStr = stdoutData.substring(startIdx + startTag.length, endIdx).trim();
          parsedResult = JSON.parse(jsonStr);
        } catch {
          // parse error
        }
      }

      // Recover any completed phases from sidecar JSONL if process died/timed out
      const sidecarPhases = readSidecarPhases(size);
      const phases = {
        ...sidecarPhases,
        ...(parsedResult?.phases ?? {}),
      };

      if (timedOut) {
        resolveResult({
          size,
          topology,
          phases,
          outcome: 'timedOut',
          failureReason: `Size run exceeded timeout of ${timeoutMs / 1000}s`,
        });
        return;
      }

      const isOOM =
        stderrData.includes('JavaScript heap out of memory') ||
        stderrData.includes('ERR_WORKER_OUT_OF_MEMORY') ||
        signal === 'SIGABRT' ||
        code === 134;

      if (isOOM) {
        console.error(`[runBaseline] Process for size ${size} encountered Out of Memory.`);
        resolveResult({
          size,
          topology,
          phases,
          outcome: 'outOfMemory',
          failureReason: 'JavaScript heap out of memory (>4096MB limit)',
        });
        return;
      }

      if (code === 0 && parsedResult) {
        resolveResult({
          ...parsedResult,
          phases: { ...phases, ...parsedResult.phases },
        });
      } else {
        resolveResult({
          size,
          topology,
          phases,
          outcome: 'failed',
          failureReason: parsedResult?.failureReason || stderrData.trim() || `Process exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const phases = readSidecarPhases(size);
      resolveResult({
        size,
        topology,
        phases,
        outcome: 'failed',
        failureReason: err.message,
      });
    });
  });
}

export async function runFullBaseline(): Promise<void> {
  const seed = 42;
  const topology = 'distributed';
  const results: Record<number, SizeBaselineResult> = {};

  let stopSeries = false;

  for (const size of SIZES) {
    if (stopSeries) {
      console.log(`[runBaseline] Skipping size ${size.toLocaleString()} because earlier size hit capacity limit.`);
      results[size] = {
        size,
        topology,
        phases: {},
        outcome: 'notRun',
        failureReason: 'Not run (skipped due to capacity ceiling in smaller size)',
      };
      continue;
    }

    const res = await runChildBenchmark(size, seed, topology, SIZE_TIMEOUT_MS);
    results[size] = res;

    if (res.outcome === 'outOfMemory' || res.outcome === 'timedOut' || res.outcome === 'failed') {
      console.warn(`[runBaseline] Size ${size.toLocaleString()} ended with status: ${res.outcome}. Stopping higher sizes.`);
      stopSeries = true;
    }
  }

  // Compile Report Data
  const reportData: BaselineReportData = {
    timestamp: new Date().toISOString(),
    gitCommit: getGitCommit(),
    workingTreeStatus: getWorkingTreeStatus(),
    seed,
    system: getSystemInfo(),
    memoryCeilingMb: MEMORY_CEILING_MB,
    sizeTimeoutMs: SIZE_TIMEOUT_MS,
    phaseTimeoutMs: PHASE_TIMEOUT_MS,
    results,
  };

  // Ensure output directories exist
  mkdirSync(resolve(process.cwd(), 'artifacts/scalability'), { recursive: true });
  mkdirSync(resolve(process.cwd(), 'docs/scalability'), { recursive: true });

  const rawJsonPath = resolve(process.cwd(), 'artifacts/scalability/baseline-raw.json');
  writeFileSync(rawJsonPath, JSON.stringify(reportData, null, 2), 'utf8');
  console.log(`\n[runBaseline] Wrote raw metrics to: ${rawJsonPath}`);

  const mdReportPath = resolve(process.cwd(), 'docs/scalability/2026-10-05-baseline.md');
  const mdContent = generateMarkdownReport(reportData);
  writeFileSync(mdReportPath, mdContent, 'utf8');
  console.log(`[runBaseline] Wrote markdown report to: ${mdReportPath}`);
}

if (process.argv[1] && process.argv[1].endsWith('runBaseline.ts')) {
  runFullBaseline().catch((err) => {
    console.error('[runBaseline] Fatal error:', err);
    process.exit(1);
  });
}
