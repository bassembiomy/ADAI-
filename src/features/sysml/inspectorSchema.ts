import type { SysmlRepositoryV4, SemanticElement, SemanticRelationship, Diagram, ItemFlow } from '../../engine/sysml/domain';
import type { SysmlCommand } from '../../engine/sysml/commands/types';
import { friendlySysmlKind, resolveSysmlReferenceLabel, sysmlObjectLabel } from './sysmlDisplayLabel';

export interface InspectorField {
  key: string;
  label: string;
  value: unknown;
  /** `stringList`: an ordered list of free-text entries, edited one per line. */
  valueType: 'string' | 'number' | 'boolean' | 'select' | 'multiSelect' | 'stringList' | 'expression';
  mode: 'editable' | 'readOnly';
  readOnlyReason?: string;
  referenceWarning?: string;
  options?: Array<{ label: string; value: string }>;
  validate?: (value: unknown) => { valid: boolean; message?: string };
  toCommand?: (value: unknown) => SysmlCommand;
}

export interface InspectorAction {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  toCommand?: () => SysmlCommand;
}

export interface InspectorSchema {
  id: string;
  title: string;
  metaclass: string;
  fields: InspectorField[];
  actions: InspectorAction[];
}

export interface InspectorSelection {
  repository: SysmlRepositoryV4;
  elementId?: string;
  relationshipId?: string;
  itemFlowId?: string;
  presentationId?: string;
  diagramId?: string;
}

/**
 * What a reference field points at. Offering every repository object for
 * every field (relationships, diagrams, the element itself...) made most
 * dropdown choices invalid, so the gateway rejected them and the selection
 * appeared not to work.
 */
type ReferencePurpose = 'owner' | 'type' | 'endpoint' | 'unit' | 'quantityKind' | 'stakeholder' | 'requirement' | 'any';

const OWNER_METACLASSES = new Set(['Model', 'Package', 'Block']);
const TYPE_METACLASSES = new Set([
  'Block', 'InterfaceBlock', 'ConstraintBlock', 'AssociationBlock', 'FlowSpecification',
  'DataType', 'ValueType', 'Enumeration', 'Signal',
]);

/** True when `candidateId` is `ancestorId` or nested anywhere beneath it. */
function isSelfOrDescendant(repository: SysmlRepositoryV4, candidateId: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  let current: string | undefined = candidateId;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = (repository.elements[current] as { ownerId?: string } | undefined)?.ownerId;
  }
  return false;
}

function referenceOptions(repository: SysmlRepositoryV4, purpose: ReferencePurpose = 'any', selfId?: string) {
  if (purpose === 'any') {
    return [
      ...Object.values(repository.elements),
      ...Object.values(repository.relationships),
      ...Object.values(repository.diagrams),
      ...Object.values(repository.itemFlows ?? {}),
    ].map(value => ({ label: sysmlObjectLabel(value), value: value.id }));
  }
  return Object.values(repository.elements)
    .filter(element => {
      if (purpose === 'owner') {
        return OWNER_METACLASSES.has(element.metaclass)
          && !(selfId && isSelfOrDescendant(repository, element.id, selfId));
      }
      if (purpose === 'type') return TYPE_METACLASSES.has(element.metaclass);
      if (purpose === 'unit') return element.metaclass === 'Unit';
      if (purpose === 'quantityKind') return element.metaclass === 'QuantityKind';
      if (purpose === 'stakeholder') return element.metaclass === 'Stakeholder';
      if (purpose === 'requirement') return element.metaclass === 'Requirement';
      return element.metaclass !== 'Diagram';
    })
    .map(value => ({ label: sysmlObjectLabel(value), value: value.id }));
}

function referenceFieldMetadata(
  repository: SysmlRepositoryV4,
  ids: string[],
  fallbackKind: string,
  allowEmpty = false,
  purpose: ReferencePurpose = 'any',
  selfId?: string,
) {
  const options = referenceOptions(repository, purpose, selfId);
  if (allowEmpty) options.unshift({ label: 'None', value: '' });
  let hasMissingReference = false;
  for (const id of ids) {
    if (id && !options.some(option => option.value === id)) {
      options.push({ label: resolveSysmlReferenceLabel(repository, id, fallbackKind), value: id });
      hasMissingReference = true;
    }
  }
  return {
    options,
    referenceWarning: hasMissingReference ? 'Referenced element is unavailable' : undefined,
  };
}

