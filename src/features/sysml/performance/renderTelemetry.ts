export type RenderArea = 'workspace' | 'canvas' | 'explorer' | 'inspector';
export type RenderPhase = 'mount' | 'update' | 'nested-update';

export interface RenderCommitEntry {
  area: RenderArea;
  phase: RenderPhase;
  actualDurationMs: number;
  timestamp: number;
}

export interface RenderTelemetrySnapshot {
  entries: RenderCommitEntry[];
  renderCountsByArea: Record<RenderArea, number>;
}

const MAX_BUFFER_SIZE = 500;
const buffer: RenderCommitEntry[] = [];
const renderCounts: Record<RenderArea, number> = {
  workspace: 0,
  canvas: 0,
  explorer: 0,
  inspector: 0,
};

let testEnabledOverride: boolean | null = null;

export function isRenderTelemetryEnabled(): boolean {
  if (testEnabledOverride !== null) return testEnabledOverride;
  if (typeof window === 'undefined') return false;
  if ((window as any).__ADIA_PERF_ENABLED__ === true) return true;
  try {
    const params = new URLSearchParams(window.location?.search ?? '');
    return params.get('perfTelemetry') === '1';
  } catch {
    return false;
  }
}

export function setRenderTelemetryEnabledForTesting(enabled: boolean | null): void {
  testEnabledOverride = enabled;
  if (typeof window !== 'undefined') {
    (window as any).__ADIA_PERF_ENABLED__ = enabled === true;
  }
}

export function recordRenderCommit(
  area: RenderArea,
  phase: RenderPhase,
  actualDurationMs: number
): void {
  if (!isRenderTelemetryEnabled()) return;

  renderCounts[area] = (renderCounts[area] ?? 0) + 1;

  if (buffer.length >= MAX_BUFFER_SIZE) {
    buffer.shift();
  }

  buffer.push({
    area,
    phase,
    actualDurationMs: Number(actualDurationMs.toFixed(2)),
    timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });
}

export function getRenderTelemetry(): RenderTelemetrySnapshot {
  return {
    entries: [...buffer],
    renderCountsByArea: { ...renderCounts },
  };
}

export function clearRenderTelemetry(): void {
  buffer.length = 0;
  renderCounts.workspace = 0;
  renderCounts.canvas = 0;
  renderCounts.explorer = 0;
  renderCounts.inspector = 0;
}

export function resetProjectLoadTelemetry(target: any, startTime: number): void {
  if (!target || target.__ADIA_PERF_ENABLED__ !== true) return;
  target.__profileTicks = [startTime];
  target.__profileLongTasks = [];
  target.__profileLoadStart = startTime;
}

// Expose on window for test hooks and automated runners
if (typeof window !== 'undefined') {
  (window as any).__ADIA_PERF__ = {
    recordRenderCommit,
    getRenderTelemetry,
    clearRenderTelemetry,
    isRenderTelemetryEnabled,
  };
}
