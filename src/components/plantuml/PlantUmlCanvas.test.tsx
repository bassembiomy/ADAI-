/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PlantUmlCanvas } from './PlantUmlCanvas';
import type { VisualDiagramModel } from '../../features/plantuml/model/visualDiagramModel';

describe('PlantUmlCanvas', () => {
  afterEach(cleanup);
  const sampleDiagram: VisualDiagramModel = {
    version: 1,
    type: 'sequence',
    canvas: { zoom: 1, pan: { x: 0, y: 0 } },
    id: 'diag-1',
    title: 'Test Diagram',
    kind: 'sequence',
    elements: [
      {
        id: 'elem-1',
        kind: 'participant',
        label: 'Controller',
        position: { x: 100, y: 150 },
        size: { width: 140, height: 60 },
        style: {},
      },
    ],
    relationships: [],
  };

  it('renders elements without generic position-delaying transition classes', () => {
    render(
      <PlantUmlCanvas
        diagram={sampleDiagram}
        selectedId="elem-1"
        onSelect={vi.fn()}
        onDrop={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: /Controller/i });
    expect(button).toBeDefined();
    // Must use transition-colors transition-shadow instead of blanket 'transition' which delays top/left
    expect(button.className).toContain('transition-colors');
    expect(button.className).not.toMatch(/(?:^|\s)transition(?:\s|$)/);
  });

  function pointer(button: HTMLElement, type: string, x: number, y: number, mouseButton = 0) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: mouseButton });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    fireEvent(button, event);
  }

  it('tracks total pointer displacement when several moves arrive before the diagram updates', () => {
    const onMove = vi.fn();
    render(<PlantUmlCanvas diagram={sampleDiagram} onSelect={vi.fn()} onDrop={vi.fn()} onMove={onMove} />);
    const button = screen.getByRole('button', { name: /Controller/i });
    button.setPointerCapture = vi.fn();
    pointer(button, 'pointerdown', 120, 170);
    pointer(button, 'pointermove', 125, 175);
    pointer(button, 'pointermove', 140, 190);
    expect(onMove).toHaveBeenLastCalledWith('elem-1', { x: 120, y: 170 });
    pointer(button, 'pointerup', 147, 197);
    expect(onMove).toHaveBeenLastCalledWith('elem-1', { x: 127, y: 177 });
    pointer(button, 'pointermove', 160, 210);
    expect(onMove).toHaveBeenCalledTimes(3);
  });

  it('ignores right-button drags and stops a cancelled gesture', () => {
    const onMove = vi.fn();
    render(<PlantUmlCanvas diagram={sampleDiagram} onSelect={vi.fn()} onDrop={vi.fn()} onMove={onMove} />);
    const button = screen.getByRole('button', { name: /Controller/i });
    button.setPointerCapture = vi.fn();
    pointer(button, 'pointerdown', 120, 170, 2);
    pointer(button, 'pointermove', 140, 190);
    expect(onMove).not.toHaveBeenCalled();
    pointer(button, 'pointerdown', 120, 170);
    pointer(button, 'pointercancel', 120, 170);
    pointer(button, 'pointermove', 140, 190);
    expect(onMove).not.toHaveBeenCalled();
  });
});
