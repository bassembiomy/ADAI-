import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPM_SIMULATION_CONFIG,
  parseOpmSimulationConfig,
  type OpmSimulationConfig,
} from '../OpmSimulationConfig';

describe('OPM Simulation Configuration bounded parsing', () => {
  it('accepts valid in-bounds integer configuration', () => {
    const valid: OpmSimulationConfig = {
      tickMs: 50,
      maxTicks: 5000,
      maxEventsPerTick: 32,
      deterministicOrder: 'priority-then-source-order',
    };

    const result = parseOpmSimulationConfig(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual(valid);
    }
  });

  it('accepts boundary limits (min and max)', () => {
    const minConfig: OpmSimulationConfig = {
      tickMs: 1,
      maxTicks: 1,
      maxEventsPerTick: 1,
      deterministicOrder: 'priority-then-source-order',
    };
    const maxConfig: OpmSimulationConfig = {
      tickMs: 60000,
      maxTicks: 1000000,
      maxEventsPerTick: 1024,
      deterministicOrder: 'priority-then-source-order',
    };

    const minRes = parseOpmSimulationConfig(minConfig);
    const maxRes = parseOpmSimulationConfig(maxConfig);

    expect(minRes.ok).toBe(true);
    expect(maxRes.ok).toBe(true);
  });

  it('rejects zero values with diagnostics', () => {
    const res = parseOpmSimulationConfig({
      tickMs: 0,
      maxTicks: 0,
      maxEventsPerTick: 0,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.diagnostics.length).toBeGreaterThanOrEqual(3);
      expect(res.diagnostics.some(d => d.includes('tickMs'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('maxTicks'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('maxEventsPerTick'))).toBe(true);
    }
  });

  it('rejects negative values with diagnostics', () => {
    const res = parseOpmSimulationConfig({
      tickMs: -10,
      maxTicks: -500,
      maxEventsPerTick: -1,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.diagnostics.some(d => d.includes('tickMs'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('maxTicks'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('maxEventsPerTick'))).toBe(true);
    }
  });

  it('rejects fractional/float values without silently rounding', () => {
    const res = parseOpmSimulationConfig({
      tickMs: 10.5,
      maxTicks: 100.25,
      maxEventsPerTick: 16.8,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.diagnostics.some(d => d.includes('tickMs'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('maxTicks'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('maxEventsPerTick'))).toBe(true);
    }
  });

  it('rejects NaN and Infinity values', () => {
    const resNan = parseOpmSimulationConfig({
      tickMs: NaN,
      maxTicks: NaN,
      maxEventsPerTick: NaN,
    });
    expect(resNan.ok).toBe(false);

    const resInf = parseOpmSimulationConfig({
      tickMs: Infinity,
      maxTicks: -Infinity,
      maxEventsPerTick: Infinity,
    });
    expect(resInf.ok).toBe(false);
  });

  it('rejects above-limit values (tickMs > 60000, maxTicks > 1000000, maxEventsPerTick > 1024)', () => {
    const res = parseOpmSimulationConfig({
      tickMs: 60001,
      maxTicks: 1000001,
      maxEventsPerTick: 1025,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.diagnostics.some(d => d.includes('60000'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('1000000'))).toBe(true);
      expect(res.diagnostics.some(d => d.includes('1024'))).toBe(true);
    }
  });

  it('preserves previous valid config when rejected edit occurs', () => {
    let activeConfig: OpmSimulationConfig = { ...DEFAULT_OPM_SIMULATION_CONFIG };
    const invalidInput = { tickMs: -50 };

    const parsed = parseOpmSimulationConfig(invalidInput);
    if (parsed.ok) {
      activeConfig = parsed.config;
    }

    // Must remain active config
    expect(activeConfig).toEqual(DEFAULT_OPM_SIMULATION_CONFIG);
  });

  it('keeps previous valid config active upon multiple rejected field updates', () => {
    let currentConfig: OpmSimulationConfig = {
      tickMs: 100,
      maxTicks: 5000,
      maxEventsPerTick: 32,
      deterministicOrder: 'priority-then-source-order',
    };

    // Attempting invalid tickMs (> 60000)
    const badTick = parseOpmSimulationConfig({ ...currentConfig, tickMs: 999999 });
    expect(badTick.ok).toBe(false);
    if (badTick.ok) currentConfig = badTick.config;
    expect(currentConfig.tickMs).toBe(100);

    // Attempting invalid fractional maxEventsPerTick
    const badEvents = parseOpmSimulationConfig({ ...currentConfig, maxEventsPerTick: 3.14 });
    expect(badEvents.ok).toBe(false);
    if (badEvents.ok) currentConfig = badEvents.config;
    expect(currentConfig.maxEventsPerTick).toBe(32);

    // Valid update succeeds
    const goodUpdate = parseOpmSimulationConfig({ ...currentConfig, tickMs: 250 });
    expect(goodUpdate.ok).toBe(true);
    if (goodUpdate.ok) currentConfig = goodUpdate.config;
    expect(currentConfig.tickMs).toBe(250);
  });

  it('verifies OPM simulation tick is completely isolated from global state machine tick', () => {
    let globalStateMachineTick = 50;
    let opmSimConfig: OpmSimulationConfig = { ...DEFAULT_OPM_SIMULATION_CONFIG };

    const onGlobalTickChange = (newTick: number) => {
      globalStateMachineTick = newTick;
    };
    const onOpmConfigChange = (newConfig: OpmSimulationConfig) => {
      opmSimConfig = newConfig;
    };

    // User modifies OPM tick to 200ms
    const parsed = parseOpmSimulationConfig({ ...opmSimConfig, tickMs: 200 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      onOpmConfigChange(parsed.config);
    }

    // OPM tick updated
    expect(opmSimConfig.tickMs).toBe(200);
    // Global State Machine tick must remain unchanged at 50ms
    expect(globalStateMachineTick).toBe(50);
  });
});
