import { AdiaBlockCatalog, CatalogBlock } from '../../../agent/adiaBlockCatalog';

export interface BlockSearchResult {
  block: CatalogBlock;
  score: number;
  matchReason: string;
}

export interface BlockSearchOptions {
  domainFilter?: 'vlab' | 'xbridges' | 'sysml' | string;
  categoryFilter?: string;
  limit?: number;
}

/**
 * Searches the canonical AdiaBlockCatalog using deterministic ranking:
 * 1. Exact ID match (1.0)
 * 2. Exact Name match (0.95)
 * 3. Exact Alias match (0.90)
 * 4. ID starts with query (0.80)
 * 5. Name starts with query (0.75)
 * 6. Alias starts with query (0.70)
 * 7. Category match (0.65)
 * 8. Capability match (0.60)
 * 9. Substring in description / name / id (0.50)
 *
 * Tie-breaking is alphabetical by block ID for strict determinism.
 */
export function searchCatalogBlocks(
  query: string,
  options: BlockSearchOptions = {}
): BlockSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lowerQuery = trimmed.toLowerCase();
  const allBlocks = AdiaBlockCatalog.list();
  const results: BlockSearchResult[] = [];

  for (const block of allBlocks) {
    // Apply domain filter
    if (options.domainFilter) {
      const targetDomain = options.domainFilter.toLowerCase();
      if (
        block.sourceLibrary.toLowerCase() !== targetDomain &&
        !block.domain.toLowerCase().includes(targetDomain)
      ) {
        continue;
      }
    }

    // Apply category filter
    if (options.categoryFilter) {
      const targetCat = options.categoryFilter.toLowerCase();
      if (!block.category.toLowerCase().includes(targetCat)) {
        continue;
      }
    }

    const blockIdLower = block.id.toLowerCase();
    const blockNameLower = block.name.toLowerCase();
    const aliasesLower = (block.aliases || []).map(a => a.toLowerCase());

    let score = 0;
    let matchReason = '';

    if (blockIdLower === lowerQuery) {
      score = 1.0;
      matchReason = 'EXACT_ID_MATCH';
    } else if (blockNameLower === lowerQuery) {
      score = 0.95;
      matchReason = 'EXACT_NAME_MATCH';
    } else if (aliasesLower.includes(lowerQuery)) {
      score = 0.9;
      matchReason = 'EXACT_ALIAS_MATCH';
    } else if (blockIdLower.startsWith(lowerQuery)) {
      score = 0.8;
      matchReason = 'ID_PREFIX_MATCH';
    } else if (blockNameLower.startsWith(lowerQuery)) {
      score = 0.75;
      matchReason = 'NAME_PREFIX_MATCH';
    } else if (aliasesLower.some(a => a.startsWith(lowerQuery))) {
      score = 0.7;
      matchReason = 'ALIAS_PREFIX_MATCH';
    } else if (block.category.toLowerCase().includes(lowerQuery)) {
      score = 0.65;
      matchReason = 'CATEGORY_MATCH';
    } else if (block.capabilities.some(c => c.toLowerCase() === lowerQuery || c.toLowerCase().includes(lowerQuery))) {
      score = 0.6;
      matchReason = 'CAPABILITY_MATCH';
    } else if (
      blockIdLower.includes(lowerQuery) ||
      blockNameLower.includes(lowerQuery) ||
      block.description.toLowerCase().includes(lowerQuery)
    ) {
      score = 0.5;
      matchReason = 'SUBSTRING_MATCH';
    }

    if (score > 0) {
      results.push({
        block,
        score,
        matchReason
      });
    }
  }

  // Deterministic sorting: highest score first, tie-break by block ID alphabetically
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.block.id.localeCompare(b.block.id);
  });

  if (options.limit && options.limit > 0) {
    return results.slice(0, options.limit);
  }

  return results;
}

/**
 * Direct lookup by canonical ID or alias against AdiaBlockCatalog.
 * Never synthesizes missing blocks or returns partial hallucinations.
 */
export function getCanonicalBlockDefinition(idOrAlias: string): CatalogBlock | undefined {
  if (!idOrAlias || typeof idOrAlias !== 'string') return undefined;

  // 1. Direct ID lookup
  const direct = AdiaBlockCatalog.findById(idOrAlias);
  if (direct) return direct;

  // 2. Case-insensitive ID lookup
  const targetLower = idOrAlias.toLowerCase().trim();
  const allBlocks = AdiaBlockCatalog.list();
  const caseInsensitiveMatch = allBlocks.find(b => b.id.toLowerCase() === targetLower);
  if (caseInsensitiveMatch) return caseInsensitiveMatch;

  // 3. Exact alias lookup
  const aliasMatch = allBlocks.find(b =>
    (b.aliases || []).some(a => a.toLowerCase() === targetLower)
  );
  if (aliasMatch) return aliasMatch;

  return undefined;
}
