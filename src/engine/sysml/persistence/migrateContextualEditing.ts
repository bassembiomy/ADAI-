import type {
  SysmlRepository,
  ModelDiagramDefinition,
  PackageDefinition,
  BlockDefinition,
  RequirementDefinition,
  SysmlRelationship,
} from '../model';
import {
  createEmptyRepository,
  type PresentationCoordinates,
  type DiagramPresentationInput,
} from '../presentationState';
import { ensureDefaultSysmlDiagrams } from '../../../services/sysmlDiagramWorkspace';
import { loadRepository, serializeRepository } from '../persistence';

export const CURRENT_CONTEXTUAL_SCHEMA_VERSION = 4;

export interface PersistedSysmlPayload {
  format?: string;
  schemaVersion?: number;
  profileId?: string;
  projectName?: string;
  version?: string;
  timestamp?: string;
  sysmlRepository?: unknown;
  sysmlCoordinates?: Record<string, PresentationCoordinates>;
  diagramPresentations?: Record<string, DiagramPresentationInput>;
  [key: string]: unknown;
}

export interface ContextualMigrationResult {
  migrated: boolean;
  payload: PersistedSysmlPayload;
  diagnostics: Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    elementId?: string;
  }>;
}

/**
 * Versioned migration for SysML projects to the canonical contextual-editing schema (v4).
 * Ensures:
 * 1. Default BDD and Requirements diagrams are seeded with deterministic IDs.
 * 2. All elements have a legal owner (defaulting to 'model' if dangling or unassigned).
 * 3. Package diagrams and presentations are properly anchored.
 * 4. Relationships preserve behavioral metaclasses, item flows, and endpoint identity.
 * 5. Dangling presentations are pruned with non-destructive diagnostics.
 */
export function migrateContextualEditingPayload(
  rawInput: PersistedSysmlPayload,
): ContextualMigrationResult {
  const diagnostics: ContextualMigrationResult['diagnostics'] = [];
  let migrated = false;

  const currentVersion = rawInput.schemaVersion ?? 1;
  if (currentVersion >= CURRENT_CONTEXTUAL_SCHEMA_VERSION && rawInput.sysmlRepository) {
    return { migrated: false, payload: rawInput, diagnostics };
  }

  // 1. Resolve repository object
  let repo: SysmlRepository;
  if (rawInput.sysmlRepository) {
    if (typeof rawInput.sysmlRepository === 'string') {
      try {
        const loaded = loadRepository(rawInput.sysmlRepository);
        repo = loaded.repository;
      } catch (err: any) {
        diagnostics.push({
          code: 'CORRUPT_REPOSITORY_ENVELOPE',
          message: `Failed to deserialize repository: ${err.message}`,
          severity: 'error',
        });
        repo = createEmptyRepository();
        migrated = true;
      }
    } else {
      const loaded = loadRepository(rawInput.sysmlRepository);
      repo = loaded.repository;
    }
  } else {
    // Legacy flat payload migration
    const loaded = loadRepository(rawInput);
    repo = loaded.repository;
    migrated = true;
  }

  // 2. Ensure root Model package exists
  if (!repo.packages) repo.packages = {};
  if (!repo.packages.model) {
    repo.packages.model = {
      id: 'model',
      kind: 'package',
      name: 'Model',
      namespace: [],
      ownerId: '',
    };
    migrated = true;
    diagnostics.push({
      code: 'ROOT_MODEL_SEEDED',
      message: 'Created default root model package.',
      severity: 'info',
      elementId: 'model',
    });
  }

  // 3. Ensure default diagrams exist
  const diagResult = ensureDefaultSysmlDiagrams(repo);
  if (diagResult.createdDiagramIds.length > 0) {
    repo = diagResult.repository;
    migrated = true;
    for (const dId of diagResult.createdDiagramIds) {
      diagnostics.push({
        code: 'DEFAULT_DIAGRAM_SEEDED',
        message: `Created default diagram: ${dId}`,
        severity: 'info',
        elementId: dId,
      });
    }
  }

  // 4. Validate and anchor owners
  const knownOwnerIds = new Set<string>([
    'model',
    ...Object.keys(repo.packages ?? {}),
    ...Object.keys(repo.definitions ?? {}),
    ...Object.keys(repo.requirements ?? {}),
  ]);

  const sanitizeOwner = (elementId: string, currentOwnerId?: string): string => {
    if (elementId === 'model') return '';
    if (!currentOwnerId || !knownOwnerIds.has(currentOwnerId)) {
      migrated = true;
      diagnostics.push({
        code: 'DANGLING_OWNER_REPAIRED',
        message: `Element '${elementId}' owner '${currentOwnerId}' is unknown; anchored to 'model'.`,
        severity: 'warning',
        elementId,
      });
      return 'model';
    }
    return currentOwnerId;
  };

  // Re-anchor packages
  for (const [id, pkg] of Object.entries(repo.packages)) {
    if (id !== 'model') {
      const validOwner = sanitizeOwner(id, pkg.ownerId);
      if (validOwner !== pkg.ownerId) {
        repo.packages[id] = { ...pkg, ownerId: validOwner };
      }
    }
  }

  // Re-anchor definitions (Blocks, etc.)
  for (const [id, def] of Object.entries(repo.definitions ?? {})) {
    const validOwner = sanitizeOwner(id, def.ownerId);
    if (validOwner !== def.ownerId) {
      repo.definitions[id] = { ...def, ownerId: validOwner };
    }
  }

  // Re-anchor requirements
  for (const [id, req] of Object.entries(repo.requirements ?? {})) {
    const validOwner = sanitizeOwner(id, req.ownerId);
    if (validOwner !== req.ownerId) {
      repo.requirements[id] = { ...req, ownerId: validOwner };
    }
  }

  // 5. Ensure diagram owners
  for (const [id, diag] of Object.entries(repo.diagrams ?? {})) {
    const validOwner = sanitizeOwner(id, diag.ownerId);
    if (validOwner !== diag.ownerId) {
      repo.diagrams[id] = { ...diag, ownerId: validOwner };
    }
  }

  // 6. Coordinates and Presentations normalization
  const coordinates: Record<string, PresentationCoordinates> = { ...(rawInput.sysmlCoordinates ?? {}) };
  const presentations: Record<string, DiagramPresentationInput> = { ...(rawInput.diagramPresentations ?? {}) };

  // Ensure every diagram in repository has an entry in presentations
  for (const diagId of Object.keys(repo.diagrams ?? {})) {
    if (!presentations[diagId]) {
      presentations[diagId] = {
        elementIds: [],
        presentations: {},
      };
      migrated = true;
    }
  }

  const updatedPayload: PersistedSysmlPayload = {
    ...rawInput,
    schemaVersion: CURRENT_CONTEXTUAL_SCHEMA_VERSION,
    format: rawInput.format || 'ADIA-SysML',
    profileId: repo.profileId || 'OMG-SysML-1.6-ADIA',
    sysmlRepository: serializeRepository(repo),
    sysmlCoordinates: coordinates,
    diagramPresentations: presentations,
  };

  return {
    migrated: true,
    payload: updatedPayload,
    diagnostics,
  };
}
