import type React from 'react';

/**
 * Maps vertical mouse wheel delta (`deltaY`) to horizontal scrolling
 * on the target toolbar element when its contents overflow horizontally.
 */
export function handleHorizontalToolbarWheel(event: React.WheelEvent<HTMLElement>): void {
  const container = event.currentTarget;
  if (!container) return;

  const canScrollHorizontally = container.scrollWidth > container.clientWidth;
  if (!canScrollHorizontally) return;

  if (event.deltaY !== 0) {
    event.preventDefault();
    container.scrollLeft += event.deltaY;
  }
}
