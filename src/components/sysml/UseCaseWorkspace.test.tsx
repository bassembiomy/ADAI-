// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { UseCaseWorkspace } from './UseCaseWorkspace';

const DIAGRAM_ID = 'uc-diagram';

beforeAll(() => {
  // jsdom lacks PointerEvent; the workspace reads clientX/clientY from it.
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    }
    (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill;
  }
});

function seedRepository() {
  const repo = createEmptyRepository();
  repo.diagrams[DIAGRAM_ID] = { id: DIAGRAM_ID, kind: 'diagram', name: 'Flight use cases', diagramKind: 'useCase', namespace: [], ownerId: 'model' };
  repo.actors.pilot = { id: 'pilot', kind: 'actor', name: 'Pilot', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] };
  repo.actors.captain = { id: 'captain', kind: 'actor', name: 'Captain', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] };
  repo.subjects.plane = { id: 'plane', kind: 'subject', name: 'Aircraft', namespace: [], ownerId: 'model' };
  repo.useCases.fly = { id: 'fly', kind: 'useCase', name: 'Fly', namespace: [], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] };
  repo.useCases.divert = { id: 'divert', kind: 'useCase', name: 'Divert', namespace: [], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] };
  const at = (id: string, x: number, y: number, width?: number, height?: number) =>
    [id, { id: `p-${id}`, diagramId: DIAGRAM_ID, semanticElementId: id, bounds: { x, y, width, height } }] as const;
  return {
    repo,
    presentations: {
      [DIAGRAM_ID]: {
        elementIds: ['pilot', 'captain', 'plane', 'fly', 'divert'],
        presentations: Object.fromEntries([at('pilot', 20, 60), at('captain', 20, 260), at('plane', 400, 20, 400, 420), at('fly', 100, 100), at('divert', 100, 300)]),
      },
    },
  };
}

let latest: SysmlGatewayState;
function Harness({ seeded = true }: { seeded?: boolean }) {
  const [state, setState] = useState(() => {
    if (!seeded) {
      const repo = createEmptyRepository();
      repo.diagrams[DIAGRAM_ID] = { id: DIAGRAM_ID, kind: 'diagram', name: 'Empty', diagramKind: 'useCase', namespace: [], ownerId: 'model' };
      return createSysmlGatewayState(repo, undefined, { [DIAGRAM_ID]: { elementIds: [], presentations: {} } });
    }
    const { repo, presentations } = seedRepository();
    return createSysmlGatewayState(repo, undefined, presentations);
  });
  latest = state;
  return (
    <UseCaseWorkspace
      repository={state.repository}
      diagramId={DIAGRAM_ID}
      diagramPresentations={state.diagramPresentations ?? {}}
      onExecute={command => {
        const result = executeSysmlCommand(latest, command);
        if (result.committed) { latest = { ...latest, ...result }; setState(latest); }
        return result;
      }}
    />
  );
}

const node = (kind: string, label: string) =>
  screen.getAllByTestId(`uc-node-${kind}`).find(element => element.getAttribute('data-label') === label)!;

