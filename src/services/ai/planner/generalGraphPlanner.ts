/**
 * src/services/ai/planner/generalGraphPlanner.ts
 *
 * General X-Bridges planner. Planning authority lives in the catalog-driven
 * graphSynthesizer; this module adapts resolved engineering requests to it
 * and handles modify-style deltas against the active snapshot. Hardcoded
 * canonical_* archetypes no longer own execution behavior.
 */
import {
  EngineeringModelPlanV2,
  LogicalBlock,
  LogicalConnection,
  StructuredDiagnostic,
  XbridgesAction,
} from '../contracts/engineeringModel';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { GeneralEngineeringRequest } from './generalIntent';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';
import { synthesizeGraph, GRAPH_SYNTHESIZER_VERSION } from './graphSynthesizer';

export interface PatternReference {
  patternId: string;
  version: string;
  sourceUri?: string;
  license?: string;
  fingerprint?: string;
}

export interface EngineeringPattern {
  id: string;
  name: string;
  domain?: string;
  category?: string;
  description?: string;
  requiredCapabilities?: string[];
  requiredBlocks?: string[];
  targetBehaviors?: string[];
  templateGraph?: unknown;
  topology?: unknown;
  provenance?: PatternReference;
  qualityScore?: number;
}

export interface PlanningContext {
  projectId: string;
  baseRevision: number;
  activeSnapshot: ModelSnapshot;
  catalog: XbridgesCapabilityIndex;
  patterns: EngineeringPattern[];
  knowledgeHash?: string;
}

export interface PlanningOutcome {
  status: 'planned' | 'refused';
  plan?: EngineeringModelPlanV2;
  diagnostics: StructuredDiagnostic[];
  provenance: PatternReference[];
}

function modifyPlan(
  request: GeneralEngineeringRequest,
  context: PlanningContext,
  diagnostics: StructuredDiagnostic[]
): PlanningOutcome {
  const { activeSnapshot, catalog, projectId, baseRevision } = context;

  // Determine target block: explicit name from request inputs or objective.
  const text = `${request.objective} ${request.rawPrompt || ''}`.toLowerCase();
  const candidates = activeSnapshot.nodes.filter(n => {
    const type = String(n.data?.type ?? n.type).toLowerCase();
    const label = String(n.data?.label || n.data?.instanceName || '').toLowerCase();
    return text.includes(type) || (label && text.includes(label));
  });

  if (candidates.length === 0) {
    diagnostics.push({
      category: 'ENGINEERING',
      code: 'MISSING_MAPPING',
      severity: 'ERROR',
      message: 'Modify refused: no block in the active model matches the request. Nothing will be guessed or invented.',
    });
    return { status: 'refused', diagnostics, provenance: [] };
  }

  const target = candidates[0];
  const blockId = String(target.data?.blockId || target.id);
  const blockType = String(target.data?.type ?? target.type);
  const cap = catalog.blocks.get(blockType);

  // Find the parameter to change: quantity names matched against catalog params.
  let paramName: string | undefined;
  let value: unknown;
  for (const q of request.inputs) {
    if (q.name === 'block_mentions') continue;
    const num = typeof q.value === 'number' ? q.value : Number(String(q.value).match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
    if (!Number.isFinite(num)) continue;
    if (cap) {
      const match = Object.keys(cap.parameters).find(p => p.toLowerCase() === q.name.toLowerCase());
      if (match) {
        paramName = match;
        value = num;
        break;
      }
    }
  }
  if (!paramName && cap && cap.parameterNames.length > 0) {
    // Objective may contain 'gain parameter to 5' style phrasing.
    for (const p of cap.parameterNames) {
      if (text.includes(p.toLowerCase())) {
        const m = text.match(new RegExp(`${p.toLowerCase()}[^-0-9]*(-?\\d+(?:\\.\\d+)?)`, 'i'));
        if (m) {
          paramName = p;
          value = Number(m[1]);
          break;
        }
      }
    }
  }

  if (!paramName) {
    diagnostics.push({
      category: 'ENGINEERING',
      code: 'MISSING_REQUIREMENT',
      severity: 'ERROR',
      message: `Modify refused: no known parameter on '${blockType}' matches the requested change.`,
    });
    return { status: 'refused', diagnostics, provenance: [] };
  }

  const action: XbridgesAction = {
    id: `act_param_${blockId}_${paramName}`,
    kind: 'set_parameter',
    blockId,
    parameterName: paramName,
    value,
  };

  const planPayload = {
    schemaVersion: '2.0.0' as const,
    planId: `plan_${projectId}_rev${baseRevision}_modify`,
    projectId,
    baseRevision,
    catalogFingerprint: catalog.catalogFingerprint,
    expectedBeforeHash: activeSnapshot.stateHash,
    expectedAfterDelta: {
      addedBlocks: [] as string[],
      removedBlocks: [] as string[],
      modifiedBlocks: [blockId],
      addedConnections: [] as Array<{ from: string; to: string }>,
      removedConnections: [] as Array<{ from: string; to: string }>,
    },
    actions: [action],
    blocks: [] as LogicalBlock[],
    connections: [] as LogicalConnection[],
    synthesizer: {
      version: GRAPH_SYNTHESIZER_VERSION,
      knowledgeHash: context.knowledgeHash ?? 'none',
      requestHash: sha256Hex(canonicalJson(request)),
    },
  };

  const plan: EngineeringModelPlanV2 = {
    ...planPayload,
    planHash: sha256Hex(canonicalJson(planPayload)),
  };

  return { status: 'planned', plan, diagnostics: [], provenance: [] };
}

export function planGeneralXbridgesModel(
  request: GeneralEngineeringRequest,
  context: PlanningContext
): PlanningOutcome {
  const diagnostics: StructuredDiagnostic[] = [];

  if (request.intent === 'modify') {
    return modifyPlan(request, context, diagnostics);
  }

  if (request.intent === 'repair' || request.intent === 'optimize') {
    diagnostics.push({
      category: 'ENGINEERING',
      code: 'UNSUPPORTED_VIA_PLANNER',
      severity: 'ERROR',
      message: `Intent '${request.intent}' requires the dedicated expert service (diagnosis/repair/optimization), not blind graph synthesis.`,
    });
    return { status: 'refused', diagnostics, provenance: [] };
  }

  const result = synthesizeGraph({
    request,
    snapshot: context.activeSnapshot,
    catalog: context.catalog,
    patterns: context.patterns,
    knowledgeHash: context.knowledgeHash,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
  });

  return {
    status: result.status,
    plan: result.plan,
    diagnostics: result.diagnostics,
    provenance: result.provenance,
  };
}
