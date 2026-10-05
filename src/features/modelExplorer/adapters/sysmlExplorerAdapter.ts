import type {
  ModelExplorerAdapter,
  ModelTreeProjection,
  ModelTreeNode,
  ExplorerCapability,
  ModelExplorerCommand,
  ExplorerCommandResult,
  ExplorerView,
  ExplorerDiagnostic,
} from '../modelExplorerTypes';
import type { SemanticElement, MetaclassKind } from '../../../engine/sysml/domain';
import {
  evaluateOwnership,
  getOwnedElementCapabilities,
  getLegalRelationshipTargets,
} from '../../../engine/sysml/capabilities';
import { migrateV3ToV4 } from '../../../engine/sysml/persistence/migrateV3ToV4';
import { derivedDepthOneParts, isPartProperty, linkedPropertyIds, resolvePartLike } from '../../../engine/sysml/partOccurrences';
import type { SysmlRepositoryV4 } from '../../../engine/sysml/domain';
import {
  SYSML_CHILDREN,
  SYSML_RELATIONSHIPS,
  SYSML_DIAGRAM_KINDS,
  getElementKindLabel,
  getRelationshipKindLabel,
  getDiagramKindLabel,
  allowedDiagramKinds,
  diagramKindsFor,
} from '../modelExplorerCapabilities';
export { allowedDiagramKinds, diagramKindsFor };
import {
  buildCreateOwnedPortCommand,
  buildCreateOwnedPropertyCommand,
  type CanonicalPortKind,
} from '../../../services/sysmlOwnedFeatureCommands';
import type { TypeSelectionPayload } from '../../../components/sysml/typeSelectionTypes';
import { hasSysmlReference, resolveSysmlReferenceLabel, sysmlObjectLabel } from '../../sysml/sysmlDisplayLabel';
import { buildPackageRelationship } from '../../sysml/packageRelationshipNotation';

function explorerKindToMetaclass(kind: string): MetaclassKind {
  switch (kind) {
    case 'part':
    case 'sharedPart':
      return 'PartProperty';
    case 'reference':
      return 'ReferenceProperty';
    case 'valueProperty':
      return 'ValueProperty';
    case 'constraintProperty':
      return 'ConstraintProperty';
    case 'flowProperty':
      return 'FlowProperty';
    case 'fullPort':
    case 'FullPort':
    case 'proxyPort':
    case 'ProxyPort':
    case 'flowPort':
    case 'FlowPort':
    case 'port':
    case 'Port':
      return 'Port';
    case 'package':
      return 'Package';
    case 'block':
      return 'Block';
    case 'interface':
      return 'InterfaceBlock';
    case 'valueType':
      return 'ValueType';
    case 'enumeration':
      return 'Enumeration';
    case 'signal':
      return 'Signal';
    case 'unit':
      return 'Unit';
    case 'quantityKind':
      return 'QuantityKind';
    case 'view':
      return 'View';
    case 'viewpoint':
      return 'Viewpoint';
    case 'stakeholder':
      return 'Stakeholder';
    case 'constraintBlock':
      return 'ConstraintBlock';
    case 'requirement':
      return 'Requirement';
    case 'testCase':
      return 'TestCase';
    case 'verificationCase':
      return 'VerificationCase';
    case 'useCase':
      return 'UseCase';
    case 'activity':
      return 'Activity';
    case 'interaction':
      return 'Interaction';
    default:
      return kind as MetaclassKind;
  }
}

function canonicalKindToExplorerKind(kind: string): string {
  switch (kind) {
    case 'Package': return 'package';
    case 'Block': return 'block';
    case 'InterfaceBlock': return 'interface';
    case 'ValueType': return 'valueType';
    case 'Enumeration': return 'enumeration';
    case 'Signal': return 'signal';
    case 'Unit': return 'unit';
    case 'QuantityKind': return 'quantityKind';
    case 'View': return 'view';
    case 'Viewpoint': return 'viewpoint';
    case 'Stakeholder': return 'stakeholder';
    case 'ConstraintBlock': return 'constraintBlock';
    case 'Requirement': return 'requirement';
    case 'TestCase': return 'testCase';
    case 'VerificationCase': return 'verificationCase';
    case 'UseCase': return 'useCase';
    case 'Activity': return 'activity';
    case 'Interaction': return 'interaction';
    case 'PartProperty': return 'part';
    case 'ReferenceProperty': return 'reference';
    case 'ValueProperty': return 'valueProperty';
    case 'ConstraintProperty': return 'constraintProperty';
    case 'FlowProperty': return 'flowProperty';
    case 'Port': return 'port';
    case 'ProxyPort': return 'proxyPort';
    case 'FullPort': return 'fullPort';
    case 'FlowPort': return 'flowPort';
    default: return kind;
  }
}

const EXECUTABLE_EXPLORER_KINDS = new Set([
  'package',
  'block',
  'interface',
  'valueType',
  'enumeration',
  'signal',
  'unit',
  'quantityKind',
  'view',
  'viewpoint',
  'stakeholder',
  'constraintBlock',
  'requirement',
  'testCase',
  'verificationCase',
  'useCase',
  'activity',
  'interaction',
  'part',
  'sharedPart',
  'reference',
  'valueProperty',
  'port',
  'fullPort',
  'proxyPort',
  'flowPort',
]);

function isExplorerKindExecutable(kind: string): boolean {
  return EXECUTABLE_EXPLORER_KINDS.has(canonicalKindToExplorerKind(kind));
}
import {
  createPackage,
  createBlock,
  createValueType,
  createEnumeration,
  createSignal,
  createUnit,
  createQuantityKind,
  createView,
  createViewpoint,
  createStakeholder,
  createActivity,
  createInteraction,
  createConstraintBlock,
  createInterface,
  createRequirement,
  createVerificationCase,
  createUseCase,
  createPortDefinition,
  createValueProperty,
  createDiagramDefinition,
  generateId,
  generateUniqueName,
} from './modelExplorerFactories';
import { copyOwnershipForest, remapClipboardPayload } from '../modelExplorerClipboard';
import type {
  SysmlGatewayState,
  SysmlCommandResult,
  SysmlEditorCommand,
  SysmlMutationCommand,
} from '../../../services/sysmlCommandGateway';
import { computeImpactHash, executeSysmlCommand } from '../../../services/sysmlCommandGateway';
import { buildCreatePartPropertyCommand } from '../../../services/sysmlPropertyCommands';
import {
  buildCreateInteractionFromContextCommand,
  buildRemoveFragmentCommand,
  buildRemoveInteractionConstraintCommand,
  buildRemoveInteractionMessageCommand,
  buildRemoveInteractionUseCommand,
  buildRemoveLifelineCommand,
  buildRemoveStateInvariantCommand,
  buildRenameInteractionElementCommand,
  type InteractionCommandPlan,
} from '../../../services/sysmlInteractionCommands';
import { findInteractionElement, lifelineBlock, messageLabel, orderedMessages } from '../../../engine/sysml/interaction';
import type {
  SysmlRepository,
  SysmlRelationship,
  SysmlUsage,
  BlockDefinition,
  PartUsage,
} from '../../../engine/sysml/model';

/**
 * Projects a V3 usage record to a V4 semantic element for relationship
 * endpoint validation. The V4 elements index carries definitions, requirements,
 * and verification cases but no usage ids, so without this projection a part
 * usage source resolves to nothing and the Allocate/Satisfy tree wizards
 * offer zero targets.
 */
/** The explorer node of a part property that no PartUsage record represents (format 5); its id is the property id. */
function occurrenceFreePart(blockId: string, property: BlockDefinition['properties'][number]): PartUsage {
  return {
    id: property.id, kind: 'part', name: property.name, ownerId: blockId, typeId: property.typeId,
    aggregation: property.kind === 'reference' ? 'reference' : 'composite', multiplicity: property.multiplicity,
    propertyId: property.id,
  };
}

function usageToSemanticElement(id: string, usage: SysmlUsage | undefined): SemanticElement | undefined {
  if (!usage) return undefined;
  const metaclass = usage.kind === 'part' ? 'PartProperty' : usage.kind === 'port' ? 'Port' : undefined;
  if (!metaclass) return undefined;
  return {
    id,
    name: usage.name,
    metaclass,
    namespace: [],
    ownerId: usage.ownerId ?? null,
  };
}

