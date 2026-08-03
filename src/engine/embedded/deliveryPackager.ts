import type { EvidenceRecord, EvidenceStatus } from '../hil/hilEvidence.js';
import type { IntegrationManifest } from './integrationManifest.js';
import { createHash } from 'node:crypto';

export interface DeliveryFile {
  path: string;
  sha256: `sha256:${string}`;
  content: string;
}

export interface DeliveryPackage {
  packageHash: `sha256:${string}`;
  files: DeliveryFile[];
  gateResult: ReleaseGateResult;
}

export type ReleaseGateResult =
  | { status: 'RELEASE_READY' }
  | { status: 'BLOCKED'; reason: string };

export function evaluateReleaseGate(
  evidenceChain: readonly EvidenceRecord[],
  manifest: IntegrationManifest,
): ReleaseGateResult {
  if (manifest.stubs.length > 0 || manifest.flashBlocked) {
    return { status: 'BLOCKED', reason: 'GENERATED_WITH_STUBS' };
  }

  const presentStatuses = new Set(evidenceChain.map(e => e.status));
  const requiredStatuses: EvidenceStatus[] = [
    'LINKED_IMAGE_VERIFIED',
    'FLASH_VERIFIED',
    'SELF_TEST_VERIFIED',
    'EXTERNAL_HIL_VERIFIED',
  ];

  for (const req of requiredStatuses) {
    if (!presentStatuses.has(req)) {
      return { status: 'BLOCKED', reason: `MISSING_${req}` };
    }
  }

  return { status: 'RELEASE_READY' };
}

function sha256Content(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

export function packageDelivery(
  project: { files: Array<{ path: string; content: string }> },
  artifacts: Record<string, { path: string; content: string }>,
  evidenceChain: readonly EvidenceRecord[],
): DeliveryPackage {
  const files: DeliveryFile[] = [];

  for (const f of project.files) {
    files.push({
      path: f.path,
      sha256: sha256Content(f.content),
      content: f.content,
    });
  }

  for (const [key, art] of Object.entries(artifacts)) {
    files.push({
      path: art.path,
      sha256: sha256Content(art.content),
      content: art.content,
    });
  }

  const evidenceJson = `${JSON.stringify(evidenceChain, null, 2)}\n`;
  files.push({
    path: 'evidence/evidence_chain.json',
    sha256: sha256Content(evidenceJson),
    content: evidenceJson,
  });

  const docs = [
    { path: 'docs/integration.md', content: '# MCU Firmware Integration Guide\n' },
    { path: 'docs/wiring.md', content: '# Target Wiring Diagram\n' },
    { path: 'docs/recovery.md', content: '# Probe Recovery & Bootloader Notes\n' },
  ];

  for (const d of docs) {
    files.push({
      path: d.path,
      sha256: sha256Content(d.content),
      content: d.content,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const packageHash: `sha256:${string}` = `sha256:${createHash('sha256').update(canonicalJson(files), 'utf8').digest('hex')}`;

  const manifest = (project as any).manifest || { stubs: [], flashBlocked: false };
  const gateResult = evaluateReleaseGate(evidenceChain, manifest);

  return {
    packageHash,
    files,
    gateResult,
  };
}
