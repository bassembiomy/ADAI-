/**
 * Acceptance tests — code generation evaluates parameter expressions like the simulation and rejects invalid ones.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-parameter-errors.md
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type { XBPersistedModelV1, XBTargetCapabilities } from './xbModel';
import { buildXBSemanticModel } from './xbSemanticBuilder';
import { validateXBModel } from './xbSemanticValidator';
import { createXBRuntime, stepXBState } from './xbInterpreter';

const target: XBTargetCapabilities = {
  supportsFloat16: false, supportsFloat32: true, supportsFloat64: true, supportsMathLibrary: true,
  maxVectorLength: 16, maxMatrixDimension: 8, embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};
const port = (p: any) => ({ id: p.id, direction: p.direction, shape: 'scalar', dataType: 'float64' });
const model = (gain: unknown): XBPersistedModelV1 => {
  const k = BLOCK_LIBRARY.Constant('k', { value: 1 });
  const g = BLOCK_LIBRARY.GAIN('g', {});
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'k', type: 'Constant', parameters: { ...(k.params as any), inputs: [], outputs: k.outputs.map(port) } },
      { id: 'g', type: 'GAIN', parameters: { ...(g.params as any), gain: gain as any, inputs: g.inputs.map(port), outputs: g.outputs.map(port) } },
    ],
    edges: [{ id: 'e', sourceNodeId: 'k', sourcePortId: 'out', targetNodeId: 'g', targetPortId: 'u' }],
    mappings: [],
    solver: { kind: 'discrete', stepSeconds: 0.01 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
};

describe('embedded parameter expressions', () => {
  it('evaluates 2*pi like the simulation', () => {
    expect(validateXBModel(model('2*pi'), {}, target).filter((d) => d.severity === 'error')).toEqual([]);
    const r = buildXBSemanticModel({ stateId: 's', model: model('2*pi'), variables: {}, target, baseTickMs: 10 });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const rt = createXBRuntime(r.ir!);
    stepXBState(rt, {});
    expect(Number(rt.signals['g:y'][0])).toBeCloseTo(2 * Math.PI, 6);
  });

  it('rejects text that is not a valid expression', () => {
    for (const bad of ['abc', '', '1.2.3']) {
      const codes = validateXBModel(model(bad), {}, target).map((d) => d.code);
      expect(codes, JSON.stringify(bad)).toContain('XB_PARAMETER_INVALID');
    }
  });
});
