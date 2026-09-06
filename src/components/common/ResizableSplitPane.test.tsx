import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ResizableSplitPaneGroup, PanelMaximizeButton } from './ResizableSplitPane';

describe('ResizableSplitPaneGroup', () => {
  it('renders all children in normal mode', () => {
    const html = renderToString(
      <ResizableSplitPaneGroup initialSizes={[30, 35, 35]}>
        <div id="pane-0">Pane 0 Content</div>
        <div id="pane-1">Pane 1 Content</div>
        <div id="pane-2">Pane 2 Content</div>
      </ResizableSplitPaneGroup>
    );

    expect(html).toContain('Pane 0 Content');
    expect(html).toContain('Pane 1 Content');
    expect(html).toContain('Pane 2 Content');
  });

  it('renders only the maximized child when maximizedIndex is specified', () => {
    const html = renderToString(
      <ResizableSplitPaneGroup initialSizes={[30, 35, 35]} maximizedIndex={1}>
        <div id="pane-0">Pane 0 Content</div>
        <div id="pane-1">Pane 1 Content</div>
        <div id="pane-2">Pane 2 Content</div>
      </ResizableSplitPaneGroup>
    );

    expect(html).not.toContain('Pane 0 Content');
    expect(html).toContain('Pane 1 Content');
    expect(html).not.toContain('Pane 2 Content');
  });

  it('renders empty when no children provided', () => {
    const html = renderToString(
      <ResizableSplitPaneGroup>
        {[]}
      </ResizableSplitPaneGroup>
    );

    expect(html).toBe('');
  });
});

describe('PanelMaximizeButton', () => {
  it('renders maximize icon when not maximized', () => {
    const html = renderToString(
      <PanelMaximizeButton isMaximized={false} onToggle={() => {}} />
    );

    expect(html).toContain('Maximize panel');
  });

  it('renders restore icon when maximized', () => {
    const html = renderToString(
      <PanelMaximizeButton isMaximized={true} onToggle={() => {}} />
    );

    expect(html).toContain('Restore normal view');
  });
});
