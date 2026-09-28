import { describe, expect, it } from 'vitest';
import type { BlockData, ConnectorData, PartData } from '../types/sysml_types';
import { reconcileAllPropertyUsages, reconcilePropertyUsages } from './sysmlPropertyUsageSync';

const block = (id: string, name = id, properties: BlockData['properties'] = []): BlockData => ({
  id, name, stereotype: 'block', x: 0, y: 0, width: 100, height: 80,
  properties, operations: [], constraints: [], classes: [], ports: [],
});

const usage = (overrides: Partial<PartData>): PartData => ({
  id: 'usage-1', name: 'oldName', blockId: 'owner', typeId: 'motor',
  x: 220, y: 180, width: 150, height: 100, multiplicity: '1', ...overrides,
});

describe('BDD/IBD property usage reconciliation', () => {
  it('projects a newly-created IBD part into the owning block properties', () => {
    const result = reconcilePropertyUsages(
      [block('owner', 'System'), block('motor', 'Motor')],
      [usage({ id: 'part-1', name: 'drive', typeId: 'motor', blockId: 'owner' })],
      [], 'owner', 'usage',
    );
    expect(result.blocks.find(item => item.id === 'owner')?.properties).toEqual([
      expect.objectContaining({ id: 'part-1', name: 'drive', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1' }),
    ]);
  });

  it('uses stable property identity when the part and property ids differ', () => {
    const result = reconcilePropertyUsages(
      [block('owner', 'System', [{ id: 'property-1', name: 'oldDrive', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1' }]), block('motor', 'Motor')],
      [usage({ id: 'usage-1', propertyId: 'property-1', name: 'drive', typeId: 'motor', blockId: 'owner' })],
      [], 'owner', 'usage',
    );
    expect(result.blocks.find(item => item.id === 'owner')?.properties).toEqual([
      expect.objectContaining({ id: 'property-1', name: 'drive', typeId: 'motor', kind: 'part' }),
    ]);
    expect(result.parts).toEqual([expect.objectContaining({ id: 'usage-1', propertyId: 'property-1' })]);
  });

  it('projects unresolved legacy parts as repairable BDD part properties', () => {
    const result = reconcileAllPropertyUsages(
      [block('owner', 'System')],
      [usage({ id: 'legacy-part', name: 'part_1', typeId: null, blockId: 'owner' })],
      [],
    );
    expect(result.blocks[0].properties).toEqual([
      expect.objectContaining({ id: 'legacy-part', name: 'part_1', kind: 'part', type: '', multiplicity: '1' }),
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_PROPERTY_TYPE', elementId: 'legacy-part' }),
    ]));
  });

  it('reconciles every block context for loaded projects', () => {
    const result = reconcileAllPropertyUsages(
      [block('a', 'A'), block('b', 'B'), block('motor', 'Motor')],
      [usage({ id: 'a-part', name: 'left', blockId: 'a' }), usage({ id: 'b-part', name: 'right', blockId: 'b' })],
      [],
    );
    expect(result.blocks.find(item => item.id === 'a')?.properties.map(item => item.name)).toEqual(['left']);
    expect(result.blocks.find(item => item.id === 'b')?.properties.map(item => item.name)).toEqual(['right']);
  });

  it('creates one composite IBD usage for a block part property', () => {
    const result = reconcilePropertyUsages(
      [block('owner', 'System', [{ id: 'prop-1', name: 'motor', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1' }]), block('motor', 'Motor')],
      [], [], 'owner',
    );
    expect(result.parts).toEqual([expect.objectContaining({ id: 'prop-1', name: 'motor', blockId: 'owner', typeId: 'motor', aggregation: 'composite' })]);
  });

  it('creates reference usages but does not create usages for value or flow properties', () => {
    const result = reconcilePropertyUsages(
      [block('owner', 'System', [
        { id: 'ref-1', name: 'sharedMotor', type: 'Motor', typeId: 'motor', kind: 'reference', multiplicity: '1' },
        { id: 'value-1', name: 'speed', type: 'Real', typeId: 'real', kind: 'value', multiplicity: '1' },
        { id: 'flow-1', name: 'command', type: 'Signal', typeId: 'signal', kind: 'flow', multiplicity: '1' },
      ]), block('motor', 'Motor'), block('real', 'Real', []), block('signal', 'Signal', [])],
      [], [], 'owner',
    );
    expect(result.parts).toEqual([expect.objectContaining({ id: 'ref-1', aggregation: 'reference' })]);
  });

  it('updates an existing usage while preserving its layout and connectors', () => {
    const connector: ConnectorData = { id: 'c1', sourcePartId: 'usage-1', sourcePortId: 'p1', targetPartId: 'other', targetPortId: 'p2' };
    const result = reconcilePropertyUsages(
      [block('owner', 'System', [{ id: 'usage-1', name: 'drive', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '0..*' }]), block('motor', 'Motor')],
      [usage({})], [connector], 'owner',
    );
    expect(result.parts[0]).toEqual(expect.objectContaining({ id: 'usage-1', name: 'drive', multiplicity: '0..*', x: 220, y: 180 }));
    expect(result.connectors).toEqual([connector]);
  });

  it('removes a paired usage and its connectors when the property is removed', () => {
    const result = reconcilePropertyUsages([block('owner', 'System', []), block('motor', 'Motor')], [usage({})], [{ id: 'c1', sourcePartId: 'usage-1', sourcePortId: 'p1', targetPartId: 'other', targetPortId: 'p2' }], 'owner', 'property');
    expect(result.parts).toEqual([]);
    expect(result.connectors).toEqual([]);
  });

  it('is idempotent', () => {
    const blocks = [block('owner', 'System', [{ id: 'prop-1', name: 'motor', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1' }]), block('motor', 'Motor')];
    const first = reconcilePropertyUsages(blocks, [], [], 'owner');
    const second = reconcilePropertyUsages(first.blocks, first.parts, first.connectors, 'owner');
    expect(second).toEqual(first);
  });

  it('reconciles canonical PartUsage ID into both BDD property compartment and IBD parts identically with no duplicate feature/usage on refresh', () => {
    const vehicle = block('vehicle', 'Vehicle', [
      { id: 'part-engine-1', name: 'engine', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1' }
    ]);
    const motor = block('motor', 'Motor');

    // Reconcile from property to usages (BDD -> IBD)
    const initial = reconcilePropertyUsages([vehicle, motor], [], [], 'vehicle', 'property');
    expect(initial.parts).toHaveLength(1);
    const partUsageId = initial.parts[0].id;
    // The PartUsage ID in IBD must equal the property ID in BDD compartment
    expect(partUsageId).toBe('part-engine-1');
    expect(initial.parts[0].propertyId).toBe('part-engine-1');
    expect(initial.blocks[0].properties[0].id).toBe('part-engine-1');

    // Refresh (reconcileAllPropertyUsages)
    const refreshed = reconcileAllPropertyUsages(initial.blocks, initial.parts, initial.connectors);
    expect(refreshed.blocks.find(b => b.id === 'vehicle')?.properties).toHaveLength(1);
    expect(refreshed.parts.filter(p => p.blockId === 'vehicle')).toHaveLength(1);
    expect(refreshed.blocks.find(b => b.id === 'vehicle')?.properties[0].id).toBe('part-engine-1');
    expect(refreshed.parts.find(p => p.blockId === 'vehicle')?.id).toBe('part-engine-1');
  });
});
