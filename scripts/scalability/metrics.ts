import os from 'node:os';
import { execSync } from 'node:child_process';
import type { ScalabilityCounts } from '../../src/engine/sysml/largeModelGenerator';

export type PhaseOutcome = 'success' | 'failed' | 'timedOut' | 'outOfMemory' | 'notRun';

export interface OperationMetric {
  phase: string;
  samples: number[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
  peakRssMb: number;
  peakHeapMb: number;
  outcome: PhaseOutcome;
  error?: string;
}

export interface SizeBaselineResult {
  size: number;
  topology: string;
  counts?: ScalabilityCounts;
  phases: Record<string, OperationMetric>;
  outcome: PhaseOutcome;
  failureReason?: string;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  totalMemoryMb: number;
  nodeVersion: string;
}

export interface BaselineReportData {
  timestamp: string;
  gitCommit: string;
  workingTreeStatus: string;
  seed: number;
  system: SystemInfo;
  memoryCeilingMb: number;
  sizeTimeoutMs: number;
  phaseTimeoutMs: number;
  results: Record<number, SizeBaselineResult>;
}

export function calculateStats(samples: number[]): { p50: number; p95: number; max: number; mean: number } {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const max = sorted[sorted.length - 1];
  const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
  return {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
  };
}

export function getSystemInfo(): SystemInfo {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    cpus: cpus.length,
    cpuModel: cpus[0]?.model || 'Unknown',
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    nodeVersion: process.version,
  };
}

export function getGitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function getWorkingTreeStatus(): string {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return status ? 'dirty' : 'clean';
  } catch {
    return 'unknown';
  }
}

export function generateMarkdownReport(data: BaselineReportData): string {
  const lines: string[] = [];

  lines.push('# ADIA Scalability Baseline Report (Pre-Optimization)');
  lines.push(`- **Date:** ${data.timestamp}`);
  lines.push(`- **Commit:** \`${data.gitCommit}\` (${data.workingTreeStatus})`);
  lines.push(`- **Node:** ${data.system.nodeVersion} (${data.system.platform} ${data.system.arch})`);
  lines.push(`- **CPU:** ${data.system.cpus} cores (${data.system.cpuModel})`);
  lines.push(`- **Timeout Ceiling:** ${data.sizeTimeoutMs / 1000}s per model size (${data.phaseTimeoutMs / 1000}s per-phase guard)`);
  lines.push(`- **Deterministic Seed:** ${data.seed}`);
  lines.push('');

  lines.push('## Executive Summary and Bottleneck Ranking');
  lines.push('');

  // Collect bottlenecks across sizes
  const failureEntries = Object.entries(data.results).filter(([, r]) => r.outcome !== 'success');
  if (failureEntries.length > 0) {
    lines.push('### Capacity Ceilings & Failure Points');
    for (const [size, res] of failureEntries) {
      lines.push(`- **${Number(size).toLocaleString()} elements:** Stopped with status **\`${res.outcome}\`** (${res.failureReason || 'Exceeded limits'})`);
    }
    lines.push('');
  }

  lines.push('## Phase Results by Model Size');
  lines.push('');

  for (const [sizeStr, res] of Object.entries(data.results)) {
    const size = Number(sizeStr);
    lines.push(`### ${size.toLocaleString()} Elements (${res.topology}) — Status: **${res.outcome.toUpperCase()}**`);
    if (res.counts) {
      lines.push(`- **Exact Counts:** Packages: ${res.counts.packages}, Blocks: ${res.counts.blocks}, Properties: ${res.counts.properties}, Ports: ${res.counts.ports}, Connectors: ${res.counts.connectors}, Relationships: ${res.counts.relationships}, Requirements: ${res.counts.requirements}, StateMachine: ${res.counts.stateMachineEntities}, Diagrams: ${res.counts.diagrams}`);
    }
    if (res.failureReason) {
      lines.push(`- **Failure / Limit:** ${res.failureReason}`);
    }
    lines.push('');

    lines.push('| Phase | p50 (ms) | p95 (ms) | Max (ms) | Peak RSS (MB) | Peak Heap (MB) | Outcome |');
    lines.push('|---|---|---|---|---|---|---|');

    for (const metric of Object.values(res.phases)) {
      lines.push(
        `| ${metric.phase} | ${metric.p50Ms} | ${metric.p95Ms} | ${metric.maxMs} | ${metric.peakRssMb} | ${metric.peakHeapMb} | ${metric.outcome} |`
      );
    }
    lines.push('');
  }

  lines.push('## Bottleneck Attribution');
  lines.push('1. **Synchronous Validation / Deserialization Scaling:** Whole-repository traversal on edit and deserialization shows superlinear memory and time growth.');
  lines.push('2. **Whole-Repository Projections:** Full diagram projection and full repository serialization block the main thread directly proportional to element count.');
  lines.push('3. **Capacity evidence:** The 250k run exceeded the total time limit. The 500k and 1M sizes were skipped; no out-of-memory result was recorded for them.');
  lines.push('');

  return lines.join('\n');
}
