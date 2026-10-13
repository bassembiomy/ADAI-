import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HILTelemetryBuffer, type TelemetryFlushSnapshot } from './hilTelemetryBuffer';

describe('HILTelemetryBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches multiple incoming samples into one bounded UI flush preserving order', () => {
    const onFlush = vi.fn();
    const buffer = new HILTelemetryBuffer({
      maxDisplayPoints: 5,
      flushIntervalMs: 50,
      onFlush,
    });

    const t0 = 1000;
    // Push 10 samples in rapid succession
    for (let i = 0; i < 10; i++) {
      buffer.pushSample({
        timestamp: t0 + i * 5,
        values: { speed: i * 10, voltage: 3.3 + i * 0.1 },
      });
    }

    // Flush should not have happened synchronously
    expect(onFlush).not.toHaveBeenCalled();

    // Advance timer to trigger flush interval
    vi.advanceTimersByTime(50);

    // Exactly one flush occurred
    expect(onFlush).toHaveBeenCalledTimes(1);

    const snapshot: TelemetryFlushSnapshot = onFlush.mock.calls[0][0];
    // Bounded to maxDisplayPoints (last 5 points)
    expect(snapshot.timestamps.length).toBe(5);
    expect(snapshot.timestamps).toEqual([
      t0 + 5 * 5,
      t0 + 6 * 5,
      t0 + 7 * 5,
      t0 + 8 * 5,
      t0 + 9 * 5,
    ]);

    // Values in plotData are bounded and preserve order
    expect(snapshot.plotData['speed']).toEqual([50, 60, 70, 80, 90]);
    // Latest values correspond to the last sample
    expect(snapshot.latestValues['speed']).toBe(90);
    expect(snapshot.latestValues['voltage']).toBeCloseTo(4.2, 5);

    buffer.dispose();
  });

  it('separates bounded display history from full recording history', () => {
    const buffer = new HILTelemetryBuffer({
      maxDisplayPoints: 3,
      flushIntervalMs: 16,
    });

    buffer.startRecording();
    for (let i = 1; i <= 6; i++) {
      buffer.pushSample({
        timestamp: 1000 + i * 10,
        values: { rpm: i * 100 },
      });
    }

    const snapshot = buffer.flush();
    // Display is bounded to 3
    expect(snapshot.timestamps.length).toBe(3);
    expect(snapshot.plotData['rpm']).toEqual([400, 500, 600]);

    // Recording retains all 6 samples
    const recorded = buffer.getRecordedData();
    expect(recorded.length).toBe(6);
    expect(recorded.map(r => r.values.rpm)).toEqual([100, 200, 300, 400, 500, 600]);

    buffer.dispose();
  });

  it('clears display and recorded buffers cleanly', () => {
    const buffer = new HILTelemetryBuffer({
      maxDisplayPoints: 10,
    });

    buffer.startRecording();
    buffer.pushSample({ timestamp: 1000, values: { temp: 25 } });
    expect(buffer.getRecordedData().length).toBe(1);

    buffer.clear();
    const snapshot = buffer.flush();
    expect(snapshot.timestamps.length).toBe(0);
    expect(snapshot.latestValues).toEqual({});
    expect(buffer.getRecordedData().length).toBe(0);

    buffer.dispose();
  });
});
