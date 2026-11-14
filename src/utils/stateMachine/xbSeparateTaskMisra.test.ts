import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import type { StateData, VariableDef } from '../../types/sm_types';
import { generateCArtifacts } from './smCGenerator';
import { flatOrFixture } from './smFixtures';
import type { StateMachineModelV5 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import type { XBEdgeV1, XBNodeV1 } from './xbModel';

/*
 * MISRA C:2012 conformance of a chart with a separate-task (multi-rate) X-Bridges state: the
 * fast task SM_XB_Task(), the chart-side latch and the escalating fault flag. Only advisory rule
 * 15.5 (single point of exit, documented in MISRA_DEVIATIONS.md) is accepted.
 */

const has = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};
const MISRA_PY = ['/usr/lib/x86_64-linux-gnu/cppcheck/addons/misra.py', '/usr/share/cppcheck/addons/misra.py'].find((path) => existsSync(path));
const hasCppcheck = has('cppcheck') && MISRA_PY !== undefined;
const ACCEPTED_DEVIATIONS = new Set(['15.5']);

const xbNode = (id: string, type: string, params: Record<string, unknown> = {}): XBNodeV1 => {
  const block = BLOCK_LIBRARY[type](id, params);
  const port = (p: { id: string; direction: string }) => ({ id: p.id, direction: p.direction, shape: 'scalar', dimensions: [], dataType: 'float32' });
  return {
    id, type, label: id,
    parameters: { ...(block.inputs ? { inputs: block.inputs.map(port) } : {}), ...(block.outputs ? { outputs: block.outputs.map(port) } : {}), ...params } as XBNodeV1['parameters'],
  };
};
const edge = (from: string, fromPort: string, to: string, toPort: string): XBEdgeV1 => ({
  id: `${from}.${fromPort}->${to}.${toPort}`, sourceNodeId: from, sourcePortId: fromPort, targetNodeId: to, targetPortId: toPort,
});
const variable = (name: string): VariableDef => ({ id: name, name, type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true });

const taskChart = (memory: 'reset' | 'retain'): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [variable('u'), variable('y')];
  const drive = {
    id: 'drive', name: 'Drive', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'u = u + 1;', exit: '',
    isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true,
    isXBridges: true,
    xBridgesModel: {
      schemaVersion: 1,
      nodes: [
        xbNode('in', 'Inport', { smVarId: 'u' }),
        xbNode('gain', 'GAIN', { gain: 2 }),
        xbNode('int', 'UNIT_DELAY', { initialCondition: 1 }),
        xbNode('out', 'Outport', { smVarId: 'y' }),
      ],
      edges: [edge('in', 'out', 'gain', 'u'), edge('gain', 'y', 'int', 'u'), edge('int', 'y', 'out', 'in')],
      mappings: [
        { smVarId: 'u', blockId: 'in', portId: 'in', direction: 'in' },
        { smVarId: 'y', blockId: 'out', portId: 'out', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.001, execution: 'separate-task' },
      policy: { memory, numericFault: 'escalate' },
    },
  } as unknown as StateData;
  model.states = [drive] as never;
  model.transitions = [];
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['drive'], transitionIds: [], junctionIds: [] }] as never;
  return model;
};

describe('generated separate-task X-Bridges C is MISRA C:2012 conformant', () => {
  for (const memory of ['reset', 'retain'] as const) {
    it.skipIf(!hasCppcheck)(`memory ${memory}: no MISRA violation except accepted deviation 15.5`, () => {
      const built = buildSemanticModel(taskChart(memory));
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const dir = mkdtempSync(join(tmpdir(), 'adia-xb-task-misra-'));
      try {
        for (const file of generateCArtifacts(built.ir!).files) {
          const path = join(dir, file.name);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, file.content);
        }
        const sources = readdirSync(dir).filter((name) => name.endsWith('.c') && !/stub|test|harness/.test(name));
        expect(readdirSync(dir).filter((name) => name.endsWith('.h')).map((name) => name)).toContain('sm_core.h');
        const dumps: string[] = [];
        for (const source of sources) {
          execFileSync('cppcheck', ['--dump', '--std=c99', '--quiet', '-I.', source], { cwd: dir, stdio: 'pipe' });
          dumps.push(`${source}.dump`);
        }
        const run = spawnSync('python3', [MISRA_PY!, ...dumps], { cwd: dir, encoding: 'utf8' });
        const report = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
        const violations = [...report.matchAll(/^\[([^\]]+?):(\d+)\][^\n]*\[misra-c2012-(\d+\.\d+)\]/gm)]
          .map((match) => ({ file: match[1], line: Number(match[2]), rule: match[3] }))
          .filter((violation) => !ACCEPTED_DEVIATIONS.has(violation.rule));
        expect(violations.map((violation) => `${violation.rule} ${violation.file}:${violation.line}`)).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 300_000);
  }
});
