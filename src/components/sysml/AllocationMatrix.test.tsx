// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { AllocationMatrix } from './AllocationMatrix';

function block(id: string, name: string): BlockDefinition {
  return { id, name, kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
}

let latest: SysmlGatewayState;
function Harness() {
  const [state, setState] = useState(() => {
    const repo = createEmptyRepository();
    repo.definitions.engine = block('engine', 'Engine');
    repo.useCases.drive = { id: 'drive', kind: 'useCase', name: 'Drive', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] };
    return createSysmlGatewayState(repo);
  });
  latest = state;
  return (
    <AllocationMatrix
      repository={state.repository}
      onExecute={command => {
        const result = executeSysmlCommand(latest, command);
        if (result.committed) { latest = { ...latest, ...result }; setState(latest); }
        return result;
      }}
    />
  );
}

describe('AllocationMatrix', () => {
  afterEach(cleanup);

  it('creates an allocation from an empty cell, shows names only, and removes it through the confirm step', () => {
    const { container } = render(<Harness />);
    expect(screen.getByTestId('allocation-coverage').textContent).toContain('0/');
    fireEvent.click(screen.getByRole('button', { name: 'Allocate Drive to Engine' }));
    expect(Object.values(latest.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Allocated: Drive to Engine' })).toBeTruthy();
    expect(container.innerHTML).not.toContain('allocate-drive-engine');

    fireEvent.click(screen.getByRole('button', { name: 'Allocated: Drive to Engine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete allocation' }));
    const confirm = screen.queryByRole('button', { name: 'Confirm delete' });
    if (confirm) fireEvent.click(confirm);
    expect(Object.values(latest.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Allocate Drive to Engine' })).toBeTruthy();
  });

  it('filters rows by kind', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Allocate Drive to Engine' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Rows: Use Case'));
    expect(screen.queryByRole('button', { name: 'Allocate Drive to Engine' })).toBeNull();
  });
});
