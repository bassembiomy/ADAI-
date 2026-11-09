import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stable id; the size is remembered under `adia.panel.${id}`. */
  id: string;
  /** Used for the handle's accessible name: "Resize {label}". */
  label: string;
  /** The panel edge the resize handle sits on. */
  edge: 'left' | 'right' | 'top' | 'bottom';
  defaultSize: number;
  minSize: number;
  maxSize: number;
  onSizeChange?: (size: number) => void;
  children?: React.ReactNode;
}

const STORAGE_PREFIX = 'adia.panel.';
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readStoredSize = (key: string, min: number, max: number, fallback: number): number => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  } catch {
    return fallback;
  }
};

const writeStoredSize = (key: string, size: number) => {
  try {
    window.localStorage.setItem(key, String(size));
  } catch {
    /* storage unavailable: the size still applies for this session */
  }
};

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  id,
  label,
  edge,
  defaultSize,
  minSize,
  maxSize,
  onSizeChange,
  children,
  className,
  style,
  ...rest
}) => {
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [size, setSize] = useState<number>(() =>
    readStoredSize(storageKey, minSize, maxSize, clamp(defaultSize, minSize, maxSize)),
  );
  const [dragging, setDragging] = useState(false);

  // Latest props for handlers attached to window listeners.
  const latest = useRef({ edge, defaultSize, minSize, maxSize, onSizeChange, storageKey });
  latest.current = { edge, defaultSize, minSize, maxSize, onSizeChange, storageKey };

  const sizeRef = useRef(size);
  const dragEndRef = useRef<(() => void) | null>(null);

  const commit = useCallback((next: number) => {
    const { minSize: min, maxSize: max, storageKey: key, onSizeChange: notify } = latest.current;
    const value = clamp(Math.round(next), min, max);
    if (value === sizeRef.current) return;
    sizeRef.current = value;
    setSize(value);
    writeStoredSize(key, value);
    notify?.(value);
  }, []);

  // Stop an active drag when the panel unmounts.
  useEffect(() => () => dragEndRef.current?.(), []);

  const vertical = edge === 'left' || edge === 'right';
  const cursor = vertical ? 'col-resize' : 'row-resize';

  const onHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragEndRef.current?.();

    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = sizeRef.current;
    // Dragging towards the panel's interior grows it: right/bottom edges grow with +delta, left/top with -delta.
    const sign = edge === 'right' || edge === 'bottom' ? 1 : -1;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = vertical ? ev.clientX - startX : ev.clientY - startY;
      commit(startSize + sign * delta);
    };
    const end = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', end);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      dragEndRef.current = null;
      setDragging(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', end);
    dragEndRef.current = end;
    setDragging(true);
  };

  const onHandleDoubleClick = () => {
    const { defaultSize: def, minSize: min, maxSize: max } = latest.current;
    commit(clamp(def, min, max));
  };

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const growKey = { left: 'ArrowLeft', right: 'ArrowRight', top: 'ArrowUp', bottom: 'ArrowDown' }[edge];
    const shrinkKey = { left: 'ArrowRight', right: 'ArrowLeft', top: 'ArrowDown', bottom: 'ArrowUp' }[edge];
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    if (e.key === growKey) {
      e.preventDefault();
      commit(sizeRef.current + step);
    } else if (e.key === shrinkKey) {
      e.preventDefault();
      commit(sizeRef.current - step);
    }
  };

  const sizeStyle: React.CSSProperties = vertical
    ? { width: `${size}px` }
    : { height: `${size}px` };

  const handlePosition: React.CSSProperties = vertical
    ? { top: 0, bottom: 0, width: 6, ...(edge === 'left' ? { left: 0 } : { right: 0 }) }
    : { left: 0, right: 0, height: 6, ...(edge === 'top' ? { top: 0 } : { bottom: 0 }) };

  const highlightClass = vertical
    ? 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2'
    : 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2';

  return (
    <div
      {...rest}
      className={className}
      style={{ ...style, ...sizeStyle, position: 'relative', flexShrink: 0 }}
    >
      {children}
      <div data-help-feature="live:components/common/ResizablePanel:82b534eeb763"
        role="separator"
        aria-label={`Resize ${label}`}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(size)}
        aria-valuemin={Math.round(minSize)}
        aria-valuemax={Math.round(maxSize)}
        tabIndex={0}
        onMouseDown={onHandleMouseDown}
        onDoubleClick={onHandleDoubleClick}
        onKeyDown={onHandleKeyDown}
        className="group absolute focus:outline-none"
        style={{ ...handlePosition, cursor, zIndex: 70 }}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute ${highlightClass} transition-colors ${
            dragging
              ? 'bg-[#c9a86c]'
              : 'bg-transparent group-hover:bg-[#c9a86c]/60 group-focus-visible:bg-[#c9a86c]'
          }`}
        />
      </div>
    </div>
  );
};

export default ResizablePanel;
