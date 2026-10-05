// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { SequenceWorkspace } from './SequenceWorkspace';

const DIAGRAM_ID = 'sd-diagram';
const INTERACTION_ID = 'int';

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

const block = (id: string, name: string, operations: string[] = []) => ({
  id, kind: 'block' as const, name, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations, constraints: [],
});

function interactionOf(state: SysmlGatewayState): InteractionDefinition {
  return state.repository.definitions[INTERACTION_ID] as InteractionDefinition;
}

function seed(kind: 'empty' | 'full') {
  const repo = createEmptyRepository();
  repo.definitions.Vehicle = block('Vehicle', 'Vehicle', ['start()', 'stop()']);
  repo.definitions.Driver = block('Driver', 'Driver');
  repo.definitions.Ignite = { id: 'Ignite', kind: 'signal', name: 'Ignite', namespace: [], ownerId: 'model' };
  const interaction: InteractionDefinition = { id: INTERACTION_ID, kind: 'interaction', name: 'Start', namespace: [], ownerId: 'model', lifelines: [], messages: [], fragments: [] };
  if (kind === 'full') {
    interaction.lifelines = [
      { id: 'l-driver', name: 'driver', representsId: 'Driver' },
      { id: 'l-car', name: 'car', representsId: 'Vehicle' },
    ];
    interaction.messages = [
      { id: 'm-call', name: '', sort: 'synchCall', sourceLifelineId: 'l-driver', targetLifelineId: 'l-car', order: 1, signatureId: 'start()' },
      { id: 'm-reply', name: 'ok', sort: 'reply', sourceLifelineId: 'l-car', targetLifelineId: 'l-driver', order: 2 },
      { id: 'm-sig', name: '', sort: 'asynchSignal', sourceLifelineId: 'l-driver', targetLifelineId: 'l-car', order: 3, signatureId: 'Ignite' },
    ];
  }
  repo.definitions[INTERACTION_ID] = interaction;
  repo.diagrams[DIAGRAM_ID] = { id: DIAGRAM_ID, kind: 'diagram', name: 'Start', namespace: [], ownerId: INTERACTION_ID, contextElementId: INTERACTION_ID, diagramKind: 'sequence' };
  return createSysmlGatewayState(repo);
}

let latest: SysmlGatewayState;
const navigated: string[] = [];
function Harness({ kind = 'full' }: { kind?: 'empty' | 'full' }) {
  const [state, setState] = useState(() => seed(kind));
  latest = state;
  return (
    <SequenceWorkspace
      repository={state.repository}
      diagramId={DIAGRAM_ID}
      onNavigate={id => navigated.push(id)}
      onExecute={command => {
        const result = executeSysmlCommand(latest, command);
        if (result.committed) { latest = { ...latest, ...result }; setState(latest); }
        return result;
      }}
    />
  );
}

const lifelineHead = (label: string) => screen.getAllByTestId('sequence-lifeline-head').find(element => element.getAttribute('data-label') === label)!;
const messageNode = (text: string) => screen.getAllByTestId('sequence-message').find(element => element.getAttribute('data-text') === text)!;
const click = (element: Element, init: Record<string, unknown> = {}) => fireEvent.pointerDown(element, { button: 0, clientX: 100, clientY: 100, ...init });

