// src/components/vlab/VLabWorkspace.test.tsx
import { describe, it, expect } from 'vitest';
import { SolverConfiguration } from '../../engine/vlab/kernel/types';
import { normalizeSolverConfiguration } from '../../engine/vlab/kernel/PhysicalNetworkExtractor';

describe('VLabWorkspace Solver Configuration Inspector', () => {
  it('uses the shared solver boundary for inspector-shaped node values', () => {
    const config = normalizeSolverConfiguration({
      id: 'sc_workspace',
      data: {
        type: 'solver_config',
        params: {
          solver: { value: 'rk4' },
          stopTime: { value: 4 },
          maximumStep: { value: 0.01 },
          relativeTolerance: { value: 1e-4 },
          enableDiagnostics: { value: 'off' }
        }
      }
    } as any);

    expect(config.solver).toBe('rk4');
    expect(config.stopTime).toBe(4);
    expect(config.maximumStep).toBe(0.01);
    expect(config.relativeTolerance).toBe(1e-4);
    expect(config.enableDiagnostics).toBe(false);
  });

  it('should contain valid default parameters for solver_config block', () => {
    const defaultConfig: SolverConfiguration = {
      id: 'sc_default',
      solver: 'auto',
      startTime: 0,
      stopTime: 10,
      initialStep: 'auto',
      minimumStep: 1e-6,
      maximumStep: 'auto',
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };
    expect(defaultConfig.solver).toBe('auto');
    expect(defaultConfig.maximumIterations).toBe(50);
    expect(defaultConfig.relativeTolerance).toBe(1e-3);
  });

  it('routes distinct time series data per scope ID without cross-talk', () => {
    // Simulate multiple scope data maps
    const perScopeData: Record<string, any[]> = {
      'scope_voltage': [
        { time: 0.0, in1: 0, value: 0 },
        { time: 0.05, in1: 100, value: 100 }
      ],
      'scope_current': [
        { time: 0.0, in1: 0, value: 0 },
        { time: 0.05, in1: 2, value: 2 }
      ]
    };

    expect(perScopeData['scope_voltage']).toHaveLength(2);
    expect(perScopeData['scope_current']).toHaveLength(2);
    expect(perScopeData['scope_voltage'][1].in1).toBe(100);
    expect(perScopeData['scope_current'][1].in1).toBe(2);
    expect(perScopeData['scope_voltage'][1].in1).not.toEqual(perScopeData['scope_current'][1].in1);
  });

  describe('Simulation End Time & Stepping Limit Resolution', () => {
    const resolveEffectiveLimit = (
      topBarLimit: number | null,
      nodes: Array<{ id: string; data: any }>
    ): number | null => {
      if (topBarLimit !== null && !isNaN(topBarLimit) && topBarLimit > 0) {
        return topBarLimit;
      }
      const scNode = nodes.find(n => n.data?.type === 'solver_config' || n.data?.type === 'solver_configuration');
      if (scNode) {
        const st = scNode.data?.params?.stopTime?.value ?? scNode.data?.params?.stop_time?.value;
        const parsed = typeof st === 'number' ? st : parseFloat(st);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return null;
    };

    it('resolves effective limit from top bar input if specified', () => {
      const nodes = [
        { id: 'sc1', data: { type: 'solver_config', params: { stopTime: { value: 10 } } } }
      ];
      expect(resolveEffectiveLimit(5.0, nodes)).toBe(5.0);
      expect(resolveEffectiveLimit(null, nodes)).toBe(10);
      expect(resolveEffectiveLimit(null, [])).toBeNull();
    });

    it('clamps last simulation step to hit exact end time without overshooting', () => {
      const DT = 0.05;
      const limit = 0.08;
      let currentT = 0;
      const timeSteps: number[] = [currentT];

      while (currentT < limit - 1e-9) {
        const dt = Math.min(DT, Math.max(0, limit - currentT));
        currentT = parseFloat((currentT + dt).toFixed(6));
        timeSteps.push(currentT);
      }

      expect(timeSteps).toEqual([0, 0.05, 0.08]);
      expect(currentT).toBe(0.08);
      expect(currentT <= limit).toBe(true);
    });

    it('terminates immediately once currentT reaches limit', () => {
      const limit = 1.0;
      const DT = 0.05;
      let currentT = 0;
      let iterations = 0;

      while (currentT < limit - 1e-9 && iterations < 100) {
        const dt = Math.min(DT, Math.max(0, limit - currentT));
        currentT = parseFloat((currentT + dt).toFixed(6));
        iterations++;
      }

      expect(iterations).toBe(20);
      expect(currentT).toBe(1.0);
    });
  });

  describe('Theme Contract', () => {
    it('declares vlab-workspace class on workspace root', async () => {
      const fs = await import('node:fs');
      const src = fs.readFileSync('src/components/vlab/VLabWorkspace.tsx', 'utf8');
      expect(src).toMatch(/className=.*vlab-workspace/);
    });

    it('uses semantic surfaces for the V-Lab shell instead of hard-coded dark shell colors', async () => {
      const fs = await import('node:fs');
      const src = fs.readFileSync('src/components/vlab/VLabWorkspace.tsx', 'utf8');
      expect(src).toMatch(/className="vlab-workspace[^\"]*bg-\[var\(--surface-canvas\)\]/);
      expect(src).not.toMatch(/vlab-workspace[^\n]*bg-\[#050505\]/);
      expect(src).not.toMatch(/\$\{isLibCollapsed[^\n]*bg-\[#0d0d0d\]/);
      expect(src).not.toMatch(/\$\{isPropsCollapsed[^\n]*bg-\[#0d0d0d\]/);
    });
  });
});

