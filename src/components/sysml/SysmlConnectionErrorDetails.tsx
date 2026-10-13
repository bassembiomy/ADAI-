import React from 'react';
import { sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';
import type { ConnectionEndpoint, ConnectionPolicyDiagnostic } from '../../engine/sysml/connectionPolicy';
// Task 6 review fix: error/warning text resolves from the centralized
// semantic palette via CSS vars. The text labels ("Relationship:", "Rule
// code:", "Reason:", "How to fix it:") stay paired with the color so status
// is never conveyed by color alone.
import { getSemanticPresentationStatusMeta } from '../../engine/sysml/semanticPresentationStyles';

export interface SysmlConnectionErrorDetailsProps {
  relationshipKind: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  diagnostic: ConnectionPolicyDiagnostic;
}

function endpointLabel(endpoint: ConnectionEndpoint): string {
  return `${sysmlObjectLabel(endpoint, endpoint.family)} (${endpoint.family})`;
}

/** Detailed, reusable policy-error content used by the application error modal. */
export function SysmlConnectionErrorDetails({
  relationshipKind,
  source,
  target,
  diagnostic,
}: SysmlConnectionErrorDetailsProps) {
  const errorMeta = getSemanticPresentationStatusMeta('error');
  const warningMeta = getSemanticPresentationStatusMeta('warning');
  return (
    <div className="mt-3 space-y-2 text-sm" aria-label="Connection error details">
      <p style={{ color: errorMeta?.token }}><span className="font-semibold">Relationship:</span> {relationshipKind}</p>
      <p style={{ color: errorMeta?.token }}><span className="font-semibold">Source endpoint:</span> {endpointLabel(source)}</p>
      <p style={{ color: errorMeta?.token }}><span className="font-semibold">Target endpoint:</span> {endpointLabel(target)}</p>
      {diagnostic.code && (
        <p style={{ color: errorMeta?.token }}><span className="font-semibold">Rule code:</span> <span data-testid="connection-error-code">{diagnostic.code}</span></p>
      )}
      <p style={{ color: errorMeta?.token }}><span className="font-semibold">Reason:</span> {diagnostic.message}</p>
      <p style={{ color: warningMeta?.token }}><span className="font-semibold">How to fix it:</span> {diagnostic.correctiveAction}</p>
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
