import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from './model';
import {
  allocatedFrom, allocatedTo, allocationCellKey, allocationNamesByElement, buildAllocationMatrix,
  formatAllocationCompartment, listAllocationElements,
} from './allocation';
import { evaluateSysmlConnection } from './connectionPolicy';

function block(id: string, name: string): BlockDefinition {
  return { id, name, kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
}

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.engine = block('engine', 'Engine');
  repo.definitions.brake = block('brake', 'Brake');
  repo.definitions.vehicle = block('vehicle', 'Vehicle');
  repo.useCases.drive = { id: 'drive', kind: 'useCase', name: 'Drive', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] };
  repo.useCases.stop = { id: 'stop', kind: 'useCase', name: 'Stop', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] };
  repo.usages.front = { id: 'front', kind: 'part', name: 'front', ownerId: 'vehicle', typeId: 'brake', aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } };
  repo.relationships.a1 = { id: 'a1', kind: 'allocation', sourceId: 'drive', targetId: 'engine' };
  repo.relationships.a2 = { id: 'a2', kind: 'allocation', sourceId: 'drive', targetId: 'vehicle' };
  repo.relationships.a3 = { id: 'a3', kind: 'allocation', sourceId: 'engine', targetId: 'vehicle' };
  return repo;
}

describe('allocation queries', () => {
  it('lists names and kinds sorted, never ids', () => {
    const repo = model();
    expect(allocatedTo(repo, 'drive').map(link => [link.element.name, link.element.kind])).toEqual([['Engine', 'block'], ['Vehicle', 'block']]);
    expect(allocatedFrom(repo, 'vehicle').map(link => link.element.name)).toEqual(['Drive', 'Engine']);
    expect(allocatedFrom(repo, 'drive')).toEqual([]);
    expect(allocationNamesByElement(repo).get('vehicle')).toEqual({ allocatedFrom: ['Drive', 'Engine'], allocatedTo: [] });
    expect(allocationNamesByElement(repo).get('brake')).toBeUndefined();
  });

  it('labels unnamed elements by kind instead of exposing ids', () => {
    const repo = model();
    repo.definitions.engine.name = ' ';
    expect(allocatedTo(repo, 'drive')[0].element.name).toBe('Block');
  });

  it('formats compartments only when non-empty', () => {
    expect(formatAllocationCompartment('allocatedFrom', [])).toEqual([]);
    expect(formatAllocationCompartment('allocatedTo', ['Engine', 'Vehicle'])).toEqual(['«allocatedTo»', '  Engine', '  Vehicle']);
  });
});

describe('allocation matrix projection', () => {
  it('builds rows, columns, cells and coverage', () => {
    const repo = model();
    const matrix = buildAllocationMatrix(repo, { rowKinds: ['useCase'], columnKinds: ['block', 'part'] });
    expect(matrix.rows.map(row => row.name)).toEqual(['Drive', 'Stop']);
    expect(matrix.columns.map(column => column.name)).toEqual(['Brake', 'Engine', 'front', 'Vehicle']);
    expect(matrix.cells[allocationCellKey('drive', 'engine')]).toEqual(['a1']);
    expect(matrix.cells[allocationCellKey('drive', 'vehicle')]).toEqual(['a2']);
    expect(matrix.cells[allocationCellKey('stop', 'engine')]).toBeUndefined();
    expect(matrix.coverage).toMatchObject({
      rowCount: 2, allocatedRowCount: 1, unallocatedRowIds: ['stop'],
      columnCount: 4, allocatedColumnCount: 2, unallocatedColumnIds: ['brake', 'front'],
    });
  });

  it('ignores allocations whose endpoints are outside the chosen kinds', () => {
    const matrix = buildAllocationMatrix(model(), { rowKinds: ['block'], columnKinds: ['block'] });
    expect(Object.keys(matrix.cells)).toEqual([allocationCellKey('engine', 'vehicle')]);
  });

  it('uses behaviour-like rows and structural columns by default', () => {
    const matrix = buildAllocationMatrix(model());
    expect(matrix.rows.some(row => row.kind === 'useCase')).toBe(true);
    expect(matrix.columns.every(column => column.kind === 'block' || column.kind === 'part')).toBe(true);
    expect(listAllocationElements(model(), ['package']).map(element => element.id)).toContain('model');
  });
});

describe('allocation connection policy', () => {
  const endpoint = (id: string) => ({ id, name: id, family: 'block' as const });
  it.each(['bdd', 'ibd', 'requirements', 'package', 'activity', 'useCase'] as const)('allows «allocate» on %s', diagram => {
    expect(evaluateSysmlConnection({ relationshipKind: 'allocation', diagram, source: endpoint('a'), target: endpoint('b') }).allowed).toBe(true);
  });
  it('rejects self allocation and unsupported diagrams', () => {
    expect(evaluateSysmlConnection({ relationshipKind: 'allocation', diagram: 'ibd', source: endpoint('a'), target: endpoint('a') }).diagnostics[0].code).toBe('SELF_RELATIONSHIP');
    expect(evaluateSysmlConnection({ relationshipKind: 'allocation', diagram: 'statemachine', source: endpoint('a'), target: endpoint('b') }).allowed).toBe(false);
    expect(evaluateSysmlConnection({ relationshipKind: 'generalization', diagram: 'ibd', source: endpoint('a'), target: endpoint('b') }).allowed).toBe(false);
  });
});
