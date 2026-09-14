import { describe, expect, it } from 'vitest';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../types/sysml_types';
import { validateLegacyConnectorCandidate, validateLegacyRelationshipCandidate, validateLegacyRequirementStatusTransition } from './sysmlCreationRules';
import {
  validateCanonicalBlockDefinition,
  validateCanonicalBlockUpdate,
  validateCanonicalConnectorCandidate,
  validateCanonicalRelationshipCandidate,
} from './sysmlCreationRules';
import { createEmptyRepository, type BlockDefinition, type ConnectorUsage, type SysmlRelationship } from '../engine/sysml/model';

const block = (id: string, stereotype = 'block', ports: BlockData['ports'] = []): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports });
const relationship = (id: string, sourceId: string, targetId: string, type: RelationshipData['type']): RelationshipData => ({ id, sourceId, targetId, type, label: '' });
const part = (id: string, blockId: string, typeId: string): PartData => ({ id, name: id, blockId, typeId, x: 0, y: 0, width: 80, height: 60 });

describe('native SysML creation rules', () => {
  it('keeps legacy and canonical endpoint-policy diagnostics in parity', () => {
    const cases = [
      { name: 'Block to ValueType composition', type: 'composition' as const, source: 'b', target: 'v', expected: 'INVALID_AGGREGATION_ENDPOINTS' },
      { name: 'Block to ValueType generalization', type: 'generalization' as const, source: 'b', target: 'v', expected: 'CROSS_FAMILY_GENERALIZATION' },
      { name: 'ValueType to ValueType generalization', type: 'generalization' as const, source: 'v', target: 'v2', expected: undefined },
      { name: 'Requirement to Block association', type: 'association' as const, source: 'r', target: 'b', expected: 'INCOMPATIBLE_RELATIONSHIP_ENDPOINTS' },
      { name: 'Block to Block trace', type: 'trace' as const, source: 'b', target: 'b2', expected: 'INVALID_TRACE_ENDPOINTS' },
      { name: 'unknown stereotype structural link', type: 'composition' as const, source: 'custom', target: 'b', expected: 'UNKNOWN_STEREOTYPE_FAMILY' },
    ];
    const legacyBlocks = [block('b'), block('b2'), block('v', 'valueType'), block('v2', 'valueType'), block('r', 'requirement'), block('custom', 'customStereotype')];
    const canonical = createEmptyRepository();
    canonical.definitions.b = {
      id: 'b', name: 'b', kind: 'block', namespace: [], isAbstract: false, isLeaf: false,
      properties: [], ports: [], operations: [], constraints: [],
    };
    canonical.definitions.b2 = {
      id: 'b2', name: 'b2', kind: 'block', namespace: [], isAbstract: false, isLeaf: false,
      properties: [], ports: [], operations: [], constraints: [],
    };
    canonical.definitions.v = { id: 'v', name: 'v', kind: 'valueType', namespace: [] };
    canonical.definitions.v2 = { id: 'v2', name: 'v2', kind: 'valueType', namespace: [] };
    canonical.requirements.r = { id: 'r', name: 'r', kind: 'requirement', namespace: [], requirementId: 'R', text: 'r', status: 'draft', version: '1' };
    canonical.definitions.custom = { id: 'custom', name: 'custom', kind: 'customStereotype' } as never;

    for (const testCase of cases) {
      const legacy = validateLegacyRelationshipCandidate(
        { blocks: legacyBlocks, parts: [], relationships: [] },
        relationship(`legacy-${testCase.name}`, testCase.source, testCase.target, testCase.type),
      );
      const canonicalResult = validateCanonicalRelationshipCandidate(
        canonical,
        { id: `canonical-${testCase.name}`, kind: (testCase.type as string) === 'aggregation' ? 'sharedAggregation' : testCase.type, sourceId: testCase.source, targetId: testCase.target },
      );
      expect({ valid: legacy.valid, code: legacy.codes[0] }).toEqual({ valid: canonicalResult.valid, code: canonicalResult.codes[0] });
      expect(legacy.codes[0]).toBe(testCase.expected);
    }
  });

  it.each(['association', 'dependency', 'allocation'] as const)('allows reciprocal %s links', type => {
    const blocks = [block('a'), block('b')];
    const existing = [relationship('forward', 'a', 'b', type)];
    expect(validateLegacyRelationshipCandidate({ blocks, parts: [], relationships: existing }, relationship('reverse', 'b', 'a', type)).valid).toBe(true);
  });

  it.each(['composition', 'generalization', 'deriveReqt', 'copy', 'requirementContainment'] as const)('rejects reciprocal %s cycles', type => {
    const blocks = [block('a'), block('b'), block('r1', 'requirement'), block('r2', 'requirement')];
    const source = ['deriveReqt', 'copy', 'requirementContainment'].includes(type) ? 'r1' : 'a';
    const target = ['deriveReqt', 'copy', 'requirementContainment'].includes(type) ? 'r2' : 'b';
    const existing = [relationship('forward', source, target, type)];
    const result = validateLegacyRelationshipCandidate({ blocks, parts: [], relationships: existing }, relationship('reverse', target, source, type));
    expect(result.valid).toBe(false);
    expect(result.codes).toEqual(expect.arrayContaining(type === 'composition' ? ['COMPOSITION_CYCLE'] : type === 'requirementContainment' ? ['REQUIREMENT_CONTAINMENT_CYCLE'] : ['RELATIONSHIP_CYCLE']));
  });

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

  it('rejects invalid composition endpoints and cycles while allowing valid block-to-block reuse', () => {
    const blocks = [block('system'), block('other'), block('partType'), block('req', 'requirement')];
    const parts: PartData[] = [];
    const model = { blocks, parts, relationships: [] as RelationshipData[] };

    expect(validateLegacyRelationshipCandidate(model, relationship('valid', 'system', 'partType', 'composition')).valid).toBe(true);
    expect(validateLegacyRelationshipCandidate(model, relationship('invalid-endpoint', 'system', 'req', 'composition')).codes)
      .toContain('INVALID_COMPOSITION_ENDPOINTS');
    const existing = [relationship('valid', 'system', 'partType', 'composition')];
    expect(validateLegacyRelationshipCandidate({ ...model, relationships: existing }, relationship('duplicate', 'system', 'partType', 'composition')).codes)
      .toContain('DUPLICATE_RELATIONSHIP');
    expect(validateLegacyRelationshipCandidate({ ...model, relationships: existing }, relationship('cycle', 'partType', 'system', 'composition')).codes)
      .toContain('COMPOSITION_CYCLE');
    expect(validateLegacyRelationshipCandidate({ ...model, relationships: existing }, relationship('reuse', 'other', 'partType', 'composition')).valid).toBe(true);
  });

  it('validates IBD direction, interface type/unit, duplicate, and boundary context', () => {
    const out = { id: 'out', name: 'out', type: 'Power', direction: 'out' as const, unit: 'V' };
    const input = { id: 'in', name: 'in', type: 'Power', direction: 'in' as const, unit: 'V' };
    const wrong = { id: 'wrong', name: 'wrong', type: 'Data', direction: 'out' as const, unit: 'A' };
    const blocks = [block('system', 'block', [out]), block('sourceType', 'block', [out]), block('targetType', 'block', [input, wrong])];
    const parts = [part('source', 'system', 'sourceType'), part('target', 'system', 'targetType'), part('foreign', 'other', 'targetType')];
    const good: ConnectorData = { id: 'good', sourcePartId: 'source', sourcePortId: 'out', targetPartId: 'target', targetPortId: 'in' };
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, good, 'system').valid).toBe(true);
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [good] }, { ...good, id: 'duplicate' }, 'system').codes).toContain('DUPLICATE_CONNECTOR');
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'bad', targetPortId: 'wrong' }, 'system').codes).toEqual(expect.arrayContaining(['INCOMPATIBLE_PORT_DIRECTION', 'INCOMPATIBLE_PORT_TYPE', 'INCOMPATIBLE_PORT_UNIT']));
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'cross', targetPartId: 'foreign' }, 'system').codes).toContain('INVALID_CONNECTOR_CONTEXT');
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'delegation', kind: 'delegation', sourcePartId: 'system' }, 'system').valid).toBe(true);
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'bad-delegation', kind: 'delegation' }, 'system').codes).toContain('INVALID_DELEGATION_ENDPOINTS');
    expect(validateLegacyConnectorCandidate({ blocks, parts, connectors: [] }, { ...good, id: 'bad-flow', itemFlow: 'MissingSignal' }, 'system').codes).toContain('MISSING_ITEM_FLOW_TYPE');
  });

  it('enforces requirement lifecycle and requires passed verification-case evidence', () => {
    const req = { ...block('r', 'requirement'), status: 'Implemented' };
    const testCase = { ...block('v', 'verificationCase'), verificationResult: 'passed' as const };
    expect(validateLegacyRequirementStatusTransition([req], [], 'r', 'Verified').codes).toContain('CURRENT_PASSING_EVIDENCE_REQUIRED');
    expect(validateLegacyRequirementStatusTransition([req, testCase], [relationship('verify', 'v', 'r', 'verify')], 'r', 'Verified').valid).toBe(true);
    expect(validateLegacyRequirementStatusTransition([{ ...req, status: 'Draft' }], [], 'r', 'Implemented').codes).toContain('INVALID_REQUIREMENT_STATUS_TRANSITION');
  });

  it('validates requirementContainment endpoint kinds, self-containment, multiple containers, and cycles', () => {
    const blocks = [block('b'), block('r1', 'requirement'), block('r2', 'requirement'), block('r3', 'requirement')];
    const model = { blocks, parts: [], relationships: [] as RelationshipData[] };

    // Valid containment r1 -> r2
    const rc1 = relationship('rc1', 'r1', 'r2', 'requirementContainment');
    expect(validateLegacyRelationshipCandidate(model, rc1).valid).toBe(true);

    // Non-requirement endpoint (block -> requirement)
    const badRc = relationship('badRc', 'b', 'r1', 'requirementContainment');
    expect(validateLegacyRelationshipCandidate(model, badRc).codes).toContain('INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT');

    // Self-containment
    const selfRc = relationship('selfRc', 'r1', 'r1', 'requirementContainment');
    expect(validateLegacyRelationshipCandidate(model, selfRc).codes).toContain('REQUIREMENT_SELF_CONTAINMENT');

    // Multiple containers: r3 already contained by r1, candidate attempts r2 -> r3
    const existingWithRc = [relationship('rcExisting', 'r1', 'r3', 'requirementContainment')];
    const multipleRc = relationship('rcMultiple', 'r2', 'r3', 'requirementContainment');
    expect(validateLegacyRelationshipCandidate({ ...model, relationships: existingWithRc }, multipleRc).codes).toContain('MULTIPLE_REQUIREMENT_CONTAINERS');

    // Cycle detection: r1 -> r2 existing, candidate r2 -> r1
    const existingForCycle = [relationship('rc1', 'r1', 'r2', 'requirementContainment')];
    const cycleRc = relationship('rcCycle', 'r2', 'r1', 'requirementContainment');
    expect(validateLegacyRelationshipCandidate({ ...model, relationships: existingForCycle }, cycleRc).codes).toContain('REQUIREMENT_CONTAINMENT_CYCLE');

    // Re-homing: after removing rcExisting, r2 -> r3 is valid
    expect(validateLegacyRelationshipCandidate(model, multipleRc).valid).toBe(true);

    // BDD composition between requirements is rejected
    const compReq = relationship('compReq', 'r1', 'r2', 'composition');
    expect(validateLegacyRelationshipCandidate(model, compReq).codes).toContain('INVALID_COMPOSITION_ENDPOINTS');
  });
});