function inspectorTitle(value: { name?: string; metaclass?: string; kind?: string }, kindName: string): string {
  const label = sysmlObjectLabel(value, kindName);
  const kind = friendlySysmlKind(value.metaclass ?? value.kind, kindName);
  return label === kind ? kind : `${kind}: ${label}`;
}

export function getInspectorSchema(selection: InspectorSelection): InspectorSchema | null {
  const { repository, elementId, relationshipId, itemFlowId } = selection;

  // 1. Item flow selection
  if (itemFlowId && repository.itemFlows?.[itemFlowId]) {
    return buildItemFlowSchema(repository.itemFlows[itemFlowId], repository);
  }
  if (elementId && repository.itemFlows?.[elementId]) {
    return buildItemFlowSchema(repository.itemFlows[elementId], repository);
  }
  if (relationshipId && repository.itemFlows?.[relationshipId]) {
    return buildItemFlowSchema(repository.itemFlows[relationshipId], repository);
  }

  // 2. Relationship selection
  if (relationshipId && repository.relationships[relationshipId]) {
    const rel = repository.relationships[relationshipId];
    return buildRelationshipSchema(rel, repository);
  }

  // 3. Element or Diagram selection
  if (elementId) {
    if (repository.elements[elementId]) {
      return buildElementSchema(repository.elements[elementId], repository);
    }
    if (repository.diagrams[elementId]) {
      return buildDiagramSchema(repository.diagrams[elementId], repository);
    }
    if (repository.relationships[elementId]) {
      return buildRelationshipSchema(repository.relationships[elementId], repository);
    }
  }

  return null;
}

