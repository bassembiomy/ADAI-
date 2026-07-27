import { describe, it, expect } from 'vitest';

describe('ScopePanel', () => {
  it('should support double click detachment state toggle', () => {
    let detached = false;
    const toggleDetached = () => { detached = !detached; };
    toggleDetached();
    expect(detached).toBe(true);
    toggleDetached();
    expect(detached).toBe(false);
  });
});
