import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from './stateMachineCodeGenerator';
import { flatOrFixture } from './stateMachine/smFixtures';
import { createEmptyRepository } from '../engine/sysml/model';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  type SysmlGatewayState,
} from '../services/sysmlCommandGateway';

describe('State Machine Code Generator Repository Isolation', () => {
  it('produces identical artifacts before and after SysML presentation changes', () => {
    const chart = flatOrFixture();
    const before = generateMISRACCode(chart);

    const repository = createEmptyRepository();
    repository.definitions['blk-motor'] = {
      id: 'blk-motor',
      name: 'Motor',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    let sysml: SysmlGatewayState = createSysmlGatewayState(repository);
    sysml = executeSysmlCommand(sysml, { type: 'addToDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });
    sysml = executeSysmlCommand(sysml, { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['blk-motor'] });
    sysml = executeSysmlCommand(sysml, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });

    const after = generateMISRACCode(chart);
    const stable = (content: string) => content.replace(/Model: ADIA State Machine \| .* UTC/, 'Model: ADIA State Machine | <timestamp> UTC');
    expect(after.errors).toEqual(before.errors);
    expect(after.warnings).toEqual(before.warnings);
    expect(after.files.map(file => [file.name, stable(file.content)]))
      .toEqual(before.files.map(file => [file.name, stable(file.content)]));
  });
});