function buildElementSchema(element: SemanticElement, repository: SysmlRepositoryV4): InspectorSchema {
  const el = element as any;
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  // Metaclass (Read-only)
  fields.push({
    key: 'metaclass',
    label: 'Metaclass',
    value: element.metaclass,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Metaclass cannot be mutated in place.',
  });

  // Name (Editable)
  fields.push({
    key: 'name',
    label: 'Name',
    value: element.name,
    valueType: 'string',
    mode: 'editable',
    toCommand: (val) => ({
      type: 'UpdateElement',
      elementId: element.id,
      patch: { name: String(val) },
    }),
  });

  // Owner (Editable or Read-only)
  if (element.ownerId) {
    fields.push({
      key: 'ownerId',
      label: 'Owner',
      value: element.ownerId,
      valueType: 'select',
      mode: 'editable',
      ...referenceFieldMetadata(repository, [element.ownerId], 'Element', false, 'owner', element.id),
      toCommand: (val) => ({
        type: 'MoveElement',
        elementId: element.id,
        newOwnerId: val ? String(val) : null,
      }),
    });
  } else {
    fields.push({
      key: 'ownerId',
      label: 'Owner',
      value: 'None (Root)',
      valueType: 'string',
      mode: 'readOnly',
      readOnlyReason: 'Root element ownership is fixed.',
    });
  }

  // Metaclass-specific fields
  if (el.typeId !== undefined) {
    fields.push({
      key: 'typeId',
      label: 'Type',
      value: el.typeId,
      valueType: 'select',
      mode: 'editable',
      ...referenceFieldMetadata(repository, [el.typeId], 'Type', false, 'type'),
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { typeId: String(val) },
      }),
    });
  }

  // Unit / QuantityKind references (SysML 1.6 §8.3.2.10-11) are element
  // pickers, never free text; clearing a picker removes the reference.
  const referencePicker = (key: string, label: string, purpose: 'unit' | 'quantityKind', fallbackKind: string): InspectorField => ({
    key,
    label,
    value: el[key] ?? '',
    valueType: 'select',
    mode: 'editable',
    ...referenceFieldMetadata(repository, el[key] ? [el[key]] : [], fallbackKind, true, purpose),
    toCommand: (val) => ({
      type: 'UpdateElement',
      elementId: element.id,
      patch: { [key]: val ? String(val) : undefined } as any,
    }),
  });
  if (element.metaclass === 'ValueType') {
    fields.push(referencePicker('unitId', 'Unit', 'unit', 'Unit'));
    fields.push(referencePicker('quantityKindId', 'Quantity Kind', 'quantityKind', 'Quantity Kind'));
  }
  if (element.metaclass === 'Unit') {
    fields.push({
      key: 'symbol',
      label: 'Symbol',
      value: el.symbol ?? '',
      valueType: 'string',
      mode: 'editable',
      validate: (val) => String(val ?? '').trim() ? { valid: true } : { valid: false, message: 'A unit needs a symbol.' },
      toCommand: (val) => ({ type: 'UpdateElement', elementId: element.id, patch: { symbol: String(val) } }),
    });
    fields.push(referencePicker('quantityKindId', 'Quantity Kind', 'quantityKind', 'Quantity Kind'));
  }
  if (element.metaclass === 'QuantityKind') {
    fields.push({
      key: 'symbol',
      label: 'Symbol',
      value: el.symbol ?? '',
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({ type: 'UpdateElement', elementId: element.id, patch: { symbol: String(val) || undefined } as any }),
    });
    fields.push({
      key: 'description',
      label: 'Description',
      value: el.description ?? '',
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({ type: 'UpdateElement', elementId: element.id, patch: { description: String(val) || undefined } as any }),
    });
  }

  // SysML 1.6 §7.3.2 View / Viewpoint / Stakeholder.
  const stringListField = (key: string, label: string, values: unknown, normalize: (lines: string[]) => string[] = lines => lines): InspectorField => ({
    key,
    label,
    value: Array.isArray(values) ? values : [],
    valueType: 'stringList',
    mode: 'editable',
    toCommand: (val) => ({
      type: 'UpdateElement',
      elementId: element.id,
      patch: { [key]: normalize(Array.isArray(val) ? val.map(String) : String(val ?? '').split('\n')) } as any,
    }),
  });
  const trimmedLines = (lines: string[]) => lines.map(line => line.trim()).filter(Boolean);
  if (element.metaclass === 'Viewpoint') {
    fields.push({
      key: 'purpose', label: 'Purpose', value: el.purpose ?? '', valueType: 'string', mode: 'editable',
      toCommand: (val) => ({ type: 'UpdateElement', elementId: element.id, patch: { purpose: String(val) } as any }),
    });
    const multiPicker = (key: string, label: string, purpose: 'stakeholder' | 'requirement', fallbackKind: string): InspectorField => {
      const ids: string[] = Array.isArray(el[key]) ? el[key] : [];
      return {
        key, label, value: ids, valueType: 'multiSelect', mode: 'editable',
        ...referenceFieldMetadata(repository, ids, fallbackKind, false, purpose),
        toCommand: (val) => ({ type: 'UpdateElement', elementId: element.id, patch: { [key]: Array.isArray(val) ? val.map(String) : [] } as any }),
      };
    };
    fields.push(multiPicker('stakeholderIds', 'Stakeholders', 'stakeholder', 'Stakeholder'));
    fields.push(multiPicker('concernIds', 'Concern Requirements', 'requirement', 'Requirement'));
    fields.push(stringListField('concerns', 'Concerns (free text)', el.concerns, trimmedLines));
    fields.push(stringListField('languages', 'Languages', el.languages, trimmedLines));
    fields.push(stringListField('presentation', 'Presentation', el.presentation, trimmedLines));
    fields.push({
      key: 'methodText', label: 'Method', value: el.methodText ?? '', valueType: 'string', mode: 'editable',
      toCommand: (val) => ({ type: 'UpdateElement', elementId: element.id, patch: { methodText: String(val) || undefined } as any }),
    });
  }
  if (element.metaclass === 'Stakeholder') {
    fields.push(stringListField('concerns', 'Concerns', el.concerns, trimmedLines));
  }
  if (element.metaclass === 'View') {
    // The Viewpoint is derived from «conform» (single source of truth); it is changed by drawing/deleting that relationship.
    const relationshipsOf = (kind: string) => Object.values(repository.relationships)
      .filter(rel => (rel.customProperties as { sourceKind?: string } | undefined)?.sourceKind === kind && rel.sourceId === element.id);
    const conformTargets = relationshipsOf('conform').map(rel => rel.targetId);
    fields.push({
      key: 'viewpoint', label: 'Viewpoint', value: conformTargets[0] ?? '', valueType: 'select', mode: 'readOnly',
      readOnlyReason: 'Derived from the «conform» relationship.',
      ...referenceFieldMetadata(repository, conformTargets, 'Viewpoint', true),
    });
    const exposed = relationshipsOf('expose').map(rel => rel.targetId);
    fields.push({
      key: 'exposes', label: 'Exposes', value: exposed, valueType: 'multiSelect', mode: 'readOnly',
      readOnlyReason: 'Derived from «expose» relationships.',
      ...referenceFieldMetadata(repository, exposed, 'Element'),
    });
  }

  if (el.direction !== undefined) {
    fields.push({
      key: 'direction',
      label: 'Direction',
      value: el.direction,
      valueType: 'select',
      mode: 'editable',
      options: [
        { label: 'In', value: 'in' },
        { label: 'Out', value: 'out' },
        { label: 'In/Out', value: 'inout' },
      ],
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { direction: val as any },
      }),
    });
  }

  if (el.isConjugated !== undefined) {
    fields.push({
      key: 'isConjugated',
      label: 'Conjugated',
      value: el.isConjugated,
      valueType: 'boolean',
      mode: 'editable',
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { isConjugated: Boolean(val) },
      }),
    });
  }

  if (el.aggregation !== undefined) {
    fields.push({
      key: 'aggregation',
      label: 'Aggregation',
      value: el.aggregation,
      valueType: 'select',
      mode: 'editable',
      options: [
        { label: 'Composite', value: 'composite' },
        { label: 'Shared', value: 'shared' },
        { label: 'None', value: 'none' },
      ],
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { aggregation: val as any },
      }),
    });
  }

  if (el.text !== undefined) {
    fields.push({
      key: 'text',
      label: 'Text',
      value: el.text,
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { text: String(val) },
      }),
    });
  }

  if (el.status !== undefined) {
    fields.push({
      key: 'status',
      label: 'Status',
      value: el.status,
      valueType: 'select',
      mode: 'editable',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Approved', value: 'approved' },
        { label: 'Implemented', value: 'implemented' },
        { label: 'Verified', value: 'verified' },
      ],
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { status: val as any },
      }),
    });
  }

  // Delete Action
  actions.push({
    id: 'delete',
    label: 'Delete Element',
    enabled: true,
    toCommand: () => ({
      type: 'DeleteElement',
      elementId: element.id,
    }),
  });

  return {
    id: element.id,
    title: inspectorTitle(element, 'Element'),
    metaclass: element.metaclass,
    fields,
    actions,
  };
}

