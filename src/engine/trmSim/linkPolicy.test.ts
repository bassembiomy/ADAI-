// WP-19 acceptance test (planner-owned): every link kind the panel offers must be accepted by the gateway (finding L11).
import { describe, expect, it } from 'vitest';
import { createSysmlGatewayState, executeSysmlCommand } from '../../services/sysmlCommandGateway';
import { createEmptyRepository } from '../sysml/model';
import { projectExternalEndpoints } from './simEndpoints';
import { thermostatProject, T } from './__fixtures__/thermostatProject';

describe('linking a model signal to a requirement through the gateway', () => {
  const project = thermostatProject();
  const context = { externalEndpoints: projectExternalEndpoints(project) };
  for (const kind of ['satisfy', 'verify', 'refine', 'trace'] as const) {
    for (const target of [T.chamberOut, T.heaterOn, T.gainOut, T.heating, T.powerValue]) {
      it(`${kind} from ${target}`, () => {
        const r = createEmptyRepository();
        r.requirements.req = { id: 'req', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 't', status: 'approved', version: '1' } as any;
        const state = createSysmlGatewayState(r, {}, {}, undefined, context);
        const result = executeSysmlCommand(state, { type: 'createElement', element: { id: 'l', kind, sourceId: target, targetId: 'req' } } as any, undefined, context);
        expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
        expect(result.committed).toBe(true);
      });
    }
  }

  it('still rejects a verify link from a plain requirement', () => {
    const r = createEmptyRepository();
    for (const id of ['a', 'b']) r.requirements[id] = { id, name: id, namespace: [], kind: 'requirement', requirementId: id, text: 't', status: 'approved', version: '1' } as any;
    const state = createSysmlGatewayState(r, {}, {}, undefined, context);
    const result = executeSysmlCommand(state, { type: 'createElement', element: { id: 'l', kind: 'verify', sourceId: 'a', targetId: 'b' } } as any, undefined, context);
    expect(result.committed).toBe(false);
  });
});
