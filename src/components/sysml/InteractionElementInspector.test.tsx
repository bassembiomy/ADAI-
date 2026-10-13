// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { InteractionElementInspector } from './InteractionElementInspector';

const block = (id: string, name: string) => ({
  id, kind: 'block' as const, name, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});

function seed() {
  const repo = createEmptyRepository();
  repo.definitions.Vehicle = block('Vehicle', 'Vehicle');
  repo.definitions.main = {
    id: 'main', kind: 'interaction', name: 'Start', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'driver' }, { id: 'b', name: 'car', representsId: 'Vehicle' }],
    messages: [
      { id: 'm1', name: 'go', sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', order: 1 },
      { id: 'm2', name: 'stop', sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', order: 2 },
    ],
    fragments: [{ id: 'f1', operator: 'opt', operands: [{ guard: 'ready', messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] }],
  } as InteractionDefinition;
  return createSysmlGatewayState(repo);
}

let latest: SysmlGatewayState;
let executed = 0;
function Harness({ elementId }: { elementId: string }) {
  const [state, setState] = useState(seed);
  latest = state;
  return (
    <InteractionElementInspector
      repository={state.repository}
      elementId={elementId}
      onExecute={command => {
        executed += 1;
        const result = executeSysmlCommand(latest, command);
        if (result.committed) { latest = { ...latest, ...result }; setState(latest); }
        return result;
      }}
    />
  );
}
const main = () => latest.repository.definitions.main as InteractionDefinition;

afterEach(() => { cleanup(); executed = 0; });

describe('InteractionElementInspector', () => {
  it('renames a lifeline and changes what it represents, one command each', () => {
    render(<Harness elementId="a" />);
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'pilot' } });
    fireEvent.blur(name);
    expect(main().lifelines[0].name).toBe('pilot');
    fireEvent.change(screen.getByLabelText('Lifeline represents'), { target: { value: 'Vehicle' } });
    expect(main().lifelines[0].representsId).toBe('Vehicle');
    expect(executed).toBe(2);
  });

  it('does not carry a half-typed name to the next selected element', () => {
    const view = render(<Harness elementId="a" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'typed for driver' } });
    view.rerender(<Harness elementId="b" />);
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('car');
    fireEvent.blur(name);
    expect(main().lifelines.map(lifeline => lifeline.name)).toEqual(['driver', 'car']);
    expect(executed).toBe(0);
  });

  it('edits a message name, kind and arguments', () => {
    render(<Harness elementId="m1" />);
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'begin' } });
    fireEvent.blur(name);
    fireEvent.change(screen.getByLabelText('Message kind'), { target: { value: 'asynchSignal' } });
    const args = screen.getByLabelText('Arguments') as HTMLInputElement;
    fireEvent.change(args, { target: { value: 'fast' } });
    fireEvent.blur(args);
    expect(main().messages[0]).toMatchObject({ name: 'begin', sort: 'asynchSignal', arguments: 'fast' });
    expect(screen.getByText('Position 1 of 2')).toBeTruthy();
  });

  it('edits a fragment operator and guard, and deletes it', () => {
    render(<Harness elementId="f1" />);
    fireEvent.change(screen.getByLabelText('Fragment operator'), { target: { value: 'loop' } });
    const guard = screen.getByLabelText('Guard of operand 1') as HTMLInputElement;
    fireEvent.change(guard, { target: { value: 'retry' } });
    fireEvent.blur(guard);
    expect(main().fragments[0]).toMatchObject({ operator: 'loop', operands: [{ guard: 'retry' }] });
    fireEvent.click(screen.getByText('Delete Fragment'));
    expect(main().fragments).toEqual([]);
  });

  it('deletes a message and renumbers the rest', () => {
    render(<Harness elementId="m1" />);
    fireEvent.click(screen.getByText('Delete Message'));
    expect(main().messages.map(message => [message.id, message.order])).toEqual([['m2', 1]]);
  });

  it('accepts a duplicate lifeline name, which is only a warning', () => {
    render(<Harness elementId="a" />);
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'car' } });
    fireEvent.blur(name);
    expect(main().lifelines[0].name).toBe('car');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing for an id that is not interaction content', () => {
    const { container } = render(<Harness elementId="Vehicle" />);
    expect(container.innerHTML).toBe('');
  });
});
