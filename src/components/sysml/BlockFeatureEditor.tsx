import React, { useState } from 'react';
import type { BlockDefinition, PropertyDefinition, PortDefinition, SysmlDefinition, SysmlRepository } from '../../engine/sysml/model';
import { createEmptyRepository } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';
import { TypeSelectionPrompt } from './TypeSelectionPrompt';
import type { CreateNewTypeAction, TypeCandidate } from './typeSelectionTypes';
import {
  PORT_KIND_MAP,
  planOwnedPortCreation,
  planOwnedPropertyCreation,
  suggestedMetaclassForPortKind,
  suggestedMetaclassForPropertyKind,
  type CanonicalPortKind,
  type CreateOwnedFeatureCommand,
  type CreateOwnedPropertyIntent,
} from '../../services/sysmlOwnedFeatureCommands';
import type { SysmlEditorCommand } from '../../services/sysmlCommandGateway';

export interface BlockFeatureEditorProps {
  block: BlockDefinition;
  definitions: Record<string, SysmlDefinition>;
  repo?: SysmlRepository;
  inheritedFeatures?: {
    properties: PropertyDefinition[];
    ports: PortDefinition[];
    operations: string[];
    constraints: string[];
    annotatedProperties?: Array<PropertyDefinition & { originId: string; originName: string; isInherited: boolean }>;
    annotatedPorts?: Array<PortDefinition & { originId: string; originName: string; isInherited: boolean }>;
    annotatedOperations?: Array<{ name: string; originId: string; originName: string; isInherited: boolean }>;
    annotatedConstraints?: Array<{ expression: string; originId: string; originName: string; isInherited: boolean }>;
  };
  parentChain?: Array<{ id: string; name: string }>;
  diagnostics?: SysmlDiagnostic[];
  maxVisibleInherited?: number;
  onChange: (block: BlockDefinition) => void;
  onDispatchCommand?: (command: SysmlEditorCommand) => void;
  onCreateNewType?: (action: CreateNewTypeAction) => void;
  onRedefine?: (property: PropertyDefinition) => void;
  onSubset?: (property: PropertyDefinition) => void;
}

// Canonical inheritance/governance codes surfaced in the inheritance panel
// (OMG SysML 1.6 ADIA profile; mirrors policy.ts + bdd.ts resolveInheritedFeatures).
const INHERITANCE_PANEL_CODES = new Set([
  'INHERITANCE_CYCLE',
  'LEAF_SPECIALIZATION',
  'ABSTRACT_INSTANTIATION',
  'MISSING_SUPERTYPE',
]);

// Deterministic capped render for large inherited-feature lists.
const DEFAULT_MAX_VISIBLE_INHERITED = 50;

const PROPERTY_KINDS: NonNullable<PropertyDefinition['kind']>[] = ['value', 'part', 'reference', 'flow'];
const PORT_KINDS: NonNullable<PortDefinition['kind']>[] = ['standard', 'proxy', 'full', 'flow'];
const PORT_DIRECTIONS: NonNullable<PortDefinition['direction']>[] = ['in', 'out', 'inout'];

