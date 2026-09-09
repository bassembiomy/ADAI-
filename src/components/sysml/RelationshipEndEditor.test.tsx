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
});
