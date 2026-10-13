// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { SysmlPropertyPanel } from './SysmlPropertyPanel';

describe('SysmlPropertyPanel', () => {
  afterEach(cleanup);
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

  it('shows named endpoints and dispatches the selected endpoint ID', () => {
    const repo = createEmptyRepositoryV4();
    repo.elements['block-1'] = { id: 'block-1', name: 'Engine', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.elements['block-2'] = { id: 'block-2', name: 'Pump', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.relationships['association-1'] = {
      id: 'association-1', name: '', metaclass: 'Association', sourceId: 'block-1', targetId: 'block-2',
    };
    const onExecuteCommand = vi.fn();

    const { container } = render(
      <SysmlPropertyPanel
        selection={{ repository: repo, relationshipId: 'association-1' }}
        onExecuteCommand={onExecuteCommand}
      />
    );

    expect(screen.getByRole('heading', { name: 'Association' })).toBeTruthy();
    expect(screen.queryByLabelText('ID')).toBeNull();
    expect(container.textContent).not.toMatch(/association-1|block-1|block-2/);
    const source = screen.getByRole('combobox', { name: 'Source' });
    expect((source as HTMLSelectElement).selectedOptions[0].textContent).toBe('Engine');
    fireEvent.change(source, { target: { value: 'block-2' } });
    expect(onExecuteCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UpdateRelationship', relationshipId: 'association-1', patch: { sourceId: 'block-2' },
    }));
  });

  it('shows names in read-only item flow references', () => {
    const repo = createEmptyRepositoryV4();
    repo.elements['block-1'] = { id: 'block-1', name: 'Engine', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.elements['block-2'] = { id: 'block-2', name: 'Pump', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.relationships['connector-1'] = {
      id: 'connector-1', name: '', metaclass: 'Connector', sourceId: 'block-1', targetId: 'block-2',
    };
    repo.itemFlows!['flow-1'] = {
      id: 'flow-1', name: '', sourceId: 'block-1', targetId: 'block-2',
      realizingRelationshipId: 'connector-1', conveyedClassifierIds: ['block-1', 'block-2'],
    };

    const { container } = render(<SysmlPropertyPanel selection={{ repository: repo, itemFlowId: 'flow-1' }} />);
    expect(screen.getByRole('heading', { name: 'Item Flow' })).toBeTruthy();
    expect(container.textContent).toContain('Engine');
    expect(container.textContent).toContain('Pump');
    expect(container.textContent).toContain('Connector');
    expect(container.textContent).not.toMatch(/flow-1|connector-1|block-1|block-2/);
  });

  it('explains a missing reference without displaying its ID', () => {
    const repo = createEmptyRepositoryV4();
    repo.relationships['association-1'] = {
      id: 'association-1', name: '', metaclass: 'Association', sourceId: 'missing-source-id', targetId: 'pkg-root',
    };

    const { container } = render(<SysmlPropertyPanel selection={{ repository: repo, relationshipId: 'association-1' }} />);
    const source = screen.getByRole('combobox', { name: 'Source' });
    expect((source as HTMLSelectElement).selectedOptions[0].textContent).toBe('Element');
    const warningId = source.getAttribute('aria-describedby');
    expect(warningId).toBeTruthy();
    expect(document.getElementById(warningId!)?.textContent).toBe('Referenced element is unavailable');
    expect(container.textContent).not.toContain('missing-source-id');
  });

  it('associates read-only reference values with their labels', () => {
    const repo = createEmptyRepositoryV4();
    repo.elements['block-1'] = { id: 'block-1', name: 'Engine', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.itemFlows!['flow-1'] = {
      id: 'flow-1', name: '', sourceId: 'block-1', targetId: 'pkg-root',
      realizingRelationshipId: 'missing-connector', conveyedClassifierIds: [],
    };

    render(<SysmlPropertyPanel selection={{ repository: repo, itemFlowId: 'flow-1' }} />);
    const source = screen.getByRole('textbox', { name: 'Source' });
    expect(source.textContent).toBe('Engine');
    expect(source.getAttribute('aria-readonly')).toBe('true');
    expect(source.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.getElementById(source.getAttribute('aria-labelledby')!)?.textContent).toBe('Source');
  });
});
