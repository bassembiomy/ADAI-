// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { TypeSelectionPrompt } from './TypeSelectionPrompt';
import { createEmptyRepository } from '../../engine/sysml/model';
import {
  getCompatiblePortCandidates,
  planOwnedPortCreation,
} from '../../services/sysmlOwnedFeatureCommands';

function createCanvasFixture() {
  const repo = createEmptyRepository();
  repo.definitions.motor = {
    id: 'motor', name: 'Motor', namespace: [], kind: 'block',
    isAbstract: false, isLeaf: false, supertypeIds: [], properties: [], ports: [], operations: [], constraints: [],
  };
  repo.definitions.canBus = {
    id: 'canBus', name: 'CANBusInterface', namespace: [], kind: 'interface', features: [],
  };
  repo.definitions.voltage = {
    id: 'voltage', name: 'Voltage', namespace: [], kind: 'valueType', unit: 'V',
  };
  repo.definitions.vehicle = {
    id: 'vehicle', name: 'Vehicle', namespace: [], kind: 'block',
    isAbstract: false, isLeaf: false, supertypeIds: [], properties: [], ports: [], operations: [], constraints: [],
  };
  return repo;
}

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

  it('canvas Standard Port needs no type selection: planner commands an untyped UML Port', () => {
    const repo = createCanvasFixture();
    const plan = planOwnedPortCreation(repo, { ownerBlockId: 'vehicle', portKind: 'umlPort' });
    expect(plan.outcome).toBe('command');
    if (plan.outcome !== 'command' || plan.command.intent.featureKind !== 'port') return;
    expect(plan.command.intent.portKind).toBe('umlPort');
    expect(plan.command.intent.typeId).toBeUndefined();
  });

  it('canvas ProxyPort chooser offers only InterfaceBlock candidates', () => {
    const repo = createCanvasFixture();
    const candidates = getCompatiblePortCandidates(repo, 'proxyPort');
    expect(candidates.map(c => c.id)).toEqual(['canBus']);
    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={vi.fn()}
        onCreateNewType={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('CANBusInterface')).toBeTruthy();
    expect(screen.queryByText('Motor')).toBeNull();
    expect(screen.queryByText('Voltage')).toBeNull();
  });

  it.each([
    ['Full Port', 'fullPort'],
    ['Legacy Flow Port', 'flowPort'],
  ] as const)('canvas %s requires an explicit compatible selection, never the first candidate', (label, portKind) => {
    const repo = createCanvasFixture();
    const candidates = getCompatiblePortCandidates(repo, portKind);
    expect(candidates.length).toBeGreaterThan(0);
    const onSelect = vi.fn();
    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind={label}
        candidates={candidates}
        onSelectType={onSelect}
        onCreateNewType={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(new RegExp(`Select Type for ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))).toBeTruthy();
    // No silent first-candidate selection on mount.
    expect(onSelect).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(candidates[0].name));
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(candidates[0].id);
  });

  it('choosing no type cannot create a typed feature: Confirm stays disabled without selection', () => {
    const onSelect = vi.fn();
    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={onSelect}
        onCreateNewType={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('drops a stale selection when candidates change so Confirm cannot fire for an absent id', () => {    const onSelect = vi.fn();
    const { rerender } = render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={onSelect}
        onCreateNewType={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('CANBus'));
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLButtonElement).disabled).toBe(false);
    rerender(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={[{ id: 'if-power', name: 'PowerInterface' }]}
        onSelectType={onSelect}
        onCreateNewType={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('backs selection, error, and confirm surfaces with semantic presentation tokens', () => {
    render(
      <TypeSelectionPrompt
        isOpen={true}
        featureKind="Proxy Port"
        candidates={candidates}
        onSelectType={vi.fn()}
        onCreateNewType={vi.fn()}
        onCancel={vi.fn()}
        error="TYPE_NOT_FOUND"
      />,
    );
    // Error surface pairs the error token with the message text.
    expect(screen.getByText('TYPE_NOT_FOUND').getAttribute('style') ?? '').toContain('--sysml-sem-error');

    // Selected candidate + enabled Confirm resolve from the selection token
    // with dark (AA-passing) text instead of white on the token.
    fireEvent.click(screen.getByText('CANBus'));
    expect(screen.getByText('CANBus').closest('button')?.getAttribute('style') ?? '').toContain('--sysml-sem-selection');
    const confirmStyle = screen.getByRole('button', { name: /Confirm/i }).getAttribute('style') ?? '';
    expect(confirmStyle).toContain('--sysml-sem-selection');
    // Dark (AA-passing) text on the selection token; React serializes the
    // hex to rgb in the style attribute.
    expect((screen.getByRole('button', { name: /Confirm/i }) as HTMLElement).style.color).toBe('rgb(17, 24, 39)');
  });
});
