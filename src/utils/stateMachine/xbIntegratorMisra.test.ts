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
 * MISRA C:2012 rule 12.1 (explicit operator precedence) for the generated INTEGRATOR_DISCRETE update, in-tick and
 * as a separate-task (multi-rate) X-Bridges state. Only advisory rule 15.5 (single point of exit, documented in
 * MISRA_DEVIATIONS.md) is accepted.
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

/** Inport -> INTEGRATOR_DISCRETE -> Outport chart; `separate` selects the separate-task execution. */
const integratorChart = (separate: boolean): StateMachineModelV5 => {
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
        xbNode('integ', 'INTEGRATOR_DISCRETE', { initial_condition: 0, sample_time: 0.001, method: 'forward_euler' }),
        xbNode('out', 'Outport', { smVarId: 'y' }),
      ],
      edges: [edge('in', 'out', 'integ', 'u'), edge('integ', 'y', 'out', 'in')],
      mappings: [
        { smVarId: 'u', blockId: 'in', portId: 'in', direction: 'in' },
        { smVarId: 'y', blockId: 'out', portId: 'out', direction: 'out' },
      ],
      solver: separate
        ? { kind: 'euler', stepSeconds: 0.001, execution: 'separate-task' }
        : { kind: 'euler', stepSeconds: 0.001 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    },
  } as unknown as StateData;
  model.states = [drive] as never;
  model.transitions = [];
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['drive'], transitionIds: [], junctionIds: [] }] as never;
  return model;
};

describe('generated INTEGRATOR_DISCRETE X-Bridges C is MISRA C:2012 conformant', () => {
  for (const [label, separate] of [['in-tick', false], ['separate-task', true]] as const) {
    it.skipIf(!hasCppcheck)(`${label}: no MISRA violation except accepted deviation 15.5`, () => {
      const built = buildSemanticModel(integratorChart(separate));
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const dir = mkdtempSync(join(tmpdir(), 'adia-xb-integ-misra-'));
      try {
        for (const file of generateCArtifacts(built.ir!).files) {
          const path = join(dir, file.name);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, file.content);
        }
        const sources = readdirSync(dir).filter((name) => name.endsWith('.c') && !/stub|test|harness/.test(name));
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
