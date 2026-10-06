import { readFileSync } from 'node:fs';
import { type WorkflowName, type WorkflowsMap, type WorkflowSample } from './workflows';

export interface ProfileLimits {
  maxP95HeartbeatGapMs: number;
  maxInteractionLongTaskMs: number;
  maxHandlerP95Ms: number;
  maxLoadLongTaskMs?: number;
}

export interface BrowserProfile {
  size: number;
  timestamp: string;
  samplesCount: number;
  productionUrl?: string;
  workflows: WorkflowsMap;
  load?: {
    durationMs: number;
    heartbeatGapMs?: number;
    maxHeartbeatGapMs?: number;
    longTasksMs: number[];
    activeDiagramId?: string;
    presented?: number;
    treeDomRows?: number;
  };
}

export interface GateFailure {
  workflow: WorkflowName;
  metric: 'heartbeatGap' | 'handler' | 'longTask' | 'loadLongTask';
  observedValue: number;
  limit: number;
  message: string;
}

export interface WorkflowEvaluation {
  p95HeartbeatGapMs: number;
  p95HandlerMs?: number;
  maxLongTaskMs: number;
  samplesCount: number;
}

export interface GateResult {
  passed: boolean;
  failures: GateFailure[];
  workflows: Record<string, WorkflowEvaluation>;
}

export function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * (percentile / 100)));
  return sorted[index];
}

export function evaluateBrowserProfile(
  profile: BrowserProfile,
  limits: ProfileLimits = {
    maxP95HeartbeatGapMs: 100,
    maxInteractionLongTaskMs: 100,
    maxHandlerP95Ms: 100,
  }
): GateResult {
  const failures: GateFailure[] = [];
  const workflowEvals: Record<string, WorkflowEvaluation> = {};

  for (const [name, workflowData] of Object.entries(profile.workflows)) {
    const wfName = name as WorkflowName;
    if (!workflowData || !workflowData.samples || workflowData.samples.length === 0) continue;

    const samples = workflowData.samples;
    const heartbeatGaps = samples.map(s => s.heartbeatGapMs);
    const handlers = wfName === 'save-reopen' || wfName === 'load'
      ? []
      : samples.map(s => s.handlerMs).filter((h): h is number => typeof h === 'number');
    const allLongTasks = samples.flatMap(s => s.longTasksMs ?? []);

    const p95Heartbeat = computePercentile(heartbeatGaps, 95);
    const p95Handler = handlers.length > 0 ? computePercentile(handlers, 95) : undefined;
    const maxLongTask = allLongTasks.length > 0 ? Math.max(...allLongTasks) : 0;

    workflowEvals[wfName] = {
      p95HeartbeatGapMs: p95Heartbeat,
      p95HandlerMs: p95Handler,
      maxLongTaskMs: maxLongTask,
      samplesCount: samples.length,
    };

    // Heartbeat delay: must be strictly below limit
    if (p95Heartbeat >= limits.maxP95HeartbeatGapMs) {
      failures.push({
        workflow: wfName,
        metric: 'heartbeatGap',
        observedValue: p95Heartbeat,
        limit: limits.maxP95HeartbeatGapMs,
        message: `Workflow '${wfName}' p95 heartbeat delay ${p95Heartbeat}ms is at or above limit of ${limits.maxP95HeartbeatGapMs}ms`,
      });
    }

    // Handler latency: must be below limit
    if (p95Handler !== undefined && p95Handler >= limits.maxHandlerP95Ms) {
      failures.push({
        workflow: wfName,
        metric: 'handler',
        observedValue: p95Handler,
        limit: limits.maxHandlerP95Ms,
        message: `Workflow '${wfName}' p95 handler duration ${p95Handler}ms is at or above limit of ${limits.maxHandlerP95Ms}ms`,
      });
    }

    // Interaction long tasks: any task > limit fails
    for (const lt of allLongTasks) {
      if (lt > limits.maxInteractionLongTaskMs) {
        failures.push({
          workflow: wfName,
          metric: 'longTask',
          observedValue: lt,
          limit: limits.maxInteractionLongTaskMs,
          message: `Workflow '${wfName}' interaction triggered Long Task of ${lt}ms, exceeding limit of ${limits.maxInteractionLongTaskMs}ms`,
        });
      }
    }
  }

  if (profile.load) {
    const heartbeatGap = profile.load.heartbeatGapMs ?? profile.load.maxHeartbeatGapMs;
    if (!Number.isFinite(heartbeatGap) || heartbeatGap! >= limits.maxP95HeartbeatGapMs) {
      failures.push({
        workflow: 'load',
        metric: 'heartbeatGap',
        observedValue: heartbeatGap ?? Number.NaN,
        limit: limits.maxP95HeartbeatGapMs,
        message: `Load heartbeat delay ${heartbeatGap}ms is missing, nonfinite, or at or above limit of ${limits.maxP95HeartbeatGapMs}ms`,
      });
    }
    const loadLongTaskLimit = limits.maxLoadLongTaskMs ?? limits.maxInteractionLongTaskMs;
    for (const lt of profile.load.longTasksMs) {
      if (lt > loadLongTaskLimit) {
        failures.push({
          workflow: 'load',
          metric: 'longTask',
          observedValue: lt,
          limit: loadLongTaskLimit,
          message: `Load triggered Long Task of ${lt}ms, exceeding limit of ${loadLongTaskLimit}ms`,
        });
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    workflows: workflowEvals,
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('assertBrowserProfile.ts')) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx scripts/scalability/assertBrowserProfile.ts <profile.json>');
    process.exit(1);
  }

  const raw = readFileSync(filePath, 'utf8');
  const profile: BrowserProfile = JSON.parse(raw);
  const result = evaluateBrowserProfile(profile);

  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) {
    console.error(`\n❌ Acceptance Gate FAILED with ${result.failures.length} violation(s):`);
    for (const f of result.failures) {
      console.error(`  - [${f.workflow}] ${f.message}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ All browser responsiveness gates PASSED.');
  }
}
