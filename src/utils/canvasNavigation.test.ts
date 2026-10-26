import { describe, expect, it } from 'vitest';
import {
  beginNavGesture, createMiddleClickTracker, dragZoomFactor, fitViewToBounds, navigationModeForPress,
  normalizedWheelDelta, stepNavGesture, switchNavGestureToZoom, wheelZoomFactor, zoomViewAt, type NavView,
} from './canvasNavigation';

const toWorld = (v: NavView, px: number, py: number) => ({ x: (px - v.offsetX) / v.scale, y: (py - v.offsetY) / v.scale });

describe('canvas navigation (SolidWorks mouse scheme)', () => {
  it('maps presses to gestures: middle pans, Shift+middle zooms, Space+left pans, plain left does nothing', () => {
    expect(navigationModeForPress({ button: 1 })).toBe('pan');
    expect(navigationModeForPress({ button: 1, shiftKey: true })).toBe('zoom');
    expect(navigationModeForPress({ button: 0 }, true)).toBe('pan');
    expect(navigationModeForPress({ button: 0 })).toBeNull();
    expect(navigationModeForPress({ button: 2 })).toBeNull();
  });

  it('wheel zoom keeps the world point under the cursor exactly fixed', () => {
    let view: NavView = { scale: 1.3, offsetX: 57, offsetY: -12 };
    const before = toWorld(view, 412, 233);
    for (const deltaY of [-100, -100, 53, -3, 240, -17]) {
      view = zoomViewAt(view, 412, 233, wheelZoomFactor({ deltaY }), 0.1, 5);
      const after = toWorld(view, 412, 233);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('wheel zoom is continuous: the same travel gives the same zoom however it is split, and in/out cancels', () => {
    const oneNotch = wheelZoomFactor({ deltaY: -100 });
    const tenSmall = Math.pow(wheelZoomFactor({ deltaY: -10 }), 10);
    expect(tenSmall).toBeCloseTo(oneNotch, 12);
    expect(wheelZoomFactor({ deltaY: 100 }) * oneNotch).toBeCloseTo(1, 12);
    expect(oneNotch).toBeGreaterThan(1.1);
    expect(oneNotch).toBeLessThan(1.2);
  });

  it('normalises line and page wheel deltas and caps runaway steps', () => {
    expect(normalizedWheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(normalizedWheelDelta({ deltaY: 1, deltaMode: 2 })).toBe(240);
    expect(normalizedWheelDelta({ deltaY: -5000 })).toBe(-240);
  });

  it('clamps zoom to the limits without moving the view', () => {
    const view = { scale: 5, offsetX: 10, offsetY: 20 };
    expect(zoomViewAt(view, 100, 100, 2, 0.1, 5)).toBe(view);
  });

  it('pans 1:1 with the pointer, corrected for the UI zoom', () => {
    const start = { scale: 2, offsetX: 0, offsetY: 0 };
    let gesture = beginNavGesture('pan', 1, 100, 100, 100, 100, start);
    let view: NavView = start;
    for (const [x, y] of [[110, 95], [150, 140], [131, 177]]) {
      ({ gesture, view } = stepNavGesture(gesture, view, x, y, 0.1, 5, 1.25));
    }
    expect(view.offsetX).toBeCloseTo(31 / 1.25, 9);
    expect(view.offsetY).toBeCloseTo(77 / 1.25, 9);
    expect(view.scale).toBe(2);
  });

  it('zoom drag: up zooms in about the press point, and returning to the start restores the view', () => {
    const start = { scale: 1, offsetX: 40, offsetY: 30 };
    const gesture = beginNavGesture('zoom', 1, 300, 200, 300, 200, start);
    const up = stepNavGesture(gesture, start, 300, 100, 0.1, 5).view;
    expect(up.scale).toBeGreaterThan(1);
    expect(toWorld(up, 300, 200).x).toBeCloseTo(toWorld(start, 300, 200).x, 9);
    expect(stepNavGesture(gesture, up, 300, 200, 0.1, 5).view).toEqual(start);
    expect(dragZoomFactor(220)).toBeCloseTo(0.5, 12);
  });

  it('CATIA chord switches a pan into a zoom anchored where the chord was made', () => {
    const start = { scale: 1, offsetX: 0, offsetY: 0 };
    const pan = beginNavGesture('pan', 1, 0, 0, 0, 0, start);
    const zoom = switchNavGestureToZoom(pan, 50, 60, 50, 60, start);
    expect(zoom.mode).toBe('zoom');
    expect(zoom.button).toBe(1);
    const next = stepNavGesture(zoom, start, 50, 0, 0.1, 5).view;
    expect(toWorld(next, 50, 60).x).toBeCloseTo(50, 9);
  });

  it('fits bounds centred in the viewport', () => {
    const view = fitViewToBounds({ x: 100, y: 50, width: 400, height: 200 }, 840, 480, 0.1, 5, 20);
    expect(view.scale).toBeCloseTo(1.5, 9); // capped so a small diagram is not blown up
    const centre = toWorld(view, 420, 240);
    expect(centre.x).toBeCloseTo(300, 9);
    expect(centre.y).toBeCloseTo(150, 9);
  });

  it('detects a double middle click only when quick and in place', () => {
    let t = 0;
    const clicks = createMiddleClickTracker(() => t);
    expect(clicks.press(10, 10)).toBe(false);
    t = 200;
    expect(clicks.press(12, 11)).toBe(true);
    t = 300;
    expect(clicks.press(12, 11)).toBe(false);
    t = 1000;
    expect(clicks.press(40, 40)).toBe(false);
  });

  it('a quick pan followed by a press at the same spot is not a double click', () => {
    let t = 0;
    const clicks = createMiddleClickTracker(() => t);
    clicks.press(100, 100);
    clicks.move(160, 130);
    clicks.move(100, 100);
    t = 150;
    expect(clicks.press(100, 100)).toBe(false);
  });
});
