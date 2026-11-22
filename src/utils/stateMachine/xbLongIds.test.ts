/**
 * WP-21 U3 rework acceptance (controller), XBV-308: identifiers longer than 63 characters are shortened consistently in
 * every generated C file and in the C-side test harnesses, so models with long block ids or a long state id compile
 * (gcc -std=c99 -Wall -Werror) and the generated C equals the interpreter.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCParity, DEFAULT_PARITY_FLAGS, toEmbeddedModel, EMBEDDED_TARGET } from '../../engine/xbridges/testkit';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { hybridXBridgesFixture } from './smFixtures';
import { buildXBSemanticModel } from './xbSemanticBuilder';

const LONG_BLOCK = (tag: string) => `${tag}_${'very_long_block_identifier_'.repeat(4)}`;

describe('XBV-308: long block ids, generated C = interpreter', () => {
  it('Constant -> Gain -> Integrator with 100+ character block ids: C compiles and matches the interpreter for 10 ticks', async () => {
    const k = LONG_BLOCK('k'), g = LONG_BLOCK('g'), i = LONG_BLOCK('i');
    const r = await runCParity({
      blocks: [{ id: k, type: 'Constant', params: { value: 3 } }, { id: g, type: 'GAIN', params: { gain: 2 } }, { id: i, type: 'Integrator' }],
      wires: [`${k}.out -> ${g}.u`, `${g}.y -> ${i}.in`],
    }, { solver: 'euler', dt: 0.01, steps: 10, probes: [`${i}.out`], flags: DEFAULT_PARITY_FLAGS });
    expect(r.generateError).toBeUndefined();
    expect(r.outcome?.log.slice(0, 400) ?? '').toBe('');
    expect(r.ok).toBe(true);
    expect(r.c[`${i}.out`]).toEqual(r.interpreter[`${i}.out`]);
  }, 120_000);
});

describe('XBV-308: a long state id', () => {
  it('a state-machine state with a 90-character id owning an X-Bridges model generates C that compiles with gcc -std=c99 -Wall -Werror', () => {
    const LONG = 'controller' + '_x'.repeat(40);
    const sm = JSON.parse(JSON.stringify(hybridXBridgesFixture()).split('"controller"').join(`"${LONG}"`));
    sm.tickMs = 10; sm.states[0].autostart = false; sm.states.find((s: { id: string }) => s.id === LONG).autostart = true;
    const shell = buildSemanticModel(sm);
    expect(shell.ir).toBeDefined();
    const xb = toEmbeddedModel({ blocks: [{ id: 'k', type: 'Constant', params: { value: 3 } }, { id: 'i', type: 'Integrator' }], wires: ['k.out -> i.in'] }, { solver: 'euler', dt: 0.01 });
    xb.policy = { memory: 'reset', numericFault: 'signal-only' };
    const built = buildXBSemanticModel({ stateId: LONG, ownerState: shell.stateSymbols?.get(LONG), model: xb, variables: {}, target: EMBEDDED_TARGET, baseTickMs: 10 } as never);
    expect(built.ir).toBeDefined();
    const ir = { ...shell.ir!, states: { ...shell.ir!.states, [LONG]: { ...shell.ir!.states[LONG], xBridges: built.ir } } };
    const out = generateCArtifacts(ir as never, { includeTestShims: true });
    const dir = mkdtempSync(join(tmpdir(), 'xbv308-'));
    for (const f of out.files) writeFileSync(join(dir, f.name), f.content);
    const cs = out.files.filter((f: { name: string }) => f.name.endsWith('.c')).map((f: { name: string }) => join(dir, f.name));
    expect(() => execFileSync('gcc', ['-std=c99', '-Wall', '-Werror', '-c', '-I', dir, ...cs], { stdio: 'pipe', cwd: dir })).not.toThrow();
  }, 120_000);
});

// U3 rework 2 (verifier): shortening applies to C identifiers only, never to string literals or comments, so the C trace
// keeps the model's ids and equals the simulator; models with short ids generate no shortened name in any option set.
import { asXbOwner, buildSmModel, diffTraces, fixtureOf, runThree, smState, smVar, xbEdge, xbMap, xbNode } from '../../engine/xbridges/testkit';
import * as fixtures from './smFixtures';
describe('XBV-308: long ids keep simulator = C traces', () => {
  for (const [label, G, D, ST] of [
    ['long block ids', 'g' + 'L'.repeat(80), 'd' + 'Q'.repeat(70) + 'Mixed', 'A'],
    ['long state id', 'g', 'd', 'Ctrl_' + 'Xy'.repeat(40)],
    ['long state id with a Step (state-timer index)', 'g', 'd', 'Step_' + 'Xy'.repeat(40)],
  ] as const) {
    it(`${label}: no difference between the simulator and the compiled C trace`, () => {
      const step = label.includes('Step');
      const a = asXbOwner(smState(ST, { autostart: true }), {
        nodes: [xbNode(G, 'GAIN', { gain: 2 }, ['u'], ['y']), xbNode(D, 'UNIT_DELAY', { initialCondition: 5 }, ['u'], ['y']),
          ...(step ? [xbNode('st', 'Step', { step_time: 0.25, initial_value: 0, final_value: 1 }, [], ['out'])] : [])],
        edges: [xbEdge(`${G}.y`, `${D}.u`)],
        mappings: [xbMap('u', `${G}.u`, 'in'), xbMap('y', `${D}.y`, 'out')],
      });
      const m = buildSmModel({ tickMs: 100, states: [a], variables: [smVar('u'), smVar('y')], layers: [{ id: 'root', parent: null, states: [ST] }] });
      const t = runThree(fixtureOf(m, [1, 2, 3, 4].map((u) => ({ kind: 'step' as const, inputs: { u } }))));
      expect(diffTraces(t.sim, t.c)).toEqual([]);
      expect(diffTraces(t.sim, t.standalone)).toEqual([]);
    }, 120_000);
  }
});
describe('XBV-308: short ids generate no shortened identifier', () => {
  it('every smFixtures model under 6 option sets: no <54 chars>_<8 hex> token in any generated file', () => {
    const bad: string[] = [];
    for (const [name, f] of Object.entries(fixtures)) {
      if (typeof f !== 'function') continue;
      let m: unknown; try { m = (f as () => unknown)(); } catch { continue; }
      if (!m || !(m as { states?: unknown }).states) continue;
      const b = buildSemanticModel(m as never); if (!b.ir) continue;
      for (const opts of [{}, { includeTestShims: true }, { platform: 'autosar' }, { platform: 'autosar', includeTestShims: true }, { includeHostHarness: true, includeVerificationPackage: true }, { platform: 'autosar', includeHostHarness: true, includeVerificationPackage: true }]) {
        let o: { files: Array<{ name: string; content: string }> };
        try { o = generateCArtifacts(b.ir, opts as never); } catch { continue; }
        for (const file of o.files) if (/\b[A-Za-z_][A-Za-z0-9_]{53}_[0-9a-f]{8}\b/.test(file.content)) bad.push(`${name} ${JSON.stringify(opts)} ${file.name}`);
      }
    }
    expect(bad).toEqual([]);
  }, 240_000);
});

// U3 rework 4 (verifier): the harnesses must use the product's own name builders. State-machine variables with ids longer
// than 63 characters keep simulator = C (the product keeps variable members as they are; the harness must not rename them).
describe('XBV-308: long variable ids keep simulator = C traces', () => {
  it('variables of 70+ characters mapped to an X-Bridges model: no difference between the simulator and the compiled C trace', () => {
    const U = 'Pin_' + 'p'.repeat(66) + '_x', Y = 'Pout_' + 'p'.repeat(66) + '_x';
    const a = asXbOwner(smState('A', { autostart: true }), {
      nodes: [xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y']), xbNode('d', 'UNIT_DELAY', { initialCondition: 5 }, ['u'], ['y'])],
      edges: [xbEdge('g.y', 'd.u')],
      mappings: [xbMap(U, 'g.u', 'in'), xbMap(Y, 'd.y', 'out')],
    });
    const m = buildSmModel({ tickMs: 100, states: [a], variables: [smVar(U), smVar(Y)], layers: [{ id: 'root', parent: null, states: ['A'] }] });
    const t = runThree(fixtureOf(m, [1, 2, 3, 4].map((u) => ({ kind: 'step' as const, inputs: { [U]: u } }))));
    expect(diffTraces(t.sim, t.c)).toEqual([]);
  }, 120_000);
});

// XBV-316: no two distinct identifiers in the generated C are equal in their first 63 characters (C99 5.2.4.1), also for
// the state-machine names that are not X-Bridges members: SM_ST_<enum>_Entry / _Exit / _During of a long state id and
// SM_Data_t members of long variable ids that differ only after character 63.
describe('XBV-316: state-machine C names unique within 63 characters', () => {
  const collisions = (files: Array<{ name: string; content: string }>) => {
    const byPrefix = new Map<string, Set<string>>();
    for (const f of files) {
      if (!/\.(c|h)$/.test(f.name)) continue;
      const code = f.content.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').replace(/"(?:\\.|[^"\\])*"/g, '""');
      for (const id of code.match(/\b[A-Za-z_][A-Za-z0-9_]{63,}\b/g) ?? []) {
        const k = id.slice(0, 63);
        if (!byPrefix.has(k)) byPrefix.set(k, new Set());
        byPrefix.get(k)!.add(id);
      }
    }
    return [...byPrefix.values()].filter((s) => s.size > 1).map((s) => [...s].join(' / '));
  };
  it('a 90-character state id with entry / exit / during actions and two 70-character variables differing at the end: no collision, and it compiles', () => {
    const ST = 'Ctrl_' + 'Xy'.repeat(42);
    const V1 = 'v'.repeat(62) + '_count', V2 = 'v'.repeat(62) + '_counter';
    const m = buildSmModel({
      tickMs: 100,
      states: [smState(ST, { autostart: true, entry: `${V1} = 1;`, exit: `${V2} = 2;`, during: `${V1} = ${V1} + 1;` } as never), smState('B', { priority: 2 })],
      transitions: [],
      variables: [smVar(V1), smVar(V2)],
      layers: [{ id: 'root', parent: null, states: [ST, 'B'] }],
    });
    const b = buildSemanticModel(m as never);
    expect(b.ir).toBeDefined();
    const out = generateCArtifacts(b.ir as never, { includeTestShims: true });
    expect(collisions(out.files)).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), 'xbv316-'));
    for (const f of out.files) writeFileSync(join(dir, f.name), f.content);
    const cs = out.files.filter((f: { name: string }) => f.name.endsWith('.c')).map((f: { name: string }) => join(dir, f.name));
    expect(() => execFileSync('gcc', ['-std=c99', '-Wall', '-Werror', '-c', '-I', dir, ...cs], { stdio: 'pipe', cwd: dir })).not.toThrow();
  }, 120_000);
});
