import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PortDefinition, type PropertyDefinition, type SysmlRepository } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram } from '../../services/sysmlCommandGateway';
import { buildCreatePathIbdConnectorCommand } from '../../services/sysmlIbdConnectorCommands';
import {
  connectorNestingDepth,
  isDrawnInIbd,
  layoutIbdNestedParts,
  MAX_NESTED_PART_DEPTH,
  structuralPropertiesOf,
} from './ibdNestedParts';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const part = (id: string, typeId: string, name = id): PropertyDefinition => ({ id, name, kind: 'part', typeId, multiplicity: one });
const port = (id: string, direction: PortDefinition['direction']): PortDefinition => ({
  id, name: id, kind: 'standard', typeId: '', direction, isConjugated: false, multiplicity: one,
});
const block = (id: string, properties: PropertyDefinition[] = [], ports: PortDefinition[] = [], extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties, ports, operations: [], constraints: [], ...extra,
});

/** vehicle { engine: Engine { crank: Crankshaft { bearing: Bearing } }, pump: Pump } */
function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.vehicle = block('vehicle', [part('engine', 'Engine'), part('pump', 'Pump')]);
  repo.definitions.Engine = block('Engine', [part('crank', 'Crankshaft'), part('piston', 'Piston')], [port('eng-out', 'out')]);
  repo.definitions.Crankshaft = block('Crankshaft', [part('bearing', 'Bearing')], [port('crank-out', 'out')]);
  repo.definitions.Bearing = block('Bearing', [], [port('bearing-in', 'in')]);
  repo.definitions.Piston = block('Piston', [], [port('piston-in', 'in')]);
  repo.definitions.Pump = block('Pump', [], [port('pump-in', 'in')]);
  return repo;
}

const topParts = (repo: SysmlRepository) => projectLegacyDiagram(repo).parts.filter(p => p.blockId === 'vehicle').map((p, index) => ({ ...p, x: 100 + index * 400, y: 100, width: 150, height: 100 }));
const ids = (parts: readonly { id: string }[]) => parts.map(p => p.id).sort();

describe('nested parts on an IBD', () => {
  it('draws a part\'s own parts inside its symbol, one level by default', () => {
    const repo = model();
    const drawn = layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true });
    expect(ids(drawn)).toEqual(['engine', 'engine/crank', 'engine/piston', 'pump']);
    // Their ids are the property paths a connector end uses.
    expect(drawn.find(p => p.id === 'engine/crank')).toMatchObject({ propertyId: 'crank', name: 'crank', typeId: 'Crankshaft', parentPartId: 'engine', blockId: 'engine' });
  });

  it('keeps every nested part inside its parent and grows the parent to hold them', () => {
    const repo = model();
    const drawn = layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true, depth: 2 });
    const byId = new Map(drawn.map(p => [p.id, p]));
    const inside = (child: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
      child.x >= outer.x && child.y >= outer.y && child.x + child.width <= outer.x + outer.width && child.y + child.height <= outer.y + outer.height;
    expect(ids(drawn)).toEqual(['engine', 'engine/crank', 'engine/crank/bearing', 'engine/piston', 'pump']);
    for (const nested of drawn.filter(p => p.parentPartId)) {
      expect(inside(nested, byId.get(nested.parentPartId!)!), nested.id).toBe(true);
    }
    expect(byId.get('engine')!.width).toBeGreaterThan(150);
    // Siblings do not overlap.
    const a = byId.get('engine/crank')!;
    const b = byId.get('engine/piston')!;
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    // The part without parts keeps its own size.
    expect(byId.get('pump')).toMatchObject({ width: 150, height: 100 });
  });

  it('shows deeper levels only when asked, and caps the depth', () => {
    const repo = model();
    expect(ids(layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true, depth: 1 }))).not.toContain('engine/crank/bearing');
    expect(ids(layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true, depth: 2 }))).toContain('engine/crank/bearing');
    expect(layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true, depth: 99 }).length)
      .toBe(layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true, depth: MAX_NESTED_PART_DEPTH }).length);
  });

  it('draws only the top-level parts when nested parts are turned off, and drops nested parts the projection derived', () => {
    const repo = model();
    const derivedNested = { id: 'engine/crank', name: 'crank', blockId: 'engine', parentPartId: 'engine', typeId: 'Crankshaft', x: 0, y: 0, width: 150, height: 100 };
    const drawn = layoutIbdNestedParts(repo, 'vehicle', [...topParts(repo), derivedNested], { enabled: false });
    expect(ids(drawn)).toEqual(['engine', 'pump']);
    const on = layoutIbdNestedParts(repo, 'vehicle', [...topParts(repo), derivedNested], { enabled: true });
    expect(on.filter(p => p.id === 'engine/crank')).toHaveLength(1);
    expect(on.find(p => p.id === 'engine/crank')!.width).toBeGreaterThan(0);
    expect(on.find(p => p.id === 'engine/crank')!.x).toBeGreaterThan(0);
  });

  it('follows the parent when it moves', () => {
    const repo = model();
    const before = layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true });
    const moved = topParts(repo).map(p => p.id === 'engine' ? { ...p, x: p.x + 50, y: p.y + 30 } : p);
    const after = layoutIbdNestedParts(repo, 'vehicle', moved, { enabled: true });
    const a = before.find(p => p.id === 'engine/crank')!;
    const b = after.find(p => p.id === 'engine/crank')!;
    expect([b.x - a.x, b.y - a.y]).toEqual([50, 30]);
  });

  it('raises the depth to what a connector of the context needs, so it keeps both ends', () => {
    const repo = model();
    const plan = buildCreatePathIbdConnectorCommand(repo, {
      contextId: 'vehicle', connectorId: 'c-deep',
      source: { path: ['engine', 'crank', 'bearing'], portId: 'bearing-in' }, target: { path: ['pump'], portId: 'pump-in' },
      kind: 'assembly',
    });
    expect(plan.diagnostics).toEqual([]);
    repo.connectors['c-deep'] = plan.connector!;
    expect(connectorNestingDepth(repo, 'vehicle')).toBe(2);
    const drawn = layoutIbdNestedParts(repo, 'vehicle', topParts(repo), { enabled: true, depth: 1 });
    expect(ids(drawn)).toContain('engine/crank/bearing');
  });

  it('inherits parts from supertypes and does not recurse through a Block that contains itself', () => {
    const repo = model();
    repo.definitions.Base = block('Base', [part('shared', 'Piston')]);
    repo.definitions.Engine = { ...(repo.definitions.Engine as BlockDefinition), supertypeIds: ['Base'] };
    expect(structuralPropertiesOf(repo, 'Engine').map(p => p.id)).toEqual(['crank', 'piston', 'shared']);

    repo.definitions.Node = block('Node', [part('child', 'Node')]);
    repo.definitions.vehicle = block('vehicle', [part('tree', 'Node')]);
    const drawn = layoutIbdNestedParts(repo, 'vehicle', [{ id: 'tree', name: 'tree', blockId: 'vehicle', typeId: 'Node', x: 0, y: 0, width: 150, height: 100 }], { enabled: true, depth: 4 });
    expect(ids(drawn)).toEqual(['tree']);
  });

  it('classifies what the IBD draws', () => {
    const repo = model();
    const drawn = layoutIbdNestedParts(repo, 'vehicle', [...topParts(repo), { id: 'x', name: 'x', blockId: 'other', x: 0, y: 0, width: 1, height: 1 }], { enabled: true });
    expect(drawn.filter(p => isDrawnInIbd(p, 'vehicle')).map(p => p.id).sort()).toEqual(['engine', 'engine/crank', 'engine/piston', 'pump']);
  });
});

