// WP-08c acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2 item 4
import { describe, expect, it } from 'vitest';
import { runVlabVerification } from './vlabRunner';
import type { SimCriterion } from './simCriterion';

const node = (id: string, type: string, params: Record<string, unknown> = {}) => ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } });
const edge = (id: string, s: string, sh: string, t: string, th: string) => ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th });
// ps_constant -> ps_integrator, no scope on the canvas
const nodes = [node('c', 'ps_constant', { value: 2 }), node('i', 'ps_integrator')];
const edges = [edge('e1', 'c', 'y_s', 'i', 'u_t')];
const source = { canvas: 'global', nodes, edges };

const crit = (over: Partial<SimCriterion>): SimCriterion => ({
  id: 'c1', requirementId: 'REQ-1', verificationCaseId: 'VC-1',
  stimuli: [{ target: 'sim:vlab/global/c/$param/value', profile: { kind: 'step', before: 2, after: -2, at: 0.5 } }],
  observe: 'sim:vlab/global/i/y', check: { kind: 'within', value: 1, tolerance: 1e-9, window: [0.5, 0.5] }, duration: 1, step: 0.1, ...over,
});

describe('runVlabVerification', () => {
  it('samples after every solved step (V-Lab has no t = 0 solve)', () => {
    const r = runVlabVerification(source, crit({}));
    expect(r.diagnostics).toEqual([]);
    expect(r.trace).toHaveLength(10);
    r.trace.forEach((s, k) => expect(s.t).toBeCloseTo((k + 1) * 0.1, 9));
  });

  it('observes a signal output without the canvas needing a scope, and drives a parameter', () => {
    const r = runVlabVerification(source, crit({}));
    expect(r.evaluation.passed).toBe(true);
    expect(r.trace[0].value).toBeCloseTo(0.2, 9);
    expect(r.trace[9].value).toBeCloseTo(0, 9);
  });

  it('fails with the first violating sample', () => {
    const r = runVlabVerification(source, crit({ check: { kind: '<=', value: 0.9, window: [0, 1] } }));
    expect(r.evaluation.passed).toBe(false);
    expect(r.evaluation.firstViolation?.t).toBeCloseTo(0.5, 9);
  });

  it('observes a solver variable by name', () => {
    const r = runVlabVerification(source, crit({ observe: 'sim:vlab/global/$var/i_state_y' }));
    expect(r.evaluation.passed).toBe(true);
    expect(r.trace[0].value).toBeCloseTo(0.2, 9);
  });

  it('does not mutate the canvas it was given', () => {
    const before = JSON.stringify({ nodes, edges });
    runVlabVerification(source, crit({}));
    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it('asks for a sensor instead of observing a conserving port', () => {
    const circuit = { canvas: 'global', nodes: [...nodes, node('r', 'resistor', { R: 10 }), node('gnd', 'ground')], edges };
    const r = runVlabVerification(circuit, crit({ observe: 'sim:vlab/global/r/p' }));
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ code: 'NOT_OBSERVABLE', target: 'sim:vlab/global/r/p' }));
    expect(r.trace).toEqual([]);
  });

  it('only drives parameters, and keeps them inside the library bounds', () => {
    const port = runVlabVerification(source, crit({ stimuli: [{ target: 'sim:vlab/global/i/u', profile: { kind: 'constant', value: 1 } }] }));
    expect(port.diagnostics).toContainEqual(expect.objectContaining({ code: 'NOT_STIMULABLE', target: 'sim:vlab/global/i/u' }));
    const circuit = { canvas: 'global', nodes: [...nodes, node('r', 'resistor', { R: 10 })], edges };
    const bad = runVlabVerification(circuit, crit({ stimuli: [{ target: 'sim:vlab/global/r/$param/R', profile: { kind: 'step', before: 10, after: 0, at: 0.2 } }] }));
    expect(bad.diagnostics).toContainEqual(expect.objectContaining({ code: 'OUT_OF_BOUNDS', target: 'sim:vlab/global/r/$param/R' }));
    expect(bad.trace).toEqual([]);
  });

  it('checks the criterion unit against the unit of the observed signal', () => {
    const sensed = { canvas: 'global', nodes: [...nodes, node('vs', 'v_sensor')], edges };
    const r = runVlabVerification(sensed, crit({ observe: 'sim:vlab/global/vs/v', unit: 'A' }));
    expect(r.diagnostics.map(d => d.code)).toContain('UNIT_MISMATCH');
    expect(r.trace).toEqual([]);
  });

  it('reports unknown targets, other engines and invalid criteria without running', () => {
    expect(runVlabVerification(source, crit({ observe: 'sim:vlab/global/zz/y' })).diagnostics).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TARGET' }));
    expect(runVlabVerification(source, crit({ observe: 'sim:xb/global/i/y' })).diagnostics).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_TARGET' }));
    expect(runVlabVerification(source, crit({ step: 2 })).diagnostics.map(d => d.code)).toContain('STEP');
  });

  it('turns a solver failure into a failed run with RUNTIME_ERROR instead of throwing', () => {
    const broken = { canvas: 'global', nodes: [node('i', 'ps_integrator')], edges: [] };
    const r = runVlabVerification(broken, crit({ stimuli: [] }));
    expect(r.evaluation.passed).toBe(false);
    expect(r.diagnostics.map(d => d.code)).toContain('RUNTIME_ERROR');
  });
});
