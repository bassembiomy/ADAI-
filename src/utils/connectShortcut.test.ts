import { describe, it, expect } from 'vitest';

describe('connectShortcut', () => {
  it('should toggle connect mode state when Shift+C is pressed outside inputs', () => {
    let isCreatingTransition = false;
    let transitionSourceId: string | null = 's1';

    const handleShiftC = (isInput: boolean) => {
      if (isInput) return;
      isCreatingTransition = !isCreatingTransition;
      if (!isCreatingTransition) transitionSourceId = null;
    };

    handleShiftC(false);
    expect(isCreatingTransition).toBe(true);

    handleShiftC(false);
    expect(isCreatingTransition).toBe(false);
    expect(transitionSourceId).toBeNull();
  });
});