const getRequirementContainmentParents = (repo: SysmlRepository) => {
  const parents = new Map<string, string>();
  for (const relationship of Object.values(repo.relationships)) {
    if (relationship.kind !== 'requirementContainment') continue;
    if (!repo.requirements[relationship.sourceId] || !repo.requirements[relationship.targetId]) continue;
    if (!parents.has(relationship.targetId)) parents.set(relationship.targetId, relationship.sourceId);
  }
  return parents;
};

export type SysmlExplorerAdapterHarness = {
  getState: () => SysmlGatewayState;
  executeCommand?: (cmd: SysmlEditorCommand) => SysmlCommandResult;
  execute?: (cmd: SysmlEditorCommand) => SysmlCommandResult;
  state?: SysmlGatewayState;
};

/**
 * Copied/pasted parts are Block properties (format 5): a part whose copied owner
 * already carries the property needs nothing; otherwise the property is added to
 * its copied owner, or to the existing owner Block through an update command.
 */
function appendPartPropertyCreationPlan(
  commands: SysmlMutationCommand[],
  planningRepository: SysmlRepository,
  part: PartUsage,
  copiedOwner: { kind?: string; properties?: BlockDefinition['properties'] } | undefined,
): void {
  const propertyId = part.propertyId ?? part.id;
  if (copiedOwner?.kind === 'block') {
    if (!copiedOwner.properties?.some(property => property.id === propertyId)) {
      copiedOwner.properties = [...(copiedOwner.properties ?? []), {
        id: propertyId, name: part.name, kind: part.aggregation === 'reference' ? 'reference' : 'part',
        typeId: part.typeId, multiplicity: part.multiplicity,
      }];
    }
    return;
  }
  const command = buildCreatePartPropertyCommand(planningRepository, part);
  if (!command) return;
  commands.push(command);
  // Keep planning state in step with the still-atomic outer batch so multiple
  // standalone PartProperties pasted into one owner accumulate safely.
  if (command.type === 'updateElement') {
    const owner = planningRepository.definitions[command.elementId];
    if (owner?.kind === 'block' && Array.isArray(command.patch.properties)) {
      planningRepository.definitions[owner.id] = { ...owner, properties: command.patch.properties as BlockDefinition['properties'] };
    }
  }
}


function toExplorerImpact(result: SysmlCommandResult): ExplorerCommandResult['impact'] {
  const impact = result.impact;
  if (!impact) return undefined;
  const deletedIds = new Set(impact.deletedElementIds);
  const presentations = Object.entries(result.diagramPresentations ?? {}).flatMap(([diagramId, diagram]) =>
    diagram.elementIds
      .filter(elementId => deletedIds.has(elementId))
      .map(elementId => `${diagramId}:${elementId}`)
  );
  return {
    descendants: impact.deletedElementIds.filter(id =>
      !impact.requestedElementIds.includes(id) && !impact.removedRelationshipIds.includes(id)
    ),
    relationships: impact.removedRelationshipIds,
    presentations,
    invalidated: [...impact.unresolvedUsageIds, ...impact.invalidatedEvidenceIds],
  };
}

function toExplorerResult(result: SysmlCommandResult, selectedIds?: string[]): ExplorerCommandResult {
  const diagnostics: ExplorerDiagnostic[] = (result.diagnostics || []).map(d => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    semanticId: d.elementId,
  }));
  const impact = toExplorerImpact(result);
  return {
    committed: result.committed,
    revision: result.repository.revision,
    diagnostics,
    selectedIds: result.committed ? selectedIds : undefined,
    impact,
    impactHash: result.impact ? computeImpactHash(result.impact) : undefined,
  };
}

