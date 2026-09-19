import { describe, it, expect } from 'vitest';
import { evaluateSourcePolicy, APPROVED_INGESTION_ORIGINS } from './sourcePolicy';
import { SourceCandidate } from './ingestionSchemas';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

describe('Source Policy Evaluation (Task 9 Step 1)', () => {
  const validContent = '{"name": "test_block", "description": "sample content"}';
  const validChecksum = sha256Hex(validContent);

  const baseCandidate: SourceCandidate = {
    sourceUrl: 'https://raw.githubusercontent.com/adia-models/inverters/main/model.json',
    origin: 'https://raw.githubusercontent.com',
    title: 'Three-Phase Inverter Reference',
    content: validContent,
    contentType: 'application/json',
    checksum: validChecksum,
    license: 'Apache-2.0',
    author: 'Community Contributors',
    retrievedAt: 1710000000000
  };

  it('accepts explicit permissive open-source licenses for quarantine ingestion', () => {
    const candidate = { ...baseCandidate, license: 'MIT' };
    const evalResult = evaluateSourcePolicy(candidate);
    expect(evalResult.verdict).toBe('accept_quarantine');
    expect(evalResult.isPermissive).toBe(true);
    expect(evalResult.violations).toHaveLength(0);
  });

  it('accepts user-owned imports even with custom proprietary-user license', () => {
    const candidate: SourceCandidate = {
      ...baseCandidate,
      license: 'User-Proprietary',
      isUserOwned: true
    };
    const evalResult = evaluateSourcePolicy(candidate);
    expect(evalResult.verdict).toBe('accept_quarantine');
    expect(evalResult.violations).toHaveLength(0);
  });

  it('rejects candidate with checksum mismatch', () => {
    const candidate: SourceCandidate = {
      ...baseCandidate,
      checksum: 'b'.repeat(64) // Tampered/invalid checksum
    };
    const evalResult = evaluateSourcePolicy(candidate);
    expect(evalResult.verdict).toBe('reject');
    expect(evalResult.violations).toContain('CHECKSUM_MISMATCH');
  });

  it('rejects candidate from unapproved origin or untrusted domain', () => {
    const candidate: SourceCandidate = {
      ...baseCandidate,
      sourceUrl: 'https://sketchy-download-site.xyz/files/model.json',
      origin: 'https://sketchy-download-site.xyz'
    };
    const evalResult = evaluateSourcePolicy(candidate);
    expect(evalResult.verdict).toBe('reject');
    expect(evalResult.violations).toContain('UNAPPROVED_ORIGIN');
  });

  it('rejects paywalled or authentication-required sources (no bypass allowed)', () => {
    const candidate: SourceCandidate = {
      ...baseCandidate,
      isPaywalled: true,
      requiresAuth: true
    };
    const evalResult = evaluateSourcePolicy(candidate);
    expect(evalResult.verdict).toBe('reject');
    expect(evalResult.violations).toContain('PAYWALL_OR_AUTH_REQUIRED');
  });

  it('rejects candidates marked as executable or containing macros', () => {
    const candidateExecutable: SourceCandidate = {
      ...baseCandidate,
      isExecutable: true
    };
    expect(evaluateSourcePolicy(candidateExecutable).verdict).toBe('reject');

    const candidateMacro: SourceCandidate = {
      ...baseCandidate,
      hasMacros: true
    };
    expect(evaluateSourcePolicy(candidateMacro).verdict).toBe('reject');
  });

  it('rejects oversized content exceeding bounded threshold', () => {
    const hugeContent = 'x'.repeat(10 * 1024 * 1024 + 1);
    const candidate: SourceCandidate = {
      ...baseCandidate,
      content: hugeContent,
      checksum: sha256Hex(hugeContent)
    };
    const evalResult = evaluateSourcePolicy(candidate);
    expect(evalResult.verdict).toBe('reject');
    expect(evalResult.violations).toContain('OVERSIZED_CONTENT');
  });
});
