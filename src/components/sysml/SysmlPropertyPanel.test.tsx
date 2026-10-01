// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { SysmlPropertyPanel } from './SysmlPropertyPanel';

describe('SysmlPropertyPanel', () => {
  it('renders fields from schema and dispatches valid updates', () => {
    const repo = createEmptyRepositoryV4();
    repo.elements['block-1'] = { id: 'block-1', name: 'Engine', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };

    const onExecuteCommand = vi.fn();

    render(
      <SysmlPropertyPanel
        selection={{ repository: repo, elementId: 'block-1' }}
        onExecuteCommand={onExecuteCommand}
      />
    );

    expect(screen.getByText('Block: Engine')).toBeTruthy();
    const nameInput = screen.getByLabelText('Name');
    expect((nameInput as HTMLInputElement).value).toBe('Engine');

    fireEvent.change(nameInput, { target: { value: 'Turbine' } });
    fireEvent.blur(nameInput);

    expect(onExecuteCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UpdateElement',
      elementId: 'block-1',
      patch: expect.objectContaining({ name: 'Turbine' }),
    }));
  });
});