describe('SequenceWorkspace', () => {
  afterEach(cleanup);

  it('starts with the initial selection and reports it instead of an empty one', () => {
    const reported: string[][] = [];
    const state = seed('full');
    render(
      <SequenceWorkspace
        repository={state.repository} diagramId={DIAGRAM_ID} initialSelection={['l-car']}
        onSelect={ids => reported.push(ids)}
        onExecute={command => executeSysmlCommand(state, command)}
      />,
    );
    expect(reported[0]).toEqual(['l-car']);
    expect(reported.some(ids => ids.length === 0)).toBe(false);
  });

  it('shows the frame label, lifelines, UML message notation, execution bar and no internal ids', () => {
    const { container } = render(<Harness />);
    expect(screen.getByTestId('sequence-frame-label').textContent).toBe('sd [Interaction] Start [Start]');
    expect(screen.getAllByTestId('sequence-lifeline').map(el => el.getAttribute('data-label'))).toEqual(['driver', 'car']);
    expect(screen.getAllByTestId('sequence-message').map(el => el.getAttribute('data-text'))).toEqual(['1: start', '2: ok', '3: Ignite']);
    expect(messageNode('1: start').getAttribute('data-sort')).toBe('synchCall');
    expect(messageNode('1: start').querySelector('polyline[marker-end="url(#seq-filled)"]')).toBeTruthy();
    expect(messageNode('2: ok').querySelector('polyline[stroke-dasharray]')).toBeTruthy();
    expect(messageNode('3: Ignite').querySelector('polyline[marker-end="url(#seq-open)"]')).toBeTruthy();
    expect(screen.getAllByTestId('sequence-activation')).toHaveLength(1);
    for (const id of ['l-driver', 'l-car', 'm-call', 'm-reply', 'm-sig', 'sd-diagram', 'Vehicle"']) expect(container.innerHTML).not.toContain(id);
  });

  it('double click opens the Signal of a signal message and the Block that owns a called operation', () => {
    navigated.length = 0;
    render(<Harness />);
    fireEvent.doubleClick(messageNode('3: Ignite'));
    fireEvent.doubleClick(messageNode('1: start'));
    expect(navigated).toEqual(['Ignite', 'Vehicle']);
  });

  it('adds a lifeline from the palette as one undoable command', () => {
    render(<Harness kind="empty" />);
    expect(screen.getByTestId('sequence-empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lifeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lifeline' }));
    expect(interactionOf(latest).lifelines.map(l => l.name)).toEqual(['Lifeline', 'Lifeline2']);
    expect(screen.queryByTestId('sequence-empty')).toBeNull();
    const undone = executeSysmlCommand(latest, { type: 'undo' });
    expect((undone.repository.definitions[INTERACTION_ID] as InteractionDefinition).lifelines.map(l => l.name)).toEqual(['Lifeline']);
  });

  it('draws a synchronous call between two lifelines, reply included, from two clicks', () => {
    render(<Harness kind="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lifeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lifeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Synchronous Call' }));
    click(lifelineHead('Lifeline'));
    expect(screen.getByTestId('sequence-message-status').textContent).toMatch(/receives/);
    click(lifelineHead('Lifeline2'));
    expect(interactionOf(latest).messages.map(m => m.sort)).toEqual(['synchCall', 'reply']);
    expect(screen.getAllByTestId('sequence-message')).toHaveLength(2);
    expect(screen.getAllByTestId('sequence-activation')).toHaveLength(1);
    // The call is selected after creation so the inspector shows it.
    expect((screen.getByLabelText('Message kind') as HTMLSelectElement).value).toBe('synchCall');
  });

  it('refuses a reply with no call with a readable message and stores nothing', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    click(lifelineHead('car'));
    click(lifelineHead('driver'));
    // A matching call/reply already exists, so a second reply has no open call to answer.
    expect(interactionOf(latest).messages).toHaveLength(3);
    expect(screen.getByTestId('sequence-message-status').textContent).toMatch(/must answer an earlier synchronous call/);
  });

  it('edits a lifeline name and what it represents, and moves it', () => {
    render(<Harness />);
    click(lifelineHead('car'));
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'vehicle' } });
    fireEvent.blur(name);
    expect(interactionOf(latest).lifelines[1].name).toBe('vehicle');
    // The car receives start(); a Block without that operation is refused.
    fireEvent.change(screen.getByLabelText('Lifeline represents'), { target: { value: 'Driver' } });
    expect(interactionOf(latest).lifelines[1].representsId).toBe('Vehicle');
    expect(screen.getByTestId('sequence-message-status').textContent).toMatch(/calls an operation that Driver does not have/);
    fireEvent.click(screen.getByRole('button', { name: 'Move left' }));
    expect(interactionOf(latest).lifelines.map(l => l.id)).toEqual(['l-car', 'l-driver']);
    // The driver only sends and receives a reply, so it may represent another Block.
    click(lifelineHead('driver'));
    fireEvent.change(screen.getByLabelText('Lifeline represents'), { target: { value: 'Vehicle' } });
    expect(interactionOf(latest).lifelines.find(l => l.id === 'l-driver')!.representsId).toBe('Vehicle');
  });

  it('offers the operations of the receiving Block and rejects an invalid choice', () => {
    render(<Harness />);
    click(messageNode('1: start'));
    const operation = screen.getByLabelText('Operation') as HTMLSelectElement;
    expect([...operation.options].map(o => o.textContent)).toEqual(['(none)', 'start', 'stop']);
    fireEvent.change(operation, { target: { value: 'stop()' } });
    expect(interactionOf(latest).messages[0].signatureId).toBe('stop()');
    expect(screen.getByTestId('sequence-frame-label')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Arguments'), { target: { value: '5' } });
    fireEvent.blur(screen.getByLabelText('Arguments'));
    expect(interactionOf(latest).messages[0].arguments).toBe('5');
    expect(screen.getAllByTestId('sequence-message')[0].getAttribute('data-text')).toBe('1: stop(5)');
  });

  it('changes a signal message signal', () => {
    render(<Harness />);
    click(messageNode('3: Ignite'));
    expect((screen.getByLabelText('Signal') as HTMLSelectElement).value).toBe('Ignite');
    fireEvent.change(screen.getByLabelText('Signal'), { target: { value: '' } });
    expect(interactionOf(latest).messages[2]).not.toHaveProperty('signatureId');
    expect(screen.getByTestId('sequence-diagnostics').textContent).toMatch(/does not reference a Signal/);
  });

  it('reorders a message with Move up/down and by dragging, as one undo step each', () => {
    render(<Harness />);
    click(messageNode('3: Ignite'));
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    expect(interactionOf(latest).messages.map(m => [m.id, m.order])).toEqual([['m-call', 1], ['m-reply', 3], ['m-sig', 2]]);
    const undone = executeSysmlCommand(latest, { type: 'undo' });
    expect((undone.repository.definitions[INTERACTION_ID] as InteractionDefinition).messages.map(m => m.order)).toEqual([1, 2, 3]);
  });

  it('reorders a message by dragging it to another slot, and shows where it will land', () => {
    render(<Harness />);
    // Drag the signal above the call (to the first slot).
    const target = screen.getAllByTestId('sequence-message')[2];
    fireEvent.pointerDown(target, { button: 0, clientY: 300 });
    fireEvent(window, new MouseEvent('pointermove', { clientY: 20, bubbles: true }));
    expect(screen.getByTestId('sequence-drop-indicator')).toBeTruthy();
    fireEvent(window, new MouseEvent('pointerup', { clientY: 20, bubbles: true }));
    expect(interactionOf(latest).messages.find(m => m.id === 'm-sig')!.order).toBe(1);
  });

  it('encloses selected messages in a combined fragment and edits its guards', () => {
    const { container } = render(<Harness />);
    click(messageNode('1: start'));
    click(messageNode('2: ok'), { shiftKey: true });
    fireEvent.change(screen.getByLabelText('Enclose the selected messages in a combined fragment'), { target: { value: 'alt' } });
    expect(interactionOf(latest).fragments).toHaveLength(1);
    expect(interactionOf(latest).fragments[0]).toMatchObject({ operator: 'alt', coveredLifelineIds: ['l-driver', 'l-car'] });
    expect(screen.getByTestId('sequence-fragment').getAttribute('data-operator')).toBe('alt');

    const guard = screen.getByLabelText('Guard of operand 1') as HTMLInputElement;
    fireEvent.change(guard, { target: { value: 'engine ok' } });
    fireEvent.blur(guard);
    expect(interactionOf(latest).fragments[0].operands[0].guard).toBe('engine ok');
    expect(container.textContent).toContain('[engine ok]');
    expect(container.textContent).toContain('[else]');

    fireEvent.change(screen.getByLabelText('Fragment operator'), { target: { value: 'loop' } });
    expect(screen.getByTestId('sequence-message-status').textContent).toMatch(/only one/);
    expect(interactionOf(latest).fragments[0].operator).toBe('alt');

    fireEvent.click(screen.getByRole('button', { name: 'Delete fragment' }));
    expect(interactionOf(latest).fragments).toEqual([]);
  });

  it('deletes a call together with its reply and a lifeline with its messages', () => {
    render(<Harness />);
    click(messageNode('1: start'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete message' }));
    expect(interactionOf(latest).messages.map(m => m.id)).toEqual(['m-sig']);
    click(lifelineHead('car'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete lifeline' }));
    expect(interactionOf(latest).lifelines.map(l => l.id)).toEqual(['l-driver']);
    expect(interactionOf(latest).messages).toEqual([]);
  });

  it('mounts with a clear notice when the diagram has no interaction', () => {
    const repo = createEmptyRepository();
    render(<SequenceWorkspace repository={repo} diagramId="nope" onExecute={command => executeSysmlCommand(createSysmlGatewayState(repo), command)} />);
    expect(screen.getByTestId('sequence-no-interaction')).toBeTruthy();
  });
});
