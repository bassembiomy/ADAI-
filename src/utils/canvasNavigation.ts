/**
 * Diagram navigation shared by every 2-D canvas in ADIA, modelled on the
 * SolidWorks mouse scheme (with the CATIA chord kept for users who have it in
 * their fingers):
 *
 *   wheel                      zoom about the cursor (the point under it stays put)
 *   middle drag                pan, 1:1 with the pointer
 *   Ctrl + middle drag         pan (SolidWorks 3-D habit)
 *   Shift + middle drag        zoom about the press point, drag up = zoom in
 *   middle held + left/right   switch the drag to zoom (CATIA chord)
 *   double middle click        zoom to fit
 *   Space + left drag          pan
 *
 * Views use screen = world * scale + offset.
 */

export interface NavView { scale: number; offsetX: number; offsetY: number }

export type NavGestureMode = 'pan' | 'zoom';

export interface NavGesture {
  mode: NavGestureMode;
  button: number;
  /** Last pointer position (client px), used for incremental pan. */
  lastX: number;
  lastY: number;
  /** Zoom anchor in canvas-local px and the view when the zoom drag began. */
  anchorX: number;
  anchorY: number;
  startY: number;
  startView: NavView;
}

export const PAN_BUTTON = 1;
/** Pixels of vertical drag that double / halve the scale in a zoom drag. */
const DRAG_PX_PER_DOUBLING = 220;
/** Normalised wheel pixels that double / halve the scale. One mouse notch ≈ 100 px ≈ 13 %. */
const WHEEL_PX_PER_DOUBLING = 520;
/** Trackpad pinch arrives as ctrl+wheel with small deltas; it gets a steeper curve. */
const PINCH_PX_PER_DOUBLING = 120;
const MAX_WHEEL_STEP_PX = 240;
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_SLOP_PX = 6;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Wheel delta in pixels regardless of the device's deltaMode (0 px, 1 line, 2 page). */
export function normalizedWheelDelta(event: { deltaY: number; deltaMode?: number }): number {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  return clamp(event.deltaY * unit, -MAX_WHEEL_STEP_PX, MAX_WHEEL_STEP_PX);
}

/**
 * Continuous zoom factor for one wheel event: exponential in the delta, so a
 * fine trackpad stream and a coarse mouse notch give the same total zoom for
 * the same travel, and zooming in then out by the same travel is exact.
 */
export function wheelZoomFactor(event: { deltaY: number; deltaMode?: number; ctrlKey?: boolean }): number {
  const delta = normalizedWheelDelta(event);
  return Math.pow(2, -delta / (event.ctrlKey ? PINCH_PX_PER_DOUBLING : WHEEL_PX_PER_DOUBLING));
}

/** Zoom factor for a zoom drag: drag up zooms in, drag down zooms out. */
export function dragZoomFactor(dyFromStart: number): number {
  return Math.pow(2, -dyFromStart / DRAG_PX_PER_DOUBLING);
}

/** Scale the view about a canvas-local point so the world point under it does not move. */
export function zoomViewAt(view: NavView, px: number, py: number, factor: number, minScale: number, maxScale: number): NavView {
  const scale = clamp(view.scale * factor, minScale, maxScale);
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return { scale, offsetX: px - (px - view.offsetX) * ratio, offsetY: py - (py - view.offsetY) * ratio };
}

export function panView(view: NavView, dx: number, dy: number): NavView {
  if (dx === 0 && dy === 0) return view;
  return { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}

/** Which navigation gesture a mouse press starts, if any. */
export function navigationModeForPress(
  event: { button: number; shiftKey?: boolean },
  spaceHeld = false,
): NavGestureMode | null {
  if (event.button === PAN_BUTTON) return event.shiftKey ? 'zoom' : 'pan';
  if (event.button === 0 && spaceHeld) return 'pan';
  return null;
}

export function beginNavGesture(
  mode: NavGestureMode, button: number, clientX: number, clientY: number, anchorX: number, anchorY: number, view: NavView,
): NavGesture {
  return { mode, button, lastX: clientX, lastY: clientY, anchorX, anchorY, startY: clientY, startView: view };
}

/** Restart a running gesture as a zoom drag from the current pointer (CATIA chord). */
export function switchNavGestureToZoom(gesture: NavGesture, clientX: number, clientY: number, anchorX: number, anchorY: number, view: NavView): NavGesture {
  return { ...gesture, mode: 'zoom', lastX: clientX, lastY: clientY, anchorX, anchorY, startY: clientY, startView: view };
}

/**
 * Advance a gesture to a new pointer position. `pixelRatio` converts client
 * px into the canvas' own px (the app-wide UI zoom), so panning stays exactly
 * under the pointer at any UI zoom.
 */
export function stepNavGesture(
  gesture: NavGesture, view: NavView, clientX: number, clientY: number, minScale: number, maxScale: number, pixelRatio = 1,
): { gesture: NavGesture; view: NavView } {
  if (gesture.mode === 'pan') {
    const next = panView(view, (clientX - gesture.lastX) / pixelRatio, (clientY - gesture.lastY) / pixelRatio);
    return { gesture: { ...gesture, lastX: clientX, lastY: clientY }, view: next };
  }
  const factor = dragZoomFactor((clientY - gesture.startY) / pixelRatio);
  const next = zoomViewAt(gesture.startView, gesture.anchorX, gesture.anchorY, factor, minScale, maxScale);
  return { gesture: { ...gesture, lastX: clientX, lastY: clientY }, view: next };
}

/** View that fits `bounds` (world units) into a viewport of `width`×`height` px. */
export function fitViewToBounds(
  bounds: { x: number; y: number; width: number; height: number } | null,
  width: number, height: number, minScale: number, maxScale: number, padding = 40,
): NavView {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = clamp(Math.min((width - 2 * padding) / bounds.width, (height - 2 * padding) / bounds.height), minScale, Math.min(maxScale, 1.5));
  return {
    scale,
    offsetX: (width - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

/**
 * Detects a double middle click (SolidWorks: zoom to fit). `press` reports
 * whether this press completes a double click; `move` must be fed pointer
 * positions while the button is held, so a press that became a drag never
 * counts as the first click.
 */
export function createMiddleClickTracker(now: () => number = () => Date.now()) {
  let last: { t: number; x: number; y: number } | null = null;
  return {
    press(clientX: number, clientY: number): boolean {
      const t = now();
      const isDouble = !!last && t - last.t <= DOUBLE_CLICK_MS
        && Math.hypot(clientX - last.x, clientY - last.y) <= DOUBLE_CLICK_SLOP_PX;
      last = isDouble ? null : { t, x: clientX, y: clientY };
      return isDouble;
    },
    move(clientX: number, clientY: number): void {
      if (last && Math.hypot(clientX - last.x, clientY - last.y) > DOUBLE_CLICK_SLOP_PX) last = null;
    },
  };
}

/**
 * Coalesces view updates to one per animation frame. `push` takes an updater
 * applied to the latest pending view, so no pointer motion is lost between frames.
 */
export function createFrameBatcher<V>(read: () => V, commit: (view: V) => void) {
  let pending: V | null = null;
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    if (pending !== null) { const v = pending; pending = null; commit(v); }
  };
  return {
    push(update: (view: V) => V) {
      pending = update(pending ?? read());
      if (frame === null) frame = requestAnimationFrame(flush);
    },
    /** Apply anything pending right now (e.g. on mouse up). */
    flush() {
      if (frame !== null) { cancelAnimationFrame(frame); }
      flush();
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; pending = null;
    },
  };
}
