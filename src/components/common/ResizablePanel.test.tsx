// @vitest-environment jsdom
/**
 * Acceptance tests — resizable docked panels (hover shows a resize cursor on the edge; press and drag resizes).
 * Plan: docs/superpowers/plans/2026-11-09-copy-everywhere-and-resizable-panels.md
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizablePanel } from './ResizablePanel';

beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });
afterEach(() => cleanup());

const handle = (label = 'Properties') => screen.getByRole('separator', { name: `Resize ${label}` });
const panel = (testId = 'panel') => screen.getByTestId(testId);
const drag = (el: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
  fireEvent.mouseDown(el, { button: 0, clientX: from.x, clientY: from.y });
  act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: to.x, clientY: to.y, buttons: 1 })); });
  act(() => { window.dispatchEvent(new MouseEvent('mouseup', { clientX: to.x, clientY: to.y, button: 0 })); });
};

describe('ResizablePanel', () => {
  it('exposes an accessible edge handle with the resize cursor', () => {
    render(<ResizablePanel id="t.props" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div>content</div></ResizablePanel>);
    const h = handle();
    expect(h.getAttribute('aria-orientation')).toBe('vertical');
    expect(h.getAttribute('aria-valuenow')).toBe('320');
    expect(h.getAttribute('aria-valuemin')).toBe('200');
    expect(h.getAttribute('aria-valuemax')).toBe('600');
    expect(h.getAttribute('tabindex')).toBe('0');
    expect((h as HTMLElement).style.cursor).toBe('col-resize');
    expect(panel().style.width).toBe('320px');
    expect(panel().textContent).toContain('content');
  });

  it('a panel on the right (handle on its left edge) grows when dragged to the left', () => {
    render(<ResizablePanel id="t.right" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 300 }, { x: 900, y: 300 });
    expect(panel().style.width).toBe('420px');
  });

  it('a panel on the left (handle on its right edge) grows when dragged to the right', () => {
    render(<ResizablePanel id="t.left" label="Hierarchy" edge="right" defaultSize={256} minSize={160} maxSize={500} data-testid="panel"><div /></ResizablePanel>);
    drag(handle('Hierarchy'), { x: 256, y: 300 }, { x: 306, y: 300 });
    expect(panel().style.width).toBe('306px');
  });

  it('a bottom panel (handle on its top edge) uses height and the row-resize cursor', () => {
    render(<ResizablePanel id="t.bottom" label="Scope" edge="top" defaultSize={224} minSize={100} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    const h = handle('Scope');
    expect(h.getAttribute('aria-orientation')).toBe('horizontal');
    expect((h as HTMLElement).style.cursor).toBe('row-resize');
    drag(h, { x: 500, y: 700 }, { x: 500, y: 640 });
    expect(panel().style.height).toBe('284px');
  });

  it('clamps to the minimum and maximum size', () => {
    render(<ResizablePanel id="t.clamp" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 0 }, { x: 1500, y: 0 });
    expect(panel().style.width).toBe('200px');
    drag(handle(), { x: 1000, y: 0 }, { x: 0, y: 0 });
    expect(panel().style.width).toBe('600px');
  });

  it('stops resizing on mouse up (moves afterwards change nothing)', () => {
    render(<ResizablePanel id="t.stop" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 0 }, { x: 950, y: 0 });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 0, buttons: 0 })); });
    expect(panel().style.width).toBe('370px');
  });

  it('double-click on the handle restores the default size', () => {
    render(<ResizablePanel id="t.dbl" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 0 }, { x: 900, y: 0 });
    fireEvent.doubleClick(handle());
    expect(panel().style.width).toBe('320px');
  });

  it('resizes with the keyboard', () => {
    render(<ResizablePanel id="t.key" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(panel().style.width).toBe('336px');
    fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true });
    expect(panel().style.width).toBe('272px');
  });

  it('remembers the size per panel and restores it', () => {
    const first = render(<ResizablePanel id="t.persist" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 0 }, { x: 920, y: 0 });
    first.unmount();
    render(<ResizablePanel id="t.persist" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    expect(panel().style.width).toBe('400px');
  });

  it('still works when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<ResizablePanel id="t.nostore" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 0 }, { x: 990, y: 0 });
    expect(panel().style.width).toBe('330px');
    spy.mockRestore(); spy2.mockRestore();
  });

  it('reports size changes', () => {
    const onSizeChange = vi.fn();
    render(<ResizablePanel id="t.cb" label="Properties" edge="left" defaultSize={320} minSize={200} maxSize={600} onSizeChange={onSizeChange} data-testid="panel"><div /></ResizablePanel>);
    drag(handle(), { x: 1000, y: 0 }, { x: 990, y: 0 });
    expect(onSizeChange).toHaveBeenLastCalledWith(330);
  });
});

describe('docked panels of the application use ResizablePanel', () => {
  const uses = (path: string, ids: string[]) => {
    const src = readFileSync(path, 'utf8');
    expect(src, path).toMatch(/<ResizablePanel\b/);
    for (const id of ids) expect(src, `${path}: ${id}`).toContain(`id="${id}"`);
  };
  it('application shell: Hierarchy, Variables, Properties, Scope', () => {
    const all = ['src/App.tsx', ...['AppShellPanels.tsx'].map((f) => `src/components/${f}`)].filter((p) => { try { readFileSync(p); return true; } catch { return false; } })
      .map((p) => readFileSync(p, 'utf8')).join('\n');
    for (const id of ['shell.hierarchy', 'shell.variables', 'shell.properties', 'shell.scope']) expect(all, id).toContain(`id="${id}"`);
  });
  it('X-Bridges: library, properties, problems list', () => uses('src/components/xbridges/XbridgesWorkspace.tsx', ['xbridges.library', 'xbridges.properties', 'xbridges.problems']));
  it('V-Lab: library, properties', () => uses('src/components/vlab/VLabWorkspace.tsx', ['vlab.library', 'vlab.properties']));
});
