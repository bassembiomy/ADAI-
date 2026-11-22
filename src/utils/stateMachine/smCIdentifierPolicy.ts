import { computeContentSha256 } from './smVerificationEvidence';
import { toCIdentifier } from './smExpressions';

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

/** C99 5.2.4.1 guarantees 63 significant initial characters for internal identifiers. */
export const C99_SIGNIFICANT_CHARACTERS = 63;

/**
 * Shortens one identifier to at most 63 characters: a readable prefix plus `_` and 8 hex characters of the
 * SHA-256 of the full identifier, so identifiers equal in their first 63 characters stay distinct and the result
 * is deterministic. Identifiers of 63 characters or fewer are returned unchanged.
 */
export function limitCIdentifierLength(identifier: string): string {
  if (identifier.length <= C99_SIGNIFICANT_CHARACTERS) return identifier;
  const hash = computeContentSha256(identifier).toLowerCase().slice(0, 8);
  return `${identifier.slice(0, C99_SIGNIFICANT_CHARACTERS - hash.length - 1)}_${hash}`;
}

/**
 * Applies limitCIdentifierLength to every identifier token of generated C text longer than 63 characters.
 * Comments, string literals and character constants are copied unchanged, so model ids in trace strings and
 * comments keep their original text. Variable members (`data.<member>`) are already limited by cDataMemberName,
 * so the mapping leaves them as they are (limiting is idempotent).
 */
export function limitCIdentifiersInSource(source: string): string {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)+'|(?<![A-Za-z0-9_])[A-Za-z_][A-Za-z0-9_]{63,}/g,
    (token) => /^[A-Za-z_]/.test(token) ? limitCIdentifierLength(token) : token,
  );
}

/** The one builder of a state index symbol: `<enum>_IDX`, with the enum name and the result both limited to 63 characters. */
export function cStateIndexSymbol(enumName: string): string {
  return limitCIdentifierLength(`${limitCIdentifierLength(enumName)}_IDX`);
}

/** The one builder of an SM_Data_t member name (and of `instance->data.<member>`): the C identifier of the variable, limited to 63 characters. */
export function cDataMemberName(variableName: string): string {
  return limitCIdentifierLength(toCIdentifier(variableName));
}

/** The one builder of a state action function name: `<enum>_Entry` / `_Exit` / `_During`, limited as a whole to 63 characters. */
export function cStateActionSymbol(enumName: string, phase: 'Entry' | 'Exit' | 'During'): string {
  return limitCIdentifierLength(`${enumName}_${phase}`);
}

/** The one builder of an MCAL channel macro: `MCAL_CH_<channel>`, limited to 63 characters. */
export function cMcalChannelMacro(channelId: string): string {
  return limitCIdentifierLength(`MCAL_CH_${toCIdentifier(channelId).toUpperCase()}`);
}
