import { describe, it, expect } from 'vitest';
import { runHilSuite } from './hilOrchestrator.js';
import type { HilFixtureManifest } from './hilFixture.js';

describe('hilOrchestrator', () => {
  const fixture: HilFixtureManifest = {
    fixtureId: 'stm32f407vgt6-v1',
    revision: '1.0.0',
    hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    wiring: [],
    sampleRateHz: 1000,
    timingToleranceMs: 5,
  };

  it('returns NOT_RUN when no matching physical fixture is connected', async () => {
    const result = await runHilSuite(
      { status: 'disconnected' },
      [],
      [],
      null,
    );
    expect(result).toEqual({ status: 'NOT_RUN', reason: 'HARDWARE_NOT_CONNECTED' });
  });

  it('orchestrates suite when connected and creates EXTERNAL_HIL_VERIFIED evidence on parity', async () => {
    const expected = [{ tick: 0, states: { s: 'Idle' }, variables: {} }];
    const result = await runHilSuite(
      { status: 'connected' },
      [{ tick: 0, inputs: {} }],
      expected,
      fixture,
      { mockActualTrace: expected },
    );

    expect(result.status).toBe('EXTERNAL_HIL_VERIFIED');
    if (result.status === 'EXTERNAL_HIL_VERIFIED') {
      expect(result.comparison.passed).toBe(true);
    }
  });
});