function buildRelationshipSchema(relationship: SemanticRelationship, repository: SysmlRepositoryV4): InspectorSchema {
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  // Metaclass (Read-only)
  fields.push({
    key: 'metaclass',
    label: 'Metaclass',
    value: relationship.metaclass,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Relationship metaclass is immutable.',
  });

  // Name (Editable)
  fields.push({
    key: 'name',
    label: 'Name',
    value: relationship.name || '',
    valueType: 'string',
    mode: 'editable',
    toCommand: (val) => ({
      type: 'UpdateRelationship',
      relationshipId: relationship.id,
      patch: { name: String(val) },
    }),
  });

  // Source (Editable)
  fields.push({
    key: 'sourceId',
    label: 'Source',
    value: relationship.sourceId,
    valueType: 'select',
    mode: 'editable',
    ...referenceFieldMetadata(repository, [relationship.sourceId], 'Element', false, 'endpoint'),
    toCommand: (val) => ({
      type: 'UpdateRelationship',
      relationshipId: relationship.id,
      patch: { sourceId: String(val) },
    }),
  });

  // Target (Editable)
  fields.push({
    key: 'targetId',
    label: 'Target',
    value: relationship.targetId,
    valueType: 'select',
    mode: 'editable',
    ...referenceFieldMetadata(repository, [relationship.targetId], 'Element', false, 'endpoint'),
    toCommand: (val) => ({
      type: 'UpdateRelationship',
      relationshipId: relationship.id,
      patch: { targetId: String(val) },
    }),
  });

  // Behavioral: Transition guard and trigger
  if (relationship.metaclass === 'Transition') {
    const trans = relationship as any;
    fields.push({
      key: 'guard',
      label: 'Guard',
      value: trans.guard || '',
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({
        type: 'UpdateRelationship',
        relationshipId: relationship.id,
        patch: { guard: String(val) } as any,
      }),
    });
    fields.push({
      key: 'trigger',
      label: 'Trigger',
      value: trans.trigger || '',
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({
        type: 'UpdateRelationship',
        relationshipId: relationship.id,
        patch: { trigger: String(val) } as any,
      }),
    });
  }

  // Connector ends
  if (relationship.sourceEnd && 'roleId' in relationship.sourceEnd) {
    const end = relationship.sourceEnd;
    fields.push({
      key: 'sourceEndRoleId',
      label: 'Source End Role',
      value: end.roleId || '',
      valueType: 'select',
      mode: 'editable',
      ...referenceFieldMetadata(repository, [end.roleId], 'Role', true),
      toCommand: (val) => ({
        type: 'UpdateRelationship',
        relationshipId: relationship.id,
        patch: { sourceEnd: { ...end, roleId: String(val) } },
      }),
    });
  }

  if (relationship.targetEnd && 'roleId' in relationship.targetEnd) {
    const end = relationship.targetEnd;
    fields.push({
      key: 'targetEndRoleId',
      label: 'Target End Role',
      value: end.roleId || '',
      valueType: 'select',
      mode: 'editable',
      ...referenceFieldMetadata(repository, [end.roleId], 'Role', true),
      toCommand: (val) => ({
        type: 'UpdateRelationship',
        relationshipId: relationship.id,
        patch: { targetEnd: { ...end, roleId: String(val) } },
      }),
    });
  }

  // Delete Action
  actions.push({
    id: 'delete',
    label: 'Delete Relationship',
    enabled: true,
    toCommand: () => ({
      type: 'DeleteRelationship',
      relationshipId: relationship.id,
    }),
  });

  return {
    id: relationship.id,
    title: inspectorTitle(relationship, 'Relationship'),
    metaclass: relationship.metaclass,
    fields,
    actions,
  };
}