export function createSysmlExplorerAdapter(harness: SysmlExplorerAdapterHarness): ModelExplorerAdapter {
  const getState = (): SysmlGatewayState => {
    if (typeof harness.getState === 'function') {
      return harness.getState();
    }
    if (harness.state) {
      return harness.state;
    }
    throw new Error('SysmlExplorerAdapter: Harness must provide getState() or .state');
  };

  const dispatchCommand = (cmd: SysmlEditorCommand): SysmlCommandResult => {
    const currentState = getState();
    const execFn = harness.executeCommand ?? harness.execute;
    if (typeof execFn === 'function') {
      return execFn(cmd);
    }
    const result = executeSysmlCommand(currentState, cmd);
    if (harness.state && result.committed) {
      harness.state = {
        repository: result.repository,
        history: result.history,
        store: result.store,
        patchHistory: result.patchHistory,
        coordinates: result.coordinates,
        diagramPresentations: result.diagramPresentations,
        presentationHistory: result.presentationHistory,
        actionStack: result.actionStack,
        redoStack: result.redoStack,
      };
    }
    return result;
  };

  /** Runs a pure interaction plan; a refused plan never reaches the gateway. */
  const runInteractionPlan = (plan: InteractionCommandPlan, selectedIds?: string[]): ExplorerCommandResult => {
    if (!plan.ok) {
      return {
        committed: false,
        revision: getState().repository.revision,
        diagnostics: plan.diagnostics.map(d => ({ code: d.code, severity: 'error' as const, message: d.message })),
      };
    }
    return toExplorerResult(dispatchCommand(plan.command as SysmlEditorCommand), selectedIds);
  };

  const getElementById = (id: string, repo: SysmlRepository) => {
    if (id === 'model' || id === '') {
      return repo.packages.model ?? { id: 'model', name: 'Model', kind: 'package' as const, ownerId: '' };
    }
    return (
      repo.packages[id] ??
      repo.diagrams[id] ??
      repo.definitions[id] ??
      repo.usages[id] ??
      repo.requirements[id] ??
      repo.verificationCases[id] ??
      repo.useCases?.[id] ??
      repo.connectors[id] ??
      repo.relationships[id] ??
      // Format 5: a part is a Block property, found by its property id.
      resolvePartLike(repo, id)
    );
  };
  const getSysmlDescendants = (id: string, repo: SysmlRepository): any[] => {
    const descendants: any[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const curId = queue.shift()!;
      for (const pkg of Object.values(repo.packages)) {
        if (pkg.ownerId === curId) {
          descendants.push(pkg);
          queue.push(pkg.id);
        }
      }
      for (const def of Object.values(repo.definitions)) {
        if (def.ownerId === curId) {
          descendants.push(def);
          queue.push(def.id);
        }
      }
      for (const usage of Object.values(repo.usages)) {
        if (usage.ownerId === curId) {
          descendants.push(usage);
          queue.push(usage.id);
        }
      }
      for (const req of Object.values(repo.requirements)) {
        if (req.ownerId === curId) {
          descendants.push(req);
          queue.push(req.id);
        }
      }
      for (const vc of Object.values(repo.verificationCases)) {
        if (vc.ownerId === curId) {
          descendants.push(vc);
          queue.push(vc.id);
        }
      }
      for (const useCase of Object.values(repo.useCases ?? {})) {
        if (useCase.ownerId === curId) {
          descendants.push(useCase);
          queue.push(useCase.id);
        }
      }
      for (const diag of Object.values(repo.diagrams)) {
        if (diag.ownerId === curId) {
          descendants.push(diag);
        }
      }
    }
    return descendants;
  };

  return {
    domain: 'sysml',

    getRevision(): number {
      return getState().repository.revision;
    },

    project(view: ExplorerView, contextId?: string): ModelTreeProjection {
      const state = getState();
      const repo = state.repository;
      const nodes: Record<string, ModelTreeNode> = {};
      const roots: string[] = [];

      // 1. Root package (Model)
      const modelNodeId = 'sysml:element:model';
      roots.push(modelNodeId);
      nodes[modelNodeId] = {
        nodeId: modelNodeId,
        semanticId: 'model',
        domain: 'sysml',
        kind: 'model',
        label: repo.packages.model?.name?.trim() || 'Model',
        parentNodeId: null,
        childNodeIds: [],
        hasChildren: false,
      };

      // Helper to register node
      const registerNode = (node: ModelTreeNode) => {
        nodes[node.nodeId] = node;
        if (node.parentNodeId && nodes[node.parentNodeId]) {
          const parent = nodes[node.parentNodeId];
          if (!parent.childNodeIds.includes(node.nodeId)) {
            parent.childNodeIds.push(node.nodeId);
            parent.hasChildren = true;
          }
        }
      };

      // 2. Packages (excluding root model)
      for (const pkg of Object.values(repo.packages)) {
        if (pkg.id === 'model') continue;
        const parentId = pkg.ownerId && repo.packages[pkg.ownerId] ? `sysml:element:${pkg.ownerId}` : modelNodeId;
        registerNode({
          nodeId: `sysml:element:${pkg.id}`,
          semanticId: pkg.id,
          domain: 'sysml',
          kind: 'package',
          label: sysmlObjectLabel(pkg, 'Package'),
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // 3. Definitions (Blocks, ValueTypes, Interfaces)
      const linkedPartPropertyIds = linkedPropertyIds(repo);
      for (const def of Object.values(repo.definitions)) {
        const parentOwnerId = def.ownerId || 'model';
        const parentId = nodes[`sysml:element:${parentOwnerId}`] ? `sysml:element:${parentOwnerId}` : modelNodeId;
        const defNodeId = `sysml:element:${def.id}`;

        registerNode({
          nodeId: defNodeId,
          semanticId: def.id,
          domain: 'sysml',
          kind: def.kind,
          label: sysmlObjectLabel(def, 'Definition'),
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });

        if (def.kind === 'interaction') {
          // Nested content sits under its Interaction (not moved, copied or related from the tree);
          // rename and delete go through the interaction command builders.
          const group = (key: string, label: string) => {
            const nodeId = `sysml:group:${def.id}:${key}`;
            registerNode({ nodeId, semanticId: def.id, domain: 'sysml', kind: 'group', label, parentNodeId: defNodeId, childNodeIds: [], hasChildren: true });
            return nodeId;
          };
          const leaf = (parent: string, id: string, kind: string, label: string, secondaryLabel?: string) => registerNode({
            nodeId: `sysml:element:${id}`, semanticId: id, domain: 'sysml', kind, label, secondaryLabel,
            parentNodeId: parent, childNodeIds: [], hasChildren: false, readOnly: true, ownerSemanticId: def.id,
          });
          const lifelines = def.lifelines ?? [];
          if (lifelines.length > 0) {
            const parent = group('lifelines', 'Lifelines');
            for (const lifeline of lifelines) {
              const block = lifelineBlock(repo, lifeline);
              leaf(parent, lifeline.id, 'lifeline', lifeline.name?.trim() || (block ? sysmlObjectLabel(block, 'Block') : 'Lifeline'),
                block && lifeline.name?.trim() ? `: ${sysmlObjectLabel(block, 'Block')}` : undefined);
            }
          }
          const messages = orderedMessages(def);
          if (messages.length > 0) {
            const parent = group('messages', 'Messages');
            messages.forEach((message, index) => leaf(parent, message.id, 'message', `${index + 1}: ${messageLabel(message)}`));
          }
          const fragments = def.fragments ?? [];
          if (fragments.length > 0) {
            const parent = group('fragments', 'Fragments');
            for (const fragment of fragments) {
              const guard = fragment.operands[0]?.guard?.trim();
              leaf(parent, fragment.id, 'fragment', guard ? `${fragment.operator} [${guard}]` : fragment.operator);
            }
          }
          const uses = def.uses ?? [];
          if (uses.length > 0) {
            const parent = group('uses', 'Ref frames');
            for (const use of uses) leaf(parent, use.id, 'interactionUse', `ref ${sysmlObjectLabel(repo.definitions[use.refersToId], 'Interaction')}`);
          }
          const constraints = def.constraints ?? [];
          if (constraints.length > 0) {
            const parent = group('constraints', 'Constraints');
            for (const constraint of constraints) {
              leaf(parent, constraint.id, 'interactionConstraint', constraint.kind === 'duration' ? 'Duration constraint' : 'Time constraint', constraint.expression.trim() ? `{${constraint.expression.trim()}}` : undefined);
            }
          }
          const invariants = def.stateInvariants ?? [];
          if (invariants.length > 0) {
            const parent = group('invariants', 'State invariants');
            for (const invariant of invariants) {
              const lifeline = lifelines.find(candidate => candidate.id === invariant.lifelineId);
              leaf(parent, invariant.id, 'stateInvariant', 'State invariant', lifeline ? `on ${lifeline.name?.trim() || 'lifeline'}` : undefined);
            }
          }
        }

        // If it's a block, add feature branches
        if (def.kind === 'block') {
          // Parts group
          // Format 5: a part is only a Block property. Part properties that no PartUsage
          // record represents are listed here (and not again under Properties).
          const linkedProperties = linkedPartPropertyIds;
          const derivedPartProperties = (def.properties ?? []).filter(property => isPartProperty(repo, property) && !linkedProperties.has(property.id));
          const derivedPartIds = new Set(derivedPartProperties.map(property => property.id));
          const parts = [
            ...Object.values(repo.usages).filter((u): u is PartUsage => u.kind === 'part' && u.ownerId === def.id),
            ...derivedPartProperties.map(property => occurrenceFreePart(def.id, property)),
          ];
          if (parts.length > 0) {
            const partsGroupId = `sysml:group:${def.id}:parts`;
            registerNode({
              nodeId: partsGroupId,
              semanticId: def.id,
              domain: 'sysml',
              kind: 'group',
              label: 'Parts',
              parentNodeId: defNodeId,
              childNodeIds: [],
              hasChildren: true,
            });
            for (const part of parts) {
              registerNode({
                nodeId: `sysml:element:${part.id}`,
                semanticId: part.id,
                domain: 'sysml',
                kind: 'part',
                label: sysmlObjectLabel(part, 'Part'),
                secondaryLabel: part.typeId ? `: ${resolveSysmlReferenceLabel(repo, part.typeId, 'Type')}` : undefined,
                badges: part.typeId && !hasSysmlReference(repo, part.typeId)
                  ? [{ kind: 'warning', label: 'Unresolved type' }] : undefined,
                parentNodeId: partsGroupId,
                childNodeIds: [],
                hasChildren: false,
              });
            }
          }

          // Ports group
          const ports = def.ports ?? [];
          if (ports.length > 0) {
            const portsGroupId = `sysml:group:${def.id}:ports`;
            registerNode({
              nodeId: portsGroupId,
              semanticId: def.id,
              domain: 'sysml',
              kind: 'group',
              label: 'Ports',
              parentNodeId: defNodeId,
              childNodeIds: [],
              hasChildren: true,
            });
            for (const port of ports) {
              registerNode({
                nodeId: `sysml:element:${port.id}`,
                semanticId: port.id,
                domain: 'sysml',
                kind: port.kind === 'proxy'
                  ? 'proxyPort'
                  : port.kind === 'full'
                    ? 'fullPort'
                    : port.kind === 'flow'
                      ? 'flowPort'
                      : 'port',
                label: sysmlObjectLabel(port, 'Port'),
                secondaryLabel: `${port.typeId ? `: ${resolveSysmlReferenceLabel(repo, port.typeId, 'Type')}` : ''}${port.direction ? ` · ${port.direction}` : ''}` || undefined,
                badges: port.typeId && !hasSysmlReference(repo, port.typeId)
                  ? [{ kind: 'warning', label: 'Unresolved type' }] : undefined,
                parentNodeId: portsGroupId,
                childNodeIds: [],
                hasChildren: false,
              });
            }
          }

          // Properties group
          const props = (def.properties ?? []).filter(property => !derivedPartIds.has(property.id));
          if (props.length > 0) {
            const propsGroupId = `sysml:group:${def.id}:properties`;
            registerNode({
              nodeId: propsGroupId,
              semanticId: def.id,
              domain: 'sysml',
              kind: 'group',
              label: 'Properties',
              parentNodeId: defNodeId,
              childNodeIds: [],
              hasChildren: true,
            });
            for (const prop of props) {
              registerNode({
                nodeId: `sysml:element:${prop.id}`,
                semanticId: prop.id,
                domain: 'sysml',
                kind: 'valueProperty',
                label: sysmlObjectLabel(prop, 'Property'),
                secondaryLabel: prop.typeId ? `: ${resolveSysmlReferenceLabel(repo, prop.typeId, 'Type')}` : undefined,
                badges: prop.typeId && !hasSysmlReference(repo, prop.typeId)
                  ? [{ kind: 'warning', label: 'Unresolved type' }] : undefined,
                parentNodeId: propsGroupId,
                childNodeIds: [],
                hasChildren: false,
              });
            }
          }
        }
      }

      // 4. Requirements
      const requirementParents = getRequirementContainmentParents(repo);
      for (const req of Object.values(repo.requirements)) {
        const parentOwnerId = requirementParents.get(req.id) ?? req.ownerId ?? 'model';
        const parentId = nodes[`sysml:element:${parentOwnerId}`] ? `sysml:element:${parentOwnerId}` : modelNodeId;
        registerNode({
          nodeId: `sysml:element:${req.id}`,
          semanticId: req.id,
          domain: 'sysml',
          kind: 'requirement',
          label: sysmlObjectLabel(req, 'Requirement'),
          secondaryLabel: req.requirementId ? `[${req.requirementId}]` : undefined,
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // 5. Verification Cases
      for (const vc of Object.values(repo.verificationCases)) {
        const parentOwnerId = vc.ownerId || 'model';
        const parentId = nodes[`sysml:element:${parentOwnerId}`] ? `sysml:element:${parentOwnerId}` : modelNodeId;
        registerNode({
          nodeId: `sysml:element:${vc.id}`,
          semanticId: vc.id,
          domain: 'sysml',
          kind: 'testCase',
          label: sysmlObjectLabel(vc, 'VerificationCase'),
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // 6. Use Cases
      for (const useCase of Object.values(repo.useCases ?? {})) {
        const parentOwnerId = useCase.ownerId || 'model';
        const parentId = nodes[`sysml:element:${parentOwnerId}`] ? `sysml:element:${parentOwnerId}` : modelNodeId;
        registerNode({
          nodeId: `sysml:element:${useCase.id}`,
          semanticId: useCase.id,
          domain: 'sysml',
          kind: 'useCase',
          label: sysmlObjectLabel(useCase, 'UseCase'),
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // 7. Diagrams
      for (const diag of Object.values(repo.diagrams ?? {})) {
        const parentOwnerId = diag.ownerId || 'model';
        const parentId = nodes[`sysml:element:${parentOwnerId}`] ? `sysml:element:${parentOwnerId}` : modelNodeId;
        registerNode({
          nodeId: `sysml:element:${diag.id}`,
          semanticId: diag.id,
          domain: 'sysml',
          kind: 'diagram',
          label: sysmlObjectLabel(diag, 'Diagram'),
          secondaryLabel: `[${diag.diagramKind.toUpperCase()}]`,
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // 8. Relationships retain semantic identity and follow an existing structural owner.
      for (const relationship of Object.values(repo.relationships ?? {})) {
        const ownerId = (relationship as { ownerId?: string }).ownerId;
        const parentId = ownerId && nodes[`sysml:element:${ownerId}`]
          ? `sysml:element:${ownerId}` : modelNodeId;
        registerNode({
          nodeId: `sysml:element:${relationship.id}`,
          semanticId: relationship.id,
          domain: 'sysml',
          kind: relationship.kind,
          label: sysmlObjectLabel(relationship, 'Relationship'),
          secondaryLabel: `${resolveSysmlReferenceLabel(repo, relationship.sourceId)} -> ${resolveSysmlReferenceLabel(repo, relationship.targetId)}`,
          badges: !hasSysmlReference(repo, relationship.sourceId) || !hasSysmlReference(repo, relationship.targetId)
            ? [{ kind: 'warning', label: 'Unresolved endpoint' }] : undefined,
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // Rebuild links after registration so containment is independent of object insertion order.
      for (const node of Object.values(nodes)) {
        node.childNodeIds = [];
        node.hasChildren = false;
      }
      for (const node of Object.values(nodes)) {
        if (!node.parentNodeId) continue;
        const parent = nodes[node.parentNodeId];
        if (parent && !parent.childNodeIds.includes(node.nodeId)) {
          parent.childNodeIds.push(node.nodeId);
          parent.hasChildren = true;
        }
      }

      // If diagramContext view, filter or focus on presented element IDs
      if (view === 'diagramContext' && contextId && state.diagramPresentations?.[contextId]) {
        const presented = new Set(state.diagramPresentations[contextId].elementIds);
        const filteredRoots: string[] = [];
        for (const [nodeId, node] of Object.entries(nodes)) {
          if (presented.has(node.semanticId)) {
            filteredRoots.push(nodeId);
          }
        }
        return {
          roots: filteredRoots.length > 0 ? filteredRoots : roots,
          nodes,
          revision: repo.revision,
        };
      }

      return {
        roots,
        nodes,
        revision: repo.revision,
      };
    },

    capabilities(
      elementIds: readonly string[],
      activeDiagramId?: string,
      options?: { includeAllTypes?: boolean }
    ): ExplorerCapability[] {
      const state = getState();
      const repo = state.repository;
      const caps: ExplorerCapability[] = [];

      if (elementIds.length === 0) {
        return caps;
      }

      if (elementIds.length === 1) {
        const id = elementIds[0];
        // A lifeline, message, fragment, ref frame or state invariant: only rename (not ref frames or
        // invariants, which have no name) and delete.
        const nested = findInteractionElement(repo, id);
        if (nested) {
          const nameable = nested.elementKind === 'lifeline' || nested.elementKind === 'message';
          return [
            ...(nameable ? [{ id: 'rename', kind: 'rename' as const, label: 'Rename', enabled: true }] : []),
            { id: 'delete', kind: 'delete' as const, label: 'Delete from Model', enabled: true },
          ];
        }
        const el = getElementById(id, repo);
        const kind = el?.kind ?? (id === 'model' ? 'model' : 'unknown');

        // Resolve semantic owner
        const ownerMetaclass = explorerKindToMetaclass(kind);
        const canonicalRepo = migrateV3ToV4(repo);
        const ownerSemanticElement: SemanticElement | null =
          canonicalRepo.elements[id] ??
          (id === 'model' || id === ''
            ? null
            : {
                id,
                name: el?.name ?? 'Element',
                metaclass: ownerMetaclass,
                namespace: el?.namespace ?? [],
                ownerId: el?.ownerId ?? null,
              });

        // 1. Canonical backend element and feature capabilities
        const backendCaps = getOwnedElementCapabilities(
          ownerSemanticElement,
          canonicalRepo
        );

        for (const cap of backendCaps) {
          const executable = isExplorerKindExecutable(cap.metaclass);
          if (cap.allowed && executable) {
            caps.push({
              id: `create:${cap.metaclass}`,
              kind: cap.category === 'feature' ? 'createOwnedFeature' : 'createElement',
              label: cap.label,
              enabled: true,
              elementKind: cap.metaclass,
              capabilityGroup: cap.category === 'feature' ? 'feature' : 'child',
              authority: cap.authority,
              catalogVisibility: 'direct',
            });
          } else if (options?.includeAllTypes) {
            caps.push({
              id: `create:${cap.metaclass}`,
              kind: cap.category === 'feature' ? 'createOwnedFeature' : 'createElement',
              label: cap.label,
              enabled: false,
              elementKind: cap.metaclass,
              diagnosticCode: executable ? (cap.diagnosticCode ?? 'ILLEGAL_OWNERSHIP') : 'UNSUPPORTED_ELEMENT_KIND',
              reason: executable ? cap.reason : `${cap.label} is not yet writable through this repository adapter.`,
              capabilityGroup: 'allTypes',
              authority: cap.authority,
              catalogVisibility: 'allTypes',
            });
          }
        }

        // 2. Convenience explorer children mappings
        const allowedChildren = SYSML_CHILDREN[kind] ?? [];
        for (const childKind of allowedChildren) {
          if (isExplorerKindExecutable(childKind) && !caps.some((c) => c.elementKind === childKind)) {
            caps.push({
              id: `create:${childKind}`,
              kind: 'createElement',
              label: getElementKindLabel(childKind),
              enabled: true,
              elementKind: childKind,
              capabilityGroup: 'child',
            });
          }
        }

        // Create diagram capabilities
        const allowedDiagrams = SYSML_DIAGRAM_KINDS[kind] ?? [];
        for (const diagKind of allowedDiagrams) {
          caps.push({
            id: `createDiagram:${diagKind}`,
            kind: 'createDiagram',
            label: getDiagramKindLabel(diagKind),
            enabled: true,
            elementKind: diagKind,
          });
        }

        // Create relationship capabilities
        const allowedRelationships = SYSML_RELATIONSHIPS[kind] ?? [];
        for (const relKind of allowedRelationships) {
          caps.push({
            id: `rel:${relKind}:outgoing`,
            kind: 'createRelationship',
            label: getRelationshipKindLabel(relKind),
            enabled: true,
            relationshipKind: relKind,
            direction: 'outgoing',
          });
          caps.push({
            id: `rel:${relKind}:incoming`,
            kind: 'createRelationship',
            label: `Incoming ${getRelationshipKindLabel(relKind)}`,
            enabled: true,
            relationshipKind: relKind,
            direction: 'incoming',
          });
        }

        // Standard tree actions
        const isRoot = id === 'model' || id === '';
        caps.push({
          id: 'rename',
          kind: 'rename',
          label: 'Rename',
          enabled: !isRoot,
        });
        caps.push({
          id: 'move',
          kind: 'move',
          label: 'Move',
          enabled: !isRoot,
        });
        caps.push({
          id: 'delete',
          kind: 'delete',
          label: 'Delete from Model',
          enabled: !isRoot,
        });
        caps.push({
          id: 'copy',
          kind: 'copy',
          label: 'Copy',
          enabled: !isRoot,
        });
        caps.push({
          id: 'paste',
          kind: 'paste',
          label: 'Paste',
          enabled: true,
        });
        caps.push({
          id: 'duplicate',
          kind: 'duplicate',
          label: 'Duplicate',
          enabled: !isRoot,
        });

        // Diagram presentation capabilities
        if (activeDiagramId) {
          const presentation = state.diagramPresentations?.[activeDiagramId];
          const diagramKind = repo.diagrams[activeDiagramId]?.diagramKind
            ?? (activeDiagramId === 'bdd' || activeDiagramId === 'requirements' || activeDiagramId === 'rtm' || activeDiagramId === 'ibd' ? activeDiagramId : undefined);
          const representedId = (String(kind) === 'part' && ['bdd', 'requirements', 'rtm'].includes(diagramKind ?? ''))
            ? el?.ownerId ?? id
            : id;
          const alreadyPresented = presentation ? presentation.elementIds.includes(representedId) : false;
          const unsupportedPackageView = kind === 'package' && !['bdd', 'requirements', 'package'].includes(diagramKind ?? '');
          const unsupportedPackageElement = diagramKind === 'package'
            && !repo.packages[id] && !repo.definitions[id]
            && !repo.requirements[id] && !repo.verificationCases[id]
            // Diagram shortcut symbols navigate to other diagrams.
            && !(repo.diagrams[id] && id !== activeDiagramId);
          if (kind === 'package' && diagramKind === 'package') {
            for (const [mode, label] of [
              ['direct', 'Show Contents'],
              ['packages', 'Show Packages'],
              ['recursive', 'Show Contents Recursively'],
            ] as const) {
              caps.push({ id: `showPackageContents:${mode}`, kind: 'showPackageContents', label,
                enabled: true, elementKind: mode, capabilityGroup: 'edit', authority: 'CAMEO_TOOLING' });
            }
          }
          caps.push({
            id: 'addToDiagram',
            kind: 'addToDiagram',
            label: 'Add to Diagram',
            enabled: !alreadyPresented && !isRoot && !unsupportedPackageView && !unsupportedPackageElement,
            reason: unsupportedPackageElement
              ? 'This element has no Package Diagram presentation.'
              : unsupportedPackageView
              ? 'Package symbols are supported on Block Definition, Requirement, and Package diagrams.'
              : alreadyPresented ? 'Element is already presented on the active diagram' : undefined,
          });
          if (alreadyPresented && !isRoot && representedId === id) {
            caps.push({
              id: 'removeFromDiagram',
              kind: 'removeFromDiagram',
              label: 'Remove from Diagram',
              enabled: true,
            });
          }
        }

        return caps;
      }

      // Multi-selection capabilities
      caps.push({
        id: 'move',
        kind: 'move',
        label: 'Move',
        enabled: !elementIds.includes('model'),
      });
      caps.push({
        id: 'delete',
        kind: 'delete',
        label: 'Delete from Model',
        enabled: !elementIds.includes('model'),
      });
      caps.push({
        id: 'copy',
        kind: 'copy',
        label: 'Copy',
        enabled: !elementIds.includes('model'),
      });
      caps.push({
        id: 'paste',
        kind: 'paste',
        label: 'Paste',
        enabled: elementIds.length === 1,
      });

      if (activeDiagramId) {
        const presentation = state.diagramPresentations?.[activeDiagramId];
        const diagramElements = new Set(presentation?.elementIds ?? []);
        const canAddAny = elementIds.some(id => !diagramElements.has(id) && id !== 'model');
        caps.push({
          id: 'addToDiagram',
          kind: 'addToDiagram',
          label: 'Add to Diagram',
          enabled: canAddAny,
        });
        const canRemoveAny = elementIds.some(id => diagramElements.has(id));
        if (canRemoveAny) {
          caps.push({
            id: 'removeFromDiagram',
            kind: 'removeFromDiagram',
            label: 'Remove from Diagram',
            enabled: true,
          });
        }
      }

      return caps;
    },

    preflight(command: ModelExplorerCommand): ExplorerCommandResult {
      const state = getState();
      const repo = state.repository;
      const diagnostics: ExplorerDiagnostic[] = [];

      switch (command.type) {
        case 'createElement': {
          if (!isExplorerKindExecutable(command.elementKind)) {
            diagnostics.push({
              code: 'UNSUPPORTED_ELEMENT_KIND',
              severity: 'error',
              message: `Kind '${command.elementKind}' is not writable through this repository adapter.`,
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          const owner = getElementById(command.ownerId, repo);
          if (!owner && command.ownerId !== 'model' && command.ownerId !== '') {
            diagnostics.push({
              code: 'OWNER_NOT_FOUND',
              severity: 'error',
              message: `Owner element '${command.ownerId}' does not exist.`,
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }

          const targetMetaclass = explorerKindToMetaclass(command.elementKind);
          const canonicalRepo = migrateV3ToV4(repo);
          const ownerSemanticElement: SemanticElement | null =
            canonicalRepo.elements[command.ownerId] ??
            (command.ownerId === 'model' || command.ownerId === ''
              ? null
              : {
                  id: command.ownerId,
                  name: owner?.name ?? 'Element',
                  metaclass: explorerKindToMetaclass(owner?.kind ?? 'Package'),
                  namespace: owner?.namespace ?? [],
                  ownerId: owner?.ownerId ?? null,
                });

          const decision = evaluateOwnership(ownerSemanticElement, targetMetaclass);
          if (!decision.allowed) {
            diagnostics.push({
              code: decision.code ?? 'ILLEGAL_OWNERSHIP',
              severity: 'error',
              message: decision.message ?? `Kind '${command.elementKind}' is not allowed under '${owner?.kind ?? command.ownerId}'.`,
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }

          const requestedKind = canonicalKindToExplorerKind(command.elementKind);
          const propertyKind = ['part', 'sharedPart', 'reference', 'valueProperty'].includes(requestedKind)
            ? requestedKind === 'reference' ? 'reference' : requestedKind === 'valueProperty' ? 'value' : 'part'
            : undefined;
          const portKind = ({ proxyPort: 'proxyPort', fullPort: 'fullPort', flowPort: 'flowPort' } as Record<string, CanonicalPortKind>)[requestedKind];
          const plan = propertyKind
            ? buildCreateOwnedPropertyCommand(repo, { ownerBlockId: command.ownerId, propertyKind, typeId: command.typeId, name: command.name })
            : portKind
              ? buildCreateOwnedPortCommand(repo, { ownerBlockId: command.ownerId, portKind, typeId: command.typeId, name: command.name })
              : null;
          if (plan && !plan.ok) {
            const needsSelection = !command.typeId && plan.diagnostics.some(item => item.code === 'TYPE_NOT_FOUND');
            const typeSelection: TypeSelectionPayload | undefined =
              needsSelection && plan.action
                ? { candidates: plan.candidates ?? [], action: plan.action }
                : undefined;
            return {
              committed: false,
              revision: repo.revision,
              diagnostics: plan.diagnostics.map(item => ({ ...item, severity: 'error' as const })),
              ...(typeSelection ? { typeSelection } : {}),
            };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'createDiagram': {
          const owner = getElementById(command.ownerId, repo);
          if (!owner && command.ownerId !== 'model' && command.ownerId !== '') {
            diagnostics.push({
              code: 'OWNER_NOT_FOUND',
              severity: 'error',
              message: `Owner '${command.ownerId}' does not exist.`,
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'rename': {
          if (!command.name || command.name.trim() === '') {
            diagnostics.push({
              code: 'EMPTY_NAME',
              severity: 'error',
              message: 'Name cannot be empty.',
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'move': {
          if (command.elementIds.includes(command.targetOwnerId)) {
            diagnostics.push({
              code: 'SELF_OWNERSHIP_CYCLE',
              severity: 'error',
              message: 'Cannot move an element into itself.',
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'delete': {
          return {
            committed: false,
            revision: repo.revision,
            diagnostics: [],
            impact: {
              descendants: [],
              relationships: [],
              presentations: [],
              invalidated: [],
            },
          };
        }

        case 'addToDiagram': {
          const diagramKind = repo.diagrams[command.diagramId]?.diagramKind
            ?? (command.diagramId === 'bdd' || command.diagramId === 'requirements' || command.diagramId === 'rtm' || command.diagramId === 'ibd' ? command.diagramId : undefined);
          const unsupportedPackageId = command.elementIds.find(id => Boolean(repo.packages[id]) && !['bdd', 'requirements', 'package'].includes(diagramKind ?? ''));
          if (unsupportedPackageId) {
            diagnostics.push({
              code: 'INVALID_DIAGRAM_ELEMENT', severity: 'error',
              message: 'Package symbols are supported on Block Definition, Requirement, and Package diagrams.',
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          if (diagramKind === 'package') {
            const unrenderableId = command.elementIds.find(id => !repo.packages[id]
              && !repo.definitions[id] && !repo.requirements[id] && !repo.verificationCases[id]
              && !(repo.diagrams[id] && id !== command.diagramId));
            if (unrenderableId) {
              diagnostics.push({ code: 'INVALID_DIAGRAM_ELEMENT', severity: 'error',
                message: `Element '${unrenderableId}' has no Package Diagram presentation.` });
              return { committed: false, revision: repo.revision, diagnostics };
            }
          }
          const presentation = state.diagramPresentations?.[command.diagramId];
          if (presentation) {
            const alreadyPresent = command.elementIds.filter(id => presentation.elementIds.includes(id));
            if (alreadyPresent.length === command.elementIds.length) {
              diagnostics.push({
                code: 'PRESENTATION_ALREADY_EXISTS',
                severity: 'error',
                message: 'All specified elements are already presented on the diagram.',
              });
              return { committed: false, revision: repo.revision, diagnostics };
            }
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'showPackageContents': {
          if (repo.diagrams[command.diagramId]?.diagramKind !== 'package') {
            diagnostics.push({ code: 'INVALID_DIAGRAM', severity: 'error', message: 'Show Contents requires a Package Diagram.' });
          } else if (!repo.packages[command.packageId]) {
            diagnostics.push({ code: 'ELEMENT_NOT_FOUND', severity: 'error', message: `Package '${command.packageId}' does not exist.` });
          }
          return { committed: false, revision: repo.revision, diagnostics };
        }

        case 'duplicate': {
          if (command.elementIds.includes(command.targetOwnerId)) {
            diagnostics.push({
              code: 'SELF_OWNERSHIP_CYCLE',
              severity: 'error',
              message: 'Cannot duplicate an element into itself.',
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'copy': {
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'removeFromDiagram': {
          const presentation = state.diagramPresentations?.[command.diagramId];
          if (!presentation) {
            diagnostics.push({
              code: 'DIAGRAM_NOT_FOUND',
              severity: 'error',
              message: `Diagram '${command.diagramId}' not found.`,
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        case 'paste': {
          if (command.payload.domain !== 'sysml') {
            diagnostics.push({
              code: 'CROSS_DOMAIN_PASTE',
              severity: 'error',
              message: 'Cannot paste state machine elements into a SysML model.',
            });
            return { committed: false, revision: repo.revision, diagnostics };
          }
          return { committed: false, revision: repo.revision, diagnostics: [] };
        }

        default:
          return { committed: false, revision: repo.revision, diagnostics: [] };
      }
    },

    execute(command: ModelExplorerCommand): ExplorerCommandResult {
      const pre = this.preflight(command);
      if (pre.typeSelection || pre.diagnostics.some(d => d.severity === 'error')) {
        return pre;
      }

      const state = getState();
      const repo = state.repository;

      switch (command.type) {
        case 'createElement': {
          const ownerId = command.ownerId || 'model';
          const requestedKind = canonicalKindToExplorerKind(command.elementKind);
          const existingNames = [
            ...Object.values(repo.packages).map(x => x.name),
            ...Object.values(repo.definitions).map(x => x.name),
            ...Object.values(repo.requirements).map(x => x.name),
            ...Object.values(repo.verificationCases).map(x => x.name),
            ...Object.values(repo.useCases ?? {}).map(x => x.name),
            ...Object.values(repo.usages).map(x => x.name),
            ...derivedDepthOneParts(repo).map(x => x.name),
          ];

          if (requestedKind === 'package') {
            const pkg = createPackage({ name: command.name, ownerId, existingNames });
            const result = dispatchCommand({ type: 'createElement', element: pkg });
            return toExplorerResult(result, [pkg.id]);
          }

          if (requestedKind === 'block') {
            const blk = createBlock({ name: command.name, ownerId, existingNames });
            const result = dispatchCommand({ type: 'createElement', element: blk });
            return toExplorerResult(result, [blk.id]);
          }

          if (requestedKind === 'valueType') {
            const vt = createValueType({ name: command.name, ownerId, existingNames });
            const result = dispatchCommand({ type: 'createElement', element: vt });
            return toExplorerResult(result, [vt.id]);
          }

          if (requestedKind === 'enumeration') {
            const enumeration = createEnumeration({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: enumeration }), [enumeration.id]);
          }

          if (requestedKind === 'signal') {
            const signal = createSignal({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: signal }), [signal.id]);
          }

          if (requestedKind === 'unit') {
            const unit = createUnit({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: unit }), [unit.id]);
          }

          if (requestedKind === 'quantityKind') {
            const quantityKind = createQuantityKind({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: quantityKind }), [quantityKind.id]);
          }

          if (requestedKind === 'view') {
            const view = createView({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: view }), [view.id]);
          }

          if (requestedKind === 'viewpoint') {
            const viewpoint = createViewpoint({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: viewpoint }), [viewpoint.id]);
          }

          if (requestedKind === 'stakeholder') {
            const stakeholder = createStakeholder({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: stakeholder }), [stakeholder.id]);
          }

          if (requestedKind === 'activity') {
            const activity = createActivity({ name: command.name, ownerId, existingNames });
            // A classifier-owned Activity (behavior) is qualified by its owning Block.
            const ownerBlock = repo.definitions[ownerId];
            if (ownerBlock) activity.namespace = [...ownerBlock.namespace, ownerBlock.name];
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: activity }), [activity.id]);
          }

          if (requestedKind === 'interaction') {
            const interaction = createInteraction({ name: command.name, ownerId, existingNames });
            // A classifier-owned Interaction (behavior) is qualified by its owning Block.
            const ownerBlock = repo.definitions[ownerId];
            if (ownerBlock) interaction.namespace = [...ownerBlock.namespace, ownerBlock.name];
            // A scenario of a Use Case is qualified by that use case.
            const ownerUseCase = repo.useCases?.[ownerId];
            if (ownerUseCase) interaction.namespace = [...(ownerUseCase.namespace ?? []), ownerUseCase.name];
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: interaction }), [interaction.id]);
          }

          if (requestedKind === 'constraintBlock') {
            const constraintBlock = createConstraintBlock({ name: command.name, ownerId, existingNames });
            return toExplorerResult(dispatchCommand({ type: 'createElement', element: constraintBlock }), [constraintBlock.id]);
          }

          if (requestedKind === 'interface') {
            const iface = createInterface({ name: command.name, ownerId, existingNames });
            const result = dispatchCommand({ type: 'createElement', element: iface });
            return toExplorerResult(result, [iface.id]);
          }

          if (requestedKind === 'requirement') {
            const req = createRequirement({ name: command.name, ownerId, existingNames });
            const result = dispatchCommand({ type: 'createElement', element: req });
            return toExplorerResult(result, [req.id]);
          }

          if (requestedKind === 'verificationCase' || requestedKind === 'testCase') {
            const vc = createVerificationCase({ name: command.name, ownerId, existingNames });
            const result = dispatchCommand({ type: 'createElement', element: vc });
            return toExplorerResult(result, [vc.id]);
          }

          if (requestedKind === 'useCase') {
            const useCase = createUseCase({ name: command.name, ownerId });
            const result = dispatchCommand({ type: 'createElement', element: useCase });
            return {
              committed: result.committed,
              revision: result.repository.revision,
              diagnostics: result.committed ? [] : result.diagnostics.map(diagnostic => ({
                code: diagnostic.code,
                severity: 'error' as const,
                message: diagnostic.message,
              })),
              selectedIds: result.committed ? [useCase.id] : undefined,
            };
          }

          if (['part', 'reference', 'sharedPart'].includes(requestedKind)) {
            const propKind: 'part' | 'reference' = requestedKind === 'reference' ? 'reference' : 'part';
            const typeId = command.typeId;
            const plan = buildCreateOwnedPropertyCommand(repo, {
              ownerBlockId: ownerId,
              propertyKind: propKind,
              typeId,
              name: command.name,
            });
            if (!plan.ok || !plan.command) {
              return {
                committed: false,
                revision: repo.revision,
                diagnostics: plan.diagnostics.map(d => ({
                  code: d.code,
                  severity: 'error' as const,
                  message: d.message,
                })),
              };
            }
            const result = dispatchCommand(plan.command as SysmlEditorCommand);
            const updatedBlock = result.repository.definitions[ownerId] as BlockDefinition | undefined;
            const createdProp = updatedBlock?.properties?.[(updatedBlock.properties?.length ?? 1) - 1];
            return toExplorerResult(result, createdProp ? [createdProp.id] : []);
          }

          if (['port', 'fullPort', 'proxyPort', 'flowPort'].includes(requestedKind)) {
            const block = repo.definitions[ownerId];
            if (block && block.kind === 'block') {
              const portKindMap: Record<string, CanonicalPortKind> = {
                port: 'umlPort',
                proxyPort: 'proxyPort',
                fullPort: 'fullPort',
                flowPort: 'flowPort',
              };
              const canonicalPortKind = portKindMap[requestedKind] ?? 'umlPort';
              const typeId = command.typeId;

              const plan = buildCreateOwnedPortCommand(repo, {
                ownerBlockId: ownerId,
                portKind: canonicalPortKind,
                name: command.name,
                typeId,
              });

              if (!plan.ok || !plan.command) {
                return {
                  committed: false,
                  revision: repo.revision,
                  diagnostics: plan.diagnostics.map(d => ({
                    code: d.code,
                    severity: 'error' as const,
                    message: d.message,
                  })),
                };
              }

              const result = dispatchCommand(plan.command as SysmlEditorCommand);
              const updatedBlock = result.repository.definitions[ownerId] as BlockDefinition | undefined;
              const createdPort = updatedBlock?.ports?.[(updatedBlock.ports?.length ?? 1) - 1];
              return toExplorerResult(result, createdPort ? [createdPort.id] : []);
            }
          }

          if (requestedKind === 'valueProperty' || requestedKind === 'value') {
            const typeId = command.typeId;
            const plan = buildCreateOwnedPropertyCommand(repo, {
              ownerBlockId: ownerId,
              propertyKind: 'value',
              typeId,
              name: command.name,
            });
            if (!plan.ok || !plan.command) {
              return {
                committed: false,
                revision: repo.revision,
                diagnostics: plan.diagnostics.map(d => ({
                  code: d.code,
                  severity: 'error' as const,
                  message: d.message,
                })),
              };
            }
            const result = dispatchCommand(plan.command as SysmlEditorCommand);
            const updatedBlock = result.repository.definitions[ownerId] as BlockDefinition | undefined;
            const createdProp = updatedBlock?.properties?.[(updatedBlock.properties?.length ?? 1) - 1];
            return toExplorerResult(result, createdProp ? [createdProp.id] : []);
          }

          if (requestedKind === 'flowProperty' || requestedKind === 'flow') {
            const typeId = command.typeId;
            const plan = buildCreateOwnedPropertyCommand(repo, {
              ownerBlockId: ownerId,
              propertyKind: 'flow',
              typeId,
              name: command.name,
            });
            if (!plan.ok || !plan.command) {
              return {
                committed: false,
                revision: repo.revision,
                diagnostics: plan.diagnostics.map(d => ({
                  code: d.code,
                  severity: 'error' as const,
                  message: d.message,
                })),
              };
            }
            const result = dispatchCommand(plan.command as SysmlEditorCommand);
            const updatedBlock = result.repository.definitions[ownerId] as BlockDefinition | undefined;
            const createdProp = updatedBlock?.properties?.[(updatedBlock.properties?.length ?? 1) - 1];
            return toExplorerResult(result, createdProp ? [createdProp.id] : []);
          }

          return {
            committed: false,
            revision: repo.revision,
            diagnostics: [{ code: 'UNSUPPORTED_ELEMENT_KIND', severity: 'error', message: `Cannot create ${command.elementKind}` }],
          };
        }

        case 'createDiagram': {
          // A Sequence Diagram is always owned by an Interaction. Asking for one
          // on a Block creates the Interaction (lifelines = the Block's parts)
          // and the diagram together, as one undo step.
          if (command.diagramKind === 'sequence' && repo.definitions[command.ownerId]?.kind === 'block') {
            const plan = buildCreateInteractionFromContextCommand(repo, { blockId: command.ownerId, name: command.name });
            if (!plan.ok) {
              return { committed: false, revision: repo.revision, diagnostics: plan.diagnostics.map(d => ({ code: d.code, severity: 'error' as const, message: d.message })) };
            }
            const created = dispatchCommand(plan.command as SysmlEditorCommand);
            return toExplorerResult(created, [plan.createdIds[1]]);
          }
          const diag = createDiagramDefinition({
            name: command.name,
            ownerId: command.ownerId,
            diagramKind: command.diagramKind as any,
            contextElementId: command.contextElementId,
          });
          const result = dispatchCommand({ type: 'createDiagram', diagram: diag });
          return toExplorerResult(result, [diag.id]);
        }

        case 'rename': {
          const nested = findInteractionElement(repo, command.elementId);
          if (nested) {
            return runInteractionPlan(
              buildRenameInteractionElementCommand(repo, { interactionId: nested.interaction.id, elementId: nested.id, name: command.name }),
              [nested.id],
            );
          }
          const result = dispatchCommand({
            type: 'updateElement',
            elementId: command.elementId,
            patch: { name: command.name },
          });
          return toExplorerResult(result, [command.elementId]);
        }

        case 'move': {
          const result = dispatchCommand({
            type: 'moveElements',
            elementIds: command.elementIds,
            targetOwnerId: command.targetOwnerId,
            confirmedImpactHash: command.confirmedImpactHash,
          });
          return toExplorerResult(result, command.elementIds);
        }

        case 'delete': {
          const nestedRefs = command.elementIds.map(id => findInteractionElement(repo, id));
          if (nestedRefs.some(Boolean)) {
            // Each nested element is one command, so a refusal names what blocks it. Deleting one
            // changes the interaction, so the next plan is built from the state after the previous one.
            let last: ExplorerCommandResult | undefined;
            for (const ref of nestedRefs) {
              if (!ref) continue;
              const current = getState().repository;
              const interactionId = ref.interaction.id;
              const plan = ref.elementKind === 'lifeline' ? buildRemoveLifelineCommand(current, { interactionId, lifelineId: ref.id })
                : ref.elementKind === 'message' ? buildRemoveInteractionMessageCommand(current, { interactionId, messageId: ref.id })
                : ref.elementKind === 'fragment' ? buildRemoveFragmentCommand(current, { interactionId, fragmentId: ref.id })
                : ref.elementKind === 'use' ? buildRemoveInteractionUseCommand(current, { interactionId, useId: ref.id })
                : ref.elementKind === 'constraint' ? buildRemoveInteractionConstraintCommand(current, { interactionId, constraintId: ref.id })
                : buildRemoveStateInvariantCommand(current, { interactionId, invariantId: ref.id });
              last = runInteractionPlan(plan);
              if (!last.committed) return last;
            }
            const others = command.elementIds.filter((_, index) => !nestedRefs[index]);
            if (others.length === 0 && last) return last;
            return toExplorerResult(dispatchCommand({ type: 'deleteElements', elementIds: others, confirmedImpactHash: command.confirmedImpactHash }));
          }
          const result = dispatchCommand({
            type: 'deleteElements',
            elementIds: command.elementIds,
            confirmedImpactHash: command.confirmedImpactHash,
          });
          return toExplorerResult(result);
        }

        case 'createRelationship': {
          const rel: SysmlRelationship = buildPackageRelationship(
            generateId('rel'), command.relationshipKind as SysmlRelationship['kind'], command.sourceId, command.targetId,
          );
          const result = dispatchCommand({
            type: 'createElement',
            element: rel,
          });
          return toExplorerResult(result, [rel.id]);
        }

        case 'addToDiagram': {
          const result = dispatchCommand({
            type: 'addToDiagram',
            diagramId: command.diagramId,
            elementIds: command.elementIds,
          });
          return toExplorerResult(result, command.elementIds);
        }

        case 'showPackageContents': {
          const result = dispatchCommand(command);
          return toExplorerResult(result, [command.packageId]);
        }

        case 'removeFromDiagram': {
          const result = dispatchCommand({
            type: 'removeFromDiagram',
            diagramId: command.diagramId,
            elementIds: command.elementIds,
          });
          return toExplorerResult(result, command.elementIds);
        }

        case 'copy':
          return {
            committed: false,
            revision: repo.revision,
            diagnostics: [{ code: 'COPIED_TO_CLIPBOARD', severity: 'info', message: `Copied ${command.elementIds.length} root element(s).` }],
            clipboard: copyOwnershipForest(
              'sysml',
              command.elementIds,
              id => getElementById(id, repo),
              id => getSysmlDescendants(id, repo),
              repo.revision
            ),
          };

        case 'duplicate': {
          const existingNames = [
            ...Object.values(repo.packages).map(x => x.name),
            ...Object.values(repo.definitions).map(x => x.name),
            ...Object.values(repo.requirements).map(x => x.name),
            ...Object.values(repo.verificationCases).map(x => x.name),
            ...Object.values(repo.usages).map(x => x.name),
            ...derivedDepthOneParts(repo).map(x => x.name),
          ];
          const payload = copyOwnershipForest(
            'sysml',
            command.elementIds,
            id => getElementById(id, repo),
            id => getSysmlDescendants(id, repo),
            repo.revision
          );
          const remapped = remapClipboardPayload(payload, oldId => generateId(oldId.split('-')[0] || 'copy'));
          const commands: SysmlMutationCommand[] = [];
          const planningRepository = structuredClone(repo);
          const createdRootIds: string[] = [];

          for (const rootId of remapped.rootIds) {
            const rootSnapshot = remapped.snapshots[rootId] as any;
            if (rootSnapshot) {
              rootSnapshot.ownerId = command.targetOwnerId || 'model';
              rootSnapshot.name = generateUniqueName(rootSnapshot.name || 'Copy', existingNames);
              existingNames.push(rootSnapshot.name);
              createdRootIds.push(rootId);
            }
          }

          for (const snapshot of Object.values(remapped.snapshots)) {
            if ((snapshot as any).kind === 'diagram') {
              commands.push({ type: 'createDiagram', diagram: snapshot as any });
            } else if ((snapshot as any).kind === 'part') {
              const part = snapshot as PartUsage;
              appendPartPropertyCreationPlan(commands, planningRepository, part, remapped.snapshots[part.ownerId] as any);
            } else {
              commands.push({ type: 'createElement', element: snapshot as any });
            }
          }

          const result = dispatchCommand({ type: 'batch', commands });
          return toExplorerResult(result, createdRootIds);
        }

        case 'paste': {
          const existingNames = [
            ...Object.values(repo.packages).map(x => x.name),
            ...Object.values(repo.definitions).map(x => x.name),
            ...Object.values(repo.requirements).map(x => x.name),
            ...Object.values(repo.verificationCases).map(x => x.name),
            ...Object.values(repo.usages).map(x => x.name),
            ...derivedDepthOneParts(repo).map(x => x.name),
          ];
          const remapped = remapClipboardPayload(command.payload, oldId => generateId(oldId.split('-')[0] || 'paste'));
          const commands: SysmlMutationCommand[] = [];
          const planningRepository = structuredClone(repo);
          const createdRootIds: string[] = [];

          for (const rootId of remapped.rootIds) {
            const rootSnapshot = remapped.snapshots[rootId] as any;
            if (rootSnapshot) {
              rootSnapshot.ownerId = command.targetOwnerId || 'model';
              rootSnapshot.name = generateUniqueName(rootSnapshot.name || 'Pasted', existingNames);
              existingNames.push(rootSnapshot.name);
              createdRootIds.push(rootId);
            }
          }

          for (const snapshot of Object.values(remapped.snapshots)) {
            if ((snapshot as any).kind === 'diagram') {
              commands.push({ type: 'createDiagram', diagram: snapshot as any });
            } else if ((snapshot as any).kind === 'part') {
              const part = snapshot as PartUsage;
              appendPartPropertyCreationPlan(commands, planningRepository, part, remapped.snapshots[part.ownerId] as any);
            } else {
              commands.push({ type: 'createElement', element: snapshot as any });
            }
          }

          const result = dispatchCommand({ type: 'batch', commands });
          return toExplorerResult(result, createdRootIds);
        }

        default:
          return {
            committed: false,
            revision: repo.revision,
            diagnostics: [{ code: 'UNSUPPORTED_COMMAND', severity: 'error', message: 'Command not supported' }],
          };
      }
    },

    relationshipTargets(sourceId: string, relationshipKind: string, direction: 'incoming' | 'outgoing'): ModelTreeNode[] {
      const state = getState();
      const repo = state.repository;
      const canonicalRepo: SysmlRepositoryV4 = (repo as any).elements ? (repo as any) : migrateV3ToV4(repo);
      // Usage ids are absent from the V4 elements index; resolve them
      // alongside elements so part-usage sources offer wizard targets. The
      // resolved usage is indexed into a transient adapter-local copy because
      // endpoint validation looks both ends up in the elements map.
      const source: SemanticElement | undefined =
        canonicalRepo.elements[sourceId] ?? usageToSemanticElement(sourceId, repo.usages?.[sourceId]);
      if (!source) return [];
      const indexed: SysmlRepositoryV4 = canonicalRepo.elements[sourceId]
        ? canonicalRepo
        : { ...canonicalRepo, elements: { ...canonicalRepo.elements, [source.id]: source } };

      const legalTargets = getLegalRelationshipTargets(source, relationshipKind, direction, indexed);
      const legalTargetIds = new Set(legalTargets.map(t => t.id));

      const projection = this.project('containment');
      const candidates: ModelTreeNode[] = [];
      for (const node of Object.values(projection.nodes)) {
        if (node.semanticId && node.semanticId !== sourceId && legalTargetIds.has(node.semanticId)) {
          candidates.push(node);
        }
      }

      return candidates;
    },
  };
}
