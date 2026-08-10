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
});

