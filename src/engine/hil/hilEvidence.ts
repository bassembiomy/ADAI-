import { createHash } from 'node:crypto';

export type EvidenceStatus =
  | 'STATIC_ANALYSIS_ONLY'
  | 'TARGET_COMPILE_VERIFIED'
  | 'LINKED_IMAGE_VERIFIED'
  | 'FLASH_VERIFIED'
  | 'SELF_TEST_VERIFIED'
  | 'EXTERNAL_HIL_VERIFIED'
  | 'RELEASE_READY';

export const EVIDENCE_PROGRESSION: readonly EvidenceStatus[] = Object.freeze([
  'STATIC_ANALYSIS_ONLY',
  'TARGET_COMPILE_VERIFIED',
  'LINKED_IMAGE_VERIFIED',
  'FLASH_VERIFIED',
  'SELF_TEST_VERIFIED',
  'EXTERNAL_HIL_VERIFIED',
  'RELEASE_READY',
]);

export interface EvidenceInput {
  status: EvidenceStatus;
  buildId: string;
  targetId: string;
  inputHashes: readonly string[];
  outputHashes: readonly string[];
  toolVersion: string;
  timestamp: number;
}

export interface EvidenceRecord extends EvidenceInput {
  previousHash: string | null;
  recordHash: string;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

export function computeRecordHash(record: Omit<EvidenceRecord, 'recordHash'>): string {
  const unsigned = {
    previousHash: record.previousHash,
    status: record.status,
    buildId: record.buildId,
    targetId: record.targetId,
    inputHashes: record.inputHashes,
    outputHashes: record.outputHashes,
    toolVersion: record.toolVersion,
    timestamp: record.timestamp,
  };
  return `sha256:${createHash('sha256').update(canonicalJson(unsigned), 'utf8').digest('hex')}`;
}

export function appendEvidence(
  previous: EvidenceRecord | null,
  input: EvidenceInput,
): EvidenceRecord {
  const previousHash = previous ? previous.recordHash : null;
  const unsigned = {
    ...input,
    previousHash,
  };
  const recordHash = computeRecordHash(unsigned);
  return Object.freeze({
    ...unsigned,
    recordHash,
  });
}

export function verifyEvidenceChain(
  chain: readonly EvidenceRecord[],
): { valid: true } | { valid: false; index: number; code: string; message: string } {
  if (!Array.isArray(chain) || chain.length === 0) {
    return { valid: false, index: 0, code: 'EMPTY_CHAIN', message: 'Evidence chain is empty' };
  }

  for (let i = 0; i < chain.length; i++) {
    const record = chain[i];
    const expectedPrevious = i === 0 ? null : chain[i - 1].recordHash;

    if (record.previousHash !== expectedPrevious) {
      return {
        valid: false,
        index: i,
        code: 'PREVIOUS_HASH_MISMATCH',
        message: `Previous hash mismatch at index ${i}`,
      };
    }

    const computed = computeRecordHash(record);
    if (record.recordHash !== computed) {
      return {
        valid: false,
        index: i,
        code: 'RECORD_HASH_MISMATCH',
        message: `Record hash mismatch at index ${i}`,
      };
    }
  }

  return { valid: true };
}
