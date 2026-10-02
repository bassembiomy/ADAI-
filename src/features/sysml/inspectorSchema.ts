import type { SysmlRepositoryV4, SemanticElement, SemanticRelationship, Diagram, ItemFlow } from '../../engine/sysml/domain';
import type { SysmlCommand } from '../../engine/sysml/commands/types';
import { friendlySysmlKind, resolveSysmlReferenceLabel, sysmlObjectLabel } from './sysmlDisplayLabel';

export interface InspectorField {
  key: string;
  label: string;
  value: unknown;
  valueType: 'string' | 'number' | 'boolean' | 'select' | 'multiSelect' | 'expression';
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

function referenceOptions(repository: SysmlRepositoryV4) {
  return [
    ...Object.values(repository.elements),
    ...Object.values(repository.relationships),
    ...Object.values(repository.diagrams),
    ...Object.values(repository.itemFlows ?? {}),
  ].map(value => ({ label: sysmlObjectLabel(value), value: value.id }));
}

function referenceFieldMetadata(repository: SysmlRepositoryV4, ids: string[], fallbackKind: string, allowEmpty = false) {
  const options = referenceOptions(repository);
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
      ...referenceFieldMetadata(repository, [element.ownerId], 'Element'),
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
      ...referenceFieldMetadata(repository, [el.typeId], 'Type'),
      toCommand: (val) => ({
        type: 'UpdateElement',
        elementId: element.id,
        patch: { typeId: String(val) },
      }),
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
    ...referenceFieldMetadata(repository, [relationship.sourceId], 'Element'),
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
    ...referenceFieldMetadata(repository, [relationship.targetId], 'Element'),
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
