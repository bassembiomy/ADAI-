// src/engine/vlab/kernel/InitializationEngine.test.ts
import { describe, it, expect } from 'vitest';
import { InitializationEngine } from './InitializationEngine';
import { CompiledPhysicalSystem } from './types';

describe('InitializationEngine', () => {
  const engine = new InitializationEngine();

  it('should initialize dynamic states and solve algebraic consistency at t=0', () => {
    const system: CompiledPhysicalSystem = {
      id: 'sys',
      domains: ['electrical'],
      stateCount: 2,
      algebraicCount: 0,
      totalSize: 2,
      isDifferentialState: [true, true],
      variableNames: ['V_C', 'I_L'],
      residual: (t, x, dx, z, ctx, out) => {
        out[0] = dx[0] - x[1];
        out[1] = dx[1] - (10 - x[0] - 100 * x[1]);
      }
    };

    const { x0, diagnostics } = engine.initialize(system, [
      { variableId: 'V_C', value: 0, source: 'user', priority: 1 },
      { variableId: 'I_L', value: 0, source: 'user', priority: 1 }
    ]);

    expect(x0[0]).toBe(0);
    expect(x0[1]).toBe(0);
    expect(diagnostics.length).toBe(0);
  });
});
