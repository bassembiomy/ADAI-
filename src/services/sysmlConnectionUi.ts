import type { BlockData, PartData, RelationshipData } from '../types/sysml_types';
import { classifyLegacyEndpoint, evaluateSysmlConnection, type ConnectionEndpoint, type ConnectionPolicyDiagnostic, type ConnectionPolicyInput } from '../engine/sysml/connectionPolicy';
import { validateLegacyRelationshipCandidate } from './sysmlCreationRules';

type UiModel = {
  blocks: readonly BlockData[];
  parts: readonly PartData[];
  relationships: readonly RelationshipData[];
  states?: readonly { id: string; name: string }[];
};
type Diagram = ConnectionPolicyInput['diagram'];
export interface UiConnectionRejection {
  relationshipKind: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  diagnostic: ConnectionPolicyDiagnostic;
}

export function resolveUiConnectionEndpoint(
  model: Pick<UiModel, 'blocks' | 'parts'> & { states?: readonly { id: string; name: string }[] },
  id: string,
): ConnectionEndpoint {
  const block = model.blocks.find(item => item.id === id);
  if (block) return classifyLegacyEndpoint(block);
  const part = model.parts.find(item => item.id === id);
  if (part) return classifyLegacyEndpoint({ ...part, stereotype: 'part' });
  const state = model.states?.find(item => item.id === id);
  if (state) return { id: state.id, name: state.name, family: 'state' };
  return { id: '', name: id, family: 'unknown' };
}

export function rejectUiRelationship(model: UiModel, candidate: RelationshipData, diagram: Diagram): UiConnectionRejection | undefined {
  const source = resolveUiConnectionEndpoint(model, candidate.sourceId);
  const target = resolveUiConnectionEndpoint(model, candidate.targetId);
  const relationshipKind = candidate.type === 'derive' ? 'deriveReqt' : candidate.type;
  const decision = evaluateSysmlConnection({ relationshipKind, source, target, diagram });
  if (!decision.allowed) return { relationshipKind, source, target, diagnostic: decision.diagnostics[0] };
  const validation = validateLegacyRelationshipCandidate(model, candidate);
  if (validation.valid) return undefined;
  const code = validation.codes[0];
  const correctiveAction = code === 'DUPLICATE_RELATIONSHIP'
    ? 'Edit the existing relationship, or choose another relationship kind or endpoint.'
    : code.includes('CYCLE')
      ? 'Choose endpoints that do not create a circular ownership, inheritance, or requirement chain.'
      : code === 'MULTIPLE_REQUIREMENT_CONTAINERS'
        ? 'Remove the existing parent containment before assigning another parent.'
        : 'Resolve the reported relationship constraint before retrying.';
  return { relationshipKind, source, target, diagnostic: {
    code,
    message: `${relationshipKind} cannot connect ${source.name} (${source.family}) to ${target.name} (${target.family}): ${code}.`,
    correctiveAction,
  } };
}

/** Check semantic validity in the relationship's owning context, even when the block is edited elsewhere. */
function relationshipContext(type: RelationshipData['type']): Diagram {
  if (type === 'binding') return 'ibd';
  if (['requirementContainment', 'derive', 'deriveReqt', 'copy', 'satisfy', 'verify', 'refine', 'trace'].includes(type)) return 'requirements';
  return 'bdd';
}

export function rejectBlockConnectionChange(model: UiModel, candidate: BlockData): UiConnectionRejection | undefined {
  const current = model.blocks.find(block => block.id === candidate.id);
  if (!current || current.stereotype === candidate.stereotype) return undefined;
  const projected = { ...model, blocks: model.blocks.map(block => block.id === candidate.id ? candidate : block) };
  for (const relationship of model.relationships) {
    if (relationship.sourceId !== candidate.id && relationship.targetId !== candidate.id) continue;
    const rejection = rejectUiRelationship(projected, relationship, relationshipContext(relationship.type));
    if (rejection) return { ...rejection, diagnostic: {
      ...rejection.diagnostic,
      message: `Cannot change ${current.name}'s stereotype to ${candidate.stereotype}. ${rejection.diagnostic.message}`,
      correctiveAction: `Change or remove the incompatible relationship first. ${rejection.diagnostic.correctiveAction}`,
    } };
  }
  return undefined;
}

const CANVAS_KINDS: RelationshipData['type'][] = ['association', 'generalization', 'composition', 'aggregation', 'dependency', 'allocation', 'requirementContainment', 'deriveReqt', 'copy', 'satisfy', 'verify', 'refine', 'trace', 'binding'];

export function getCanvasRelationshipKinds(model: UiModel, sourceId: string, targetId: string, diagram: Diagram): RelationshipData['type'][] {
  return CANVAS_KINDS.filter(type => !rejectUiRelationship(model, { id: '', sourceId, targetId, type, label: '' }, diagram));
}