describe('canonical SysML creation rules (Task 2 policy gating)', () => {
  const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
  const defBlock = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
    id, name: id, kind: 'block', namespace: [], isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations: [], constraints: [], ...extra,
  });
  const rel = (id: string, kind: SysmlRelationship['kind'], sourceId: string, targetId: string): SysmlRelationship => ({
    id, kind, sourceId, targetId,
  });
  const baseRepo = () => {
    const repo = createEmptyRepository();
    repo.definitions.a = defBlock('a');
    repo.definitions.b = defBlock('b');
    repo.requirements.r1 = {
      id: 'r1', name: 'r1', kind: 'requirement', namespace: [],
      requirementId: 'REQ-1', text: 'req', status: 'draft', version: '1.0',
    };
    return repo;
  };

  it('emits typed codes for missing endpoints, self-links, duplicates, and endpoint legality', () => {
    const repo = baseRepo();
    expect(validateCanonicalRelationshipCandidate(repo, rel('x', 'association', 'a', 'ghost')).codes)
      .toContain('MISSING_RELATIONSHIP_ENDPOINT');
    expect(validateCanonicalRelationshipCandidate(repo, rel('x', 'association', 'a', 'a')).codes)
      .toContain('SELF_RELATIONSHIP');
    expect(validateCanonicalRelationshipCandidate(repo, rel('x', 'generalization', 'r1', 'a')).codes)
      .toContain('INVALID_GENERALIZATION_ENDPOINTS');
    expect(validateCanonicalRelationshipCandidate(repo, rel('x', 'composition', 'a', 'r1')).codes)
      .toContain('INVALID_COMPOSITION_ENDPOINTS');

    repo.relationships.r1 = rel('r1', 'association', 'a', 'b');
    expect(validateCanonicalRelationshipCandidate(repo, rel('r2', 'association', 'a', 'b')).codes)
      .toContain('DUPLICATE_RELATIONSHIP');

    expect(validateCanonicalRelationshipCandidate(repo, rel('g', 'generalization', 'a', 'b')).valid).toBe(true);
  });

  it('detects relationship cycles with typed codes', () => {
    const repo = baseRepo();
    repo.relationships.g1 = rel('g1', 'generalization', 'a', 'b');
    expect(validateCanonicalRelationshipCandidate(repo, rel('g2', 'generalization', 'b', 'a')).codes)
      .toContain('RELATIONSHIP_CYCLE');
  });

  it.each(['association', 'dependency', 'allocation'] as const)('allows reciprocal canonical %s links', kind => {
    const repo = baseRepo();
    repo.relationships.forward = rel('forward', kind, 'a', 'b');
    expect(validateCanonicalRelationshipCandidate(repo, rel('reverse', kind, 'b', 'a')).valid).toBe(true);
  });

  it.each(['composition', 'generalization', 'deriveReqt', 'copy', 'requirementContainment'] as const)('rejects reciprocal canonical %s cycles', kind => {
    const repo = baseRepo();
    repo.requirements.r2 = { id: 'r2', name: 'r2', kind: 'requirement', namespace: [], requirementId: 'REQ-2', text: 'req', status: 'draft', version: '1.0' };
    const source = ['deriveReqt', 'copy', 'requirementContainment'].includes(kind) ? 'r1' : 'a';
    const target = ['deriveReqt', 'copy', 'requirementContainment'].includes(kind) ? 'r2' : 'b';
    repo.relationships.forward = rel('forward', kind, source, target);
    const result = validateCanonicalRelationshipCandidate(repo, rel('reverse', kind, target, source));
    expect(result.valid).toBe(false);
    expect(result.codes).toEqual(expect.arrayContaining(kind === 'requirementContainment' ? ['REQUIREMENT_CONTAINMENT_CYCLE'] : ['RELATIONSHIP_CYCLE']));
  });

  it('validates canonical connectors through the IBD policy with typed codes', () => {
    const repo = baseRepo();
    repo.definitions.if = { id: 'if', name: 'IF', namespace: [], kind: 'interface', features: [] };
    (repo.definitions.a as BlockDefinition).ports = [
      { id: 'out-def', name: 'out', kind: 'proxy', typeId: 'if', direction: 'out', isConjugated: false, multiplicity: one },
    ];
    (repo.definitions.b as BlockDefinition).ports = [
      { id: 'in-def', name: 'in', kind: 'proxy', typeId: 'if', direction: 'in', isConjugated: false, multiplicity: one },
      { id: 'out-def-b', name: 'out', kind: 'proxy', typeId: 'if', direction: 'out', isConjugated: false, multiplicity: one },
    ];
    repo.definitions.sys = defBlock('sys');
    repo.usages.partA = { id: 'partA', name: 'partA', kind: 'part', ownerId: 'sys', typeId: 'a', aggregation: 'composite', multiplicity: one };
    repo.usages.partB = { id: 'partB', name: 'partB', kind: 'part', ownerId: 'sys', typeId: 'b', aggregation: 'composite', multiplicity: one };
    repo.usages.aOut = { id: 'aOut', name: 'out', kind: 'port', ownerId: 'partA', definitionId: 'out-def' };
    repo.usages.bIn = { id: 'bIn', name: 'in', kind: 'port', ownerId: 'partB', definitionId: 'in-def' };
    repo.usages.bOut = { id: 'bOut', name: 'out', kind: 'port', ownerId: 'partB', definitionId: 'out-def-b' };

    const conn = (id: string, extra: Partial<ConnectorUsage> = {}): ConnectorUsage => ({
      id, kind: 'assembly', ownerId: 'sys', sourcePortId: 'aOut', targetPortId: 'bIn', ...extra,
    });
    expect(validateCanonicalConnectorCandidate(repo, conn('good')).valid).toBe(true);
    expect(validateCanonicalConnectorCandidate(repo, conn('self', { targetPortId: 'aOut' })).codes)
      .toContain('SELF_CONNECTOR');
    expect(validateCanonicalConnectorCandidate(repo, conn('dir', { targetPortId: 'bOut' })).codes)
      .toContain('INCOMPATIBLE_PORT_DIRECTION');
    expect(validateCanonicalConnectorCandidate(repo, conn('ctx', { ownerId: 'a' })).codes)
      .toContain('INVALID_CONNECTOR_CONTEXT');
    expect(validateCanonicalConnectorCandidate(repo, conn('miss', { targetPortId: 'ghost' })).codes)
      .toContain('MISSING_CONNECTOR_ENDPOINT');

    repo.connectors.existing = conn('existing');
    expect(validateCanonicalConnectorCandidate(repo, conn('dupe')).codes)
      .toContain('DUPLICATE_CONNECTOR');
  });

  it('validates canonical block definitions for leaf specialization and redefinition', () => {
    const repo = baseRepo();
    repo.definitions.leaf = defBlock('leaf', { isLeaf: true });
    expect(validateCanonicalBlockDefinition(repo, defBlock('child', { supertypeIds: ['leaf'] })).codes)
      .toContain('LEAF_SPECIALIZATION');

    repo.definitions.base = defBlock('base', {
      properties: [{ id: 'p1', name: 'p1', kind: 'value', typeId: 'T', multiplicity: one }],
    });
    const badRedefine = defBlock('child2', {
      supertypeIds: ['base'],
      properties: [{ id: 'p1r', name: 'p1r', kind: 'value', typeId: 'Other', multiplicity: one, redefinesId: 'p1' }],
    });
    expect(validateCanonicalBlockDefinition(repo, badRedefine).codes)
      .toContain('INCOMPATIBLE_REDEFINITION');

    const abstract = validateCanonicalBlockDefinition(repo, defBlock('abs', { isAbstract: true }));
    expect(abstract.codes).toContain('ABSTRACT_INSTANTIATION');
    expect(abstract.valid).toBe(true);
  });

  it('rejects updates that seal a specialized block as leaf', () => {
    const repo = baseRepo();
    repo.definitions.base = defBlock('base');
    repo.definitions.child = defBlock('child', { supertypeIds: ['base'] });
    const res = validateCanonicalBlockUpdate(repo, 'base', { isLeaf: true });
    expect(res.valid).toBe(false);
    expect(res.codes).toContain('LEAF_SPECIALIZATION');
    expect(validateCanonicalBlockUpdate(repo, 'nope', { name: 'x' }).codes).toContain('ELEMENT_NOT_FOUND');
  });
});

