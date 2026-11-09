/**
 * Shared helpers for the docked panels of the application shell (Hierarchy, Variables, Properties, Scope).
 * The panels themselves are wrapped in ResizablePanel in App.tsx.
 */

let pendingFrame: number | null = null;

/**
 * After a docked panel was resized the canvas must re-measure. React Flow workspaces observe their container,
 * the shell canvas listens to window resize, so one throttled resize event covers both.
 */
export const notifyShellPanelResize = (): void => {
  if (typeof window === 'undefined' || pendingFrame !== null) return;
  pendingFrame = window.requestAnimationFrame(() => {
    pendingFrame = null;
    window.dispatchEvent(new Event('resize'));
  });
};

/** Hides the resize handle of a ResizablePanel (collapsed strip, mobile layout). */
export const HIDE_PANEL_HANDLE = '[&>[role=separator]]:hidden';
