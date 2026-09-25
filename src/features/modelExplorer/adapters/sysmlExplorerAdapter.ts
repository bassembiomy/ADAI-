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
import type { SysmlRepositoryV4 } from '../../../engine/sysml/domain';
import {
  SYSML_CHILDREN,
  SYSML_RELATIONSHIPS,
  SYSML_DIAGRAM_KINDS,
  getElementKindLabel,
  getRelationshipKindLabel,
  getDiagramKindLabel,
} from '../modelExplorerCapabilities';

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
    case 'Requirement': return 'requirement';
    case 'TestCase': return 'testCase';
    case 'VerificationCase': return 'verificationCase';
    case 'UseCase': return 'useCase';
    case 'Activity': return 'activity';
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
  'requirement',
  'testCase',
  'verificationCase',
  'useCase',
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
  createInterface,
  createRequirement,
  createVerificationCase,
  createUseCase,
  createPartUsage,
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
import type {
  SysmlRepository,
  SysmlRelationship,
  PartUsage,
} from '../../../engine/sysml/model';

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
      repo.relationships[id]
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
        label: repo.packages.model?.name ?? 'Model',
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
          label: pkg.name,
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });
      }

      // 3. Definitions (Blocks, ValueTypes, Interfaces)
      for (const def of Object.values(repo.definitions)) {
        const parentOwnerId = def.ownerId || 'model';
        const parentId = nodes[`sysml:element:${parentOwnerId}`] ? `sysml:element:${parentOwnerId}` : modelNodeId;
        const defNodeId = `sysml:element:${def.id}`;

        registerNode({
          nodeId: defNodeId,
          semanticId: def.id,
          domain: 'sysml',
          kind: def.kind,
          label: def.name,
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: false,
        });

        // If it's a block, add feature branches
        if (def.kind === 'block') {
          // Parts group
          const parts = Object.values(repo.usages).filter((u): u is PartUsage => u.kind === 'part' && u.ownerId === def.id);
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
                label: part.name,
                secondaryLabel: part.typeId ? `: ${repo.definitions[part.typeId]?.name ?? part.typeId}` : undefined,
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
              const portNameIsUuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(port.name) || port.name === port.id;
              const portOrdinal = ports.findIndex(candidate => candidate.id === port.id) + 1;
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
                label: portNameIsUuid ? `Port ${portOrdinal}` : port.name,
                secondaryLabel: `${port.typeId ? `: ${repo.definitions[port.typeId]?.name ?? port.typeId}` : ''}${port.direction ? ` · ${port.direction}` : ''}${portNameIsUuid ? ` · ID ${port.id}` : ''}` || undefined,
                parentNodeId: portsGroupId,
                childNodeIds: [],
                hasChildren: false,
              });
            }
          }

          // Properties group
          const props = def.properties ?? [];
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
                label: prop.name,
                secondaryLabel: prop.typeId ? `: ${prop.typeId}` : undefined,
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
          label: req.name,
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
          label: vc.name,
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
          label: useCase.name,
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
          label: diag.name,
          secondaryLabel: `[${diag.diagramKind.toUpperCase()}]`,
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
          const alreadyPresented = presentation ? presentation.elementIds.includes(id) : false;
          caps.push({
            id: 'addToDiagram',
            kind: 'addToDiagram',
            label: 'Add to Diagram',
            enabled: !alreadyPresented && !isRoot,
            reason: alreadyPresented ? 'Element is already presented on the active diagram' : undefined,
          });
          if (alreadyPresented && !isRoot) {
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

          // Part type check: must have a valid block definition
          if (['part', 'reference', 'sharedPart'].includes(command.elementKind)) {
            const blockDefs = Object.values(repo.definitions).filter(d => d.kind === 'block');
            if (blockDefs.length === 0) {
              diagnostics.push({
                code: 'PART_TYPE_REQUIRED',
                severity: 'error',
                message: 'A valid block type is required to instantiate a part.',
              });
              return { committed: false, revision: repo.revision, diagnostics };
            }
          }

          if (canonicalKindToExplorerKind(command.elementKind) === 'proxyPort') {
            const interfaceType = Object.values(repo.definitions).find(definition => definition.kind === 'interface');
            if (!interfaceType) {
              diagnostics.push({
                code: 'TYPE_NOT_FOUND',
                severity: 'error',
                message: 'Proxy Port requires an existing Interface Block type. Create an Interface Block explicitly, then retry.',
              });
              return { committed: false, revision: repo.revision, diagnostics };
            }
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
      if (pre.diagnostics.some(d => d.severity === 'error')) {
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
            const blockDefs = Object.values(repo.definitions).filter(d => d.kind === 'block');
            const typeBlock = blockDefs.find(b => b.id !== ownerId) ?? blockDefs[0];
            if (!typeBlock) {
              return {
                committed: false,
                revision: repo.revision,
                diagnostics: [{ code: 'PART_TYPE_REQUIRED', severity: 'error', message: 'A valid block type is required.' }],
              };
            }
            const agg = requestedKind === 'reference' ? 'reference' : requestedKind === 'sharedPart' ? 'shared' : 'composite';
            const part = createPartUsage({
              name: command.name,
              ownerId,
              typeId: typeBlock.id,
              aggregation: agg,
              existingNames,
            });
            const result = dispatchCommand({ type: 'createElement', element: part });
            return toExplorerResult(result, [part.id]);
          }

          if (['port', 'fullPort', 'proxyPort', 'flowPort'].includes(requestedKind)) {
            const block = repo.definitions[ownerId];
            if (block && block.kind === 'block') {
              const interfaceType = Object.values(repo.definitions).find(definition => definition.kind === 'interface');
              if (requestedKind === 'proxyPort' && !interfaceType) {
                return {
                  committed: false,
                  revision: repo.revision,
                  diagnostics: [{
                    code: 'TYPE_NOT_FOUND',
                    severity: 'error',
                    message: 'Proxy Port requires an existing Interface Block type. Create an Interface Block explicitly, then retry.',
                  }],
                };
              }
              const port = createPortDefinition({
                name: command.name,
                kind: requestedKind === 'proxyPort'
                  ? 'proxy'
                  : requestedKind === 'fullPort'
                    ? 'full'
                    : requestedKind === 'flowPort'
                      ? 'flow'
                      : 'standard',
                typeId: requestedKind === 'proxyPort' ? interfaceType?.id : undefined,
                existingNames: (block.ports ?? []).map(p => p.name),
              });
              const nextPorts = [...(block.ports ?? []), port];
              const result = dispatchCommand({
                type: 'updateElement',
                elementId: ownerId,
                patch: { ports: nextPorts },
              });
              return toExplorerResult(result, [port.id]);
            }
          }

          if (requestedKind === 'valueProperty') {
            const block = repo.definitions[ownerId];
            if (block && block.kind === 'block') {
              const prop = createValueProperty({
                name: command.name,
                existingNames: (block.properties ?? []).map(p => p.name),
              });
              const nextProps = [...(block.properties ?? []), prop];
              const result = dispatchCommand({
                type: 'updateElement',
                elementId: ownerId,
                patch: { properties: nextProps },
              });
              return toExplorerResult(result, [prop.id]);
            }
          }

          return {
            committed: false,
            revision: repo.revision,
            diagnostics: [{ code: 'UNSUPPORTED_ELEMENT_KIND', severity: 'error', message: `Cannot create ${command.elementKind}` }],
          };
        }

        case 'createDiagram': {
          const diag = createDiagramDefinition({
            name: command.name,
            ownerId: command.ownerId,
            diagramKind: command.diagramKind as any,
          });
          const result = dispatchCommand({ type: 'createDiagram', diagram: diag });
          return toExplorerResult(result, [diag.id]);
        }

        case 'rename': {
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
          const result = dispatchCommand({
            type: 'deleteElements',
            elementIds: command.elementIds,
            confirmedImpactHash: command.confirmedImpactHash,
          });
          return toExplorerResult(result);
        }

        case 'createRelationship': {
          const rel: SysmlRelationship = {
            id: generateId('rel'),
            kind: command.relationshipKind as any,
            sourceId: command.sourceId,
            targetId: command.targetId,
          };
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
          ];
          const remapped = remapClipboardPayload(command.payload, oldId => generateId(oldId.split('-')[0] || 'paste'));
          const commands: SysmlMutationCommand[] = [];
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
      const source = canonicalRepo.elements[sourceId];
      if (!source) return [];

      const legalTargets = getLegalRelationshipTargets(source, relationshipKind, direction, canonicalRepo);
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
