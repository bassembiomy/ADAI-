import { describe, expect, it } from 'vitest';
import {
  computeImpactHash, createSysmlGatewayState, executeSysmlCommand, loadCanonicalSysmlProject, projectLegacyDiagram,
  buildCanonicalSysmlProjectPayload,
} from './sysmlCommandGateway';
import { createEmptyRepository, type BlockDefinition } from '../engine/sysml/model';
import { buildCreateAllocationCommand, buildDeleteAllocationCommand } from './sysmlAllocationCommands';
import { computeBlockDisplayBounds } from '../components/sysml/blockLayout';

function block(id: string, name: string): BlockDefinition {
  return { id, name, kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
}

function start() {
  const repo = createEmptyRepository();
  repo.definitions.engine = block('engine', 'Engine');
  repo.definitions.vehicle = block('vehicle', 'Vehicle');
  repo.useCases.drive = { id: 'drive', kind: 'useCase', name: 'Drive', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] };
  return createSysmlGatewayState(repo);
}

describe('allocation commands through the gateway', () => {
  it('creates an allocation as one undo step, rejects a duplicate and rejects self allocation', () => {
    const state = start();
    const created = executeSysmlCommand(state, buildCreateAllocationCommand(state.repository, 'drive', 'engine'));
    expect(created.committed).toBe(true);
    expect(Object.values(created.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(1);

    const duplicate = executeSysmlCommand({ ...state, ...created }, buildCreateAllocationCommand(created.repository, 'drive', 'engine'));
    expect(duplicate.committed).toBe(false);
    expect(duplicate.diagnostics.map(d => d.code)).toContain('DUPLICATE_RELATIONSHIP');

    const self = executeSysmlCommand(state, buildCreateAllocationCommand(state.repository, 'engine', 'engine'));
    expect(self.committed).toBe(false);

    const undone = executeSysmlCommand({ ...state, ...created }, { type: 'undo' });
    expect(Object.values(undone.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(0);
  });

  it('deletes through the impact confirmation flow and undoes it', () => {
    const state = start();
    const created = executeSysmlCommand(state, buildCreateAllocationCommand(state.repository, 'drive', 'engine'));
    const id = Object.keys(created.repository.relationships)[0];
    const afterCreate = { ...state, ...created };
    const command = buildDeleteAllocationCommand([id]);
    const preview = executeSysmlCommand(afterCreate, command);
    if (!preview.committed) {
      expect(preview.impact).toBeDefined();
      const confirmed = executeSysmlCommand(afterCreate, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as typeof command);
      expect(confirmed.committed).toBe(true);
      expect(confirmed.repository.relationships[id]).toBeUndefined();
      const undone = executeSysmlCommand({ ...afterCreate, ...confirmed }, { type: 'undo' });
      expect(undone.repository.relationships[id]).toBeDefined();
    } else {
      expect(preview.repository.relationships[id]).toBeUndefined();
    }
  });

  it('survives save and load', () => {
    const state = start();
    const created = executeSysmlCommand(state, buildCreateAllocationCommand(state.repository, 'drive', 'vehicle'));
    const payload = buildCanonicalSysmlProjectPayload({ ...state, ...created }, { projectName: 'alloc', version: '1.0' });
    const loaded = loadCanonicalSysmlProject(JSON.parse(JSON.stringify(payload)));
    expect(Object.values(loaded.repository.relationships).some(rel => rel.kind === 'allocation' && rel.sourceId === 'drive' && rel.targetId === 'vehicle')).toBe(true);
  });

  it('projects allocatedFrom / allocatedTo names onto BDD blocks only when present', () => {
    const state = start();
    const first = executeSysmlCommand(state, buildCreateAllocationCommand(state.repository, 'drive', 'engine'));
    const second = executeSysmlCommand({ ...state, ...first }, buildCreateAllocationCommand(first.repository, 'engine', 'vehicle'));
    const view = projectLegacyDiagram(second.repository, {}, {});
    const engine = view.blocks.find(candidate => candidate.id === 'engine')!;
    const vehicle = view.blocks.find(candidate => candidate.id === 'vehicle')!;
    expect(engine.allocatedFrom).toEqual(['Drive']);
    expect(engine.allocatedTo).toEqual(['Vehicle']);
    expect(vehicle.allocatedFrom).toEqual(['Engine']);
    expect(vehicle.allocatedTo).toBeUndefined();

    const plain = projectLegacyDiagram(state.repository, {}, {}).blocks.find(candidate => candidate.id === 'engine')!;
    expect(plain.allocatedFrom).toBeUndefined();
    const base = computeBlockDisplayBounds(plain).height;
    expect(computeBlockDisplayBounds(engine).height).toBeGreaterThan(base);
    expect(computeBlockDisplayBounds({ ...engine, allocatedFrom: undefined, allocatedTo: undefined }).height).toBe(base);
  });
});
