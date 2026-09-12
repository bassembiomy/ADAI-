import React from 'react';
import type { ConnectorUsage, SysmlDefinition } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';

export interface IbdConnectorPortDetail {
  id: string;
  name: string;
  ownerName?: string;
  direction?: 'in' | 'out' | 'inout';
  isConjugated?: boolean;
  typeName?: string;
}

export interface IbdConnectorEditorProps {
  connector: ConnectorUsage;
  availablePorts: Array<{ id: string; name: string; ownerName?: string }>;
  definitions: Record<string, SysmlDefinition>;
  diagnostics?: SysmlDiagnostic[];
  /** Owning block context name shown so connectors stay visibly context-bound. */
  ownerName?: string;
  /** Effective endpoint direction/typing/conjugation details (optional). */
  portDetails?: IbdConnectorPortDetail[];
  onChange: (connector: ConnectorUsage) => void;
}

const CONNECTOR_KINDS: NonNullable<ConnectorUsage['kind']>[] = ['assembly', 'delegation', 'binding'];

/** IBD-only connector notation, disjoint from BDD relation notation. */
export function ibdConnectorNotationFor(kind: ConnectorUsage['kind']): string {
  if (kind === 'delegation') return 'delegation-solid';
  if (kind === 'binding') return 'binding-dashed';
  return 'assembly-solid';
}

export function IbdConnectorEditor({
  connector,
  availablePorts,
  definitions,
  diagnostics = [],
  ownerName,
  portDetails = [],
  onChange,
}: IbdConnectorEditorProps) {
  const update = (patch: Partial<ConnectorUsage>) => {
    onChange({ ...connector, ...patch });
  };

  const notation = ibdConnectorNotationFor(connector.kind);
  const detailById = new Map(portDetails.map(detail => [detail.id, detail]));
  const endpointLine = (portId: string): string | undefined => {
    const detail = detailById.get(portId);
    if (!detail) return undefined;
    const segments = [
      detail.ownerName ? `${detail.ownerName}.${detail.name}` : detail.name,
      detail.direction ? `direction: ${detail.direction}` : undefined,
      detail.isConjugated ? 'conjugated' : undefined,
      detail.typeName ? `type: ${detail.typeName}` : undefined,
    ].filter((segment): segment is string => Boolean(segment));
    return segments.join(' · ');
  };

  const connDiagnostics = diagnostics.filter(
    d => d.elementId === connector.id || d.propertyPath?.startsWith(`connectors.${connector.id}`)
  );

  const conveyedOptions = Object.values(definitions).filter(
    d => d.kind === 'valueType' || d.kind === 'interface'
  );

  return (
    <div className="sysml-editor space-y-4 text-xs" aria-label="IBD Connector Inspector">
      {/* Diagnostics */}
      {connDiagnostics.length > 0 && (
        <div role="alert" className="space-y-1 rounded border border-red-700 bg-red-950/40 p-2 text-red-300">
          {connDiagnostics.map((d, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="font-semibold text-red-400">[{d.code}]</span>
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kind */}
      <fieldset className="rounded border border-gray-700 p-2 space-y-2">
        <legend className="px-1 font-semibold text-gray-300">Connector Settings</legend>
        <div className="flex items-center gap-2 text-gray-400">
          <span aria-label="Connector notation" title="IBD connector notation (disjoint from BDD relation notation)">
            notation: {notation}
          </span>
          {(ownerName ?? connector.ownerId) && (
            <span aria-label="Owning context" title="Owning block context: connectors are bound to exactly one context">
              context: {ownerName ?? connector.ownerId}
            </span>
          )}
        </div>
        <label className="block">
          Connector kind
          <select
            aria-label="Connector kind"
            value={connector.kind}
            onChange={e => update({ kind: e.target.value as ConnectorUsage['kind'] })}
            className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1 mt-1"
          >
            {CONNECTOR_KINDS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>

        {/* Endpoints */}
        <div className="grid grid-cols-2 gap-2">
          <label>
            Source Port
            <select
              aria-label="Source port"
              value={connector.sourcePortId}
              onChange={e => update({ sourcePortId: e.target.value })}
              className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1 mt-1"
            >
              <option value="">Select source port</option>
              {availablePorts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.ownerName ? `${p.ownerName}.${p.name}` : p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target Port
            <select
              aria-label="Target port"
              value={connector.targetPortId}
              onChange={e => update({ targetPortId: e.target.value })}
              className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1 mt-1"
            >
              <option value="">Select target port</option>
              {availablePorts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.ownerName ? `${p.ownerName}.${p.name}` : p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(endpointLine(connector.sourcePortId) || endpointLine(connector.targetPortId)) && (
          <div aria-label="Endpoint details" className="space-y-1 text-gray-400">
            {endpointLine(connector.sourcePortId) && (
              <div>source: {endpointLine(connector.sourcePortId)}</div>
            )}
            {endpointLine(connector.targetPortId) && (
              <div>target: {endpointLine(connector.targetPortId)}</div>
            )}
          </div>
        )}

        {connector.kind === 'binding' && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700">
            <label>
              Source Parameter / Property ID
              <input
                aria-label="Source parameter ID"
                value={connector.sourceParameterId || ''}
                onChange={e => update({ sourceParameterId: e.target.value || undefined })}
                className="w-full rounded border border-gray-700 bg-transparent px-2 py-1 mt-1"
                placeholder="e.g. param1"
              />
            </label>
            <label>
              Target Parameter / Property ID
              <input
                aria-label="Target parameter ID"
                value={connector.targetParameterId || ''}
                onChange={e => update({ targetParameterId: e.target.value || undefined })}
                className="w-full rounded border border-gray-700 bg-transparent px-2 py-1 mt-1"
                placeholder="e.g. param2"
              />
            </label>
          </div>
        )}
      </fieldset>

      {/* Item Flow */}
      <fieldset className="rounded border border-gray-700 p-2 space-y-2">
        <legend className="px-1 font-semibold text-gray-300">Item Flow Specification</legend>
        <label className="block">
          Conveyed Classifier
          <select
            aria-label="Conveyed classifier"
            value={connector.itemFlowId || ''}
            onChange={e => update({ itemFlowId: e.target.value || undefined })}
            className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1 mt-1"
          >
            <option value="">None (no item flow)</option>
            {conveyedOptions.map(def => (
              <option key={def.id} value={def.id}>
                {def.name} «{def.kind}»
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label>
            Item Property Name
            <input
              aria-label="Item property name"
              value={connector.itemProperty || ''}
              onChange={e => update({ itemProperty: e.target.value || undefined })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1 mt-1"
              placeholder="e.g. signalFlow"
            />
          </label>
          <label>
            Unit
            <input
              aria-label="Item unit"
              value={connector.itemUnit || ''}
              onChange={e => update({ itemUnit: e.target.value || undefined })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1 mt-1"
              placeholder="e.g. kg/s or V"
            />
          </label>
        </div>
      </fieldset>
    </div>
  );
}
