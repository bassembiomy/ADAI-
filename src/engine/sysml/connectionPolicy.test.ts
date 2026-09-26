import { describe, expect, it } from 'vitest';
import {
  classifyCanonicalEndpoint,
  classifyLegacyEndpoint,
  evaluateSysmlConnection,
  type ConnectionEndpoint,
  type SysmlEndpointFamily,
} from './connectionPolicy';
import { createEmptyRepository, type BlockDefinition } from './model';
import { loadRepository, serializeRepository } from './persistence';

const endpoint = (family: SysmlEndpointFamily, id: string = family, name: string = family): ConnectionEndpoint => ({ id, name, family });

describe('central SysML connection policy', () => {
  it.each([
    ['association', 'block', 'valueType', true],
    ['composition', 'block', 'valueType', false],
    ['composition', 'block', 'block', true],
    ['composition', 'block', 'part', true],
    ['sharedAggregation', 'block', 'interface', false],
    ['sharedAggregation', 'block', 'block', true],
    ['sharedAggregation', 'block', 'part', true],
    ['generalization', 'valueType', 'valueType', true],
    ['generalization', 'block', 'valueType', false],
    ['generalization', 'interface', 'interface', true],
    ['generalization', 'block', 'interfaceBlock', true],
    ['generalization', 'enumeration', 'enumeration', true],
    ['sharedAggregation', 'interfaceBlock', 'block', true],
    ['dependency', 'unknown', 'valueType', true],
    ['allocation', 'unknown', 'unknown', true],
    ['association', 'requirement', 'block', false],
    ['association', 'unknown', 'block', false],
    ['generalization', 'unknown', 'block', false],
  ] as const)('%s %s -> %s is %s', (kind, source, target, allowed) => {
    const result = evaluateSysmlConnection({ relationshipKind: kind, source: endpoint(source, 'source'), target: endpoint(target, 'target'), diagram: 'bdd' });
    expect(result.allowed).toBe(allowed);
  });

  it.each([
    ['requirementContainment', 'requirement', 'requirement', true],
    ['deriveReqt', 'requirement', 'requirement', true],
    ['copy', 'requirement', 'requirement', true],
    ['satisfy', 'block', 'requirement', true],
    ['satisfy', 'part', 'requirement', true],
    ['satisfy', 'state', 'requirement', true],
    ['verify', 'verificationCase', 'requirement', true],
    ['verify', 'state', 'requirement', true],
    ['refine', 'unknown', 'requirement', true],
    ['refine', 'state', 'requirement', true],
    ['trace', 'block', 'requirement', true],
    ['trace', 'state', 'requirement', true],
    ['trace', 'block', 'valueType', false],
    ['satisfy', 'requirement', 'requirement', false],
  ] as const)('%s %s -> %s is %s', (kind, source, target, allowed) => {
    const result = evaluateSysmlConnection({ relationshipKind: kind, source: endpoint(source, 'source'), target: endpoint(target, 'target'), diagram: kind === 'requirementContainment' ? 'requirements' : 'rtm' });
    expect(result.allowed).toBe(allowed);
  });

  it.each([
    ['binding', 'valueParameter', 'valueParameter'],
    ['assembly', 'port', 'port'],
    ['delegation', 'port', 'port'],
  ] as const)('allows %s between %s endpoints', (kind, source, target) => {
    expect(evaluateSysmlConnection({ relationshipKind: kind, source: endpoint(source, 'source'), target: endpoint(target, 'target'), diagram: 'ibd' }).allowed).toBe(true);
  });

  it.each([
    ['binding', 'unknown', 'valueParameter'],
    ['assembly', 'unknown', 'port'],
    ['delegation', 'port', 'unknown'],
    ['binding', 'port', 'valueParameter'],
    ['assembly', 'valueParameter', 'port'],
  ] as const)('rejects %s with invalid or unknown endpoints using a stable primary code', (kind, source, target) => {
    const result = evaluateSysmlConnection({ relationshipKind: kind, source: endpoint(source, 'source'), target: endpoint(target, 'target'), diagram: 'ibd' });
    expect(result.allowed).toBe(false);
    expect(result.diagnostics[0].code).toBe(source === 'unknown' || target === 'unknown' ? 'UNKNOWN_STEREOTYPE_FAMILY' : `INVALID_${kind.toUpperCase()}_ENDPOINTS`);
  });

  it('rejects missing endpoints before relationship-specific checks', () => {
    const result = evaluateSysmlConnection({ relationshipKind: 'dependency', source: endpoint('block', ''), target: endpoint('block', 'target'), diagram: 'bdd' });
    expect(result.allowed).toBe(false);
    expect(result.diagnostics[0].code).toBe('MISSING_RELATIONSHIP_ENDPOINT');
  });

  it('rejects unknown structural links with actionable stable diagnostics', () => {
    const result = evaluateSysmlConnection({ relationshipKind: 'composition', source: endpoint('unknown', 's', 'Custom'), target: endpoint('block', 't', 'Engine'), diagram: 'bdd' });
    expect(result.allowed).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ code: 'UNKNOWN_STEREOTYPE_FAMILY' });
    expect(result.diagnostics[0].message).toContain('Custom');
    expect(result.diagnostics[0].message).toContain('unknown');
    expect(result.diagnostics[0].correctiveAction).toMatch(/supported family|stereotype/i);
  });

  it.each([
    ['association', 'unknown', 'block', 'UNKNOWN_STEREOTYPE_FAMILY'],
    ['generalization', 'unknown', 'block', 'UNKNOWN_STEREOTYPE_FAMILY'],
    ['satisfy', 'requirement', 'requirement', 'INVALID_SATISFY_DIRECTION'],
    ['verify', 'block', 'requirement', 'INVALID_VERIFY_DIRECTION'],
    ['refine', 'requirement', 'block', 'INVALID_REFINE_DIRECTION'],
    ['trace', 'block', 'valueType', 'INVALID_TRACE_ENDPOINTS'],
  ] as const)('returns exact primary diagnostic for %s', (kind, source, target, code) => {
    const result = evaluateSysmlConnection({ relationshipKind: kind, source: endpoint(source, 'source'), target: endpoint(target, 'target'), diagram: kind === 'trace' || kind === 'satisfy' || kind === 'verify' || kind === 'refine' ? 'rtm' : 'bdd' });
    expect(result.allowed).toBe(false);
    expect(result.diagnostics[0].code).toBe(code);
  });

  it('classifies legacy and canonical endpoints without collapsing families', () => {
    expect(classifyLegacyEndpoint({ id: 'v', name: 'Temperature', stereotype: 'valueType' })).toMatchObject({ id: 'v', family: 'valueType' });
    expect(classifyLegacyEndpoint({ id: 'p', name: 'p', kind: 'part' })).toMatchObject({ id: 'p', family: 'part' });
    expect(classifyCanonicalEndpoint({ id: 'b', name: 'B', kind: 'block', properties: [], ports: [], operations: [], constraints: [], isAbstract: false, isLeaf: false, namespace: [] })).toMatchObject({ id: 'b', family: 'block' });
  });

  describe('SysML Requirements Connection Policy on Requirements Diagram', () => {
    const req1 = endpoint('requirement', 'r1', 'Safety Requirement');
    const req2 = endpoint('requirement', 'r2', 'Temp Limit Requirement');
    const block = endpoint('block', 'b1', 'Heater Controller');
    const testCase = endpoint('verificationCase', 'tc1', 'Temp Test');

    it('permits all 7 requirement relationship kinds on requirements diagram', () => {
      const kinds = ['requirementContainment', 'deriveReqt', 'copy', 'refine', 'trace', 'satisfy', 'verify'];
      for (const kind of kinds) {
        const source = (kind === 'satisfy' ? block : kind === 'verify' ? testCase : req1);
        const res = evaluateSysmlConnection({
          relationshipKind: kind,
          source,
          target: req2,
          diagram: 'requirements',
        });
        expect(res.allowed).toBe(true);
      }
    });

    it('rejects reversed satisfy (Requirement -> Block) on requirements diagram', () => {
      const res = evaluateSysmlConnection({
        relationshipKind: 'satisfy',
        source: req1,
        target: block,
        diagram: 'requirements',
      });
      expect(res.allowed).toBe(false);
      expect(res.diagnostics[0].code).toBe('INVALID_SATISFY_DIRECTION');
    });

    it('rejects reversed verify (Requirement -> Test Case) on requirements diagram', () => {
      const res = evaluateSysmlConnection({
        relationshipKind: 'verify',
        source: req1,
        target: testCase,
        diagram: 'requirements',
      });
      expect(res.allowed).toBe(false);
      expect(res.diagnostics[0].code).toBe('INVALID_VERIFY_DIRECTION');
    });

    it('allows refine from both model elements and requirements to requirement', () => {
      expect(evaluateSysmlConnection({ relationshipKind: 'refine', source: block, target: req1, diagram: 'requirements' }).allowed).toBe(true);
      expect(evaluateSysmlConnection({ relationshipKind: 'refine', source: req1, target: req2, diagram: 'requirements' }).allowed).toBe(true);
    });
  });

  describe('property endpoint relationships', () => {
    const propEndpoint = endpoint('property', 'prop-1', 'speed');
    const blockEndpoint = endpoint('block', 'block-1', 'Vehicle');
    const portEndpoint = endpoint('port', 'port-1', 'pIn');

    it('classifies property endpoints with family property instead of unknown', () => {
      expect(classifyCanonicalEndpoint({ id: 'p1', name: 'sensor', metaclass: 'PartProperty' }).family).toBe('property');
      expect(classifyLegacyEndpoint({ id: 'p1', name: 'sensor', stereotype: 'property' }).family).toBe('property');
    });

    it('allows Association, Dependency, and Allocation between Property and Block', () => {
      expect(evaluateSysmlConnection({ relationshipKind: 'association', source: propEndpoint, target: blockEndpoint, diagram: 'bdd' }).allowed).toBe(true);
      expect(evaluateSysmlConnection({ relationshipKind: 'association', source: blockEndpoint, target: propEndpoint, diagram: 'bdd' }).allowed).toBe(true);
      expect(evaluateSysmlConnection({ relationshipKind: 'dependency', source: propEndpoint, target: blockEndpoint, diagram: 'bdd' }).allowed).toBe(true);
      expect(evaluateSysmlConnection({ relationshipKind: 'allocation', source: propEndpoint, target: blockEndpoint, diagram: 'bdd' }).allowed).toBe(true);
      expect(evaluateSysmlConnection({ relationshipKind: 'association', source: propEndpoint, target: propEndpoint, diagram: 'bdd' }).allowed).toBe(false); // self-relationship
    });

    it('rejects Association between Property and Port with INCOMPATIBLE_RELATIONSHIP_ENDPOINTS', () => {
      const res = evaluateSysmlConnection({ relationshipKind: 'association', source: propEndpoint, target: portEndpoint, diagram: 'bdd' });
      expect(res.allowed).toBe(false);
      expect(res.diagnostics[0].code).toBe('INCOMPATIBLE_RELATIONSHIP_ENDPOINTS');
    });

    it('rejects missing Property or Block IDs with MISSING_RELATIONSHIP_ENDPOINT', () => {
      const res = evaluateSysmlConnection({ relationshipKind: 'association', source: endpoint('property', ''), target: blockEndpoint, diagram: 'bdd' });
      expect(res.allowed).toBe(false);
      expect(res.diagnostics[0].code).toBe('MISSING_RELATIONSHIP_ENDPOINT');
    });

    it('persists property relationships and propagates rename without endpoint mutation', () => {
      const blockDef = (id: string, name: string): BlockDefinition => ({
        id, name, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
        ownerId: 'model',
        properties: [], ports: [], operations: [], constraints: [],
      });

      const repo = createEmptyRepository();
      repo.definitions.b1 = {
        ...blockDef('b1', 'Controller'),
        properties: [{
          id: 'p1',
          name: 'engineRef',
          kind: 'reference',
          typeId: 'b2',
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        }],
      };
      repo.definitions.b2 = blockDef('b2', 'Engine');
      repo.relationships.r1 = {
        id: 'r1',
        kind: 'association',
        sourceId: 'p1',
        targetId: 'b2',
        name: 'engineRef',
      };

      const serialized = serializeRepository(repo);
      const loaded = loadRepository(serialized);
      expect(loaded.valid).toBe(true);
      expect(loaded.repository.relationships.r1).toBeDefined();
      expect(loaded.repository.relationships.r1.sourceId).toBe('p1');
      expect(loaded.repository.relationships.r1.targetId).toBe('b2');

      // Rename Property and Block
      const b1 = loaded.repository.definitions.b1 as BlockDefinition;
      b1.properties[0].name = 'engineRefRenamed';
      loaded.repository.definitions.b2.name = 'EngineV2';

      // Verify canonical endpoint classification uses updated names while preserving IDs
      const propEndpoint = classifyCanonicalEndpoint(b1.properties[0]);
      const targetEndpoint = classifyCanonicalEndpoint(loaded.repository.definitions.b2);
      expect(propEndpoint.name).toBe('engineRefRenamed');
      expect(propEndpoint.id).toBe('p1');
      expect(targetEndpoint.name).toBe('EngineV2');
      expect(targetEndpoint.id).toBe('b2');

      // Relationship remains valid and endpoints unchanged
      expect(loaded.repository.relationships.r1.sourceId).toBe('p1');
      expect(loaded.repository.relationships.r1.targetId).toBe('b2');
      const evalResult = evaluateSysmlConnection({
        relationshipKind: loaded.repository.relationships.r1.kind,
        source: propEndpoint,
        target: targetEndpoint,
        diagram: 'bdd',
      });
      expect(evalResult.allowed).toBe(true);
    });
  });
});
