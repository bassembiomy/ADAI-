import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModelExplorerToolbar } from './ModelExplorerToolbar';

describe('ModelExplorerToolbar', () => {
  it('renders tabs for containment, diagram, and search', () => {
    const html = renderToStaticMarkup(
      <ModelExplorerToolbar
        viewMode="containment"
        onViewModeChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
      />
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('Containment');
    expect(html).toContain('Diagram');
    expect(html).toContain('Search');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-label="Expand All"');
    expect(html).toContain('aria-label="Collapse All"');
  });

  it('renders search input with active query and clear button', () => {
    const html = renderToStaticMarkup(
      <ModelExplorerToolbar
        viewMode="search"
        onViewModeChange={vi.fn()}
        searchQuery="Sensor"
        onSearchQueryChange={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        showFavoritesOnly={true}
        onToggleFavoritesOnly={vi.fn()}
      />
    );

    expect(html).toContain('value="Sensor"');
    expect(html).toContain('aria-label="Clear Search"');
    expect(html).toContain('aria-label="Toggle Favorites"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('disables Diagram when there is no active diagram', () => {
    const html = renderToStaticMarkup(
      <ModelExplorerToolbar
        viewMode="containment"
        onViewModeChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        diagramAvailable={false}
      />
    );

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="No active diagram"');
  });
});
