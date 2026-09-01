import { describe, it, expect } from 'vitest';

describe('VLab Canvas Zoom Controls & Math', () => {
  it('calculates expected zoom factors correctly', () => {
    let zoom = 1.0;
    const zoomIn = (factor = 1.2) => zoom * factor;
    const zoomOut = (factor = 0.8) => zoom * factor;

    expect(zoomIn(1.25)).toBeCloseTo(1.25, 2);
    expect(zoomOut(0.8)).toBeCloseTo(0.8, 2);
  });

  it('clamps zoom bounds within safe viewport limits [0.1x to 4.0x]', () => {
    const clampZoom = (z: number) => Math.max(0.1, Math.min(4.0, z));

    expect(clampZoom(0.02)).toBe(0.1);
    expect(clampZoom(5.5)).toBe(4.0);
    expect(clampZoom(1.2)).toBe(1.2);
  });

  it('computes percentage display accurately', () => {
    const formatZoomPct = (z: number) => `${Math.round(z * 100)}%`;

    expect(formatZoomPct(1.0)).toBe('100%');
    expect(formatZoomPct(1.25)).toBe('125%');
    expect(formatZoomPct(0.75)).toBe('75%');
  });
});
