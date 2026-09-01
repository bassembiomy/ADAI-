import { describe, it, expect } from 'vitest';
import {
  PhysicalPort,
  SolverConfiguration,
  Diagnostic
} from './types';

describe('V-Lab Kernel Core Types', () => {
  it('should instantiate valid PhysicalPort with variable collections', () => {
    const port: PhysicalPort = {
      id: 'p1',
      name: 'Positive',
      domain: 'electrical',
      variables: [
        { id: 'v', name: 'Voltage', symbol: 'V', unit: 'V', role: 'across' },
        { id: 'i', name: 'Current', symbol: 'I', unit: 'A', role: 'through' }
      ]
    };
    expect(port.domain).toBe('electrical');
    expect(port.variables.length).toBe(2);
  });

  it('should instantiate valid SolverConfiguration with default parameters', () => {
    const config: SolverConfiguration = {
      id: 'sc1',
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
    expect(config.solver).toBe('auto');
    expect(config.maximumIterations).toBe(50);
  });

  it('should structure Diagnostic with deterministic fields', () => {
    const diag: Diagnostic = {
      id: 'VL-REF-001',
      severity: 'ERROR',
      message: 'Electrical network has no electrical reference.',
      componentIds: ['resistor_1'],
      networkId: 'PhysicalNetwork_electrical_01',
      suggestedAction: 'Add an Electrical Reference block.'
    };
    expect(diag.id).toBe('VL-REF-001');
    expect(diag.severity).toBe('ERROR');
  });
});
