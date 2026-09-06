import { computeContentSha256 } from './smVerificationEvidence';

export interface ExternalIdentifierInput {
  id: string;
  name?: string;
  prefix?: string;
}

export type IdentifierCandidate = string | ExternalIdentifierInput;

/**
 * Normalizes a string into a valid C identifier prefix.
 * Keeps only alphanumeric chars and underscores, collapses consecutive underscores,
 * ensures it starts with an ASCII letter or underscore, and trims trailing underscores.
 */
export function normalizeCPrefix(input: string): string {
  let cleaned = input.replace(/[^a-zA-Z0-9_]/g, '_');
  cleaned = cleaned.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) {
    return 'ID';
  }
  if (/^[0-9]/.test(cleaned)) {
    cleaned = `_${cleaned}`;
  }
  return cleaned;
}

/**
 * Deterministically allocates unique external C identifiers within a fixed significant character limit (default 31).
 * Combines a readable normalized prefix with SHA-256 hex characters, lengthening the hash
 * while shortening the prefix if a collision occurs within the significant character window.
 */
export function allocateExternalIdentifiers(
  elements: readonly IdentifierCandidate[],
  significantCharacters = 31,
): Map<string, string> {
  const result = new Map<string, string>();
  const allocatedSet = new Set<string>();

  for (const item of elements) {
    const id = typeof item === 'string' ? item : item.id;
    if (result.has(id)) {
      continue;
    }
    const nameOrPrefix = typeof item === 'string'
      ? item
      : (item.prefix ?? item.name ?? item.id);
    const basePrefix = normalizeCPrefix(nameOrPrefix);
    const hashHex = computeContentSha256(id).toLowerCase();

    let hashLength = 8;
    let allocated = '';
    let success = false;

    // Try lengthening the hash up to significantCharacters - 1 (leaving room for prefix/letter)
    while (hashLength <= significantCharacters) {
      const currentHash = hashHex.slice(0, hashLength);
      // Room for prefix: significantCharacters - hashLength - (separator ? 1 : 0)
      const maxPrefixLen = significantCharacters - hashLength - 1;

      let prefix = '';
      if (maxPrefixLen > 0) {
        prefix = basePrefix.slice(0, maxPrefixLen).replace(/_+$/, '');
      }

      let candidate: string;
      if (prefix.length > 0) {
        candidate = `${prefix}_${currentHash}`;
      } else {
        // If no room for prefix, ensure candidate starts with a letter or underscore
        candidate = `_${currentHash}`.slice(0, significantCharacters);
      }

      const significantSlice = candidate.slice(0, significantCharacters);
      if (!allocatedSet.has(significantSlice)) {
        allocated = significantSlice;
        allocatedSet.add(significantSlice);
        success = true;
        break;
      }

      hashLength++;
    }

    if (!success) {
      // Fallback discriminator if 64 hex characters collided (theoretically unreachable)
      let suffix = 1;
      while (true) {
        const disc = `_${suffix}`;
        const prefix = basePrefix.slice(0, Math.max(1, significantCharacters - disc.length));
        const candidate = `${prefix}${disc}`.slice(0, significantCharacters);
        if (!allocatedSet.has(candidate)) {
          allocated = candidate;
          allocatedSet.add(candidate);
          break;
        }
        suffix++;
      }
    }

    result.set(id, allocated);
  }

  return result;
}
