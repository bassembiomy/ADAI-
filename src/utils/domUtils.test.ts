import { describe, it, expect } from 'vitest';
import { isInputFocused } from './domUtils';

describe('isInputFocused', () => {
  it('returns false for null or non-HTMLElement targets', () => {
    expect(isInputFocused(null)).toBe(false);
    expect(isInputFocused({} as any)).toBe(false);
  });

  it('returns true for INPUT, TEXTAREA, and SELECT elements', () => {
    expect(isInputFocused({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isInputFocused({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isInputFocused({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
  });

  it('returns true for contenteditable elements', () => {
    expect(isInputFocused({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isInputFocused({ contentEditable: 'true' } as unknown as EventTarget)).toBe(true);
  });

  it('returns true for elements with textbox or combobox roles', () => {
    const mockElement = {
      getAttribute: (attr: string) => (attr === 'role' ? 'textbox' : null)
    };
    expect(isInputFocused(mockElement as unknown as EventTarget)).toBe(true);
  });

  it('returns true for children inside nodrag or interactive-input containers', () => {
    const mockChild = {
      closest: (selector: string) => selector.includes('.nodrag') ? {} : null
    };
    expect(isInputFocused(mockChild as unknown as EventTarget)).toBe(true);
  });

  it('returns false for standard canvas elements outside inputs', () => {
    const mockCanvas = {
      tagName: 'DIV',
      isContentEditable: false,
      getAttribute: () => null,
      closest: () => null
    };
    expect(isInputFocused(mockCanvas as unknown as EventTarget)).toBe(false);
  });
});
