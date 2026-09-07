import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { DEFAULT_DOCKS, PAGE_PRESETS, loadDocks, saveDocks } from '../OpmDockState';
import { OpmDockShell } from '../OpmDockShell';

describe('opm dock shell', () => {
  it('page presets force the right dock tab', () => {
    expect(PAGE_PRESETS.simulate.rightTab).toBe('simControl');
    expect(PAGE_PRESETS.review.rightTab).toBe('opmCodegen');
    expect(PAGE_PRESETS.model.bottom).toBe(false);
  });
  it('persists dock state to localStorage', () => {
    saveDocks({ ...DEFAULT_DOCKS, left: false });
    expect(loadDocks().left).toBe(false);
    saveDocks(DEFAULT_DOCKS);
  });
  it('renders page bar + docks with testids', () => {
    const html = renderToStaticMarkup(
      <OpmDockShell docks={DEFAULT_DOCKS} onDocksChange={() => {}} left={<div />} right={<div />} bottom={<div />} center={<div />} />
    );
    expect(html).toContain('data-testid="opm-pagebar"');
    expect(html).toContain('data-testid="opm-dock-left"');
    expect(html).toContain('data-testid="opm-dock-right"');
    expect(html).toContain('data-testid="opm-dock-bottom"');
    expect(html).toContain('data-testid="opm-resizer-left"');
    expect(html).toContain('data-testid="opm-resizer-right"');
    expect(html).toContain('data-testid="opm-resizer-bottom"');
  });
});
