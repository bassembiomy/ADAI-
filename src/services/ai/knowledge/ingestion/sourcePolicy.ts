import {
  SourceCandidate,
  PolicyEvaluationResult,
  PERMISSIVE_SPDX_LICENSES
} from './ingestionSchemas';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

export const APPROVED_INGESTION_ORIGINS: readonly string[] = Object.freeze([
  'https://raw.githubusercontent.com',
  'https://github.com',
  'https://www.mathworks.com',
  'https://gitlab.com',
  'https://zenodo.org',
  'https://arxiv.org',
  'file://'
]);

const MAX_CONTENT_BYTES = 10 * 1024 * 1024; // 10 MB

export function evaluateSourcePolicy(candidate: SourceCandidate): PolicyEvaluationResult {
  const violations: string[] = [];

  // 1. Content size check
  const byteLength = Buffer.byteLength(candidate.content, 'utf8');
  if (byteLength > MAX_CONTENT_BYTES) {
    violations.push('OVERSIZED_CONTENT');
  }

  // 2. Checksum verification
  const computedChecksum = sha256Hex(candidate.content);
  if (computedChecksum !== candidate.checksum) {
    violations.push('CHECKSUM_MISMATCH');
  }

  // 3. Paywall and auth bypass prevention
  if (candidate.isPaywalled || candidate.requiresAuth) {
    violations.push('PAYWALL_OR_AUTH_REQUIRED');
  }

  // 4. Executable / macro prohibition
  if (candidate.isExecutable || candidate.hasMacros) {
    violations.push('EXECUTABLE_OR_MACRO_BLOCKED');
  }

  // 5. Approved origins check
  const isApprovedOrigin =
    candidate.isUserOwned ||
    APPROVED_INGESTION_ORIGINS.some(origin =>
      candidate.origin.toLowerCase().startsWith(origin.toLowerCase())
    );

  if (!isApprovedOrigin) {
    violations.push('UNAPPROVED_ORIGIN');
  }

  // 6. License check
  const normalizedLicense = candidate.license.trim();
  const isPermissiveSpdx = PERMISSIVE_SPDX_LICENSES.some(
    l => l.toLowerCase() === normalizedLicense.toLowerCase()
  );
  const isPermissive = isPermissiveSpdx || Boolean(candidate.isUserOwned);

  if (violations.length > 0) {
    return {
      verdict: 'reject',
      reason: `Policy check failed with violations: ${violations.join(', ')}`,
      violations,
      effectiveLicense: normalizedLicense,
      isPermissive
    };
  }

  return {
    verdict: 'accept_quarantine',
    reason: isPermissive
      ? 'Source candidate complies with all safety, origin, and license policies.'
      : 'Source accepted into quarantine pending license review.',
    violations: [],
    effectiveLicense: normalizedLicense,
    isPermissive
  };
}
