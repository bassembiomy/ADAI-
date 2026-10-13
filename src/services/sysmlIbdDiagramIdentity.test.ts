import { describe, it, expect } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildCreatePathIbdConnectorCommand } from './sysmlIbdConnectorCommands';
import { projectActiveDiagram } from '../engine/sysml/projection/activeDiagramProjection';

function fixture() {
  const repo = createEmptyRepository();
  const block = (id: string): BlockDefinition => ({ id, name: id, kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] });
  repo.definitions.system = block('system');
  repo.definitions.component = block('component');
  for (const id of ['ibd-a', 'ibd-b']) repo.diagrams[id] = { id, name: id, kind: 'diagram', diagramKind: 'ibd', contextElementId: 'system', ownerId: 'system', namespace: [] };
  return createSysmlGatewayState(repo);
}

it('creates and presents a part in the named IBD with one undo step', () => {
  const base = fixture();
  const result = executeSysmlCommand(base, { type: 'createOwnedFeature', intent: { featureKind: 'property', ownerBlockId: 'system', propertyKind: 'part', typeId: 'component', featureId: 'left', name: 'left' }, diagramId: 'ibd-a', presentation: { x: 123, y: 234, width: 150, height: 100 } });
  expect(result.committed).toBe(true);
  expect(result.diagramPresentations['ibd-a'].elementIds).toContain('left');
  expect(projectActiveDiagram(result.store!, 'ibd-a').parts.find(part => part.id === 'left')).toMatchObject({ x: 123, y: 234 });
  expect(projectActiveDiagram(result.store!, 'ibd-b').parts).toEqual([]);
  const undone = executeSysmlCommand({ ...base, ...result }, { type: 'undo' });
  expect((undone.repository.definitions.system as BlockDefinition).properties).toEqual([]);
  expect(projectActiveDiagram(undone.store!, 'ibd-a').parts).toEqual([]);
  const redone = executeSysmlCommand({ ...base, ...undone }, { type: 'redo' });
  expect(projectActiveDiagram(redone.store!, 'ibd-a').parts.find(part => part.id === 'left')).toMatchObject({ x: 123, y: 234 });
});

it('presents a connector in the selected IBD while keeping its semantic owner Block', () => {
  const state = fixture();
  const system = state.repository.definitions.system as BlockDefinition;
  system.properties = ['left', 'right'].map(id => ({ id, name: id, kind: 'part', typeId: 'component', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }));
  const plan = buildCreatePathIbdConnectorCommand(state.repository, { contextId: 'system', diagramId: 'ibd-b', source: { path: ['left'] }, target: { path: ['right'] } });
  expect(plan.ok).toBe(true);
  expect(plan.command).toMatchObject({ diagramId: 'ibd-b', element: { ownerId: 'system' } });
});
