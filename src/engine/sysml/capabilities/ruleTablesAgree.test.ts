import { describe, expect, it } from 'vitest';
import { evaluateSysmlConnection, familyOfMetaclass, type SysmlEndpointFamily } from '../connectionPolicy';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type MetaclassKind,
  type SemanticElement,
  type SemanticRelationship,
} from '../domain';
import { getLegalRelationshipKinds, validateRelationshipEndpoints } from './relationshipPolicy';
import { validateRelationshipEndpoints as validateV4Endpoints } from '../validation/relationshipRules';

/**
 * The canonical connection policy is the single source of endpoint legality.
 * Every other rule table (V4 capabilities, V4 validation) must agree with it
 * for every relationship kind and every pair of metaclasses.
 */
const METACLASSES: MetaclassKind[] = [
  'Block', 'InterfaceBlock', 'ConstraintBlock', 'AssociationBlock', 'FlowSpecification', 'ValueType', 'DataType', 'Enumeration', 'Signal',
  'PartProperty', 'ReferenceProperty', 'ValueProperty', 'FlowProperty', 'ConstraintProperty', 'Port',
  'Requirement', 'TestCase', 'UseCase', 'Activity', 'Interaction', 'Operation', 'Package',
  'View', 'Viewpoint', 'Stakeholder',
];

const KINDS: Array<{ v4: SemanticRelationship['metaclass']; policyKind: string; diagram: 'bdd' | 'rtm' | 'requirements' }> = [
  { v4: 'Association', policyKind: 'association', diagram: 'bdd' },
  { v4: 'Generalization', policyKind: 'generalization', diagram: 'bdd' },
  { v4: 'Dependency', policyKind: 'dependency', diagram: 'bdd' },
  { v4: 'Allocate', policyKind: 'allocation', diagram: 'bdd' },
  { v4: 'Satisfy', policyKind: 'satisfy', diagram: 'rtm' },
  { v4: 'Verify', policyKind: 'verify', diagram: 'rtm' },
  { v4: 'Refine', policyKind: 'refine', diagram: 'rtm' },
  { v4: 'Trace', policyKind: 'trace', diagram: 'rtm' },
  { v4: 'Containment', policyKind: 'requirementContainment', diagram: 'requirements' },
  { v4: 'DeriveReqt', policyKind: 'deriveReqt', diagram: 'requirements' },
  { v4: 'Copy', policyKind: 'copy', diagram: 'requirements' },
];

function element(id: string, metaclass: MetaclassKind): SemanticElement {
  return { id, name: id, metaclass, namespace: [], ownerId: 'pkg-root' };
}

describe('rule tables agree with the connection policy', () => {
  const repo = createEmptyRepositoryV4();
  for (const metaclass of METACLASSES) {
    addSemanticElementV4(repo, element(`s-${metaclass}`, metaclass));
    addSemanticElementV4(repo, element(`t-${metaclass}`, metaclass));
  }

  it('answers every kind and metaclass pair identically', () => {
    const disagreements: string[] = [];
    for (const { v4, policyKind, diagram } of KINDS) {
      for (const source of METACLASSES) {
        for (const target of METACLASSES) {
          const expected = evaluateSysmlConnection({
            relationshipKind: policyKind, diagram,
            source: { id: 'source', name: 'source', family: familyOfMetaclass(source) },
            target: { id: 'target', name: 'target', family: familyOfMetaclass(target) },
          }).allowed;
          const actual = validateRelationshipEndpoints(
            { id: 'rel', metaclass: v4, sourceId: `s-${source}`, targetId: `t-${target}` }, repo,
          ).allowed;
          if (expected !== actual) disagreements.push(`${v4}: ${source} -> ${target} policy=${expected} v4=${actual}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('lists legal kinds that the policy actually accepts for some counterpart', () => {
    const kinds = getLegalRelationshipKinds(element('x', 'Block'), 'outgoing', repo);
    expect(kinds).toEqual(expect.arrayContaining(['Association', 'Composition', 'Generalization', 'Satisfy', 'Allocate']));
    expect(kinds).not.toContain('RequirementContainment');
    expect(kinds).not.toContain('DeriveReqt');
    // Requirements are only ever the target of Satisfy, never its source.
    expect(getLegalRelationshipKinds(element('r', 'Requirement'), 'outgoing', repo)).not.toContain('Satisfy');
    expect(getLegalRelationshipKinds(element('r', 'Requirement'), 'incoming', repo)).toContain('Satisfy');
  });

  it('keeps View, Viewpoint and Stakeholder out of the structural relationship families', () => {
    for (const metaclass of ['View', 'Viewpoint', 'Stakeholder'] as const) {
      for (const v4 of ['Association', 'Generalization', 'Satisfy'] as const) {
        const outgoing = validateRelationshipEndpoints({ id: 'r', metaclass: v4, sourceId: `s-${metaclass}`, targetId: 't-Block' }, repo).allowed;
        expect(outgoing).toBe(false);
      }
    }
    // «expose» (a Dependency in V4) may still target them.
    expect(validateRelationshipEndpoints({ id: 'r', metaclass: 'Dependency', sourceId: 's-View', targetId: 't-Viewpoint' }, repo).allowed).toBe(true);
  });

  it('keeps the V4 association validation on the same family rules', () => {
    const rel: SemanticRelationship = { id: 'a', metaclass: 'Association', sourceId: 's-Block', targetId: 't-Requirement' };
    expect(validateV4Endpoints(repo, rel).valid).toBe(false);
    expect(validateV4Endpoints(repo, { ...rel, targetId: 't-InterfaceBlock' }).valid).toBe(true);
  });

  it('accepts «satisfy» from any named design element, as SysML does', () => {
    const families: SysmlEndpointFamily[] = [];
    for (const metaclass of METACLASSES) {
      const ok = validateRelationshipEndpoints({ id: 'r', metaclass: 'Satisfy', sourceId: `s-${metaclass}`, targetId: 't-Requirement' }, repo).allowed;
      if (ok) families.push(familyOfMetaclass(metaclass));
    }
    expect(families).toEqual(expect.arrayContaining(['block', 'part', 'port', 'property', 'useCase', 'activity', 'operation']));
    expect(families).not.toContain('requirement');
    expect(families).not.toContain('package');
  });
});