describe('a nested connector two levels deep validates, renders and survives save and load', () => {
  it('connects a nested port to a part through the gateway and projects both ends as drawn parts', () => {
    const repo = model();
    const plan = buildCreatePathIbdConnectorCommand(repo, {
      contextId: 'vehicle', connectorId: 'c-nested',
      source: { path: ['engine', 'crank'], portId: 'crank-out' }, target: { path: ['pump'], portId: 'pump-in' },
    });
    expect(plan.diagnostics).toEqual([]);
    const result = executeSysmlCommand(createSysmlGatewayState(repo), plan.command!);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.usages).toEqual({});

    const view = projectLegacyDiagram(result.repository, result.coordinates, result.diagramPresentations, 'vehicle');
    const connector = view.connectors.find(c => c.id === 'c-nested')!;
    expect(connector).toMatchObject({ sourcePartId: 'engine/crank', sourcePortId: 'crank-out', targetPartId: 'pump', targetPortId: 'pump-in' });

    const drawn = layoutIbdNestedParts(result.repository, 'vehicle', view.parts.map((p, i) => ({ ...p, x: 100 + i * 300, y: 100, width: 150, height: 100 })), { enabled: true });
    const drawnIds = new Set(drawn.map(p => p.id));
    expect(drawnIds.has(connector.sourcePartId)).toBe(true);
    expect(drawnIds.has(connector.targetPartId)).toBe(true);
  });

  it('refuses a nested end that does not exist or a delegation that is not directly on a part', () => {
    const repo = model();
    const missing = buildCreatePathIbdConnectorCommand(repo, {
      contextId: 'vehicle', source: { path: ['engine', 'nope'], portId: 'crank-out' }, target: { path: ['pump'], portId: 'pump-in' },
    });
    expect(missing.ok).toBe(false);
    repo.definitions.vehicle = block('vehicle', (repo.definitions.vehicle as BlockDefinition).properties, [port('boundary', 'out')]);
    const deep = buildCreatePathIbdConnectorCommand(repo, {
      contextId: 'vehicle', kind: 'delegation', source: { path: [], portId: 'boundary' }, target: { path: ['engine', 'crank'], portId: 'crank-out' },
    });
    expect(deep.diagnostics.map(d => d.code)).toContain('INVALID_DELEGATION_ENDPOINTS');
  });
});
