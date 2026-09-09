import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RelationshipEndEditor } from './RelationshipEndEditor';
import type { SysmlRelationship } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';

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
        diagnostics={[]}
        onChange={vi.fn()}
      />
    );

    expect(htmlDisabled).toMatch(/value="requirementContainment"[^>]*disabled/);
  });
});

