import {
  createEmptyRepository,
  type BlockDefinition,
  type PartUsage,
  type PortDefinition,
  type PortUsage,
  type SysmlRepository,
} from '../model';
import { stableDiagramPresentationId, type DiagramPresentation } from '../presentationState';

/**
 * Models as the previous model format (3) saved them, for the format 5 upgrade tests.
 * Names are readable and ids are deliberately not, so a report or a label that leaks an id is caught.
 */
export const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
export const block = (id: string, name: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, name, namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [], ...extra,
});
export const port = (id: string, name: string, direction: PortDefinition['direction'], extra: Partial<PortDefinition> = {}): PortDefinition => ({
  id, name, kind: 'standard', typeId: '', direction, isConjugated: false, multiplicity: one, ...extra,
});
export const part = (id: string, name: string, ownerId: string, typeId: string, propertyId?: string, extra: Partial<PartUsage> = {}): PartUsage => ({
  id, kind: 'part', name, ownerId, typeId, aggregation: 'composite', multiplicity: one, ...(propertyId ? { propertyId } : {}), ...extra,
});
export const portUsage = (id: string, name: string, ownerId: string, definitionId: string): PortUsage => ({ id, kind: 'port', name, ownerId, definitionId });

/**
 * A format 3 repository as the previous version saved it: names are readable,
 * ids are deliberately not, so a report that leaks an id is caught.
 */
