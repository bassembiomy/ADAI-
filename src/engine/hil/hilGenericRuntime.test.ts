import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

let hasGcc = true;
try {
  execSync('gcc --version', { stdio: 'ignore' });
} catch {
  hasGcc = false;
}

const buildGenericImage = (dir: string): string => {
  const result = generateMISRACCode({
    tickMs: 10,
    states: [{
      id: 's1', name: 'Init', x: 0, y: 0, width: 100, height: 100,
      entry: '', during: 'v_out = v_in;', exit: '',
      isActive: false, color: 'blue', parentId: 'root', children: [],
      priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
    }],
    junctions: [],
    transitions: [],
    variables: [
      { id: 'v1', name: 'v_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'v2', name: 'v_out', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
    ],
    layers: [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }],
    safetyMode: false,
    hilConfig: {
      enabled: true,
      target: 'Generic',
      clockSpeed: 1,
      commPort: '',
      baudRate: 115200,
      channels: [
        { id: 'in', name: 'inputCh', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'float', rangeMin: 0, rangeMax: 10, scalingFactor: 1, unit: '' },
        { id: 'out', name: 'outputCh', peripheral: 'DAC', pin: 'D0', direction: 'Out', dataType: 'float', rangeMin: 0, rangeMax: 10, scalingFactor: 1, unit: '' },
      ],
      mappings: [
        { id: 'm1', adiaVarId: 'v_in', channelId: 'in', direction: 'read' },
        { id: 'm2', adiaVarId: 'v_out', channelId: 'out', direction: 'write', safeValue: 0 },
      ],
    },
  } as any);
  expect(result.errors).toHaveLength(0);
  for (const f of result.files) fs.writeFileSync(path.join(dir, f.name), f.content);
  const srcs = result.files.filter(f => f.name.endsWith('.c')).map(f => f.name).join(' ');
  const exe = path.join(dir, 'hil_generic');
  execSync(`gcc -std=c99 -O2 -Wall -Wextra -Werror -I. ${srcs} -o hil_generic`, { cwd: dir, stdio: 'pipe' });
  return exe;
};

describe.skipIf(!hasGcc)('HIL Generic runtime (non-blocking stdin)', () => {
  it('keeps emitting telemetry with stdin open and idle, and tolerates input', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil_generic_'));
    try {
      const exe = buildGenericImage(dir);
      const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      const telemetry = () => out.split('\n').filter(l => l.startsWith('inputCh='));

      await new Promise(r => setTimeout(r, 1000));
      expect(telemetry().length).toBeGreaterThanOrEqual(2);

      // Input arriving (including a partial line and an over-long line) must not stall the loop.
      // Note: overrides do not reach the SM in the Generic image today (mcal path ignores them).
      const before = telemetry().length;
      child.stdin.write('inputCh=3');
      await new Promise(r => setTimeout(r, 150));
      child.stdin.write('.5\n');
      child.stdin.write(`inputCh=9${'0'.repeat(600)}\n`);
      await new Promise(r => setTimeout(r, 400));
      expect(telemetry().length).toBeGreaterThanOrEqual(before + 2);

      child.kill('SIGKILL');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
