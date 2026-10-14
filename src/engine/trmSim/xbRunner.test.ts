// WP-08b acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2 item 4
import { describe, expect, it } from 'vitest';
import { runXbVerification } from './xbRunner';
import type { SimCriterion } from './simCriterion';

// Global canvas, React Flow node shape as saved in globalXBridgesNodes / XbridgesWorkspace.
const node = (id: string, type: string, params: Record<string, unknown>) => ({ id, type: 'xbridgesBlock', position: { x: 0, y: 0 }, data: { id, type, params } });
const nodes = [node('c1', 'Constant', { value: 5 }), node('i1', 'INTEGRATOR_CONTINUOUS', { initial_condition: 2 }), node('g', 'GAIN', { gain: 2 })];
const edges = [{ id: 'e1', source: 'c1', sourceHandle: 'out', target: 'i1', targetHandle: 'u' }];
const source = { canvas: 'global', nodes, edges };

const crit = (over: Partial<SimCriterion>): SimCriterion => ({
  id: 'c1', requirementId: 'REQ-1', verificationCaseId: 'VC-1',
  stimuli: [{ target: 'sim:xb/global/c1/$param/value', profile: { kind: 'step', before: 5, after: -5, at: 0.5 } }],
  observe: 'sim:xb/global/i1/y', check: { kind: 'reaches', value: 4.5, by: 0.5 }, duration: 1, step: 0.1, ...over,
});

describe('runXbVerification', () => {
  it('samples the initial outputs at t = 0 and then every step', () => {
    const r = runXbVerification(source, crit({}));
    expect(r.diagnostics).toEqual([]);
    expect(r.trace).toHaveLength(11);
    expect(r.trace[0]).toEqual({ t: 0, value: 2 });
    r.trace.forEach((s, k) => expect(s.t).toBeCloseTo(k * 0.1, 9));
  });

  it('drives a block parameter from the stimulus and integrates the response', () => {
    const r = runXbVerification(source, crit({}));
    expect(r.evaluation.passed).toBe(true);
    expect(r.trace[5].value).toBeCloseTo(4.5, 9);
    expect(r.trace[10].value).toBeCloseTo(2, 9);
  });

  it('fails with the first violating sample', () => {
    const r = runXbVerification(source, crit({ check: { kind: '<=', value: 4.4, window: [0, 1] } }));
    expect(r.evaluation.passed).toBe(false);
    expect(r.evaluation.firstViolation?.t).toBeCloseTo(0.5, 9);
  });

  it('drives an unconnected input port', () => {
    const r = runXbVerification(source, crit({
      stimuli: [{ target: 'sim:xb/global/g/u', profile: { kind: 'constant', value: 3 } }],
      observe: 'sim:xb/global/g/y', check: { kind: 'within', value: 6, tolerance: 1e-9, window: [0, 1] },
    }));
    expect(r.evaluation.passed).toBe(true);
  });

  it('refuses to drive an output port or an input that is already wired', () => {
    for (const target of ['sim:xb/global/i1/y', 'sim:xb/global/i1/u']) {
      const r = runXbVerification(source, crit({ stimuli: [{ target, profile: { kind: 'constant', value: 1 } }] }));
      expect(r.diagnostics).toContainEqual(expect.objectContaining({ code: 'NOT_STIMULABLE', target }));
      expect(r.trace).toEqual([]);
    }
  });

  it('reports unknown blocks, other canvases and other engines without running', () => {
    expect(runXbVerification(source, crit({ observe: 'sim:xb/global/nope/y' })).diagnostics)
      .toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TARGET', target: 'sim:xb/global/nope/y' }));
    expect(runXbVerification(source, crit({ observe: 'sim:xb/file-7/i1/y' })).diagnostics)
      .toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TARGET' }));
    expect(runXbVerification(source, crit({ observe: 'sim:sm/var/v1' })).diagnostics)
      .toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_TARGET' }));
  });

  it('leaves models inside a state to the state machine runner', () => {
    const r = runXbVerification({ canvas: 'state:s2', nodes: [], edges: [] }, crit({ observe: 'sim:xb/state%3As2/g/y', stimuli: [] }));
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_TARGET' }));
  });

  it('does not run an invalid criterion', () => {
    const r = runXbVerification(source, crit({ duration: -1 }));
    expect(r.trace).toEqual([]);
    expect(r.diagnostics.map(d => d.code)).toContain('DURATION');
  });

  it('does not mutate the canvas nodes it was given', () => {
    const before = JSON.stringify(nodes);
    runXbVerification(source, crit({}));
    expect(JSON.stringify(nodes)).toBe(before);
  });
});
