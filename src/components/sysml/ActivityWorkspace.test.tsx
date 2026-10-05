// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyRepository, type ActivityDefinition } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { ActivityWorkspace } from './ActivityWorkspace';

const DIAGRAM_ID = 'act-diagram';
const ACTIVITY_ID = 'act';

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

const block = (id: string, name: string) => ({
  id, kind: 'block' as const, name, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});

function activityOf(state: SysmlGatewayState): ActivityDefinition {
  return state.repository.definitions[ACTIVITY_ID] as ActivityDefinition;
}

function seed(kind: 'empty' | 'full' | 'lanes') {
  const repo = createEmptyRepository();
  repo.definitions.Real = { id: 'Real', kind: 'valueType', name: 'Real', namespace: [], ownerId: 'model' };
  repo.definitions.Vehicle = block('Vehicle', 'Vehicle');
  repo.definitions.Car = { ...block('Car', 'Car'), supertypeIds: ['Vehicle'] };
  const activity: ActivityDefinition = { id: ACTIVITY_ID, kind: 'activity', name: 'Drive', namespace: [], ownerId: 'model', parameters: [], nodes: [], edges: [], partitions: [] };
  const bounds: Record<string, { x: number; y: number }> = {};
  if (kind === 'full') {
    activity.nodes = [
      { id: 'n-init', kind: 'initial', name: '' },
      { id: 'n-start', kind: 'action', name: 'Start engine', pins: [{ id: 'p-out', name: 'power', direction: 'out', typeId: 'Vehicle' }] },
      { id: 'n-drive', kind: 'action', name: 'Drive off', pins: [{ id: 'p-in-car', name: 'car', direction: 'in', typeId: 'Car' }, { id: 'p-in-veh', name: 'veh', direction: 'in', typeId: 'Vehicle' }] },
      { id: 'n-dec', kind: 'decision', name: '' },
      { id: 'n-fin', kind: 'activityFinal', name: '' },
    ];
    Object.assign(bounds, { 'n-init': { x: 40, y: 40 }, 'n-start': { x: 40, y: 120 }, 'n-drive': { x: 300, y: 300 }, 'n-dec': { x: 40, y: 260 }, 'n-fin': { x: 40, y: 400 } });
  }
  if (kind === 'lanes') {
    activity.nodes = [{ id: 'n-a', kind: 'action', name: 'Act' }];
    activity.partitions = [{ id: 'l1', name: 'Pilot', nodeIds: ['n-a'] }, { id: 'l2', name: 'System', nodeIds: [] }];
    Object.assign(bounds, { 'n-a': { x: 40, y: 120 } });
  }
  repo.definitions[ACTIVITY_ID] = activity;
  repo.diagrams[DIAGRAM_ID] = { id: DIAGRAM_ID, kind: 'diagram', name: 'Drive', namespace: [], ownerId: ACTIVITY_ID, contextElementId: ACTIVITY_ID, diagramKind: 'activity' };
  return createSysmlGatewayState(repo, undefined, {
    [DIAGRAM_ID]: {
      elementIds: Object.keys(bounds),
      presentations: Object.fromEntries(Object.entries(bounds).map(([id, rect]) => [id, { id: `p-${id}`, diagramId: DIAGRAM_ID, semanticElementId: id, bounds: rect }])),
    },
  });
}

