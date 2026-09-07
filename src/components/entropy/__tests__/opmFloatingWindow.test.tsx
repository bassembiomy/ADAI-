import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { OpmFloatingWindow } from '../OpmFloatingWindow';

describe('OpmFloatingWindow', () => {
  it('renders title, badge, and children when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <OpmFloatingWindow
        title="Element Inspector"
        badge="OPM Studio"
        isOpen={true}
        onClose={() => {}}
        onDock={() => {}}
      >
        <div data-testid="floating-child">Panel Content</div>
      </OpmFloatingWindow>
    );

    expect(html).toContain('Element Inspector');
    expect(html).toContain('OPM Studio');
    expect(html).toContain('data-testid="floating-child"');
    expect(html).toContain('data-testid="opm-floating-window"');
    expect(html).toContain('data-testid="opm-floating-titlebar"');
  });

  it('renders control buttons for re-dock, minimize, maximize, and close', () => {
    const html = renderToStaticMarkup(
      <OpmFloatingWindow
        title="Inspector"
        isOpen={true}
        onClose={() => {}}
        onDock={() => {}}
      >
        <div>Content</div>
      </OpmFloatingWindow>
    );

    expect(html).toContain('data-testid="opm-floating-dock-btn"');
    expect(html).toContain('data-testid="opm-floating-minimize-btn"');
    expect(html).toContain('data-testid="opm-floating-maximize-btn"');
    expect(html).toContain('data-testid="opm-floating-close-btn"');
  });

  it('renders corner resize grip handle when not minimized or maximized', () => {
    const html = renderToStaticMarkup(
      <OpmFloatingWindow
        title="Inspector"
        isOpen={true}
        onClose={() => {}}
        onDock={() => {}}
      >
        <div>Content</div>
      </OpmFloatingWindow>
    );

    expect(html).toContain('data-testid="opm-floating-resizer"');
  });

  it('returns null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <OpmFloatingWindow
        title="Inspector"
        isOpen={false}
        onClose={() => {}}
        onDock={() => {}}
      >
        <div>Content</div>
      </OpmFloatingWindow>
    );

    expect(html).toBe('');
  });
});