// Inspector creation kinds (spec 3.2, 4.1, 4.2). The inspector plans through
// the same surface-agnostic planners as tree and canvas
// (planOwnedPropertyCreation / planOwnedPortCreation) and renders the shared
// TypeSelectionPrompt, so no production path silently selects the first
// candidate or creates a type automatically.
type InspectorPropertyKind = CreateOwnedPropertyIntent['propertyKind'];
const INSPECTOR_PROPERTY_KINDS: InspectorPropertyKind[] = ['part', 'reference', 'value', 'flow'];
const INSPECTOR_PROPERTY_KIND_LABELS: Record<InspectorPropertyKind, string> = {
  part: 'Part Property',
  reference: 'Reference Property',
  value: 'Value Property',
  flow: 'Flow Property',
};
const INSPECTOR_PORT_KINDS: Array<{ kind: CanonicalPortKind; label: string; description: string }> = [
  { kind: 'umlPort', label: 'Standard UML Port', description: 'Generic UML Port; explicitly untyped' },
  { kind: 'proxyPort', label: 'ProxyPort', description: 'Requires an explicitly selected InterfaceBlock' },
  { kind: 'fullPort', label: 'FullPort', description: 'Requires an explicitly selected Block or ValueType' },
  { kind: 'flowPort', label: 'Legacy FlowPort', description: 'Requires an explicitly selected compatible type' },
];
const INSPECTOR_PORT_TYPE_LABELS: Record<CanonicalPortKind, string> = {
  umlPort: 'Standard Port',
  proxyPort: 'ProxyPort',
  fullPort: 'FullPort',
  flowPort: 'Legacy FlowPort',
};

interface PendingPropertySelection {
  propertyKind: InspectorPropertyKind;
  candidates: TypeCandidate[];
  action: CreateNewTypeAction;
  error?: string;
}

interface PendingPortSelection {
  portKind: CanonicalPortKind;
  candidates: TypeCandidate[];
  action: CreateNewTypeAction;
  error?: string;
}

