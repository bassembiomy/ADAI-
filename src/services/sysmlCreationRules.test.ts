import { describe, expect, it } from 'vitest';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../types/sysml_types';
import { validateLegacyConnectorCandidate, validateLegacyRelationshipCandidate } from './sysmlCreationRules';

const block = (id: string, stereotype = 'block', ports: BlockData['ports'] = []): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports });
const relationship = (id: string, sourceId: string, targetId: string, type: RelationshipData['type']): RelationshipData => ({ id, sourceId, targetId, type, label: '' });
const part = (id: string, blockId: string, typeId: string): PartData => ({ id, name: id, blockId, typeId, x: 0, y: 0, width: 80, height: 60 });

describe('native SysML creation rules', () => {
  it('enforces satisfy, deriveReqt, verify, refine, trace, and composition endpoint kinds', () => {
    const blocks = [block('b'), block('r1', 'requirement'), block('r2', 'requirement'), block('v', 'verificationCase')];
    const check = (candidate: RelationshipData) => validateLegacyRelationshipCandidate({ blocks, parts: [], relationships: [] }, candidate);
    expect(check(relationship('s', 'b', 'r1', 'satisfy')).valid).toBe(true);
    expect(check(relationship('bad-s', 'r1', 'b', 'satisfy')).valid).toBe(false);
    expect(check(relationship('d', 'r1', 'r2', 'deriveReqt')).valid).toBe(true);
    expect(check(relationship('v', 'v', 'r1', 'verify')).valid).toBe(true);
    expect(check(relationship('ref', 'b', 'r1', 'refine')).valid).toBe(true);
    expect(check(relationship('trace', 'b', 'b', 'trace')).valid).toBe(false);
    expect(check(relationship('cross-comp', 'b', 'r1', 'composition')).valid).toBe(false);
  });

  it('rejects duplicates and generalization/requirement hierarchy cycles', () => {
    const blocks = [block('a'), block('b'), block('r1', 'requirement'), block('r2', 'requirement')];
    const existing = [relationship('g1', 'a', 'b', 'generalization'), relationship('h1', 'r1', 'r2', 'deriveReqt')];
    expect(validateLegacyRelationshipCandidate({ blocks, parts: [], relationships: existing }, relationship('dup', 'a', 'b', 'generalization')).codes).toContain('DUPLICATE_RELATIONSHIP');
    expect(validateLegacyRelationshipCandidate({ blocks, parts: [], relationships: existing }, relationship('g2', 'b', 'a', 'generalization')).codes).toContain('RELATIONSHIP_CYCLE');
    expect(validateLegacyRelationshipCandidate({ blocks, parts: [], relationships: existing }, relationship('h2', 'r2', 'r1', 'deriveReqt')).codes).toContain('RELATIONSHIP_CYCLE');
  });

  it('validates IBD direction, interface type/unit, duplicate, and boundary context', () => {
    const out = { id: 'out', name: 'out', type: 'Power', direction: 'out' as const, unit: 'V' };
    const input = { id: 'in', name: 'in', type: 'Power', direction: 'in' as const, unit: 'V' };
    const wrong = { id: 'wrong', name: 'wrong', type: 'Data', direction: 'out' as const, unit: 'A' };
    const blocks = [block('system'), block('sourceType', 'block', [out]), block('targetType', 'block', [input, wrong])];
    const parts = [part('source', 'system', 'sourceType'), part('target', 'system', 'targetType'), part('foreign', 'other', 'targetType')];
    const good: ConnectorData = { id: 'good', sourcePartId: 'source', sourcePortId: 'out', targetPartId: 'target', targetPortId: 'in' };
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, good, 'system').valid).toBe(true);
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [good] }, { ...good, id: 'duplicate' }, 'system').codes).toContain('DUPLICATE_CONNECTOR');
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'bad', targetPortId: 'wrong' }, 'system').codes).toEqual(expect.arrayContaining(['INCOMPATIBLE_PORT_DIRECTION', 'INCOMPATIBLE_PORT_TYPE', 'INCOMPATIBLE_PORT_UNIT']));
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'cross', targetPartId: 'foreign' }, 'system').codes).toContain('INVALID_CONNECTOR_CONTEXT');
  });
});
