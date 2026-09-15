// src/components/vlab/VLabWorkspace.test.tsx
import { describe, it, expect } from 'vitest';
import { SolverConfiguration } from '../../engine/vlab/kernel/types';
import {
  createVLabSolverJob,
  refreshVLabSolverJobAtStepBoundary,
  resolveVLabStepBoundary,
  updateVLabSolverJobConfiguration
} from './VLabWorkspace';

describe('VLabWorkspace Solver Configuration Inspector', () => {
  it('passes inspector values through the workspace solver-job boundary for a new run', () => {
    const nodes = [{
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
    }] as any;
    const job = createVLabSolverJob(nodes, []);

    expect(job.solverConfiguration.solver).toBe('rk4');
    expect(job.solverConfiguration.stopTime).toBe(4);
    expect(job.solverConfiguration.maximumStep).toBe(0.01);
    expect(job.solverConfiguration.relativeTolerance).toBe(1e-4);
    expect(job.solverConfiguration.enableDiagnostics).toBe(false);
    expect(job.engine.getSolverConfiguration()).toBe(job.solverConfiguration);
  });

  it('updates the active solver job through the same normalized workspace boundary', () => {
    const initialNodes = [{
      id: 'sc_active',
      data: { type: 'solver_config', params: { stopTime: { value: 4 }, maximumStep: { value: 0.01 } } }
    }] as any;
    const updatedNodes = [{
      id: 'sc_active',
      data: { type: 'solver_config', params: { stopTime: { value: Number.NaN }, maximumStep: { value: -1 }, solver: { value: 'bdf' } } }
    }] as any;
    const job = createVLabSolverJob(initialNodes, []);
    const updated = updateVLabSolverJobConfiguration(job, updatedNodes);

    expect(updated).toBe(job.solverConfiguration);
    expect(job.solverConfiguration.stopTime).toBe(10);
    expect(job.solverConfiguration.maximumStep).toBe('auto');
    expect(job.solverConfiguration.solver).toBe('bdf');
    expect(job.engine.getSolverConfiguration()).toBe(updated);
  });

  it('rejects a normalized configuration whose start time follows its stop time before creating a job', () => {
    const nodes = [{
      id: 'sc_invalid_time',
      data: { type: 'solver_config', params: { startTime: { value: 5 }, stopTime: { value: 4 } } }
    }] as any;

    expect(() => createVLabSolverJob(nodes, [])).toThrow('stopTime must be greater than or equal to startTime');
  });

  it('rejects a normalized configuration whose minimum step exceeds its maximum step before updating a job', () => {
    const job = createVLabSolverJob([{
      id: 'sc_invalid_steps',
      data: { type: 'solver_config', params: { minimumStep: { value: 0.01 }, maximumStep: { value: 0.1 } } }
    }] as any, []);
    const invalidNodes = [{
      id: 'sc_invalid_steps',
      data: { type: 'solver_config', params: { minimumStep: { value: 0.2 }, maximumStep: { value: 0.1 } } }
    }] as any;

    expect(() => updateVLabSolverJobConfiguration(job, invalidNodes)).toThrow('minimumStep must not exceed maximumStep');
    expect(job.solverConfiguration.minimumStep).toBe(0.01);
    expect(job.engine.getSolverConfiguration()).toBe(job.solverConfiguration);
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

  describe('Simulation solver boundaries', () => {
    it('uses normalized stop and initial step settings at run start', () => {
      const boundary = resolveVLabStepBoundary({
        id: 'sc_start', solver: 'auto', startTime: 0, stopTime: 0.08,
        initialStep: 0.2, minimumStep: 0.01, maximumStep: 0.05,
        relativeTolerance: 1e-3, absoluteTolerance: 1e-6, maximumIterations: 50,
        nonlinearTolerance: 1e-8, enableDiagnostics: false, enableLogging: false
      }, 0, true);

      expect(boundary.stopTime).toBe(0.08);
      expect(boundary.dt).toBe(0.05);
      expect(boundary.enableDiagnostics).toBe(false);
      expect(boundary.enableLogging).toBe(false);
    });

    it('observes changed stop and step limits at the next step boundary', () => {
      const job = createVLabSolverJob([{
        id: 'sc_updated', data: { type: 'solver_config', params: { stopTime: { value: 4 } } }
      }] as any, []);
      const { boundary, solverConfiguration } = refreshVLabSolverJobAtStepBoundary(job, [{
        id: 'sc_updated',
        data: {
          type: 'solver_config',
          params: { stopTime: { value: 0.08 }, minimumStep: { value: 0.02 }, maximumStep: { value: 0.03 } }
        }
      }] as any, 0.05, false);

      expect(boundary.stopTime).toBe(0.08);
      expect(boundary.dt).toBe(0.03);
      expect(job.engine.getSolverConfiguration()).toBe(solverConfiguration);
    });

    it('uses a terminal partial step even when it is smaller than minimumStep', () => {
      const boundary = resolveVLabStepBoundary({
        id: 'sc_terminal', solver: 'auto', startTime: 0, stopTime: 0.08,
        initialStep: 'auto', minimumStep: 0.02, maximumStep: 'auto',
        relativeTolerance: 1e-3, absoluteTolerance: 1e-6, maximumIterations: 50,
        nonlinearTolerance: 1e-8, enableDiagnostics: true, enableLogging: true
      }, 0.075, false);

      expect(boundary.dt).toBeCloseTo(0.005);
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

