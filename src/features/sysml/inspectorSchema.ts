import type { SysmlRepositoryV4, SemanticElement, SemanticRelationship, Diagram, ItemFlow } from '../../engine/sysml/domain';
import type { SysmlCommand } from '../../engine/sysml/commands/types';

export interface InspectorField {
  key: string;
  label: string;
  value: unknown;
  valueType: 'string' | 'number' | 'boolean' | 'select' | 'multiSelect' | 'expression';
  mode: 'editable' | 'readOnly';
  readOnlyReason?: string;
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

  // Identity (Read-only)
  fields.push({
    key: 'id',
    label: 'ID',
    value: element.id,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Canonical identity is immutable.',
  });

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
      label: 'Owner ID',
      value: element.ownerId,
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({
        type: 'MoveElement',
        elementId: element.id,
        newOwnerId: val ? String(val) : null,
      }),
    });
  } else {
    fields.push({
      key: 'ownerId',
      label: 'Owner ID',
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
      valueType: 'string',
      mode: 'editable',
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
    title: `${element.metaclass}: ${element.name}`,
    metaclass: element.metaclass,
    fields,
    actions,
  };
}

function buildRelationshipSchema(relationship: SemanticRelationship, repository: SysmlRepositoryV4): InspectorSchema {
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  // Identity (Read-only)
  fields.push({
    key: 'id',
    label: 'ID',
    value: relationship.id,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Canonical relationship identity is immutable.',
  });

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
    label: 'Source ID',
    value: relationship.sourceId,
    valueType: 'string',
    mode: 'editable',
    toCommand: (val) => ({
      type: 'UpdateRelationship',
      relationshipId: relationship.id,
      patch: { sourceId: String(val) },
    }),
  });

  // Target (Editable)
  fields.push({
    key: 'targetId',
    label: 'Target ID',
    value: relationship.targetId,
    valueType: 'string',
    mode: 'editable',
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
  if (relationship.sourceEnd) {
    const end = relationship.sourceEnd as any;
    fields.push({
      key: 'sourceEndRoleId',
      label: 'Source End Role',
      value: end.roleId || '',
      valueType: 'string',
      mode: 'editable',
      toCommand: (val) => ({
        type: 'UpdateRelationship',
        relationshipId: relationship.id,
        patch: { sourceEnd: { ...end, roleId: String(val) } },
      }),
    });
  }

  if (relationship.targetEnd) {
    const end = relationship.targetEnd as any;
    fields.push({
      key: 'targetEndRoleId',
      label: 'Target End Role',
      value: end.roleId || '',
      valueType: 'string',
      mode: 'editable',
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
    title: `${relationship.metaclass}: ${relationship.name || relationship.id}`,
    metaclass: relationship.metaclass,
    fields,
    actions,
  };
}

function buildItemFlowSchema(flow: ItemFlow, repository: SysmlRepositoryV4): InspectorSchema {
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  fields.push({
    key: 'id',
    label: 'ID',
    value: flow.id,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'ItemFlow identity is immutable.',
  });

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
    label: 'Source ID',
    value: flow.sourceId,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'ItemFlow source follows realized connector.',
  });

  fields.push({
    key: 'targetId',
    label: 'Target ID',
    value: flow.targetId,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'ItemFlow target follows realized connector.',
  });

  fields.push({
    key: 'realizingRelationshipId',
    label: 'Realizing Connector',
    value: flow.realizingRelationshipId,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Connector realization link is immutable.',
  });

  fields.push({
    key: 'conveyedClassifierIds',
    label: 'Conveyed Classifiers',
    value: (flow.conveyedClassifierIds || []).join(', '),
    valueType: 'string',
    mode: 'readOnly',
  });

  return {
    id: flow.id,
    title: `ItemFlow: ${flow.name || flow.id}`,
    metaclass: 'ItemFlow',
    fields,
    actions,
  };
}

function buildDiagramSchema(diagram: Diagram, repository: SysmlRepositoryV4): InspectorSchema {
  const fields: InspectorField[] = [];
  const actions: InspectorAction[] = [];

  fields.push({
    key: 'id',
    label: 'ID',
    value: diagram.id,
    valueType: 'string',
    mode: 'readOnly',
    readOnlyReason: 'Diagram identity is immutable.',
  });

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
    title: `Diagram: ${diagram.name}`,
    metaclass: 'Diagram',
    fields,
    actions,
  };
}