function buildItemFlowSchema(flow: ItemFlow, repository: SysmlRepositoryV4): InspectorSchema {
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  fields.push({
    key: 'metaclass',
    label: 'Metaclass',
    value: 'ItemFlow',
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'ItemFlow metaclass is immutable.',
  });

  fields.push({
    key: 'name',
    label: 'Name',
    value: flow.name || '',
    valueType: 'string',
    mode: 'readOnly',
  });

  fields.push({
    key: 'sourceId',
    label: 'Source',
    value: flow.sourceId,
    valueType: 'select',
    mode: 'readOnly',
    readOnlyReason: 'ItemFlow source follows realized connector.',
    ...referenceFieldMetadata(repository, [flow.sourceId], 'Element'),
  });

  fields.push({
    key: 'targetId',
    label: 'Target',
    value: flow.targetId,
    valueType: 'select',
    mode: 'readOnly',
    readOnlyReason: 'ItemFlow target follows realized connector.',
    ...referenceFieldMetadata(repository, [flow.targetId], 'Element'),
  });

  fields.push({
    key: 'realizingRelationshipId',
    label: 'Realizing Connector',
    value: flow.realizingRelationshipId,
    valueType: 'select',
    mode: 'readOnly',
    readOnlyReason: 'Connector realization link is immutable.',
    ...referenceFieldMetadata(repository, [flow.realizingRelationshipId], 'Connector'),
  });

  fields.push({
    key: 'conveyedClassifierIds',
    label: 'Conveyed Classifiers',
    value: flow.conveyedClassifierIds || [],
    valueType: 'multiSelect',
    mode: 'readOnly',
    readOnlyReason: 'Conveyed classifiers follow the item flow.',
    ...referenceFieldMetadata(repository, flow.conveyedClassifierIds || [], 'Classifier'),
  });

  return {
    id: flow.id,
    title: inspectorTitle(flow, 'ItemFlow'),
    metaclass: 'ItemFlow',
    fields,
    actions,
  };
}

function buildDiagramSchema(diagram: Diagram, repository: SysmlRepositoryV4): InspectorSchema {
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  fields.push({
    key: 'diagramKind',
    label: 'Diagram Kind',
    value: diagram.diagramKind,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Diagram kind is fixed at creation.',
  });

  fields.push({
    key: 'name',
    label: 'Name',
    value: diagram.name,
    valueType: 'string',
    mode: 'editable',
    toCommand: (val) => ({
      type: 'UpdateElement',
      elementId: diagram.id,
      patch: { name: String(val) },
    }),
  });

  actions.push({
    id: 'delete',
    label: 'Delete Diagram',
    enabled: true,
    toCommand: () => ({
      type: 'DeleteElement',
      elementId: diagram.id,
    }),
  });

  return {
    id: diagram.id,
    title: inspectorTitle(diagram, 'Diagram'),
    metaclass: 'Diagram',
    fields,
    actions,
  };
}
