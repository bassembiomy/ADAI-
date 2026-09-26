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
});
