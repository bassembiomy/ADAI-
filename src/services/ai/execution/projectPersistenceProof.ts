import * as fs from 'fs';
import * as path from 'path';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { computeModelFingerprint, sha256Hex } from '../../../engine/opm/canonicalHash';

export interface PersistedSnapshotReceipt {
  readonly filePath: string;
  readonly contentHash: string;
  readonly modelFingerprint: string;
  readonly revision: number;
  readonly savedAt: number;
  readonly sizeBytes: number;
}

export interface SaveSnapshotOptions {
  targetPath?: string;
  allowedBaseDir?: string;
}

export interface ReloadSnapshotOptions {
  allowedBaseDir?: string;
}

/**
 * Saves project snapshot to an atomic .adia file and returns a verified receipt
 * including raw file content hash and canonical model fingerprint.
 */
export async function saveProjectSnapshot(
  snapshot: ModelSnapshot,
  options: SaveSnapshotOptions = {}
): Promise<PersistedSnapshotReceipt> {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.projectSaveSnapshot) {
    return (window as any).electronAPI.projectSaveSnapshot(snapshot, options);
  }

  const modelFingerprint = computeModelFingerprint({
    nodes: snapshot.nodes,
    edges: snapshot.edges
  });

  const now = Date.now();
  const filePath = options.targetPath || path.resolve(`project_${snapshot.projectId}.adia`);

  // Path traversal protection if allowedBaseDir is specified
  if (options.allowedBaseDir) {
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(options.allowedBaseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error('PATH_TRAVERSAL_DETECTED: Target path is outside allowed project base directory');
    }
  }

  const projectPayload = {
    formatVersion: '2.0.0',
    projectId: snapshot.projectId,
    revision: snapshot.revision,
    modelFingerprint,
    xbridges: {
      nodes: snapshot.nodes,
      edges: snapshot.edges
    },
    savedAt: now
  };

  const fileContent = JSON.stringify(projectPayload, null, 2) + '\n';
  const contentHash = sha256Hex(fileContent);

  // Atomic write using temporary file and rename
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, fileContent, 'utf8');
  fs.renameSync(tempPath, filePath);

  const stats = fs.statSync(filePath);

  return {
    filePath,
    contentHash,
    modelFingerprint,
    revision: snapshot.revision,
    savedAt: now,
    sizeBytes: stats.size
  };
}

/**
 * Reloads a project snapshot from an atomic .adia file and strictly verifies
 * content hash and path safety against the provided receipt.
 */
export async function reloadProjectSnapshot(
  receipt: PersistedSnapshotReceipt,
  options: ReloadSnapshotOptions = {}
): Promise<ModelSnapshot> {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.projectReloadSnapshot) {
    return (window as any).electronAPI.projectReloadSnapshot(receipt, options);
  }

  const resolvedPath = path.resolve(receipt.filePath);

  if (options.allowedBaseDir) {
    const resolvedBase = path.resolve(options.allowedBaseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error('PATH_TRAVERSAL_DETECTED: Target path is outside allowed project base directory');
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`FILE_NOT_FOUND: Persisted file '${receipt.filePath}' does not exist.`);
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf8');
  const actualContentHash = sha256Hex(rawContent);

  if (actualContentHash !== receipt.contentHash) {
    throw new Error(
      `CONTENT_HASH_MISMATCH: Persisted project file has been corrupted or tampered on disk. Expected ${receipt.contentHash}, found ${actualContentHash}.`
    );
  }

  const data = JSON.parse(rawContent);

  const nodes = data.xbridges?.nodes || [];
  const edges = data.xbridges?.edges || [];
  const revision = Number(data.revision ?? receipt.revision);
  const projectId = String(data.projectId ?? '');

  const actualModelFingerprint = computeModelFingerprint({ nodes, edges });
  if (actualModelFingerprint !== receipt.modelFingerprint) {
    throw new Error(
      `MODEL_FINGERPRINT_MISMATCH: Read-back model fingerprint '${actualModelFingerprint}' does not match receipt '${receipt.modelFingerprint}'.`
    );
  }

  return {
    projectId,
    revision,
    nodes,
    edges,
    stateHash: actualModelFingerprint,
    timestamp: Date.now()
  };
}

/**
 * Verifies that an active live ModelSnapshot matches the persisted snapshot receipt.
 */
export function verifyPersistenceIntegrity(
  receipt: PersistedSnapshotReceipt,
  activeModel: ModelSnapshot
): boolean {
  if (receipt.revision !== activeModel.revision) return false;

  const activeFingerprint = computeModelFingerprint({
    nodes: activeModel.nodes,
    edges: activeModel.edges
  });

  return receipt.modelFingerprint === activeFingerprint;
}
