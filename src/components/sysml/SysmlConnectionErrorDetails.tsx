import React from 'react';
import type { ConnectionEndpoint, ConnectionPolicyDiagnostic } from '../../engine/sysml/connectionPolicy';

export interface SysmlConnectionErrorDetailsProps {
  relationshipKind: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  diagnostic: ConnectionPolicyDiagnostic;
}

function endpointLabel(endpoint: ConnectionEndpoint): string {
  return `${endpoint.name || endpoint.id} (${endpoint.family})`;
}

/** Detailed, reusable policy-error content used by the application error modal. */
export function SysmlConnectionErrorDetails({
  relationshipKind,
  source,
  target,
  diagnostic,
}: SysmlConnectionErrorDetailsProps) {
  return (
    <div className="mt-3 space-y-2 text-sm" aria-label="Connection error details">
      <p className="text-red-200"><span className="font-semibold">Relationship:</span> {relationshipKind}</p>
      <p className="text-red-200"><span className="font-semibold">Source endpoint:</span> {endpointLabel(source)}</p>
      <p className="text-red-200"><span className="font-semibold">Target endpoint:</span> {endpointLabel(target)}</p>
      <p className="text-red-200"><span className="font-semibold">Reason:</span> {diagnostic.message}</p>
      <p className="text-amber-200"><span className="font-semibold">How to fix it:</span> {diagnostic.correctiveAction}</p>
    </div>
  );
}

/** Schedules focus restoration so a closing modal never steals the click event. */
export function restoreConnectionErrorFocus(
  trigger: Pick<HTMLElement, 'focus'> | null,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
): void {
  schedule(() => trigger?.focus());
}
