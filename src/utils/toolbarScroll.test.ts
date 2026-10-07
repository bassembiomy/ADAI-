import { describe, it, expect, vi } from 'vitest';
import { handleHorizontalToolbarWheel } from './toolbarScroll';

describe('handleHorizontalToolbarWheel', () => {
  it('translates vertical deltaY into horizontal scrollLeft when content overflows', () => {
    const element = {
      scrollWidth: 1000,
      clientWidth: 500,
      scrollLeft: 50,
    } as unknown as HTMLElement;

    const preventDefault = vi.fn();
    const event = {
      currentTarget: element,
      deltaY: 100,
      preventDefault,
    } as unknown as React.WheelEvent<HTMLElement>;

    handleHorizontalToolbarWheel(event);

    expect(element.scrollLeft).toBe(150);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('does nothing and does not prevent default when content does not overflow', () => {
    const element = {
      scrollWidth: 400,
      clientWidth: 500,
      scrollLeft: 0,
    } as unknown as HTMLElement;

    const preventDefault = vi.fn();
    const event = {
      currentTarget: element,
      deltaY: 100,
      preventDefault,
    } as unknown as React.WheelEvent<HTMLElement>;

    handleHorizontalToolbarWheel(event);

    expect(element.scrollLeft).toBe(0);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
