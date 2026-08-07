import { describe, it, expect } from 'vitest';
import {
  migrateSysMLState,
  previewDeletionImpact,
  cascadeDeleteBlock,
  cascadeDeletePort,
  validateConnectorConnection,
} from './sysmlIntegrityService';
import { SysMLDiagramState } from '../types/sysml_types';

describe('sysmlIntegrityService - Schema Hydration', () => {
  it('hydrates empty or undefined state with empty arrays', () => {
    const migrated = migrateSysMLState({});
    expect(migrated).toEqual({
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    });
  });

  it('populates missing port direction with default "inout"', () => {
    const raw = {
      ports: [{ id: 'p1', name: 'Port 1', blockId: 'b1' }],
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.ports[0].direction).toBe('inout');
  });

  it('populates missing parentPartId with null', () => {
    const raw = {
      parts: [{ id: 'pt1', name: 'Part 1', typeBlockId: 'b1', parentBlockId: 'b2' }],
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.parts[0].parentPartId).toBeNull();
  });

  it('canonicalizes relation type "derive" to "deriveReqt"', () => {
    const raw = {
      relations: [{ id: 'r1', sourceId: 'req1', targetId: 'req2', type: 'derive' }],
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.relations[0].type).toBe('deriveReqt');
  });
});

describe('sysmlIntegrityService - Cascade Deletion & Impact Preview', () => {
  const sampleState: SysMLDiagramState = {
    blocks: [
      { id: 'b1', name: 'EngineBlock', ports: ['p1'], parts: ['pt1'] },
      { id: 'b2', name: 'SensorBlock', ports: ['p2'], parts: [] },
    ],
    ports: [
      { id: 'p1', name: 'OutPort', direction: 'out', blockId: 'b1' },
      { id: 'p2', name: 'InPort', direction: 'in', blockId: 'b2' },
    ],
    parts: [
      { id: 'pt1', name: 'SubPart', typeBlockId: 'b2', parentBlockId: 'b1', parentPartId: null },
    ],
    connectors: [
      { id: 'c1', sourcePortId: 'p1', targetPortId: 'p2' },
    ],
    requirements: [
      { id: 'req1', reqId: 'REQ-01', text: 'Must work' },
    ],
    relations: [
      { id: 'r1', sourceId: 'b1', targetId: 'req1', type: 'satisfy' },
    ],
  };

  it('previews deletion impact for a block', () => {
    const impact = previewDeletionImpact('b1', sampleState);
    expect(impact.elementId).toBe('b1');
    expect(impact.elementType).toBe('block');
    expect(impact.affectedParts).toContain('pt1');
    expect(impact.affectedConnectors).toContain('c1');
    expect(impact.affectedRelations).toContain('r1');
  });

  it('cascade deletes a block and all dependent parts/ports/connectors/relations', () => {
    const updatedState = cascadeDeleteBlock('b1', sampleState);
    expect(updatedState.blocks.find(b => b.id === 'b1')).toBeUndefined();
    expect(updatedState.ports.find(p => p.id === 'p1')).toBeUndefined();
    expect(updatedState.parts.find(pt => pt.id === 'pt1')).toBeUndefined();
    expect(updatedState.connectors.find(c => c.id === 'c1')).toBeUndefined();
    expect(updatedState.relations.find(r => r.id === 'r1')).toBeUndefined();
    // b2, p2, req1 should remain
    expect(updatedState.blocks.length).toBe(1);
    expect(updatedState.ports.length).toBe(1);
  });

  it('cascade deletes a port and affected connectors/relations', () => {
    const updatedState = cascadeDeletePort('p1', sampleState);
    expect(updatedState.ports.find(p => p.id === 'p1')).toBeUndefined();
    expect(updatedState.connectors.find(c => c.id === 'c1')).toBeUndefined();
    expect(updatedState.blocks.find(b => b.id === 'b1')?.ports).not.toContain('p1');
  });
});

describe('sysmlIntegrityService - Connector Validation', () => {
  const state: SysMLDiagramState = {
    blocks: [],
    ports: [
      { id: 'p_out1', name: 'Out1', direction: 'out', blockId: 'b1' },
      { id: 'p_out2', name: 'Out2', direction: 'out', blockId: 'b1' },
      { id: 'p_in1', name: 'In1', direction: 'in', blockId: 'b2' },
      { id: 'p_in2', name: 'In2', direction: 'in', blockId: 'b2' },
      { id: 'p_inout1', name: 'Bi1', direction: 'inout', blockId: 'b3' },
    ],
    parts: [],
    connectors: [
      { id: 'c_existing', sourcePortId: 'p_out1', targetPortId: 'p_in1' }
    ],
    requirements: [],
    relations: [],
  };

  it('validates out -> in connection as valid', () => {
    const res = validateConnectorConnection('p_out1', 'p_in2', state);
    expect(res.valid).toBe(true);
  });

  it('validates inout -> in connection as valid', () => {
    const res = validateConnectorConnection('p_inout1', 'p_in1', state);
    expect(res.valid).toBe(true);
  });

  it('rejects self-connection on same port', () => {
    const res = validateConnectorConnection('p_out1', 'p_out1', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Cannot connect a port to itself');
  });

  it('rejects out -> out connection', () => {
    const res = validateConnectorConnection('p_out1', 'p_out2', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('out');
  });

  it('rejects in -> in connection', () => {
    const res = validateConnectorConnection('p_in1', 'p_in2', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('in');
  });

  it('rejects duplicate connector between same ports', () => {
    const res = validateConnectorConnection('p_out1', 'p_in1', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('already exists');
  });
});


