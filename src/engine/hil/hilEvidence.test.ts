import { describe, it, expect } from 'vitest';
import { appendEvidence, verifyEvidenceChain, type EvidenceInput } from './hilEvidence.js';

describe('hilEvidence', () => {
  it('builds a tamper-evident evidence chain and detects record hash mismatch when tampered', () => {
    const compileInput: EvidenceInput = {
      status: 'TARGET_COMPILE_VERIFIED',
      buildId: 'BUILD_100',
      targetId: 'stm32f407vgt6',
      inputHashes: ['sha256:aaaa'],
      outputHashes: ['sha256:bbbb'],
      toolVersion: 'arm-none-eabi-gcc 10.3.1',
      timestamp: 1000,
    };

    const linkInput: EvidenceInput = {
      status: 'LINKED_IMAGE_VERIFIED',
      buildId: 'BUILD_100',
      targetId: 'stm32f407vgt6',
      inputHashes: ['sha256:bbbb'],
      outputHashes: ['sha256:cccc'],
      toolVersion: 'arm-none-eabi-gcc 10.3.1',
      timestamp: 2000,
    };

    const r1 = appendEvidence(null, compileInput);
    const r2 = appendEvidence(r1, linkInput);
    const chain = [r1, r2];

    expect(verifyEvidenceChain(chain)).toEqual({ valid: true });

    // Tamper with record 0
    const tamperedChain = [{ ...r1, outputHashes: ['sha256:tampered'] }, r2];
    expect(verifyEvidenceChain(tamperedChain)).toEqual(expect.objectContaining({
      valid: false,
      index: 0,
      code: 'RECORD_HASH_MISMATCH',
    }));
  });
});
