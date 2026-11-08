/**
 * Acceptance tests — discrete solver in the embedded path (semantic model, interpreter, generated C).
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-discrete-solver-start-stop.md
 *
 * Contract:
 *  - XBSolverKind gains 'discrete' (fixed-step, no continuous states).
 *  - adaptXBModel accepts { kind: 'discrete', stepSeconds }.
 *  - validateXBModel reports XB_DISCRETE_SOLVER_CONTINUOUS_STATE (error) for any block with continuous states
 *    (e.g. INTEGRATOR_CONTINUOUS, Integrator, continuous TRANSFER_FUNCTION / STATE_SPACE) when kind is 'discrete'.
 *  - Interpreter and generated C perform no continuous integration for 'discrete': discrete blocks give the same
 *    result as under 'euler', and sm_core.c contains no Euler/RK4 integration stage.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { SemanticVariable } from './smSemanticModel';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type { XBNodeV1, XBParameterValue, XBPersistedModelV1, XBTargetCapabilities } from './xbModel';
import { adaptXBModel } from './xbModelAdapter';
import { buildXBSemanticModel } from './xbSemanticBuilder';
import { validateXBModel } from './xbSemanticValidator';
import { createXBRuntime, stepXBState } from './xbInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { hybridXBridgesFixture } from './smFixtures';

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: true,
  supportsMathLibrary: true,
  maxVectorLength: 16,
  maxMatrixDimension: 8,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};
const variables: Readonly<Record<string, SemanticVariable>> = {};

const node = (type: string, id: string, params: Record<string, unknown> = {}): XBNodeV1 => {
  const block = BLOCK_LIBRARY[type](id, params);
  const portOf = (port: (typeof block.outputs)[number]) => ({ id: port.id, direction: port.direction, shape: 'scalar', dataType: 'float32' });
  return {
    id,
    type,
    parameters: {
      ...(block.params as Record<string, XBParameterValue>),
      inputs: block.inputs.map(portOf),
      outputs: block.outputs.map(portOf),
    },
  };
};
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) =>
  ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

const model = (kind: string, nodes: XBNodeV1[], edges: ReturnType<typeof edge>[] = []): XBPersistedModelV1 => ({
  schemaVersion: 1,
  nodes,
  edges,
  mappings: [],
  solver: { kind: kind as any, stepSeconds: 0.01 },
  policy: { memory: 'reset', numericFault: 'escalate' },
});

const accumulator = (kind: string) => model(kind, [
  node('Constant', 'k', { value: 2 }),
  node('INTEGRATOR_DISCRETE', 'di', { sample_time: 0.01 }),
], [edge('e1', 'k', 'out', 'di', 'u')]);

describe('discrete solver — model and validation', () => {
  it('adaptXBModel accepts the discrete solver', () => {
    const result = adaptXBModel({ ...accumulator('discrete') });
    expect(result.diagnostics).toEqual([]);
    expect(result.model?.solver.kind).toBe('discrete');
  });

  it('rejects continuous states with the discrete solver', () => {
    const codes = validateXBModel(model('discrete', [
      node('Constant', 'k', { value: 1 }),
      node('INTEGRATOR_CONTINUOUS', 'i'),
    ], [edge('e1', 'k', 'out', 'i', 'u')]), variables, target).map((d) => d.code);
    expect(codes).toContain('XB_DISCRETE_SOLVER_CONTINUOUS_STATE');
  });

  it('accepts a purely discrete model', () => {
    const codes = validateXBModel(accumulator('discrete'), variables, target).map((d) => d.code);
    expect(codes).not.toContain('XB_DISCRETE_SOLVER_CONTINUOUS_STATE');
    expect(codes).not.toContain('XB_SAMPLE_TIME_INVALID');
  });
});

describe('discrete solver — interpreter', () => {
  it('gives the same discrete results as the Euler solver', () => {
    const trace = (kind: string) => {
      const result = buildXBSemanticModel({ stateId: 'controller', model: accumulator(kind), variables, target, baseTickMs: 10 });
      expect(result.diagnostics).toEqual([]);
      expect(result.ir!.solver.kind).toBe(kind);
      const runtime = createXBRuntime(result.ir!);
      const values: number[] = [];
      for (let i = 0; i < 5; i++) {
        stepXBState(runtime, {});
        values.push(Number(runtime.signals['di:y'][0]));
      }
      return values;
    };
    const discrete = trace('discrete');
    expect(discrete).toEqual(trace('euler'));
    expect(discrete[4]).toBeGreaterThan(0);
  });
});

describe('discrete solver — generated C', () => {
  const generate = (kind: string) => {
    const m = hybridXBridgesFixture();
    m.states[1].xBridgesModel = accumulator(kind);
    const result = buildSemanticModel(m);
    expect(result.diagnostics).toEqual([]);
    return generateCArtifacts(result.ir!, { includeTestShims: true }).files;
  };

  it('emits no continuous integration stage and compiles as strict C99', () => {
    const files = generate('discrete');
    const core = files.find((f) => f.name === 'sm_core.c')!.content;
    expect(core).not.toMatch(/xb_rk_base|xb_euler_next/);
    const workspace = createGeneratedCodeTestWorkspace('xb-discrete-solver');
    try {
      for (const file of files) writeFileSync(join(workspace.directory, file.name), file.content);
      for (const file of files.filter((f) => f.name.endsWith('.c'))) {
        execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-fsyntax-only', file.name], { cwd: workspace.directory, stdio: 'pipe' });
      }
    } finally {
      workspace.cleanup();
    }
  });
});
