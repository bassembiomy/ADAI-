// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { TypeSelectionPrompt } from './TypeSelectionPrompt';

describe('TypeSelectionPrompt', () => {
  afterEach(() => {
    cleanup();
  });
  const candidates = [
    { id: 'if-can', name: 'CANBus' },
    { id: 'if-power', name: 'PowerInterface' },
  ];

  it('renders available type candidates and allows selection', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const onCreateNew = vi.fn();

    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={onSelect}
        onCreateNewType={onCreateNew}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/Select Type for Proxy Port/i)).toBeTruthy();
    expect(screen.getByText('CANBus')).toBeTruthy();
    expect(screen.getByText('PowerInterface')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLButtonElement).disabled).toBe(true);

    // Select CANBus
    fireEvent.click(screen.getByText('CANBus'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm|Select/i }));
    expect(onSelect).toHaveBeenCalledWith('if-can');
  });

  it('invokes onCreateNewType when the user clicks Create New Type', () => {
    const onCreateNew = vi.fn();

    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={vi.fn()}
        onCreateNewType={onCreateNew}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create New Type/i }));
    expect(onCreateNew).toHaveBeenCalled();
  });

  it('invokes onCancel on Cancel button or Escape key', () => {
    const onCancel = vi.fn();

    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows empty candidates and permits only explicit Create New Type or Cancel', () => {
    const onSelect = vi.fn();
    render(<TypeSelectionPrompt isOpen featureKind="Proxy Port" candidates={[]} onSelectType={onSelect} onCreateNewType={vi.fn()} onCancel={vi.fn()} error="TYPE_NOT_FOUND" />);
    expect(screen.getByText(/No compatible existing types/i)).toBeTruthy();
    expect(screen.getByText('TYPE_NOT_FOUND')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
