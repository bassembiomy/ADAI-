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
  it('produces identical artifacts after SysML semantic rename and presentation add, move, and remove', () => {
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
    let result = executeSysmlCommand(sysml, {
      type: 'addToDiagram', diagramId: 'requirements', elementIds: ['blk-motor'],
      coordinates: { 'blk-motor': { x: 20, y: 30 } },
    });
    expect(result.committed).toBe(true);
    sysml = result;
    result = executeSysmlCommand(sysml, {
      type: 'addToDiagram', diagramId: 'bdd', elementIds: ['blk-motor'],
      coordinates: { 'blk-motor': { x: 100, y: 120 } },
    });
    expect(result.committed).toBe(true);
    sysml = result;
    result = executeSysmlCommand(sysml, { type: 'updateElement', elementId: 'blk-motor', patch: { name: 'BLDCMotor' } });
    expect(result.committed).toBe(true);
    sysml = result;
    result = executeSysmlCommand(sysml, {
      type: 'updatePresentation', diagramId: 'bdd', elementId: 'blk-motor', presentation: { x: 240, y: 260 },
    });
    expect(result.committed).toBe(true);
    sysml = result;
    result = executeSysmlCommand(sysml, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });
    expect(result.committed).toBe(true);
    sysml = result;
    expect(sysml.repository.definitions['blk-motor'].name).toBe('BLDCMotor');
    expect(sysml.diagramPresentations!.requirements.elementIds).not.toContain('blk-motor');
    expect(sysml.diagramPresentations!.bdd.presentations['blk-motor'].bounds).toMatchObject({ x: 240, y: 260 });

    const after = generateMISRACCode(chart);
    const stable = (content: string) => content.replace(/Model: ADIA State Machine \| .* UTC/, 'Model: ADIA State Machine | <timestamp> UTC');
    expect(after.errors).toEqual(before.errors);
    expect(after.warnings).toEqual(before.warnings);
    expect(after.files.map(file => [file.name, stable(file.content)]))
      .toEqual(before.files.map(file => [file.name, stable(file.content)]));
  });
});