let latest: SysmlGatewayState;
function Harness({ kind = 'full' }: { kind?: 'empty' | 'full' | 'lanes' }) {
  const [state, setState] = useState(() => seed(kind));
  latest = state;
  return (
    <ActivityWorkspace
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

const node = (kind: string, label?: string) =>
  screen.getAllByTestId(`activity-node-${kind}`).find(element => label === undefined || element.getAttribute('data-label') === label)!;
const pin = (label: string) => screen.getAllByTestId('activity-pin').find(element => element.getAttribute('data-label') === label)!;

describe('ActivityWorkspace', () => {
  afterEach(cleanup);

  it('shows the frame label, the UML notation for each node kind and no internal ids', () => {
    const { container } = render(<Harness />);
    expect(screen.getByTestId('activity-frame-label').textContent).toBe('act [Activity] Drive [Drive]');
    expect(node('action', 'Start engine')).toBeTruthy();
    expect(node('initial').querySelector('circle')).toBeTruthy();
    expect(node('decision').querySelector('polygon')).toBeTruthy();
    expect(node('activityFinal').querySelectorAll('circle')).toHaveLength(2);
    expect(node('action', 'Start engine').querySelector('rect[rx]')).toBeTruthy();
    expect(screen.getAllByTestId('activity-pin')).toHaveLength(3);
    for (const id of ['n-init', 'n-start', 'p-out', 'act-diagram', 'p-n-start']) expect(container.innerHTML).not.toContain(id);
  });

  it('places an Action and an Initial Node from the palette, each one undoable command', () => {
    const { container } = render(<Harness kind="empty" />);
    expect(screen.getByTestId('activity-empty')).toBeTruthy();
    const svg = container.querySelector('svg')!;
    for (const name of ['Action', 'Initial Node']) {
      fireEvent.click(screen.getByRole('button', { name }));
      fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, button: 0 });
    }
    expect(activityOf(latest).nodes.map(n => n.kind)).toEqual(['action', 'initial']);
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).toHaveLength(2);
    expect(screen.queryByTestId('activity-empty')).toBeNull();
    const undone = executeSysmlCommand(latest, { type: 'undo' });
    expect((undone.repository.definitions[ACTIVITY_ID] as ActivityDefinition).nodes.map(n => n.kind)).toEqual(['action']);
  });

  it('refuses a second initial node with a readable message', () => {
    const { container } = render(<Harness kind="full" />);
    fireEvent.click(screen.getByRole('button', { name: 'Initial Node' }));
    fireEvent.pointerDown(container.querySelector('svg')!, { clientX: 600, clientY: 100, button: 0 });
    expect(screen.getByTestId('activity-message').textContent).toMatch(/at most one/);
    expect(activityOf(latest).nodes.filter(n => n.kind === 'initial')).toHaveLength(1);
  });

  it('draws control flows by clicking source then target and rejects illegal ones', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    fireEvent.pointerDown(node('action', 'Start engine'), { button: 0 });
    fireEvent.pointerDown(node('initial'), { button: 0 });
    expect(screen.getByTestId('activity-message').textContent).toMatch(/initial node cannot have incoming/i);
    expect(activityOf(latest).edges).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    fireEvent.pointerDown(node('initial'), { button: 0 });
    fireEvent.pointerDown(node('action', 'Start engine'), { button: 0 });
    expect(activityOf(latest).edges).toMatchObject([{ kind: 'controlFlow', sourceId: 'n-init', targetId: 'n-start' }]);
    expect(screen.getAllByTestId('activity-edge')[0].getAttribute('data-kind')).toBe('controlFlow');
  });

  it('draws an object flow between pins and enforces the type rule', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    fireEvent.pointerDown(pin('power'), { button: 0 });
    fireEvent.pointerDown(pin('car'), { button: 0 });
    expect(screen.getByTestId('activity-message').textContent).toMatch(/subtype/);
    expect(activityOf(latest).edges).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    fireEvent.pointerDown(pin('power'), { button: 0 });
    fireEvent.pointerDown(pin('veh'), { button: 0 });
    expect(activityOf(latest).edges).toMatchObject([{ kind: 'objectFlow', sourceId: 'p-out', targetId: 'p-in-veh' }]);
  });

  it('edits a decision guard and shows it in brackets', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    fireEvent.pointerDown(node('decision'), { button: 0 });
    fireEvent.pointerDown(node('activityFinal'), { button: 0 });
    fireEvent.pointerDown(screen.getAllByTestId('activity-edge')[0], { button: 0 });
    const guard = screen.getByLabelText('Guard');
    fireEvent.change(guard, { target: { value: 'speed > 0' } });
    fireEvent.blur(guard);
    expect(activityOf(latest).edges[0].guard).toBe('speed > 0');
    expect(screen.getByTestId('activity-canvas').textContent).toContain('[speed > 0]');
  });

  it('renames a node from the inspector with one command', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('action', 'Drive off'), { button: 0 });
    fireEvent.pointerUp(window);
    const revision = latest.repository.revision;
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Pull away' } });
    fireEvent.blur(input);
    expect(activityOf(latest).nodes.find(n => n.id === 'n-drive')?.name).toBe('Pull away');
    expect(latest.repository.revision).toBe(revision + 1);
    expect(node('action', 'Pull away')).toBeTruthy();
  });

  it('adds an input pin to the selected action', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('action', 'Start engine'), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole('button', { name: 'Add input pin' }));
    expect(activityOf(latest).nodes.find(n => n.id === 'n-start')?.pins?.map(p => p.direction)).toEqual(['out', 'in']);
  });

  it('Delete removes a node from the diagram only; Delete from model removes it from the activity', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('action', 'Start engine'), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.keyDown(screen.getByTestId('activity-canvas'), { key: 'Delete' });
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).not.toContain('n-start');
    expect(activityOf(latest).nodes.map(n => n.id)).toContain('n-start');

    // It can be shown again.
    fireEvent.change(screen.getByLabelText('Show an existing node on this diagram'), { target: { value: 'n-start' } });
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).toContain('n-start');

    fireEvent.pointerDown(node('action', 'Start engine'), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole('button', { name: 'Delete from model' }));
    expect(activityOf(latest).nodes.map(n => n.id)).not.toContain('n-start');
    expect(latest.diagramPresentations![DIAGRAM_ID].elementIds).not.toContain('n-start');
  });

  it('dragging a node into another swimlane proposes membership; Apply commits it, Keep leaves it', () => {
    render(<Harness kind="lanes" />);
    expect(screen.getAllByTestId('activity-lane').map(l => l.getAttribute('data-label'))).toEqual(['Pilot', 'System']);
    const drag = () => {
      fireEvent.pointerDown(node('action', 'Act'), { button: 0, clientX: 100, clientY: 160 });
      fireEvent.pointerMove(window, { clientX: 370, clientY: 160 });
      fireEvent.pointerUp(window);
    };
    drag();
    const bar = screen.getByTestId('lane-proposal');
    expect(bar.textContent).toContain('Put “Act” in swimlane “System”');
    expect(activityOf(latest).partitions.map(p => p.nodeIds)).toEqual([['n-a'], []]);

    fireEvent.click(within(bar).getByRole('button', { name: 'Keep as drawn only' }));
    expect(screen.queryByTestId('lane-proposal')).toBeNull();
    expect(activityOf(latest).partitions.map(p => p.nodeIds)).toEqual([['n-a'], []]);

    // Drag it back and forth once more, this time confirming.
    fireEvent.pointerDown(node('action', 'Act'), { button: 0, clientX: 370, clientY: 160 });
    fireEvent.pointerMove(window, { clientX: 380, clientY: 160 });
    fireEvent.pointerUp(window);
    fireEvent.click(within(screen.getByTestId('lane-proposal')).getByRole('button', { name: 'Apply' }));
    expect(activityOf(latest).partitions.map(p => p.nodeIds)).toEqual([[], ['n-a']]);
    expect(screen.queryByTestId('lane-proposal')).toBeNull();
    const undone = executeSysmlCommand(latest, { type: 'undo' });
    expect((undone.repository.definitions[ACTIVITY_ID] as ActivityDefinition).partitions.map(p => p.nodeIds)).toEqual([['n-a'], []]);
  });

  it('allocates a selected action to a Block through the allocation tools and shows it on the action', () => {
    render(<Harness />);
    fireEvent.pointerDown(node('action', 'Start engine'), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.change(screen.getByLabelText('Allocate action to'), { target: { value: 'Vehicle' } });
    expect(Object.values(latest.repository.relationships)).toMatchObject([{ kind: 'allocation', sourceId: 'n-start', targetId: 'Vehicle' }]);
    expect(node('action', 'Start engine').textContent).toContain('«allocate» Vehicle');
  });

  it('sets what a swimlane represents and moves lanes', () => {
    render(<Harness kind="lanes" />);
    fireEvent.pointerDown(screen.getAllByTestId('activity-lane')[0], { button: 0 });
    fireEvent.change(screen.getByLabelText('Swimlane represents'), { target: { value: 'Vehicle' } });
    expect(activityOf(latest).partitions[0].representsId).toBe('Vehicle');
    expect(screen.getAllByTestId('activity-lane')[0].textContent).toContain('«represents» Vehicle');
    fireEvent.click(screen.getByRole('button', { name: 'Move right' }));
    expect(activityOf(latest).partitions.map(p => p.id)).toEqual(['l2', 'l1']);
  });

  it('lists model warnings readably', () => {
    render(<Harness />);
    const list = screen.getByTestId('activity-diagnostics');
    expect(list.textContent).toMatch(/Decision .* needs at least two outgoing edges/);
    expect(list.textContent).not.toContain('n-dec');
  });
});
