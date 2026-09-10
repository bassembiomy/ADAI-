/**
 * Performance measurement and instrumentation utilities for large SysML models.
 */

export interface PerformanceMeasurement<T> {
  label: string;
  result: T;
  durationMs: number;
  heapDeltaBytes?: number;
  heapUsedBytes?: number;
  longTaskCount?: number;
  longTasks?: Array<{ durationMs: number; startTimeMs: number }>;
}

export interface MeasureOptions {
  trackHeap?: boolean;
  trackLongTasks?: boolean;
  longTaskThresholdMs?: number; // default 50ms
}

function getHeapUsed(): number | undefined {
  if (typeof process !== 'undefined' && process.memoryUsage && typeof process.memoryUsage === 'function') {
    try {
      return process.memoryUsage().heapUsed;
    } catch {
      // Ignore if unavailable
    }
  }
  const perf = typeof performance !== 'undefined' ? (performance as any) : undefined;
  if (perf?.memory && typeof perf.memory.usedJSHeapSize === 'number') {
    return perf.memory.usedJSHeapSize;
  }
  return undefined;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || isNaN(bytes)) return 'N/A';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KB`;
  if (abs < 1024 * 1024 * 1024) return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
  return `${sign}${(abs / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Measure synchronous execution of a function with duration, heap delta, and long task detection.
 */
export function measureSync<T>(
  label: string,
  fn: () => T,
  options: MeasureOptions = {},
): PerformanceMeasurement<T> {
  const { trackHeap = true, longTaskThresholdMs = 50 } = options;
  const startHeap = trackHeap ? getHeapUsed() : undefined;
  const startTime = performance.now();

  const result = fn();

  const endTime = performance.now();
  const endHeap = trackHeap ? getHeapUsed() : undefined;
  const durationMs = endTime - startTime;

  const heapDeltaBytes = (startHeap !== undefined && endHeap !== undefined) ? endHeap - startHeap : undefined;
  const isLongTask = durationMs >= longTaskThresholdMs;
  const longTasks = isLongTask ? [{ durationMs, startTimeMs: startTime }] : [];

  return {
    label,
    result,
    durationMs,
    heapDeltaBytes,
    heapUsedBytes: endHeap,
    longTaskCount: longTasks.length,
    longTasks,
  };
}

/**
 * Measure asynchronous execution of a promise-returning function.
 */
export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  options: MeasureOptions = {},
): Promise<PerformanceMeasurement<T>> {
  const { trackHeap = true, longTaskThresholdMs = 50 } = options;
  const startHeap = trackHeap ? getHeapUsed() : undefined;
  const startTime = performance.now();

  const result = await fn();

  const endTime = performance.now();
  const endHeap = trackHeap ? getHeapUsed() : undefined;
  const durationMs = endTime - startTime;

  const heapDeltaBytes = (startHeap !== undefined && endHeap !== undefined) ? endHeap - startHeap : undefined;
  const isLongTask = durationMs >= longTaskThresholdMs;
  const longTasks = isLongTask ? [{ durationMs, startTimeMs: startTime }] : [];

  return {
    label,
    result,
    durationMs,
    heapDeltaBytes,
    heapUsedBytes: endHeap,
    longTaskCount: longTasks.length,
    longTasks,
  };
}
