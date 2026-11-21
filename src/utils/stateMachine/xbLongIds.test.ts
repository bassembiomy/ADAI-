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