export function flatModel(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions['b-veh'] = block('b-veh', 'Vehicle', {
    properties: [
      { id: 'pr-engine', name: 'engine', kind: 'part', typeId: 'b-eng', multiplicity: one },
      { id: 'pr-wheel', name: 'wheel', kind: 'part', typeId: 'b-whl', multiplicity: one },
      { id: 'pr-mass', name: 'mass', kind: 'value', typeId: 'vt-mass', multiplicity: one },
      { id: 'pr-mass2', name: 'dry mass', kind: 'value', typeId: 'vt-mass', multiplicity: one },
    ],
    ports: [port('po-veh-fuel', 'fuel', 'in')],
  });
  repo.definitions['b-eng'] = block('b-eng', 'Engine', { ports: [port('po-eng-torque', 'torque', 'out'), port('po-eng-fuel', 'fuel', 'in')] });
  repo.definitions['b-whl'] = block('b-whl', 'Wheel', { ports: [port('po-whl-torque', 'torque', 'in')] });
  repo.definitions['vt-mass'] = { id: 'vt-mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'model' };
  repo.requirements['rq-1'] = {
    id: 'rq-1', kind: 'requirement', name: 'Move', namespace: [], ownerId: 'model', requirementId: 'REQ-1',
    text: 'The vehicle moves', status: 'approved', version: '1',
  };
  repo.usages['u-eng'] = part('u-eng', 'engine', 'b-veh', 'b-eng', 'pr-engine');
  repo.usages['u-whl'] = part('u-whl', 'wheel', 'b-veh', 'b-whl', 'pr-wheel');
  repo.usages['pu-eng-torque'] = portUsage('pu-eng-torque', 'torque', 'u-eng', 'po-eng-torque');
  repo.usages['pu-eng-fuel'] = portUsage('pu-eng-fuel', 'fuel', 'u-eng', 'po-eng-fuel');
  repo.usages['pu-whl-torque'] = portUsage('pu-whl-torque', 'torque', 'u-whl', 'po-whl-torque');
  repo.usages['pu-veh-fuel'] = portUsage('pu-veh-fuel', 'fuel', 'b-veh', 'po-veh-fuel');
  // Every kind of connector end: port to port, boundary delegation, part to part, parametric binding.
  repo.connectors['c-asm'] = { id: 'c-asm', kind: 'assembly', ownerId: 'b-veh', sourcePortId: 'pu-eng-torque', targetPortId: 'pu-whl-torque' };
  repo.connectors['c-del'] = { id: 'c-del', kind: 'delegation', ownerId: 'b-veh', sourcePortId: 'pu-veh-fuel', targetPortId: 'pu-eng-fuel' };
  repo.connectors['c-part'] = { id: 'c-part', kind: 'assembly', ownerId: 'b-veh', sourcePortId: 'u-eng', targetPortId: 'u-whl' };
  repo.connectors['c-par'] = {
    id: 'c-par', kind: 'binding', ownerId: 'b-veh', sourcePortId: 'pr-mass', targetPortId: 'pr-mass2',
    sourceEnd: { propertyId: 'pr-mass' }, targetEnd: { propertyId: 'pr-mass2' },
  };
  // Relationships whose ends were usage ids.
  repo.relationships['rl-sat'] = { id: 'rl-sat', kind: 'satisfy', sourceId: 'u-eng', targetId: 'rq-1' };
  repo.relationships['rl-alloc'] = { id: 'rl-alloc', kind: 'allocation', sourceId: 'u-whl', targetId: 'b-eng' };
  return repo;
}

/** A format 3 file as the loader receives it. */
export const asV3 = (repo: SysmlRepository): unknown => ({ ...JSON.parse(JSON.stringify(repo)), schemaVersion: 3 });

export const presentation = (diagramId: string, ids: string[], bounds: Record<string, { x: number; y: number }> = {}): DiagramPresentation => ({
  elementIds: ids,
  presentations: Object.fromEntries(ids.map(id => [id, {
    id: stableDiagramPresentationId(diagramId, id), diagramId, semanticElementId: id, bounds: bounds[id] ?? { x: 10, y: 20 },
    ...(id === 'u-eng' ? { portLayouts: { 'po-eng-torque': { side: 'right' as const, offset: 0.5 } } } : {}),
  }])),
});

/** Flat model plus an Axle whose two nested wheels were drawn inside the axle part. */
export function nestedModel(): SysmlRepository {
  const repo = flatModel();
  repo.definitions['b-axle'] = block('b-axle', 'Axle');
  (repo.definitions['b-veh'] as BlockDefinition).properties.push({ id: 'pr-axle', name: 'axle', kind: 'part', typeId: 'b-axle', multiplicity: one });
  repo.usages['u-axle'] = part('u-axle', 'axle', 'b-veh', 'b-axle', 'pr-axle');
  repo.usages['u-left'] = part('u-left', 'left', 'u-axle', 'b-whl');
  repo.usages['u-right'] = part('u-right', 'right', 'u-axle', 'b-whl');
  repo.usages['pu-left-torque'] = portUsage('pu-left-torque', 'torque', 'u-left', 'po-whl-torque');
  repo.connectors['c-nested'] = { id: 'c-nested', kind: 'assembly', ownerId: 'b-veh', sourcePortId: 'pu-eng-torque', targetPortId: 'pu-left-torque' };
  repo.relationships['rl-nested'] = { id: 'rl-nested', kind: 'satisfy', sourceId: 'u-left', targetId: 'rq-1' };
  return repo;
}

/** Flat model plus an Axle part used three times: the front axle has one nested wheel, the rear two, the spare none. */
export function divergentModel(): SysmlRepository {
  const repo = flatModel();
  repo.definitions['b-axle'] = block('b-axle', 'Axle');
  const vehicle = repo.definitions['b-veh'] as BlockDefinition;
  for (const [id, name] of [['pr-a1', 'front'], ['pr-a2', 'rear'], ['pr-a3', 'spare']] as const) {
    vehicle.properties.push({ id, name, kind: 'part', typeId: 'b-axle', multiplicity: one });
  }
  repo.usages['u-a1'] = part('u-a1', 'front', 'b-veh', 'b-axle', 'pr-a1');
  repo.usages['u-a2'] = part('u-a2', 'rear', 'b-veh', 'b-axle', 'pr-a2');
  repo.usages['u-a3'] = part('u-a3', 'spare', 'b-veh', 'b-axle', 'pr-a3');
  repo.usages['u-a1-l'] = part('u-a1-l', 'left', 'u-a1', 'b-whl');
  repo.usages['u-a2-l'] = part('u-a2-l', 'left', 'u-a2', 'b-whl');
  repo.usages['u-a2-r'] = part('u-a2-r', 'right', 'u-a2', 'b-whl');
  repo.usages['pu-a2-r'] = portUsage('pu-a2-r', 'torque', 'u-a2-r', 'po-whl-torque');
  repo.connectors['c-div'] = { id: 'c-div', kind: 'assembly', ownerId: 'b-veh', sourcePortId: 'pu-eng-torque', targetPortId: 'pu-a2-r' };
  return repo;
}
