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

// XBV-316 (U4 rework): the HIL interface code uses the same SM_Data_t member names as the core (cDataMemberName), so a HIL
// package with variables longer than 63 characters compiles (Generic target, gcc -std=c99 -Wall -Werror), and the Arduino
// and STM32F4 hil_interface.c reference only declared members.
import { generateMISRACCode } from '../stateMachineCodeGenerator';
describe('XBV-316: HIL interface with long variable ids', () => {
  const A = 'v_adc_' + 'a'.repeat(70), P = 'v_pwm_' + 'p'.repeat(70);
  const gen = (target: string) => generateMISRACCode({
    tickMs: 10,
    states: [{ id: 'idle', name: 'Idle', x: 0, y: 0, width: 100, height: 60, entry: '', during: `${P} = ${A};`, exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true }],
    junctions: [], transitions: [],
    variables: [A, P].map((n, i) => ({ id: 'v' + i, name: n, type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true })),
    layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['idle'], transitionIds: [], junctionIds: [] }],
    safetyMode: false,
    hilConfig: { enabled: true, target, clockSpeed: 1, commPort: '', baudRate: 115200,
      channels: [{ id: 'adc', name: 'adc', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
        { id: 'pwm', name: 'pwm', peripheral: 'PWM', pin: 'P0', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' }],
      mappings: [{ id: 'adc_read', adiaVarId: A, channelId: 'adc', direction: 'read' }, { id: 'pwm_write', adiaVarId: P, channelId: 'pwm', direction: 'write', safeValue: 128 }] },
  } as never, { includeTestShims: true } as never) as unknown as { files: Array<{ name: string; content: string }>; errors: unknown[] };
  it('Generic: every .c compiles with gcc -std=c99 -Wall -Werror', () => {
    const r = gen('Generic');
    const dir = mkdtempSync(join(tmpdir(), 'xbv316hil-'));
    for (const f of r.files) if (!f.name.includes('/')) writeFileSync(join(dir, f.name), f.content);
    const cs = r.files.filter((f) => f.name.endsWith('.c') && !f.name.includes('/')).map((f) => f.name);
    expect(() => execFileSync('gcc', ['-std=c99', '-Wall', '-Werror', '-c', '-I.', ...cs], { cwd: dir, stdio: 'pipe' })).not.toThrow();
  }, 120_000);
  for (const target of ['Arduino_Uno', 'STM32F4']) {
    it(`${target}: every data.<member> in the HIL interface is declared in SM_Data_t`, () => {
      const r = gen(target);
      const core = r.files.filter((f) => /\.h$/.test(f.name)).map((f) => f.content).join('\n');
      const used = new Set(r.files.flatMap((f) => f.content.match(/data\.([A-Za-z_]\w*)/g) ?? []).map((s) => s.slice(5)));
      for (const m of used) expect(core, m).toMatch(new RegExp(`\\b${m}\\b`));
    });
  }
});

// XBV-318: the Generic HIL package compiles with clang -std=c99 -Wall -Werror as well as gcc (no unused static HAL helpers).
describe('XBV-318: Generic HIL package compiles with clang -Werror', () => {
  it('short variable ids, Generic target: every .c compiles with clang -std=c99 -Wall -Werror', () => {
    const r = generateMISRACCode({
      tickMs: 10,
      states: [{ id: 'idle', name: 'Idle', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'v_pwm = v_adc;', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true }],
      junctions: [], transitions: [],
      variables: ['v_adc', 'v_pwm'].map((n, i) => ({ id: 'v' + i, name: n, type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true })),
      layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['idle'], transitionIds: [], junctionIds: [] }],
      safetyMode: false,
      hilConfig: { enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
        channels: [{ id: 'adc', name: 'adc', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
          { id: 'pwm', name: 'pwm', peripheral: 'PWM', pin: 'P0', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' }],
        mappings: [{ id: 'adc_read', adiaVarId: 'v_adc', channelId: 'adc', direction: 'read' }, { id: 'pwm_write', adiaVarId: 'v_pwm', channelId: 'pwm', direction: 'write', safeValue: 128 }] },
    } as never, { includeTestShims: true } as never) as unknown as { files: Array<{ name: string; content: string }> };
    const dir = mkdtempSync(join(tmpdir(), 'xbv318-'));
    for (const f of r.files) if (!f.name.includes('/')) writeFileSync(join(dir, f.name), f.content);
    const cs = r.files.filter((f) => f.name.endsWith('.c') && !f.name.includes('/')).map((f) => f.name);
    expect(() => execFileSync('clang', ['-std=c99', '-Wall', '-Werror', '-c', '-I.', ...cs], { cwd: dir, stdio: 'pipe' })).not.toThrow();
  }, 120_000);
  it('Generic target with only UART and SPI channels: every .c compiles with clang -std=c99 -Wall -Werror', () => {
    const r = generateMISRACCode({
      tickMs: 10,
      states: [{ id: 'idle', name: 'Idle', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'v_tx = v_rx;', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true }],
      junctions: [], transitions: [],
      variables: ['v_rx', 'v_tx'].map((n, i) => ({ id: 'v' + i, name: n, type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true })),
      layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['idle'], transitionIds: [], junctionIds: [] }],
      safetyMode: false,
      hilConfig: { enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
        channels: [{ id: 'rx', name: 'rx', peripheral: 'UART', pin: 'U0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
          { id: 'tx', name: 'tx', peripheral: 'SPI', pin: 'S0', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' }],
        mappings: [{ id: 'rx_read', adiaVarId: 'v_rx', channelId: 'rx', direction: 'read' }, { id: 'tx_write', adiaVarId: 'v_tx', channelId: 'tx', direction: 'write', safeValue: 0 }] },
    } as never, { includeTestShims: true } as never) as unknown as { files: Array<{ name: string; content: string }> };
    const dir = mkdtempSync(join(tmpdir(), 'xbv318b-'));
    for (const f of r.files) if (!f.name.includes('/')) writeFileSync(join(dir, f.name), f.content);
    const cs = r.files.filter((f) => f.name.endsWith('.c') && !f.name.includes('/')).map((f) => f.name);
    expect(() => execFileSync('clang', ['-std=c99', '-Wall', '-Werror', '-c', '-I.', ...cs], { cwd: dir, stdio: 'pipe' })).not.toThrow();
  }, 120_000);
});

// XBV-318 rework (verifier): each Generic simulation array is emitted only for the direction that uses it, so every
// channel combination compiles with gcc and clang -std=c99 -Wall -Wextra -Werror.
describe('XBV-318: Generic HIL, every channel combination compiles with gcc and clang -Wall -Wextra -Werror', () => {
  type Ch = { id: string; peripheral: string; direction: 'In' | 'Out'; mapped: boolean };
  const configs: Record<string, Ch[]> = {
    'DAC only': [{ id: 'dac', peripheral: 'DAC', direction: 'Out', mapped: true }],
    'PWM only': [{ id: 'pwm', peripheral: 'PWM', direction: 'Out', mapped: true }],
    'ADC only': [{ id: 'adc', peripheral: 'ADC', direction: 'In', mapped: true }],
    'GPIO in + UART': [{ id: 'gi', peripheral: 'GPIO', direction: 'In', mapped: true }, { id: 'u', peripheral: 'UART', direction: 'Out', mapped: true }],
    'GPIO out only': [{ id: 'go', peripheral: 'GPIO', direction: 'Out', mapped: true }],
    'unmapped GPIO input': [{ id: 'gi', peripheral: 'GPIO', direction: 'In', mapped: false }],
    'ADC + DAC': [{ id: 'adc', peripheral: 'ADC', direction: 'In', mapped: true }, { id: 'dac', peripheral: 'DAC', direction: 'Out', mapped: true }],
  };
  for (const [label, chans] of Object.entries(configs)) {
    it(label, () => {
      const vars = chans.map((c) => ({ id: `v_${c.id}`, name: `v_${c.id}`, type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true }));
      const r = generateMISRACCode({
        tickMs: 10,
        states: [{ id: 'idle', name: 'Idle', x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true }],
        junctions: [], transitions: [], variables: vars,
        layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['idle'], transitionIds: [], junctionIds: [] }],
        safetyMode: false,
        hilConfig: { enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
          channels: chans.map((c, i) => ({ id: c.id, name: c.id, peripheral: c.peripheral, pin: `P${i}`, direction: c.direction, dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' })),
          mappings: chans.filter((c) => c.mapped).map((c) => ({ id: `${c.id}_m`, adiaVarId: `v_${c.id}`, channelId: c.id, direction: c.direction === 'In' ? 'read' : 'write', ...(c.direction === 'Out' ? { safeValue: 0 } : {}) })) },
      } as never, { includeTestShims: true } as never) as unknown as { files: Array<{ name: string; content: string }> };
      const dir = mkdtempSync(join(tmpdir(), 'xbv318c-'));
      for (const f of r.files) if (!f.name.includes('/')) writeFileSync(join(dir, f.name), f.content);
      const cs = r.files.filter((f) => f.name.endsWith('.c') && !f.name.includes('/')).map((f) => f.name);
      for (const cc of ['gcc', 'clang']) expect(() => execFileSync(cc, ['-std=c99', '-Wall', '-Wextra', '-Werror', '-c', '-I.', ...cs], { cwd: dir, stdio: 'pipe' }), cc).not.toThrow();
    }, 120_000);
  }
});