describe('UseCaseWorkspace', () => {
  afterEach(cleanup);

  it('shows the frame label, the notation for each element kind, and no internal ids', () => {
    const { container } = render(<Harness />);
    expect(screen.getByTestId('usecase-frame-label').textContent).toBe('uc [Model] Model [Flight use cases]');
    expect(node('actor', 'Pilot')).toBeTruthy();
    expect(node('subject', 'Aircraft')).toBeTruthy();
    expect(container.querySelectorAll('ellipse')).toHaveLength(2);
    expect(container.innerHTML).not.toContain('p-pilot');
    expect(container.innerHTML).not.toContain('uc-diagram');
  });

  it('places an Actor, a Use Case and a Subject from the palette, each as one undoable command', () => {
    const { container } = render(<Harness seeded={false} />);
    expect(screen.getByTestId('usecase-empty')).toBeTruthy();
    const svg = container.querySelector('svg')!;
    for (const [button, key] of [['Actor', 'actors'], ['Use Case', 'useCases'], ['Subject', 'subjects']] as const) {
      fireEvent.click(screen.getByRole('button', { name: button }));
      fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, button: 0 });
      expect(Object.keys((latest.repository as unknown as Record<string, object>)[key])).toHaveLength(1);
    }
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).toHaveLength(3);
    expect(screen.queryByTestId('usecase-empty')).toBeNull();
    // Names come from the model, unique per kind.
    expect(Object.values(latest.repository.actors)[0].name).toBe('Actor');
    expect(Object.values(latest.repository.useCases)[0].name).toBe('UseCase');
    // Each placement is a single undo step.
    const undone = executeSysmlCommand(latest, { type: 'undo' });
    expect(Object.keys(undone.repository.subjects)).toHaveLength(0);
    expect(Object.keys(undone.repository.useCases)).toHaveLength(1);
  });

  it('draws an association by clicking source then target and reports illegal pairs', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Association' }));
    fireEvent.pointerDown(node('actor', 'Pilot'), { button: 0 });
    fireEvent.pointerDown(node('actor', 'Captain'), { button: 0 });
    expect(screen.getByTestId('usecase-message').textContent).toMatch(/Actor and a Use Case/);
    expect(Object.keys(latest.repository.relationships)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Association' }));
    fireEvent.pointerDown(node('actor', 'Pilot'), { button: 0 });
    fireEvent.pointerDown(node('useCase', 'Fly'), { button: 0 });
    const relationships = Object.values(latest.repository.relationships);
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({ kind: 'useCaseAssociation', sourceId: 'pilot', targetId: 'fly' });
    expect(screen.getAllByTestId('uc-edge')[0].getAttribute('data-kind')).toBe('useCaseAssociation');
  });

  it('extend asks for an extension point, then creates point and relationship together with the «extend» note', () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Extend' }));
    fireEvent.pointerDown(node('useCase', 'Divert'), { button: 0 });
    fireEvent.pointerDown(node('useCase', 'Fly'), { button: 0 });
    const prompt = screen.getByTestId('extend-prompt');
    expect(Object.keys(latest.repository.relationships)).toHaveLength(0);
    fireEvent.change(within(prompt).getByLabelText('New extension point name'), { target: { value: 'engine failure' } });
    fireEvent.change(within(prompt).getByLabelText('Extend condition'), { target: { value: 'engine out' } });
    fireEvent.click(within(prompt).getByRole('button', { name: /Create «extend»/ }));

    expect(screen.queryByTestId('extend-prompt')).toBeNull();
    expect(Object.values(latest.repository.extensionPoints).map(ep => ep.name)).toEqual(['engine failure']);
    expect(Object.values(latest.repository.relationships)[0]).toMatchObject({ kind: 'extend', sourceId: 'divert', targetId: 'fly', name: 'engine out' });
    const text = container.textContent ?? '';
    expect(text).toContain('«extend»');
    expect(text).toContain('extension point: engine failure');
    expect(text).toContain('[engine out]');
    // The use case ellipse now lists its extension point.
    expect(text).toContain('extension points');
  });

  it('Delete removes the selection from the diagram only; Delete from model removes it from the model', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('actor', 'Pilot'), { button: 0 });
    fireEvent.pointerUp(container(), { button: 0 });
    fireEvent.keyDown(screen.getByTestId('usecase-canvas'), { key: 'Delete' });
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).not.toContain('pilot');
    expect(latest.repository.actors.pilot).toBeDefined();

    fireEvent.pointerDown(node('actor', 'Captain'), { button: 0 });
    fireEvent.pointerUp(container(), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete from model…' }));
    const confirm = screen.queryByRole('button', { name: 'Confirm delete' });
    if (confirm) fireEvent.click(confirm);
    expect(latest.repository.actors.captain).toBeUndefined();
  });

  it('renames the selected element through updateElement', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('useCase', 'Fly'), { button: 0 });
    fireEvent.pointerUp(container(), { button: 0 });
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Cruise' } });
    fireEvent.blur(input);
    expect(latest.repository.useCases.fly.name).toBe('Cruise');
    expect(node('useCase', 'Cruise')).toBeTruthy();
  });

  it('adds an extension point to the selected use case', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('useCase', 'Fly'), { button: 0 });
    fireEvent.pointerUp(container(), { button: 0 });
    fireEvent.change(screen.getByLabelText('Extension point name'), { target: { value: 'turbulence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add extension point' }));
    expect(latest.repository.useCases.fly.extensionPointIds).toHaveLength(1);
    expect(screen.getByText('turbulence')).toBeTruthy();
  });

  it('dragging a use case into a subject proposes membership and commits only after Apply', () => {
    render(<Harness />);
    const fly = node('useCase', 'Fly');
    // Fly is at (100,100); the viewport offset is 20, so client = world + 20. Move it right by 400 into Aircraft (x 400..800).
    fireEvent.pointerDown(fly, { clientX: 220, clientY: 156, button: 0, pointerId: 1 });
    const svg = document.querySelector('svg')!;
    fireEvent.pointerMove(svg, { clientX: 560, clientY: 176, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 560, clientY: 176, pointerId: 1 });

    const bounds = latest.diagramPresentations![DIAGRAM_ID].presentations.fly.bounds;
    expect(bounds.x).toBeGreaterThanOrEqual(400);
    const proposal = screen.getByTestId('subject-proposal');
    expect(proposal.textContent).toContain('“Fly”');
    expect(proposal.textContent).toContain('“Aircraft”');
    expect(latest.repository.useCases.fly.subjectId).toBeUndefined();

    fireEvent.click(within(proposal).getByRole('button', { name: 'Apply' }));
    expect(latest.repository.useCases.fly.subjectId).toBe('plane');
    expect(screen.queryByTestId('subject-proposal')).toBeNull();
  });

  it('wheel zoom changes the zoom readout without touching the model', () => {
    render(<Harness />);
    const revision = latest.repository.revision;
    fireEvent.wheel(screen.getByTestId('usecase-canvas'), { deltaY: -100, clientX: 100, clientY: 100 });
    expect(screen.getByText(/^1\d\d%$/)).toBeTruthy();
    expect(latest.repository.revision).toBe(revision);
  });

  it('can show an existing element that is not on the diagram yet', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('actor', 'Pilot'), { button: 0 });
    fireEvent.pointerUp(container(), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from diagram' }));
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).not.toContain('pilot');
    fireEvent.change(screen.getByLabelText('Add existing element to this diagram'), { target: { value: 'pilot' } });
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).toContain('pilot');
    expect(node('actor', 'Pilot')).toBeTruthy();
  });
});

function container(): Element {
  return document.querySelector('svg')!;
}
