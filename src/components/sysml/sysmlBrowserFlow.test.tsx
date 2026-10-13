import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { applyLegacySysmlDeletion, formatLegacyDeletionImpact, requiresDeletionConfirmation } from '../../services/sysmlTransactionAdapter';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../../types/sysml_types';
import { TraceabilityMatrix } from './TraceabilityMatrix';

describe('SysML browser flow release surface', () => {
  it('renders navigable, filterable, non-color-only RTM release evidence', () => {
    const repo = createEmptyRepository();
    repo.requirements.r = { id: 'r', name: 'Safety', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Safe', status: 'stale', version: '1', owner: 'Systems' };
    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repo} />);
    expect(html).toContain('role="region"');
    expect(html).toContain('Search requirements');
    expect(html).toContain('Filter by traceability status');
    expect(html).toContain('Traceability status: stale');
    expect(html).toContain('Export CSV');
  });

  it('routes legacy BDD definition deletion through the canonical adapter with composite-only cascade', () => {
    const block = (id: string): BlockData => ({ id, name: id, stereotype: 'block', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] });
    const model = {
      blocks: [block('whole'), block('child'), block('other')],
      parts: [
        { id: 'owned', name: 'owned', blockId: 'whole', typeId: 'child', x: 0, y: 0, width: 80, height: 60 } as PartData,
        { id: 'external', name: 'external', blockId: 'other', typeId: 'child', aggregation: 'shared' as const, x: 0, y: 0, width: 80, height: 60 },
      ],
      relationships: [{ id: 'c1', sourceId: 'whole', targetId: 'child', type: 'composition', label: '' } as RelationshipData],
      connectors: [] as ConnectorData[],
    };
    const result = applyLegacySysmlDeletion(model, ['child']);
    expect(result.model.parts.map(item => item.id)).toEqual(['external']);
    expect(result.impact.unresolvedUsageIds).toEqual(['external']);
    expect(requiresDeletionConfirmation(result.impact)).toBe(true);
    // User-facing confirmation text preserved by the legacy editor callbacks.
    expect(formatLegacyDeletionImpact(result.impact)).toContain('Typed usages left unresolved: external');
  });
});
