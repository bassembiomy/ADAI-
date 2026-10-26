import { useEffect, useRef, type RefObject } from 'react';
import {
  beginNavGesture, createFrameBatcher, createMiddleClickTracker, navigationModeForPress, stepNavGesture,
  switchNavGestureToZoom, wheelZoomFactor, zoomViewAt, type NavGesture, type NavView,
} from './canvasNavigation';

export interface CadNavigationOptions {
  /** Element that receives the mouse; canvas-local coordinates are measured from it. */
  targetRef: RefObject<HTMLElement | null>;
  getView: () => NavView;
  setView: (view: NavView) => void;
  minScale: number;
  maxScale: number;
  /** Double middle click. */
  onFit?: () => void;
  /** Handle wheel zoom here (off when the canvas library already zooms smoothly about the cursor). */
  wheel?: boolean;
  /** Space + left drag pans. */
  spacePan?: boolean;
  /** Called when a navigation drag starts / ends (e.g. to show a grabbing cursor). */
  onActiveChange?: (active: boolean) => void;
  enabled?: boolean;
}

/**
 * SolidWorks-style navigation for a 2-D canvas (see canvasNavigation.ts for the
 * mouse map). All listeners run in the capture phase, so middle-button
 * navigation works over symbols as well as over the background, and the
 * symbol's own handlers never see the press.
 */
export function useCadNavigation(options: CadNavigationOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { targetRef, enabled = true } = options;

  useEffect(() => {
    const element = targetRef.current;
    if (!element || !enabled) return undefined;
    const opts = () => optionsRef.current;
    let gesture: NavGesture | null = null;
    let suppressContextMenu = false;
    let spaceHeld = false;
    // The mousedown that follows a fit's pointerdown must not reach the canvas either.
    let swallowMouseDown = false;
    const middleClicks = createMiddleClickTracker();
    const batcher = createFrameBatcher<NavView>(() => opts().getView(), view => opts().setView(view));

    const local = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      // Canvas px per client px, in case an ancestor applies a CSS zoom or scale.
      const ratio = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
      return { x: (clientX - rect.left) / (ratio || 1), y: (clientY - rect.top) / (ratio || 1), ratio: ratio || 1 };
    };
    const end = () => {
      if (!gesture) return;
      gesture = null;
      batcher.flush();
      opts().onActiveChange?.(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || gesture) return;
      const mode = navigationModeForPress(event, !!opts().spacePan && spaceHeld);
      if (!mode) return;
      event.stopPropagation();
      if (event.button === 1 && middleClicks.press(event.clientX, event.clientY)) {
        batcher.cancel();
        swallowMouseDown = true;
        opts().onFit?.();
        return;
      }
      const p = local(event.clientX, event.clientY);
      batcher.flush();
      gesture = beginNavGesture(mode, event.button, event.clientX, event.clientY, p.x, p.y, opts().getView());
      opts().onActiveChange?.(true);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault(); // no browser auto-scroll
      if (swallowMouseDown) {
        swallowMouseDown = false;
        event.stopPropagation();
        return;
      }
      if (!gesture) return;
      // CATIA chord: with the middle button held, a left or right click turns the drag into a zoom.
      if (gesture.button === 1 && (event.button === 0 || event.button === 2)) {
        const p = local(event.clientX, event.clientY);
        batcher.flush();
        gesture = switchNavGestureToZoom(gesture, event.clientX, event.clientY, p.x, p.y, opts().getView());
        if (event.button === 2) suppressContextMenu = true;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!suppressContextMenu) return;
      suppressContextMenu = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const onMove = (event: PointerEvent | MouseEvent) => {
      if (!gesture) return;
      event.preventDefault();
      const { clientX, clientY } = event;
      middleClicks.move(clientX, clientY);
      const { ratio } = local(clientX, clientY);
      batcher.push(view => {
        if (!gesture) return view;
        const stepped = stepNavGesture(gesture, view, clientX, clientY, opts().minScale, opts().maxScale, ratio);
        gesture = stepped.gesture;
        return stepped.view;
      });
    };
    const onUp = (event: MouseEvent) => {
      if (gesture && event.button === gesture.button) end();
    };
    const onWheel = (event: WheelEvent) => {
      if (!opts().wheel) return;
      event.preventDefault();
      const p = local(event.clientX, event.clientY);
      const factor = wheelZoomFactor(event);
      batcher.push(view => zoomViewAt(view, p.x, p.y, factor, opts().minScale, opts().maxScale));
    };
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.code === 'Space' && !isTyping(event.target)) spaceHeld = true; };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld = false; };
    const onBlur = () => { spaceHeld = false; end(); };

    element.addEventListener('pointerdown', onPointerDown, true);
    element.addEventListener('mousedown', onMouseDown, true);
    element.addEventListener('contextmenu', onContextMenu, true);
    element.addEventListener('wheel', onWheel, { passive: false });
    // Capture phase: panels the pointer crosses must not be able to swallow the drag.
    window.addEventListener('pointermove', onMove, { passive: false, capture: true });
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      batcher.cancel();
      if (gesture) opts().onActiveChange?.(false);
      element.removeEventListener('pointerdown', onPointerDown, true);
      element.removeEventListener('mousedown', onMouseDown, true);
      element.removeEventListener('contextmenu', onContextMenu, true);
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [targetRef, enabled]);
}

interface FlowViewportApi {
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (viewport: { x: number; y: number; zoom: number }) => unknown;
  fitView: (options?: { padding?: number; duration?: number }) => unknown;
}

/**
 * The same navigation for a React Flow canvas. React Flow keeps its own wheel
 * zoom (already continuous and anchored at the cursor); every middle-button
 * gesture is taken over so it behaves exactly as on the other diagrams.
 */
export function useReactFlowCadNavigation(
  containerRef: RefObject<HTMLElement | null>,
  getFlow: () => FlowViewportApi | null | undefined,
  minZoom = 0.5,
  maxZoom = 2,
): void {
  useCadNavigation({
    targetRef: containerRef,
    getView: () => {
      const vp = getFlow()?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
      return { scale: vp.zoom, offsetX: vp.x, offsetY: vp.y };
    },
    setView: next => { getFlow()?.setViewport({ x: next.offsetX, y: next.offsetY, zoom: next.scale }); },
    minScale: minZoom,
    maxScale: maxZoom,
    onFit: () => { getFlow()?.fitView({ padding: 0.1, duration: 200 }); },
  });
}