export function BlockFeatureEditor({
  block,
  definitions,
  inheritedFeatures,
  parentChain,
  diagnostics = [],
  maxVisibleInherited = DEFAULT_MAX_VISIBLE_INHERITED,
  onChange,
  onDispatchCommand,
  onCreateNewType,
  onRedefine,
  onSubset,
}: BlockFeatureEditorProps) {
  const update = (patch: Partial<BlockDefinition>) => {
    onChange({ ...block, ...patch });
  };

  const [propertyPrompt, setPropertyPrompt] = useState<PendingPropertySelection | null>(null);
  const [portKindOpen, setPortKindOpen] = useState(false);
  const [portPrompt, setPortPrompt] = useState<PendingPortSelection | null>(null);

  const repositoryForPlanning = (): SysmlRepository => (block as any)._repo ?? {
    ...createEmptyRepository(),
    definitions: { ...definitions, [block.id]: block },
  };

  const updateProperty = (index: number, patch: Partial<PropertyDefinition>) => {
    const properties = block.properties.map((p, i) => (i === index ? { ...p, ...patch } : p));
    update({ properties });
  };

  const removeProperty = (index: number) => {
    update({ properties: block.properties.filter((_, i) => i !== index) });
  };

  // Inspector property creation (spec 3.2, 4.1): clicking Add Property only
  // opens the shared type-selection workflow. Nothing is dispatched or
  // applied until the user explicitly confirms an explicitly selected
  // compatible type; cancel performs no mutation. The property-kind dropdown
  // is a visible chooser default, not a silent semantic selection — the
  // command is built only after explicit Confirm with an explicit typeId.
  const openPropertyPromptForKind = (propertyKind: InspectorPropertyKind) => {
    const plan = planOwnedPropertyCreation(repositoryForPlanning(), {
      ownerBlockId: block.id,
      propertyKind,
    });
    if (plan.outcome === 'typeSelection') {
      setPropertyPrompt({
        propertyKind,
        candidates: plan.request.candidates,
        action: plan.request.action,
        error: plan.request.candidates.length === 0
          ? 'TYPE_NOT_FOUND: No compatible existing type.'
          : undefined,
      });
      return;
    }
    if (plan.outcome === 'error') {
      setPropertyPrompt({
        propertyKind,
        candidates: plan.candidates ?? [],
        action: plan.action ?? {
          kind: 'CreateNewType',
          payload: { suggestedMetaclass: suggestedMetaclassForPropertyKind(propertyKind) },
        },
        error: plan.diagnostics[0]?.message ?? 'TYPE_NOT_FOUND: No compatible existing type.',
      });
    }
  };

  const openPropertyPrompt = () => {
    openPropertyPromptForKind('part');
  };

  const dispatchOrApplyProperty = (command: CreateOwnedFeatureCommand, propertyKind: InspectorPropertyKind, typeId: string) => {
    if (onDispatchCommand) {
      onDispatchCommand(command as SysmlEditorCommand);
      return;
    }
    // No command bus: apply the explicitly confirmed kind and type locally.
    // The type was explicitly chosen in the dialog, so this is not silent.
    const newProp: PropertyDefinition = {
      id: crypto.randomUUID(),
      name: `prop${block.properties.length + 1}`,
      kind: propertyKind,
      typeId,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    update({ properties: [...block.properties, newProp] });
  };

  const confirmPropertyType = (typeId: string) => {
    if (!propertyPrompt) return;
    const plan = planOwnedPropertyCreation(repositoryForPlanning(), {
      ownerBlockId: block.id,
      propertyKind: propertyPrompt.propertyKind,
      typeId,
    });
    if (plan.outcome === 'command') {
      const confirmed = propertyPrompt;
      setPropertyPrompt(null);
      dispatchOrApplyProperty(plan.command, confirmed.propertyKind, typeId);
      return;
    }
    if (plan.outcome === 'typeSelection') {
      // Stale prompt (repository changed while the chooser was open):
      // refresh candidates rather than committing a typed feature.
      setPropertyPrompt(prev => prev ? {
        ...prev,
        candidates: plan.request.candidates,
        action: plan.request.action,
        error: undefined,
      } : prev);
      return;
    }
    // Structured error (unresolvable or incompatible type): surface the
    // message and leave repository, history, and presentations unchanged.
    setPropertyPrompt(prev => prev ? { ...prev, error: plan.diagnostics[0]?.message } : prev);
  };

  const createNewPropertyType = () => {
    if (!propertyPrompt || !onCreateNewType) return;
    onCreateNewType(propertyPrompt.action);
  };

  const updatePort = (index: number, patch: Partial<PortDefinition>) => {
    const ports = block.ports.map((p, i) => (i === index ? { ...p, ...patch } : p));
    update({ ports });
  };

  const removePort = (index: number) => {
    update({ ports: block.ports.filter((_, i) => i !== index) });
  };

  // Inspector port creation (spec 3.2, 4.1, 4.2): the user explicitly
  // chooses Standard Port, ProxyPort, FullPort, or legacy FlowPort before
  // choosing a compatible type where required. Standard UML Port is the
  // explicit untyped exception and is never converted into a SysML
  // stereotype; every other kind opens the shared type-selection workflow.
  // Cancel performs no mutation; errors never mutate.
  const dispatchOrApplyPort = (command: CreateOwnedFeatureCommand, portKind: CanonicalPortKind, typeId: string | undefined) => {
    if (onDispatchCommand) {
      onDispatchCommand(command as SysmlEditorCommand);
      return;
    }
    // No command bus: apply the explicitly confirmed kind and type locally.
    const newPort: PortDefinition = {
      id: crypto.randomUUID(),
      name: `port${block.ports.length + 1}`,
      kind: PORT_KIND_MAP[portKind],
      typeId: typeId ?? '',
      direction: 'inout',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    update({ ports: [...block.ports, newPort] });
  };

  const choosePortKind = (portKind: CanonicalPortKind) => {
    const plan = planOwnedPortCreation(repositoryForPlanning(), {
      ownerBlockId: block.id,
      portKind,
    });
    if (plan.outcome === 'command') {
      // Standard UML Port explicit no-type exception: the kind was
      // explicitly chosen, so the immediate untyped command is explicit.
      setPortKindOpen(false);
      dispatchOrApplyPort(plan.command, portKind, undefined);
      return;
    }
    if (plan.outcome === 'typeSelection') {
      setPortKindOpen(false);
      setPortPrompt({
        portKind,
        candidates: plan.request.candidates,
        action: plan.request.action,
        error: plan.request.candidates.length === 0
          ? 'TYPE_NOT_FOUND: No compatible existing type.'
          : undefined,
      });
      return;
    }
    setPortKindOpen(false);
    setPortPrompt({
      portKind,
      candidates: plan.candidates ?? [],
      action: plan.action ?? {
        kind: 'CreateNewType',
        payload: { suggestedMetaclass: suggestedMetaclassForPortKind(portKind) },
      },
      error: plan.diagnostics[0]?.message ?? 'TYPE_NOT_FOUND: No compatible existing type.',
    });
  };

  const confirmPortType = (typeId: string) => {
    if (!portPrompt) return;
    const plan = planOwnedPortCreation(repositoryForPlanning(), {
      ownerBlockId: block.id,
      portKind: portPrompt.portKind,
      typeId,
    });
    if (plan.outcome === 'command') {
      const confirmed = portPrompt;
      setPortPrompt(null);
      dispatchOrApplyPort(plan.command, confirmed.portKind, typeId);
      return;
    }
    if (plan.outcome === 'typeSelection') {
      // Stale prompt: refresh candidates rather than committing.
      setPortPrompt(prev => prev ? {
        ...prev,
        candidates: plan.request.candidates,
        action: plan.request.action,
        error: undefined,
      } : prev);
      return;
    }
    // Structured error (unresolvable or incompatible type, e.g. a Block
    // chosen for a ProxyPort): surface the message without mutation.
    setPortPrompt(prev => prev ? { ...prev, error: plan.diagnostics[0]?.message } : prev);
  };

  const createNewPortType = () => {
    if (!portPrompt || !onCreateNewType) return;
    onCreateNewType(portPrompt.action);
  };

  const handleRedefine = (inheritedProp: PropertyDefinition) => {
    if (onRedefine) {
      onRedefine(inheritedProp);
    } else {
      const redefined: PropertyDefinition = {
        id: crypto.randomUUID(),
        name: inheritedProp.name,
        kind: inheritedProp.kind,
        typeId: inheritedProp.typeId,
        multiplicity: { ...inheritedProp.multiplicity },
        redefinesId: inheritedProp.id,
      };
      update({ properties: [...block.properties, redefined] });
    }
  };

  const handleSubset = (inheritedProp: PropertyDefinition) => {
    if (onSubset) {
      onSubset(inheritedProp);
    } else {
      const subsetted: PropertyDefinition = {
        id: crypto.randomUUID(),
        name: `${inheritedProp.name}Subset`,
        kind: inheritedProp.kind,
        typeId: inheritedProp.typeId,
        multiplicity: { ...inheritedProp.multiplicity },
        subsetsId: inheritedProp.id,
      };
      update({ properties: [...block.properties, subsetted] });
    }
  };

  const defOptions = Object.values(definitions);
  const inheritedProps = inheritedFeatures?.properties ?? [];

  // Prefer bdd resolveInheritedFeatures annotated origin fields; fall back to
  // the plain inherited list with its inheritedFromId marker. Deterministic
  // ordering (name, then id) matches policy resolveInheritance stability.
  const annotatedSource = inheritedFeatures?.annotatedProperties
    ?? inheritedProps.map(ip => ({
      ...ip,
      originId: ip.inheritedFromId ?? 'Base',
      originName: ip.inheritedFromId ?? 'Base',
      isInherited: true,
    }));
  const sortedInherited = [...annotatedSource].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const visibleInherited = sortedInherited.slice(0, maxVisibleInherited);
  const hiddenInheritedCount = sortedInherited.length - visibleInherited.length;

  const inheritancePanelDiagnostics = diagnostics.filter(d => INHERITANCE_PANEL_CODES.has(d.code));
  const abstractGuidance = block.isAbstract
    ? `Block ${block.name} is abstract and cannot be directly instantiated; specialize it with a concrete subtype`
    : undefined;
  const hasInheritanceSignal = (parentChain ?? []).length > 0
    || inheritancePanelDiagnostics.length > 0
    || abstractGuidance !== undefined;

  const diagnosticsFor = (elementId: string) => diagnostics.filter(d => d.elementId === elementId);

  return (
    <div className="sysml-editor space-y-4" aria-label="Block Feature Inspector">
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={Boolean(block.isAbstract)}
            onChange={e => update({ isAbstract: e.target.checked })}
          />
          <span>Abstract</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={Boolean(block.isLeaf)}
            onChange={e => update({ isLeaf: e.target.checked })}
          />
          <span>Leaf</span>
        </label>
      </div>

      {/* Properties Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase text-gray-400">Properties</h4>
          <button
            type="button"
            onClick={openPropertyPrompt}
            className="rounded border border-gray-600 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            + Add Property
          </button>
        </div>

        {block.properties.map((prop, index) => (
          <fieldset key={prop.id} className="rounded border border-gray-700 p-2 space-y-2 text-xs">
            <legend className="px-1 text-gray-400">Property {index + 1}</legend>
            <div className="grid grid-cols-2 gap-2">
              <label>
                Name
                <input
                  aria-label={`Property ${index + 1} name`}
                  value={prop.name}
                  onChange={e => updateProperty(index, { name: e.target.value })}
                  className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
                />
              </label>
              <label>
                Property kind
                <select
                  aria-label={`Property ${index + 1} kind`}
                  value={prop.kind}
                  onChange={e => updateProperty(index, { kind: e.target.value as PropertyDefinition['kind'] })}
                  className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
                >
                  {PROPERTY_KINDS.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              Type
              <select
                aria-label={`Property ${index + 1} type`}
                value={prop.typeId}
                onChange={e => updateProperty(index, { typeId: e.target.value })}
                className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
              >
                <option value="">Select a classifier</option>
                {defOptions.map(def => (
                  <option key={def.id} value={def.id}>
                    {def.name} «{def.kind}»
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label>
                Multiplicity
                <input
                  aria-label={`Property ${index + 1} multiplicity`}
                  value={`${prop.multiplicity.lower}..${prop.multiplicity.upper}`}
                  onChange={e => {
                    const text = e.target.value.trim();
                    const parts = text.split('..');
                    const lower = parseInt(parts[0], 10) || 0;
                    const upper = parts[1] === '*' ? '*' : parseInt(parts[1] || parts[0], 10) || 1;
                    updateProperty(index, { multiplicity: { ...prop.multiplicity, lower, upper } });
                  }}
                  className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 pt-4">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(prop.multiplicity.ordered)}
                    onChange={e => updateProperty(index, { multiplicity: { ...prop.multiplicity, ordered: e.target.checked } })}
                  />
                  ordered
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={!prop.multiplicity.unique}
                    onChange={e => updateProperty(index, { multiplicity: { ...prop.multiplicity, unique: !e.target.checked } })}
                  />
                  nonunique
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(prop.isDerived)}
                    onChange={e => updateProperty(index, { isDerived: e.target.checked })}
                  />
                  derived
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label>
                Redefines
                <select
                  value={prop.redefinesId || ''}
                  onChange={e => updateProperty(index, { redefinesId: e.target.value || undefined })}
                  className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
                >
                  <option value="">None</option>
                  {inheritedProps.map(ip => (
                    <option key={ip.id} value={ip.id}>{ip.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Subsets
                <select
                  value={prop.subsetsId || ''}
                  onChange={e => updateProperty(index, { subsetsId: e.target.value || undefined })}
                  className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
                >
                  <option value="">None</option>
                  {inheritedProps.map(ip => (
                    <option key={ip.id} value={ip.id}>{ip.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => removeProperty(index)}
              className="text-xs text-red-400 hover:underline"
            >
              Remove property
            </button>
            {diagnosticsFor(prop.id).length > 0 && (
              <div role="alert" className="space-y-1 rounded border border-red-700 bg-red-950/40 p-1.5 text-red-300">
                {diagnosticsFor(prop.id).map((d, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="font-semibold text-red-400">[{d.code}]</span>
                    <span>{d.message}</span>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        ))}
      </div>

      {/* Ports Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase text-gray-400">Ports</h4>
          <button
            type="button"
            onClick={() => setPortKindOpen(true)}
            className="rounded border border-gray-600 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            + Add Port
          </button>
        </div>

        {block.ports.map((port, index) => (
          <fieldset key={port.id} className="rounded border border-gray-700 p-2 space-y-2 text-xs">
            <legend className="px-1 text-gray-400">Port {index + 1}</legend>
            <div className="grid grid-cols-3 gap-2">
              <label>
                Name
                <input
                  aria-label={`Port ${index + 1} name`}
                  value={port.name}
                  onChange={e => updatePort(index, { name: e.target.value })}
                  className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
                />
              </label>
              <label>
                Port kind
                <select
                  aria-label={`Port ${index + 1} kind`}
                  value={port.kind}
                  onChange={e => updatePort(index, { kind: e.target.value as PortDefinition['kind'] })}
                  className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
                >
                  {PORT_KINDS.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Direction
                <select
                  aria-label={`Port ${index + 1} direction`}
                  value={port.direction}
                  onChange={e => updatePort(index, { direction: e.target.value as PortDefinition['direction'] })}
                  className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
                >
                  {PORT_DIRECTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label>
                Type
                <select
                  aria-label={`Port ${index + 1} type`}
                  value={port.typeId}
                  onChange={e => updatePort(index, { typeId: e.target.value })}
                  className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
                >
                  <option value="">Select an Interface or Block</option>
                  {defOptions.map(def => (
                    <option key={def.id} value={def.id}>
                      {def.name} «{def.kind}»
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center pt-4">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(port.isConjugated)}
                    onChange={e => updatePort(index, { isConjugated: e.target.checked })}
                  />
                  Conjugated (~)
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => removePort(index)}
              className="text-xs text-red-400 hover:underline"
            >
              Remove port
            </button>
            {diagnosticsFor(port.id).length > 0 && (
              <div role="alert" className="space-y-1 rounded border border-red-700 bg-red-950/40 p-1.5 text-red-300">
                {diagnosticsFor(port.id).map((d, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="font-semibold text-red-400">[{d.code}]</span>
                    <span>{d.message}</span>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        ))}
      </div>

      {/* Inheritance Panel: parent chain, cycle/leaf diagnostics, abstract guidance */}
      <div className="space-y-2 rounded border border-gray-800 bg-[var(--surface-sunken)] p-2 text-xs" aria-label="Inheritance panel">
        <h4 className="font-semibold uppercase text-gray-400">Inheritance panel</h4>
        <div aria-label="Parent chain" className="text-gray-300">
          {(parentChain ?? []).length > 0
            ? parentChain!.map(ancestor => ancestor.name).join(' → ')
            : 'No supertypes — root block'}
        </div>
        {abstractGuidance !== undefined && (
          <div role="alert" className="flex items-start gap-1 text-amber-300">
            <span className="font-semibold text-amber-400">[ABSTRACT_INSTANTIATION]</span>
            <span>{abstractGuidance}</span>
          </div>
        )}
        {inheritancePanelDiagnostics.length > 0 && (
          <div role="alert" aria-label="Inheritance diagnostics" className="space-y-1 text-red-300">
            {inheritancePanelDiagnostics.map((d, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="font-semibold text-red-400">[{d.code}]</span>
                <span>{d.message}</span>
              </div>
            ))}
          </div>
        )}
        {!hasInheritanceSignal && (
          <div className="text-gray-500">No inheritance issues detected</div>
        )}
      </div>

      {/* Inherited Features Section: read-only rows with annotated origin */}
      <div className="space-y-2 rounded border border-gray-800 bg-[var(--surface-sunken)] p-2 text-xs">
        <h4 className="font-semibold uppercase text-gray-400">Inherited Features</h4>
        {sortedInherited.length === 0 ? (
          <div className="text-gray-500">No inherited features to display</div>
        ) : (
          <div role="list" aria-label="Inherited features">
            {visibleInherited.map(ip => (
              <div
                key={ip.id}
                role="listitem"
                aria-readonly="true"
                tabIndex={0}
                aria-label={`Inherited feature ${ip.name} from ${ip.originName}`}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleRedefine(ip);
                  }
                }}
                className="flex items-center justify-between border-b border-gray-800 py-1"
              >
                <div>
                  <span className="font-mono text-gray-300">{ip.name}</span>
                  <span className="text-gray-500"> : {ip.typeId} [{ip.kind}]</span>
                  <div className="text-[10px] text-gray-500">Inherited from {ip.originName} ({ip.originId})</div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleRedefine(ip)}
                    className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800"
                  >
                    Redefine
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubset(ip)}
                    className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800"
                  >
                    Subset
                  </button>
                </div>
              </div>
            ))}
            {hiddenInheritedCount > 0 && (
              <div className="pt-1 text-gray-500">
                + {hiddenInheritedCount} more inherited features ({sortedInherited.length} total)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inspector type-selection workflows (spec 3.2, 4.1): shared
          TypeSelectionPrompt plus an explicit port-kind chooser. */}
      {propertyPrompt && (
        <div className="space-y-2 rounded border border-gray-700 p-2 text-xs">
          <label className="block text-gray-300">
            New property kind
            <select
              aria-label="New property kind"
              value={propertyPrompt.propertyKind}
              onChange={e => openPropertyPromptForKind(e.target.value as InspectorPropertyKind)}
              className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
            >
              {INSPECTOR_PROPERTY_KINDS.map(k => (
                <option key={k} value={k}>{INSPECTOR_PROPERTY_KIND_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <TypeSelectionPrompt
            isOpen
            featureKind={INSPECTOR_PROPERTY_KIND_LABELS[propertyPrompt.propertyKind]}
            candidates={propertyPrompt.candidates}
            error={propertyPrompt.error}
            onSelectType={confirmPropertyType}
            onCreateNewType={onCreateNewType ? createNewPropertyType : undefined}
            onCancel={() => setPropertyPrompt(null)}
          />
        </div>
      )}

      {portKindOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select Port kind"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-[420px] max-w-[90vw] space-y-2 rounded-lg border border-gray-700 bg-[var(--surface-sunken)] p-5 text-xs text-gray-200 shadow-2xl">
            <h3 className="text-sm font-semibold text-gray-100">Select Port kind</h3>
            <p className="text-gray-400">
              Choose the port stereotype before choosing a compatible type. Standard UML Port stays untyped.
            </p>
            <div className="flex flex-col gap-2">
              {INSPECTOR_PORT_KINDS.map(({ kind, label, description }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => choosePortKind(kind)}
                  className="rounded border border-gray-700 px-3 py-2 text-left hover:bg-gray-800"
                >
                  <span className="block font-medium text-gray-100">{label}</span>
                  <span className="block text-gray-400">{description}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPortKindOpen(false)}
                className="rounded border border-gray-600 px-3 py-1 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {portPrompt && (
        <TypeSelectionPrompt
          isOpen
          featureKind={INSPECTOR_PORT_TYPE_LABELS[portPrompt.portKind]}
          candidates={portPrompt.candidates}
          error={portPrompt.error}
          onSelectType={confirmPortType}
          onCreateNewType={onCreateNewType ? createNewPortType : undefined}
          onCancel={() => setPortPrompt(null)}
        />
      )}
    </div>
  );
}
