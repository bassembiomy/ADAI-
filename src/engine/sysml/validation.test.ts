import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PartUsage } from './model';
import { validateSysmlRepository } from './validation';

const block = (id: string, name = id): BlockDefinition => ({
  id, name, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});

const part = (id: string, ownerId: string, typeId: string, aggregation: PartUsage['aggregation'] = 'composite'): PartUsage => ({
  id, ownerId, typeId, aggregation, kind: 'part', name: id,
  multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
});

describe('validateSysmlRepository', () => {
  it('diagnoses missing and cyclic package owners in a loaded repository', () => {
    const repo = createEmptyRepository();
    repo.packages.a = { id: 'a', kind: 'package', name: 'A', namespace: [], ownerId: 'b' };
    repo.packages.b = { id: 'b', kind: 'package', name: 'B', namespace: [], ownerId: 'a' };
    repo.packages.c = { id: 'c', kind: 'package', name: 'C', namespace: [], ownerId: 'absent' };

    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'PACKAGE_OWNERSHIP_CYCLE', 'INVALID_PACKAGE_OWNER',
    ]));
    expect(report.valid).toBe(false);
  });
  it('accepts a valid definition and composite part usage', () => {
    const repo = createEmptyRepository();
    repo.definitions.whole = block('whole');
    repo.definitions.child = block('child');
    repo.usages.engine = part('engine', 'whole', 'child');

    const report = validateSysmlRepository(repo);

    expect(report.valid).toBe(true);
    expect(report.diagnostics).toEqual([]);
    expect(report.canSimulate).toBe(true);
    expect(report.canExport).toBe(true);
  });

  it('rejects duplicate element IDs and qualified names across namespaces', () => {
    const repo = createEmptyRepository();
    repo.definitions.a = block('same', 'Controller');
    repo.definitions.b = { ...block('other', 'Controller') };
    repo.requirements.r = {
      id: 'same', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'x', status: 'draft', version: '1',
    };

    const codes = validateSysmlRepository(repo).diagnostics.map(d => d.code);
    expect(codes).toContain('DUPLICATE_ELEMENT_ID');
    expect(codes).toContain('DUPLICATE_QUALIFIED_NAME');
  });

  it('reports missing owner/type references and invalid relationship endpoints', () => {
    const repo = createEmptyRepository();
    repo.usages.p = part('p', 'missing-owner', 'missing-type');
    repo.relationships.rel = { id: 'rel', kind: 'association', sourceId: 'p', targetId: 'missing' };

    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'MISSING_USAGE_OWNER', 'MISSING_USAGE_TYPE', 'MISSING_RELATIONSHIP_ENDPOINT',
    ]));
    expect(report.canSimulate).toBe(false);
    expect(report.canExport).toBe(false);
    expect(report.canReport).toBe(false);
  });

  it('detects composite containment and inheritance cycles', () => {
    const repo = createEmptyRepository();
    repo.definitions.a = { ...block('a'), supertypeIds: ['b'] };
    repo.definitions.b = { ...block('b'), supertypeIds: ['a'] };
    repo.usages.p1 = part('p1', 'p2', 'a');
    repo.usages.p2 = part('p2', 'p1', 'b');

    const codes = validateSysmlRepository(repo).diagnostics.map(d => d.code);
    expect(codes).toContain('INHERITANCE_CYCLE');
    expect(codes).toContain('COMPOSITE_CONTAINMENT_CYCLE');
  });

  it('rejects multiple composition relationships claiming the same owned usage', () => {
    const repo = createEmptyRepository();
    repo.definitions.a = block('a');
    repo.definitions.b = block('b');
    repo.definitions.t = block('t');
    repo.usages.p = part('p', 'a', 't');
    repo.relationships.c1 = { id: 'c1', kind: 'composition', sourceId: 'a', targetId: 'p' };
    repo.relationships.c2 = { id: 'c2', kind: 'composition', sourceId: 'b', targetId: 'p' };

    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('MULTIPLE_COMPOSITE_OWNERS');
  });

  it('enforces SysML requirement relationship direction', () => {
    const repo = createEmptyRepository();
    repo.definitions.b = block('b');
    repo.requirements.r = {
      id: 'r', name: 'Requirement', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'x', status: 'draft', version: '1',
    };
    repo.relationships.bad = { id: 'bad', kind: 'satisfy', sourceId: 'r', targetId: 'b' };

    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.map(d => d.code)).toContain('INVALID_RELATIONSHIP_DIRECTION');
    expect(report.canVerify).toBe(false);
  });

  it('checks Package and Diagram IDs in the global repository identity space', () => {
    const repo = createEmptyRepository();
    repo.packages['pkg-shared'] = { id: 'pkg-shared', kind: 'package', name: 'Package', namespace: [], ownerId: 'model' };
    repo.diagrams['pkg-shared'] = { id: 'pkg-shared', kind: 'diagram', diagramKind: 'package', name: 'Diagram', namespace: [], ownerId: 'model' };
    expect(validateSysmlRepository(repo).diagnostics.map(diagnostic => diagnostic.code)).toContain('DUPLICATE_ELEMENT_ID');
  });

  it('reports central-policy errors for resolvable relationships without removing them', () => {
    const repo = createEmptyRepository();
    repo.definitions.system = block('system');
    repo.definitions.temperature = {
      id: 'temperature', name: 'Temperature', namespace: [], kind: 'valueType',
    };
    repo.requirements.req = {
      id: 'req', name: 'Requirement', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'x', status: 'draft', version: '1',
    };
    repo.relationships.badAggregation = {
      id: 'badAggregation', kind: 'sharedAggregation', sourceId: 'system', targetId: 'temperature',
    };
    repo.relationships.badAssociation = {
      id: 'badAssociation', kind: 'association', sourceId: 'req', targetId: 'system',
    };

    const report = validateSysmlRepository(repo);

    expect(repo.relationships.badAggregation).toBeDefined();
    expect(repo.relationships.badAssociation).toBeDefined();
    expect(report.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'INVALID_AGGREGATION_ENDPOINTS', 'INCOMPATIBLE_RELATIONSHIP_ENDPOINTS',
    ]));
  });

  it('validates SysML requirement containment rules in repository', () => {
    const repo = createEmptyRepository();
    repo.definitions.b = block('b');
    repo.requirements.r1 = {
      id: 'r1', name: 'R1', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'x', status: 'draft', version: '1',
    };
    repo.requirements.r2 = {
      id: 'r2', name: 'R2', namespace: [], kind: 'requirement', requirementId: 'REQ-2',
      text: 'y', status: 'draft', version: '1',
    };
    repo.requirements.r3 = {
      id: 'r3', name: 'R3', namespace: [], kind: 'requirement', requirementId: 'REQ-3',
      text: 'z', status: 'draft', version: '1',
    };

    // Valid containment: r1 contains r2
    repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    expect(validateSysmlRepository(repo).valid).toBe(true);

    // Non-requirement endpoint
    repo.relationships.badRc = { id: 'badRc', kind: 'requirementContainment', sourceId: 'b', targetId: 'r1' };
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT');
    delete repo.relationships.badRc;

    // Self containment
    repo.relationships.selfRc = { id: 'selfRc', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r1' };
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('REQUIREMENT_SELF_CONTAINMENT');
    delete repo.relationships.selfRc;

    // Multiple containers for r2
    repo.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'r3', targetId: 'r2' };
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('MULTIPLE_REQUIREMENT_CONTAINERS');
    delete repo.relationships.rc2;

    // Containment cycle
    repo.relationships.cycleRc = { id: 'cycleRc', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r1' };
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('REQUIREMENT_CONTAINMENT_CYCLE');
  });

  it('validates external State relationship endpoints only when resolvable through context', () => {
    const repo = createEmptyRepository();
    repo.requirements.req1 = {
      id: 'req1', name: 'Req 1', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'Must be fast', status: 'draft', version: '1',
    };
    repo.relationships.rel1 = {
      id: 'rel1',
      kind: 'satisfy',
      sourceId: 'state-active',
      targetId: 'req1',
      sourceFamily: 'state',
      targetFamily: 'requirement',
    };

    // Without external context, relationship to nonexistent state is missing an endpoint
    const withoutContext = validateSysmlRepository(repo);
    expect(withoutContext.diagnostics.map(d => d.code)).toContain('MISSING_RELATIONSHIP_ENDPOINT');

    // With external context containing state-active, validation passes
    const context = {
      externalEndpoints: new Map([
        ['state-active', { id: 'state-active', name: 'Active', family: 'state' as const }],
      ]),
    };
    const withContext = validateSysmlRepository(repo, context);
    expect(withContext.valid).toBe(true);
  });

  it('validates repository nested ports and reports INVALID_NESTED_PROXY_PORT for non-proxy port in proxy port', () => {
    const repo = createEmptyRepository();
    repo.definitions.iface = {
      id: 'iface',
      name: 'CANInterface',
      kind: 'interface',
      namespace: [],
      ownerId: 'model',
      features: [],
    };
    repo.definitions.b1 = {
      ...block('b1'),
      ports: [
        {
          id: 'parent-proxy',
          name: 'parentPort',
          kind: 'proxy',
          portKind: 'proxyPort',
          typeId: 'iface',
          direction: 'inout',
          isConjugated: false,
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
        {
          id: 'child-standard',
          name: 'childPort',
          kind: 'standard',
          portKind: 'umlPort',
          ownerPortId: 'parent-proxy',
          nestedPortPathIds: ['parent-proxy', 'child-standard'],
          typeId: '',
          direction: 'inout',
          isConjugated: false,
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
      ],
    };

    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.some(d => d.code === 'INVALID_NESTED_PROXY_PORT')).toBe(true);
  });
});


