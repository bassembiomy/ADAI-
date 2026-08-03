import { describe, it, expect } from 'vitest';
import { validateHilFixture, type HilFixtureManifest } from './hilFixture';

describe('hilFixture', () => {
  it('validates a complete HIL fixture manifest and returns success', () => {
    const fixture: HilFixtureManifest = {
      fixtureId: 'stm32f407vgt6-v1',
      revision: '1.0.0',
      hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      wiring: [
        { channelId: 'motor_pwm', direction: 'Out', pin: 'PD12', loadOhms: 100 },
      ],
      sampleRateHz: 1000,
      timingToleranceMs: 5,
    };

    const result = validateHilFixture(fixture);
    expect(result.valid).toBe(true);
  });

  it('rejects incomplete fixture manifest missing revision or hash', () => {
    const invalidFixture = {
      fixtureId: 'bad-fixture',
      wiring: [],
    };

    const result = validateHilFixture(invalidFixture);
    expect(result.valid).toBe(false);
  });
});
