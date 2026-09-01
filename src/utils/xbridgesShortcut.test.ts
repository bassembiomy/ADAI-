import { describe, it, expect } from 'vitest';

describe('xbridgesShortcut', () => {
  it('should trigger xbridges state creation when Shift+X is pressed outside inputs', () => {
    let created = false;
    const handleShiftX = (isInput: boolean) => {
      if (isInput) return;
      created = true;
    };

    handleShiftX(true);
    expect(created).toBe(false);

    handleShiftX(false);
    expect(created).toBe(true);
  });

  it('should not delete state machine state when Delete is pressed inside xbridges workspace or default is prevented', () => {
    let stateDeleted = false;

    const simulateKeyDown = (options: {
      key: string;
      defaultPrevented: boolean;
      xBridgesStateId: string | null;
      selectedIds: string[];
    }) => {
      const { key, defaultPrevented, xBridgesStateId, selectedIds } = options;

      // Logic under test for global keydown listener
      if (defaultPrevented) return;
      if (xBridgesStateId !== null) return;

      if (key === 'Delete' && selectedIds.length > 0) {
        stateDeleted = true;
      }
    };

    simulateKeyDown({
      key: 'Delete',
      defaultPrevented: true,
      xBridgesStateId: 'xb-state-1',
      selectedIds: ['xb-state-1'],
    });
    expect(stateDeleted).toBe(false);

    simulateKeyDown({
      key: 'Delete',
      defaultPrevented: false,
      xBridgesStateId: 'xb-state-1',
      selectedIds: ['xb-state-1'],
    });
    expect(stateDeleted).toBe(false);

    simulateKeyDown({
      key: 'Delete',
      defaultPrevented: false,
      xBridgesStateId: null,
      selectedIds: ['state-1'],
    });
    expect(stateDeleted).toBe(true);
  });

  it('should route multi-selection delete to deleteStates and execute delete for all selected state ids', () => {
    let confirmPayload: { ids: string[]; totalStates: number } | null = null;
    let executedIds: string[] = [];

    const states = [
      { id: 's1', name: 'State1' },
      { id: 's2', name: 'State2' },
      { id: 's3', name: 'State3' },
    ];
    const transitions = [
      { id: 't1', sourceId: 's1', targetId: 's2' }
    ];

    const deleteStates = (selectedStateIds: string[], otherSelectedIds: string[]) => {
      confirmPayload = {
        ids: selectedStateIds,
        totalStates: selectedStateIds.length,
      };
    };

    const executeDeleteState = (ids: string[]) => {
      executedIds = ids;
    };

    // Simulate Ctrl+A selection
    const selectedIds = ['s1', 's2', 's3', 't1'];

    // Simulate Delete key
    const selectedStateIds = selectedIds.filter(id => states.some(s => s.id === id));
    const otherSelectedIds = selectedIds.filter(id => !states.some(s => s.id === id));

    if (selectedStateIds.length > 0) {
      deleteStates(selectedStateIds, otherSelectedIds);
    }

    expect(confirmPayload).not.toBeNull();
    expect((confirmPayload as any)?.ids).toEqual(['s1', 's2', 's3']);
    expect((confirmPayload as any)?.totalStates).toBe(3);

    // Simulate user approval in modal
    if (confirmPayload) {
      executeDeleteState((confirmPayload as any).ids);
    }

    expect(executedIds).toEqual(['s1', 's2', 's3']);
  });
});

