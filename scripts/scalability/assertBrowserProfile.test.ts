import { describe, it, expect } from 'vitest';
import {
  evaluateBrowserProfile,
  type BrowserProfile,
  type ProfileLimits,
} from './assertBrowserProfile';

describe('assertBrowserProfile evaluator', () => {
  it('rejects blocked load heartbeat from the standalone browser profiler', () => {
    const result = evaluateBrowserProfile({ size: 10000, timestamp: '', samplesCount: 5, workflows: {},
      load: { durationMs: 1000, maxHeartbeatGapMs: 800, longTasksMs: [] } });
    expect(result.passed).toBe(false);
  });

  it('rejects a load record without a finite heartbeat measurement', () => {
    const result = evaluateBrowserProfile({ size: 10000, timestamp: '', samplesCount: 5, workflows: {},
      load: { durationMs: 1000, longTasksMs: [] } });
    expect(result.passed).toBe(false);
  });
  const defaultLimits: ProfileLimits = {
    maxP95HeartbeatGapMs: 100,
    maxInteractionLongTaskMs: 100,
    maxHandlerP95Ms: 100,
  };

  it('passes when all workflows satisfy limits with 5 samples', () => {
    const profile: BrowserProfile = {
      size: 10000,
      timestamp: new Date().toISOString(),
      samplesCount: 5,
      workflows: {
        rename: {
          samples: [
            { handlerMs: 25, settleMs: 60, heartbeatGapMs: 45, longTasksMs: [] },
            { handlerMs: 28, settleMs: 65, heartbeatGapMs: 50, longTasksMs: [] },
            { handlerMs: 30, settleMs: 70, heartbeatGapMs: 55, longTasksMs: [] },
            { handlerMs: 32, settleMs: 75, heartbeatGapMs: 60, longTasksMs: [] },
            { handlerMs: 35, settleMs: 80, heartbeatGapMs: 65, longTasksMs: [] },
          ],
        },
        undo: {
          samples: [
            { handlerMs: 20, settleMs: 50, heartbeatGapMs: 40, longTasksMs: [] },
            { handlerMs: 22, settleMs: 52, heartbeatGapMs: 42, longTasksMs: [] },
            { handlerMs: 25, settleMs: 55, heartbeatGapMs: 45, longTasksMs: [] },
            { handlerMs: 28, settleMs: 58, heartbeatGapMs: 48, longTasksMs: [] },
            { handlerMs: 30, settleMs: 60, heartbeatGapMs: 50, longTasksMs: [] },
          ],
        },
      },
    };

    const result = evaluateBrowserProfile(profile, defaultLimits);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.workflows.rename.p95HeartbeatGapMs).toBe(65);
    expect(result.workflows.rename.p95HandlerMs).toBe(35);
  });

  it('fails when heartbeat delay is exactly at limit (must be strictly below)', () => {
    const profile: BrowserProfile = {
      size: 10000,
      timestamp: new Date().toISOString(),
      samplesCount: 5,
      workflows: {
        rename: {
          samples: [
            { handlerMs: 20, settleMs: 90, heartbeatGapMs: 80, longTasksMs: [] },
            { handlerMs: 20, settleMs: 90, heartbeatGapMs: 85, longTasksMs: [] },
            { handlerMs: 20, settleMs: 90, heartbeatGapMs: 90, longTasksMs: [] },
            { handlerMs: 20, settleMs: 95, heartbeatGapMs: 95, longTasksMs: [] },
            { handlerMs: 20, settleMs: 100, heartbeatGapMs: 100, longTasksMs: [] }, // exactly 100ms
          ],
        },
      },
    };

    const result = evaluateBrowserProfile(profile, defaultLimits);
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => f.metric === 'heartbeatGap' && f.observedValue === 100)).toBe(true);
  });

  it('fails when a fast handler is followed by a slow heartbeat delay', () => {
    const profile: BrowserProfile = {
      size: 10000,
      timestamp: new Date().toISOString(),
      samplesCount: 5,
      workflows: {
        rename: {
          samples: [
            { handlerMs: 15, settleMs: 250, heartbeatGapMs: 174, longTasksMs: [] },
            { handlerMs: 16, settleMs: 240, heartbeatGapMs: 180, longTasksMs: [] },
            { handlerMs: 18, settleMs: 260, heartbeatGapMs: 195, longTasksMs: [] },
            { handlerMs: 20, settleMs: 255, heartbeatGapMs: 210, longTasksMs: [] },
            { handlerMs: 22, settleMs: 270, heartbeatGapMs: 234, longTasksMs: [] },
          ],
        },
      },
    };

    const result = evaluateBrowserProfile(profile, defaultLimits);
    expect(result.passed).toBe(false);
    expect(result.workflows.rename.p95HandlerMs).toBeLessThan(100);
    expect(result.workflows.rename.p95HeartbeatGapMs).toBeGreaterThan(100);
    expect(result.failures.some(f => f.workflow === 'rename' && f.metric === 'heartbeatGap')).toBe(true);
  });

  it('fails when an interaction triggers a long task above 100 ms', () => {
    const profile: BrowserProfile = {
      size: 10000,
      timestamp: new Date().toISOString(),
      samplesCount: 5,
      workflows: {
        'property-edit': {
          samples: [
            { handlerMs: 30, settleMs: 140, heartbeatGapMs: 70, longTasksMs: [125] },
            { handlerMs: 32, settleMs: 90, heartbeatGapMs: 60, longTasksMs: [] },
            { handlerMs: 35, settleMs: 95, heartbeatGapMs: 65, longTasksMs: [] },
            { handlerMs: 38, settleMs: 100, heartbeatGapMs: 70, longTasksMs: [] },
            { handlerMs: 40, settleMs: 105, heartbeatGapMs: 75, longTasksMs: [] },
          ],
        },
      },
    };

    const result = evaluateBrowserProfile(profile, defaultLimits);
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => f.workflow === 'property-edit' && f.metric === 'longTask' && f.observedValue === 125)).toBe(true);
  });

  it('fails when initial load blocks the heartbeat or creates a long task', () => {
    const profile: BrowserProfile = {
      size: 10000,
      timestamp: new Date().toISOString(),
      samplesCount: 5,
      workflows: {},
      load: {
        durationMs: 2000,
        heartbeatGapMs: 956,
        longTasksMs: [951],
      },
    };

    const result = evaluateBrowserProfile(profile, defaultLimits);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ workflow: 'load', metric: 'heartbeatGap', observedValue: 956 }),
      expect.objectContaining({ workflow: 'load', metric: 'longTask', observedValue: 951 }),
    ]));
  });

  it('computes 5-sample p95 correctly using standard percentile logic', () => {
    const profile: BrowserProfile = {
      size: 10000,
      timestamp: new Date().toISOString(),
      samplesCount: 5,
      workflows: {
        undo: {
          samples: [
            { handlerMs: 10, settleMs: 40, heartbeatGapMs: 20, longTasksMs: [] },
            { handlerMs: 20, settleMs: 50, heartbeatGapMs: 30, longTasksMs: [] },
            { handlerMs: 30, settleMs: 60, heartbeatGapMs: 40, longTasksMs: [] },
            { handlerMs: 40, settleMs: 70, heartbeatGapMs: 50, longTasksMs: [] },
            { handlerMs: 50, settleMs: 80, heartbeatGapMs: 90, longTasksMs: [] },
          ],
        },
      },
    };

    const result = evaluateBrowserProfile(profile, defaultLimits);
    // In a 5-element array sorted [20, 30, 40, 50, 90], p95 targets the top sample (90)
    expect(result.workflows.undo.p95HeartbeatGapMs).toBe(90);
    expect(result.workflows.undo.p95HandlerMs).toBe(50);
  });
});
