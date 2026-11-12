import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRandomChart } from './smRandomChartFixture';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';

/*
 * RAM of the generated instance must scale with what the model uses, so that large charts
 * fit small MCUs (ATmega328P: 2 KB RAM in total, including stack and drivers):
 *  - no history storage at all when the model has no history junction,
 *  - deep history kept as bits (one bit per state per layer), not one byte,
 *  - a 77-state, 22-layer chart without history: instance <= 600 bytes on AVR,
 *    <= 700 bytes on a 64-bit host (was 2,198 / 2,288),
 *  - a 78-state chart with shallow and deep history: <= 900 bytes on AVR,
 *    <= 1,000 bytes on the host (was 2,312 / 2,408).
 * Behaviour is unchanged: the random-chart differential test covers parity.
 */

const NO_HISTORY_SEED = 67;
const WITH_HISTORY_SEED = 104;

const generate = (seed: number) => {
  const model = buildRandomChart(seed, { innerTransitions: false, arithmetic: false });
  const built = buildSemanticModel(model);
  expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  return { model, files: generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/')) };
};

const has = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

const instanceSize = (seed: number, compiler: string, nm: string, flags: string[]) => {
  const { files } = generate(seed);
  const dir = mkdtempSync(join(tmpdir(), 'adia-mem-'));
  try {
    for (const file of files) writeFileSync(join(dir, file.name), file.content);
    writeFileSync(join(dir, 'size_probe.c'), '#include "sm_core.h"\nADIA_Instance_t adia_probe_instance;\n');
    execFileSync(compiler, ['-std=c99', ...flags, '-I.', '-c', 'size_probe.c', '-o', 'size_probe.o'], { cwd: dir, stdio: 'pipe' });
    const line = execFileSync(nm, ['-S', 'size_probe.o'], { cwd: dir, encoding: 'utf8' })
      .split('\n').find((row) => row.trim().endsWith(' adia_probe_instance'));
    return parseInt(line!.trim().split(/\s+/)[1], 16);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('generated instance RAM scales with the model', () => {
  it('the probe charts are the large charts the budgets refer to', () => {
    const plain = generate(NO_HISTORY_SEED).model;
    expect(plain.states.length).toBe(77);
    expect(plain.junctions.some((junction) => junction.type === 'history' || junction.type === 'deep-history')).toBe(false);
    const withHistory = generate(WITH_HISTORY_SEED).model;
    expect(withHistory.states.length).toBe(78);
    expect(withHistory.junctions.some((junction) => junction.type === 'deep-history')).toBe(true);
  });

  it('emits no history storage when the model has no history junction', () => {
    const config = generate(NO_HISTORY_SEED).files.find((file) => file.name === 'sm_config.h')!.content;
    const instance = config.slice(config.indexOf('struct ADIA_Instance {'));
    expect(instance).not.toMatch(/deep_history/);
    expect(instance).not.toMatch(/history_states/);
  });

  it.skipIf(!has('gcc'))('fits the host budgets', () => {
    expect(instanceSize(NO_HISTORY_SEED, 'gcc', 'nm', [])).toBeLessThanOrEqual(700);
    expect(instanceSize(WITH_HISTORY_SEED, 'gcc', 'nm', [])).toBeLessThanOrEqual(1000);
  }, 120_000);

  it.skipIf(!has('avr-gcc'))('fits the ATmega328P budgets', () => {
    const flags = ['-mmcu=atmega328p', '-Os'];
    expect(instanceSize(NO_HISTORY_SEED, 'avr-gcc', 'avr-nm', flags)).toBeLessThanOrEqual(600);
    expect(instanceSize(WITH_HISTORY_SEED, 'avr-gcc', 'avr-nm', flags)).toBeLessThanOrEqual(900);
  }, 120_000);
});
