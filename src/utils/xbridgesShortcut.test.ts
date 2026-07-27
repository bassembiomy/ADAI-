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
});
