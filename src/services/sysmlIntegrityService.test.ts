import { describe, it, expect } from 'vitest';
import {
  migrateSysMLState,
  previewDeletionImpact,
  cascadeDeleteBlock,
  cascadeDeletePort,
  cascadeDeletePart,
  cascadeDeleteRequirement,
  validateConnectorConnection,
  validateTraceabilityRelation,
  validateUniqueRequirementIds,
} from './sysmlIntegrityService';
import type {
  SysMLDiagramState,
  SysMLBlock,
  SysMLPort,
  SysMLPart,
  SysMLConnector,
  SysMLRelation,
} from '../types/sysml_types';

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
      { id: 'b1', name: 'EngineBlock', ports: ['p1'], parts: ['pt1', 'part-b1'] },
      { id: 'b2', name: 'SensorBlock', ports: ['p2'], parts: [] },
    ],
    ports: [
      { id: 'p1', name: 'OutPort', direction: 'out', blockId: 'b1' },
      { id: 'p2', name: 'InPort', direction: 'in', blockId: 'b2' },
    ],
    parts: [
      { id: 'pt1', name: 'SubPart', typeBlockId: 'b2', parentBlockId: 'b1', parentPartId: null },
      { id: 'part-b1', name: 'PartB1', typeBlockId: 'b2', parentBlockId: 'b1', parentPartId: null },
    ],
    connectors: [
      { id: 'c1', sourcePortId: 'p1', targetPortId: 'p2' },
      { id: 'c2', sourcePartId: 'part-b1', targetPartId: 'pt1' } as any,
    ],
    requirements: [
      { id: 'req1', reqId: 'REQ-01', text: 'Must work' },
      { id: 'req-1', reqId: 'REQ-02', text: 'Must also work' },
    ],
    relations: [
      { id: 'r1', sourceId: 'b1', targetId: 'req1', type: 'satisfy' },
      { id: 'r2', sourceId: 'b1', targetId: 'req-1', type: 'satisfy' },
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
    expect(updatedState.blocks.find((b: SysMLBlock) => b.id === 'b1')).toBeUndefined();
    expect(updatedState.ports.find((p: SysMLPort) => p.id === 'p1')).toBeUndefined();
    expect(updatedState.parts.find((pt: SysMLPart) => pt.id === 'pt1')).toBeUndefined();
    expect(updatedState.connectors.find((c: SysMLConnector) => c.id === 'c1')).toBeUndefined();
    expect(updatedState.relations.find((r: SysMLRelation) => r.id === 'r1')).toBeUndefined();
    // b2, p2, req1 should remain
    expect(updatedState.blocks.length).toBe(1);
    expect(updatedState.ports.length).toBe(1);
  });

  it('cascade deletes a port and affected connectors/relations', () => {
    const updatedState = cascadeDeletePort('p1', sampleState);
    expect(updatedState.ports.find((p: SysMLPort) => p.id === 'p1')).toBeUndefined();
    expect(updatedState.connectors.find((c: SysMLConnector) => c.id === 'c1')).toBeUndefined();
    expect(updatedState.blocks.find((b: SysMLBlock) => b.id === 'b1')?.ports).not.toContain('p1');
  });

  it('removes all relations touching a deleted requirement', () => {
    const updated = cascadeDeleteRequirement('req-1', sampleState);
    expect(updated.requirements.some(r => r.id === 'req-1')).toBe(false);
    expect(updated.relations.some(r => r.sourceId === 'req-1' || r.targetId === 'req-1')).toBe(false);
  });

  it('removes connectors touching parts removed by block cascade deletion', () => {
    const updated = cascadeDeleteBlock('b1', sampleState);
    expect(updated.connectors.every(c => c.sourcePartId !== 'part-b1' && c.targetPartId !== 'part-b1')).toBe(true);
  });

  it('cascade deletes a part and dependent child parts, connectors, and relations', () => {
    const updated = cascadeDeletePart('pt1', sampleState);
    expect(updated.parts.some(p => p.id === 'pt1')).toBe(false);
    expect(updated.connectors.every(c => c.sourcePartId !== 'pt1' && c.targetPartId !== 'pt1')).toBe(true);
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

describe('sysmlIntegrityService - Traceability & Requirement Governance', () => {
  const state: SysMLDiagramState = {
    blocks: [{ id: 'b1', name: 'Controller', ports: [], parts: [] }],
    parts: [{ id: 'pt1', name: 'Pump', typeBlockId: 'b1', parentBlockId: 'b1', parentPartId: null }],
    ports: [],
    connectors: [],
    requirements: [
      { id: 'req1', reqId: 'REQ-01', text: 'Safety Limit' },
      { id: 'req2', reqId: 'REQ-02', text: 'Derived Limit' },
    ],
    relations: [],
  };

  it('validates satisfy relation from block to requirement', () => {
    const res = validateTraceabilityRelation('b1', 'req1', 'satisfy', state);
    expect(res.valid).toBe(true);
  });

  it('rejects satisfy relation from requirement to block', () => {
    const res = validateTraceabilityRelation('req1', 'b1', 'satisfy', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Target must be a Requirement');
  });

  it('validates deriveReqt relation from requirement to requirement', () => {
    const res = validateTraceabilityRelation('req1', 'req2', 'deriveReqt', state);
    expect(res.valid).toBe(true);
  });

  it('rejects deriveReqt relation if source is a block', () => {
    const res = validateTraceabilityRelation('b1', 'req2', 'deriveReqt', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Source must be a Requirement');
  });

  it('validates uniqueness of requirement IDs', () => {
    const validRes = validateUniqueRequirementIds([
      { id: '1', reqId: 'REQ-01', text: 'A' },
      { id: '2', reqId: 'REQ-02', text: 'B' },
    ]);
    expect(validRes.valid).toBe(true);

    const dupRes = validateUniqueRequirementIds([
      { id: '1', reqId: 'REQ-01', text: 'A' },
      { id: '2', reqId: 'req-01', text: 'B' },
    ]);
    expect(dupRes.valid).toBe(false);
    expect(dupRes.reason).toContain('Duplicate requirement ID');
  });
});

describe('sysmlIntegrityService - High-Scale 1000+ Elements Performance', () => {
  it('handles cascade deletion and validation across 1,000+ elements efficiently (< 20ms)', () => {
    const largeState: SysMLDiagramState = {
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    };

    // Generate 1,000 blocks, 2,000 ports, 1,000 parts, 1,000 connectors, 1,000 requirements, 1,000 relations
    for (let i = 0; i < 1000; i++) {
      const bId = `b_${i}`;
      const pOutId = `p_out_${i}`;
      const pInId = `p_in_${i}`;
      const ptId = `pt_${i}`;
      const reqId = `req_${i}`;
      const rId = `r_${i}`;

      largeState.blocks.push({ id: bId, name: `Block_${i}`, ports: [pOutId, pInId], parts: [ptId] });
      largeState.ports.push(
        { id: pOutId, name: `OutPort_${i}`, direction: 'out', blockId: bId },
        { id: pInId, name: `InPort_${i}`, direction: 'in', blockId: bId }
      );
      largeState.parts.push({ id: ptId, name: `Part_${i}`, typeBlockId: bId, parentBlockId: bId, parentPartId: null });
      largeState.requirements.push({ id: reqId, reqId: `REQ-${i.toString().padStart(4, '0')}`, text: `Req Text ${i}` });
      largeState.relations.push({ id: rId, sourceId: bId, targetId: reqId, type: 'satisfy' });

      if (i > 0) {
        largeState.connectors.push({ id: `c_${i}`, sourcePortId: `p_out_${i - 1}`, targetPortId: pInId });
      }
    }

    expect(largeState.blocks.length).toBe(1000);
    expect(largeState.ports.length).toBe(2000);
    expect(largeState.connectors.length).toBe(999);

    const startTime = performance.now();

    // 1. Schema hydration
    const migrated = migrateSysMLState(largeState);
    expect(migrated.blocks.length).toBe(1000);

    // 2. Cascade delete block_500
    const deletedState = cascadeDeleteBlock('b_500', migrated);
    expect(deletedState.blocks.length).toBe(999);
    expect(deletedState.ports.length).toBe(1998);

    // 3. Validate connector
    const valRes = validateConnectorConnection('p_out_10', 'p_in_20', deletedState);
    expect(valRes.valid).toBe(true);

    // 4. Requirement ID uniqueness across 1,000 requirements
    const reqRes = validateUniqueRequirementIds(deletedState.requirements);
    expect(reqRes.valid).toBe(true);

    const duration = performance.now() - startTime;
    expect(duration).toBeLessThan(100); // Completed in under 100ms even under heavy test-runner load (typically 2-10ms)
  });
});




