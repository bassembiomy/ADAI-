import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordRenderCommit,
  getRenderTelemetry,
  clearRenderTelemetry,
  isRenderTelemetryEnabled,
  setRenderTelemetryEnabledForTesting,
  type RenderCommitEntry,
} from './renderTelemetry';

describe('renderTelemetry', () => {
  beforeEach(() => {
    clearRenderTelemetry();
    setRenderTelemetryEnabledForTesting(false);
  });

  it('is inert when perfTelemetry is disabled', () => {
    expect(isRenderTelemetryEnabled()).toBe(false);
    recordRenderCommit('workspace', 'update', 25);
    recordRenderCommit('canvas', 'update', 40);
    const telemetry = getRenderTelemetry();
    expect(telemetry.entries).toHaveLength(0);
    expect(telemetry.renderCountsByArea.workspace).toBe(0);
    expect(telemetry.renderCountsByArea.canvas).toBe(0);
  });

  it('records commits and increments counts when enabled', () => {
    setRenderTelemetryEnabledForTesting(true);
    expect(isRenderTelemetryEnabled()).toBe(true);

    recordRenderCommit('canvas', 'mount', 15.5);
    recordRenderCommit('canvas', 'update', 22.3);
    recordRenderCommit('explorer', 'update', 8.1);

    const telemetry = getRenderTelemetry();
    expect(telemetry.entries).toHaveLength(3);
    expect(telemetry.entries[0]).toMatchObject({
      area: 'canvas',
      phase: 'mount',
      actualDurationMs: 15.5,
    });
    expect(telemetry.renderCountsByArea.canvas).toBe(2);
    expect(telemetry.renderCountsByArea.explorer).toBe(1);
    expect(telemetry.renderCountsByArea.workspace).toBe(0);
  });

  it('enforces a bounded 500-entry buffer (drops oldest on overflow)', () => {
    setRenderTelemetryEnabledForTesting(true);
    for (let i = 0; i < 550; i++) {
      recordRenderCommit('workspace', 'update', i);
    }

    const telemetry = getRenderTelemetry();
    expect(telemetry.entries).toHaveLength(500);
    // Oldest 50 entries (0..49) dropped; first remaining is i = 50
    expect(telemetry.entries[0].actualDurationMs).toBe(50);
    expect(telemetry.entries[499].actualDurationMs).toBe(549);
    expect(telemetry.renderCountsByArea.workspace).toBe(550);
  });

  it('clears buffer and reset counts on clearRenderTelemetry', () => {
    setRenderTelemetryEnabledForTesting(true);
    recordRenderCommit('inspector', 'update', 12);
    clearRenderTelemetry();

    const telemetry = getRenderTelemetry();
    expect(telemetry.entries).toHaveLength(0);
    expect(telemetry.renderCountsByArea.inspector).toBe(0);
  });
});
