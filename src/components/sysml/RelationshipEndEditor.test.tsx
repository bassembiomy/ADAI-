import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createRejectedRelationshipChange,
  filterRelationshipKinds,
  RelationshipEndEditor,
  validateRelationshipKindUpdate,
} from './RelationshipEndEditor';
import type { SysmlRelationship } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';

function findElementByAriaLabel(node: React.ReactNode, label: string): React.ReactElement | undefined {
  if (!React.isValidElement(node)) return undefined;
  if (node.props['aria-label'] === label) return node;
  return React.Children.toArray(node.props.children)
    .map(child => findElementByAriaLabel(child, label))
    .find((element): element is React.ReactElement => Boolean(element));
}

describe('RelationshipEndEditor', () => {
  const relationship: SysmlRelationship = {
    id: 'rel1',
    kind: 'composition',
    sourceId: 'blockA',
    targetId: 'blockB',
    sourceRole: 'whole',
    targetRole: 'part',
    sourceMultiplicity: { lower: 0, upper: 1, ordered: false, unique: true },
    targetMultiplicity: { lower: 1, upper: '*', ordered: false, unique: true },
    sourceNavigable: false,
    targetNavigable: true,
    sourceAggregation: 'composite',
    targetAggregation: 'none',
  };

  it('renders role names, multiplicities, navigability, and aggregation controls', () => {
    const html = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={relationship}
        diagnostics={[]}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('Role name');
    expect(html).toContain('whole');
    expect(html).toContain('part');
    expect(html).toContain('Navigable');
    expect(html).toContain('Aggregation');
    expect(html).toContain('composite');
  });

  it('hides IBD and requirement relationships from generic BDD choices', () => {
    const html = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={relationship}
        diagnostics={[]}
        sourceEndpoint={{ id: 'blockA', name: 'Engine', family: 'block' }}
        targetEndpoint={{ id: 'blockB', name: 'Mass', family: 'valueType' }}
        diagram="bdd"
        onChange={vi.fn()}
      />
    );
    expect((html.match(/aria-label="Relationship kind"/g) ?? [])).toHaveLength(1);
    expect(html).toContain('value="association"');
    expect(html).not.toContain('value="binding"');
    expect(html).not.toContain('value="deriveReqt"');
    expect(html).not.toContain('value="composition"');
  });

  it('only offers requirement links when their endpoint direction is valid', () => {
    const block = { id: 'block', name: 'Controller', family: 'block' as const };
    const requirement = { id: 'req', name: 'Safety', family: 'requirement' as const };

    expect(filterRelationshipKinds(block, requirement, 'rtm')).toContain('satisfy');
    expect(filterRelationshipKinds(block, requirement, 'rtm')).not.toContain('verify');
    expect(filterRelationshipKinds(requirement, block, 'rtm')).not.toContain('satisfy');
  });

  it('rejects a stale invalid kind update with an actionable policy diagnostic', () => {
    const result = validateRelationshipKindUpdate(
      'composition',
      { id: 'blockA', name: 'Engine', family: 'block' },
      { id: 'mass', name: 'Mass', family: 'valueType' },
      'bdd',
    );

    expect(result.allowed).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'INVALID_AGGREGATION_ENDPOINTS',
      correctiveAction: expect.stringContaining('value property'),
    });
  });

  it('reports the rejected candidate kind and both resolved endpoints to the invalid-update callback', () => {
    const source = { id: 'blockA', name: 'Engine', family: 'block' as const };
    const target = { id: 'mass', name: 'Mass', family: 'valueType' as const };
    const rejected = createRejectedRelationshipChange('composition', source, target, 'bdd');

    expect(rejected).toMatchObject({
      relationshipKind: 'composition',
      source,
      target,
      diagnostic: { code: 'INVALID_AGGREGATION_ENDPOINTS' },
    });
  });

  it('blocks a stale select interaction and sends its candidate kind to onInvalidChange', () => {
    const onChange = vi.fn();
    const onInvalidChange = vi.fn();
    const editor = RelationshipEndEditor({
      relationship,
      diagnostics: [],
      sourceEndpoint: { id: 'blockA', name: 'Engine', family: 'block' },
      targetEndpoint: { id: 'mass', name: 'Mass', family: 'valueType' },
      diagram: 'bdd',
      onChange,
      onInvalidChange,
    });
    const kindSelect = findElementByAriaLabel(editor, 'Relationship kind');

    expect(kindSelect).toBeDefined();
    kindSelect!.props.onChange({ target: { value: 'composition' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(onInvalidChange).toHaveBeenCalledWith(expect.objectContaining({
      relationshipKind: 'composition',
      source: { id: 'blockA', name: 'Engine', family: 'block' },
      target: { id: 'mass', name: 'Mass', family: 'valueType' },
    }));
  });

  it('renders diagnostics matching property paths', () => {
    const diagnostics: SysmlDiagnostic[] = [
      { code: 'INVALID_MULTIPLICITY', severity: 'error', elementId: 'rel1', propertyPath: 'relationships.rel1.sourceMultiplicity', message: 'Composition composite end multiplicity upper must be at most 1' },
      { code: 'NON_NAVIGABLE_ENDS', severity: 'error', elementId: 'rel1', propertyPath: 'relationships.rel1.navigability', message: 'At least one end must be navigable' },
    ];

    const html = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={relationship}
        diagnostics={diagnostics}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('Composition composite end multiplicity upper must be at most 1');
    expect(html).toContain('At least one end must be navigable');
  });

  it('includes Requirement Containment option, enables only when both endpoints are requirements, and shows container/nested roles', () => {
    const containmentRel: SysmlRelationship = {
      id: 'rc1',
      kind: 'requirementContainment',
      sourceId: 'req1',
      targetId: 'req2',
      sourceRole: 'parent',
      targetRole: 'child',
    };

    // Both endpoints are requirements -> option enabled
    const htmlEnabled = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={containmentRel}
        sourceIsRequirement={true}
        targetIsRequirement={true}
        diagram="requirements"
        diagnostics={[]}
        onChange={vi.fn()}
      />
    );

    expect(htmlEnabled).toContain('Requirement Containment (parent → child)');
    expect(htmlEnabled).toContain('value="requirementContainment"');
    expect(htmlEnabled).not.toMatch(/value="requirementContainment"[^>]*disabled/);
    expect(htmlEnabled).toContain('Container (parent)');
    expect(htmlEnabled).toContain('Nested (child)');

    // One endpoint is not a requirement -> option disabled
    const htmlDisabled = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={containmentRel}
        sourceIsRequirement={false}
        targetIsRequirement={true}
        diagram="requirements"
        diagnostics={[]}
        onChange={vi.fn()}
      />
    );

    expect(htmlDisabled).not.toContain('value="requirementContainment"');
  });

  it('renders generalization inheritance guidance with parent chain, leaf/cycle diagnostics, and abstract guidance', () => {
    const generalization: SysmlRelationship = {
      id: 'gen1',
      kind: 'generalization',
      sourceId: 'child',
      targetId: 'parent',
    };
    const html = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={generalization}
        diagnostics={[
          { code: 'LEAF_SPECIALIZATION', severity: 'error', elementId: 'gen1', propertyPath: 'supertypeIds', message: 'Leaf block parent cannot be specialized' },
          { code: 'INHERITANCE_CYCLE', severity: 'error', elementId: 'gen1', propertyPath: 'supertypeIds', message: 'Inheritance cycle includes child' },
        ]}
        generalizationInfo={{
          parentChain: [{ id: 'grandparent', name: 'Grandparent' }, { id: 'parent', name: 'Parent' }],
          targetIsAbstract: true,
        }}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('Inheritance guidance');
    expect(html).toContain('Grandparent');
    expect(html).toContain('Parent');
    expect(html).toContain('[LEAF_SPECIALIZATION]');
    expect(html).toContain('[INHERITANCE_CYCLE]');
    expect(html).toContain('[ABSTRACT_INSTANTIATION]');
  });

  it('announces an empty state when a generalization has no inheritance issues', () => {
    const generalization: SysmlRelationship = {
      id: 'gen2',
      kind: 'generalization',
      sourceId: 'child',
      targetId: 'parent',
    };
    const html = renderToStaticMarkup(
      <RelationshipEndEditor
        relationship={generalization}
        diagnostics={[]}
        generalizationInfo={{ parentChain: [{ id: 'parent', name: 'Parent' }] }}
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('No inheritance issues detected');
  });
});

