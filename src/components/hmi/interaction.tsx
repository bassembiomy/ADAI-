import React, { useEffect, useRef } from 'react';

export type { HmiInputCommand as HmiInput, HmiInputResult } from '../../features/hmi/hmiModel';
import type { HmiInputResult } from '../../features/hmi/hmiModel';

/** Pointer and keyboard share one held state: cancellation can never duplicate a press. */
export function MomentaryButton({ disabled, resetVersion, send, children, label }: {
  disabled: boolean; resetVersion: number; send: (mode: 'press' | 'release') => HmiInputResult;
  children: React.ReactNode; label: string;
}) {
  const held = useRef(false);
  const heldRelease = useRef<(() => void) | undefined>();
  const sendRef = useRef(send); sendRef.current = send;
  const release = () => { if (held.current) { held.current = false; const originalRelease = heldRelease.current; heldRelease.current = undefined; originalRelease?.(); } };
  const press = () => { if (!disabled && !held.current) { const originalSend = sendRef.current; if (originalSend('press').accepted) { held.current = true; heldRelease.current = () => originalSend('release'); } } };
  useEffect(() => { const blur = () => release(); window.addEventListener('blur', blur); return () => { window.removeEventListener('blur', blur); release(); }; }, []);
  useEffect(() => { held.current = false; heldRelease.current = undefined; }, [resetVersion]);
  useEffect(() => { if (disabled) release(); }, [disabled]);
  return <button data-help-topic="hmi_dashboard" aria-label={label} disabled={disabled}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); press(); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) press(); } }}
    onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }}>{children}</button>;
}
