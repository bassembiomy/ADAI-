/**
 * Project persistence and ZIP export/import utilities for OPM diagrams and C artifacts.
 *
 * Task 8 contract: execution config plus optional verification metadata
 * ({fingerprint, verifiedAt, toolchainVersion, status}) is persisted, C
 * artifacts are regenerated after load, and a persisted `verified` status is
 * NEVER trusted — the model fingerprint is always recomputed on import and
 * the bundle must be re-verified before export gating re-opens.
 */

import JSZip from 'jszip';
import type { OpmExecutionConfig } from './executableTypes';
import type { OpmDiagnostic } from './executableTypes';
import { compileExecutableOpm } from './pipeline';
import { generateOpmCArtifacts, type OpmManifest } from './cGenerator';
import type { GeneratedOpmFile } from './cGeneratorTypes';

export type OpmPersistedVerificationStatus = 'verified' | 'failed';

export interface OpmVerificationMetadata {
  fingerprint: string;
  verifiedAt: string;
  toolchainVersion: string;
  status: OpmPersistedVerificationStatus;
}

export interface OpmProjectPayload {
  projectName?: string;
  entropyNodes: any[];
  entropyEdges: any[];
  entropyExecutionConfig?: OpmExecutionConfig;
  opmVerification?: OpmVerificationMetadata;
  [key: string]: any;
}

/** Result of resolving persisted verification metadata after a load. */
export interface OpmReloadedVerification {
  /** Always false: persisted verification is never trusted without re-verify. */
  trusted: false;
  /** `stale` when metadata was persisted (re-verify required); else `unverified`. */
  status: 'unverified' | 'stale';
  recomputedFingerprint: string | null;
  persistedFingerprint: string | null;
  fingerprintsMatch: boolean;
  /** Freshly regenerated artifacts from the loaded model (never the archive copy). */
  files: GeneratedOpmFile[];
  manifest: OpmManifest | null;
  diagnostics: OpmDiagnostic[];
}

export async function exportProjectZip(payload: OpmProjectPayload): Promise<Uint8Array> {
  const zip = new JSZip();

  // Save main model files (execution config + optional verification metadata)
  const entropyData = {
    nodes: payload.entropyNodes || [],
    edges: payload.entropyEdges || [],
    executionConfig: payload.entropyExecutionConfig,
    opmVerification: payload.opmVerification,
  };
  zip.file('entropy.json', JSON.stringify(entropyData, null, 2));
  zip.file('adia_project_unified.json', JSON.stringify(payload, null, 2));

  // If the diagram compiles to an executable model, include C artifacts
  if (payload.entropyNodes && payload.entropyNodes.length > 0) {
    const compRes = compileExecutableOpm(
      payload.entropyNodes,
      payload.entropyEdges || [],
      payload.entropyExecutionConfig,
    );
    if (compRes.model) {
      const { files } = generateOpmCArtifacts(compRes.model);
      const cFolder = zip.folder('c_artifacts');
      if (cFolder) {
        for (const f of files) {
          cFolder.file(f.name, f.content);
        }
      }
    }
  }

  return await zip.generateAsync({ type: 'uint8array' });
}

export async function importProjectZip(zipInput: Uint8Array | ArrayBuffer | Blob): Promise<OpmProjectPayload> {
  // NEVER trust a persisted `verified` flag from the archive: the caller must
  // run resolvePersistedVerification() to recompute the model fingerprint and
  // regenerate artifacts (Task 8). The metadata is carried through only so the
  // UI can report it as stale.
  const zip = await JSZip.loadAsync(zipInput);

  // Read adia_project_unified.json first if available
  const unifiedFile = zip.file('adia_project_unified.json');
  if (unifiedFile) {
    const text = await unifiedFile.async('string');
    return JSON.parse(text);
  }

  // Fallback to entropy.json
  const entropyFile = zip.file('entropy.json');
  if (entropyFile) {
    const text = await entropyFile.async('string');
    const parsed = JSON.parse(text);
    return {
      entropyNodes: parsed.nodes || [],
      entropyEdges: parsed.edges || [],
      entropyExecutionConfig: parsed.executionConfig,
      ...(parsed.opmVerification ? { opmVerification: parsed.opmVerification } : {}),
    };
  }

  return {
    entropyNodes: [],
    entropyEdges: [],
  };
}

/**
 * Recompute the model fingerprint after load, regenerate artifacts from the
 * loaded model, and downgrade any persisted verification to stale/unverified.
 * The returned `trusted` flag is always false: export gating must require a
 * fresh in-session verification even when fingerprints match.
 */
export function resolvePersistedVerification(
  nodes: any[],
  edges: any[],
  executionConfig: OpmExecutionConfig | undefined,
  persisted?: OpmVerificationMetadata,
): OpmReloadedVerification {
  let recomputedFingerprint: string | null = null;
  let files: GeneratedOpmFile[] = [];
  let manifest: OpmManifest | null = null;
  let diagnostics: OpmDiagnostic[] = [];
  try {
    const compRes = compileExecutableOpm(nodes, edges, executionConfig);
    diagnostics = compRes.diagnostics;
    if (compRes.model) {
      recomputedFingerprint = compRes.model.fingerprint;
      const generated = generateOpmCArtifacts(compRes.model);
      files = generated.files;
      manifest = generated.manifest;
    }
  } catch (err) {
    diagnostics = [
      {
        code: 'OPM_INTERNAL_ERROR',
        severity: 'error',
        message: err instanceof Error ? err.message : String(err),
        source: { elementId: 'canvas', propertyPath: 'internal' },
      },
    ];
  }

  const persistedFingerprint = persisted?.fingerprint ?? null;
  const fingerprintsMatch =
    persistedFingerprint !== null &&
    recomputedFingerprint !== null &&
    persistedFingerprint === recomputedFingerprint;

  return {
    trusted: false,
    status: persisted ? 'stale' : 'unverified',
    recomputedFingerprint,
    persistedFingerprint,
    fingerprintsMatch,
    files,
    manifest,
    diagnostics,
  };
}

export function takeProjectSnapshot(state: Record<string, any>): string {
  const { timestamp: _timestamp, ...stable } = state;
  return JSON.stringify(stable);
}

export function detectSnapshotDiff(s1: string, s2: string): { changed: boolean } {
  return { changed: s1 !== s2 };
}

