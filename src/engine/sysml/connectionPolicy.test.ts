import { describe, expect, it } from 'vitest';
import {
  classifyCanonicalEndpoint,
  classifyLegacyEndpoint,
  evaluateSysmlConnection,
  type ConnectionEndpoint,
  type SysmlEndpointFamily,
} from './connectionPolicy';

const endpoint = (family: SysmlEndpointFamily, id = family, name = family): ConnectionEndpoint => ({ id, name, family });

describe('central SysML connection policy', () => {
  it.each([
    ['association', 'block', 'valueType', true],
    ['composition', 'block', 'valueType', false],
    ['composition', 'block', 'block', true],
    ['sharedAggregation', 'block', 'interface', false],
    ['sharedAggregation', 'block', 'block', true],
    ['generalization', 'valueType', 'valueType', true],
    ['generalization', 'block', 'valueType', false],
    ['generalization', 'interface', 'interface', true],
    ['generalization', 'block', 'interfaceBlock', true],
    ['dependency', 'unknown', 'valueType', true],
    ['allocation', 'unknown', 'unknown', true],
    ['association', 'requirement', 'block', false],
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
    ['verify', 'verificationCase', 'requirement', true],
    ['refine', 'unknown', 'requirement', true],
    ['trace', 'block', 'requirement', true],
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

  it('rejects unknown structural links with actionable stable diagnostics', () => {
    const result = evaluateSysmlConnection({ relationshipKind: 'composition', source: endpoint('unknown', 's', 'Custom'), target: endpoint('block', 't', 'Engine'), diagram: 'bdd' });
    expect(result.allowed).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ code: 'UNKNOWN_STEREOTYPE_FAMILY' });
    expect(result.diagnostics[0].message).toContain('Custom');
    expect(result.diagnostics[0].message).toContain('unknown');
    expect(result.diagnostics[0].correctiveAction).toMatch(/supported family|stereotype/i);
  });

  it('classifies legacy and canonical endpoints without collapsing families', () => {
    expect(classifyLegacyEndpoint({ id: 'v', name: 'Temperature', stereotype: 'valueType' })).toMatchObject({ id: 'v', family: 'valueType' });
    expect(classifyLegacyEndpoint({ id: 'p', name: 'p', kind: 'part' })).toMatchObject({ id: 'p', family: 'part' });
    expect(classifyCanonicalEndpoint({ id: 'b', name: 'B', kind: 'block', properties: [], ports: [], operations: [], constraints: [], isAbstract: false, isLeaf: false, namespace: [] })).toMatchObject({ id: 'b', family: 'block' });
  });
});
