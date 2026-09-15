import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseCaseRelationshipEditor } from './UseCaseRelationshipEditor';

describe('UseCaseRelationshipEditor', () => {
  const rel = {
    id: 'rel-1',
    kind: 'extend',
    sourceId: 'uc-abort',
    targetId: 'uc-mission',
    extensionPoint: 'OnEngineFailure',
    sourceRole: 'extender',
    targetRole: 'base',
  };

  it('renders relationship editor with stereotype and role properties', () => {
    const html = renderToStaticMarkup(
      <UseCaseRelationshipEditor
        relationship={rel}
        sourceName="Abort Mission"
        targetName="Execute Mission"
        availableExtensionPoints={['OnEngineFailure', 'OnLowFuel']}
        onChangeKind={vi.fn()}
        onUpdateRelationship={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(html).toContain('Relationship Details');
    expect(html).toContain('«extend»');
    expect(html).toContain('Abort Mission');
    expect(html).toContain('Execute Mission');
    expect(html).toContain('Extension Point');
    expect(html).toContain('OnEngineFailure');
  });

  it('renders delete action', () => {
    const html = renderToStaticMarkup(
      <UseCaseRelationshipEditor
        relationship={rel}
        sourceName="Abort Mission"
        targetName="Execute Mission"
        onDelete={vi.fn()}
      />
    );

    expect(html).toContain('Delete Relationship');
  });
});
