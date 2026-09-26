import type { SemanticElement } from '../domain/base';
import type { SysmlRepositoryV4 } from '../domain';
import type { SysmlDefinition, SysmlRepository } from '../model';
import type { TypeCandidate, TypeNotFoundResult } from '../commands/commandResult';

export type ResolvedTypeOutcome =
  | { found: true; element: SemanticElement | SysmlDefinition }
  | (TypeNotFoundResult & { found: false });

export interface TypeResolutionOptions {
  expectedMetaclasses?: string[];
  maxCandidates?: number;
}

const CLASSIFIER_METACLASSES = new Set([
  'Block',
  'InterfaceBlock',
  'ConstraintBlock',
  'AssociationBlock',
  'DataType',
  'ValueType',
  'QuantityKind',
  'Unit',
  'Enumeration',
  'Signal',
]);

interface CandidateItem {
  id: string;
  name: string;
  qualifiedName: string;
  metaclass: string;
  element: SemanticElement | SysmlDefinition;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function extractItemsFromRepo(repo: SysmlRepository | SysmlRepositoryV4): CandidateItem[] {
  const items: CandidateItem[] = [];

  if ('elements' in repo) {
    // SysmlRepositoryV4
    for (const elem of Object.values(repo.elements)) {
      if (CLASSIFIER_METACLASSES.has(elem.metaclass)) {
        const qName = [...elem.namespace.filter(Boolean), elem.name].join('::');
        items.push({
          id: elem.id,
          name: elem.name,
          qualifiedName: qName,
          metaclass: elem.metaclass,
          element: elem,
        });
      }
    }
  } else {
    // SysmlRepository v3 compatibility
    for (const def of Object.values(repo.definitions)) {
      const qName = [...(def.namespace || []).filter(Boolean), def.name].join('::');
      items.push({
        id: def.id,
        name: def.name,
        qualifiedName: qName,
        metaclass: def.kind,
        element: def,
      });
    }
  }

  return items;
}

export function resolveType(
  query: string,
  repo: SysmlRepository | SysmlRepositoryV4,
  options?: TypeResolutionOptions
): ResolvedTypeOutcome {
  const text = query.trim();
  const normQuery = normalize(text);
  const items = extractItemsFromRepo(repo);

  // 1. Direct ID match
  const byId = items.find(item => item.id === text);
  if (byId) {
    return { found: true, element: byId.element };
  }

  // 2. Exact Qualified Name match
  const byQName = items.find(item => item.qualifiedName === text || normalize(item.qualifiedName) === normQuery);
  if (byQName) {
    return { found: true, element: byQName.element };
  }

  // 3. Exact Simple Name match
  const byName = items.find(item => item.name === text || normalize(item.name) === normQuery);
  if (byName) {
    return { found: true, element: byName.element };
  }

  // 4. Rank candidates by similarity
  const scoredCandidates: Array<TypeCandidate & { rawItem: CandidateItem }> = [];

  for (const item of items) {
    let score = 0;
    const normName = normalize(item.name);
    const normQName = normalize(item.qualifiedName);

    if (normQName.startsWith(normQuery)) {
      score = 60;
    } else if (normName.startsWith(normQuery)) {
      score = 50;
    } else if (normQName.includes(normQuery)) {
      score = 30;
    } else if (normName.includes(normQuery)) {
      score = 20;
    }

    if (score > 0) {
      scoredCandidates.push({
        id: item.id,
        name: item.name,
        qualifiedName: item.qualifiedName,
        metaclass: item.metaclass,
        score,
        rawItem: item,
      });
    }
  }

  // Sort descending by score, then alphabetically
  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.qualifiedName.localeCompare(b.qualifiedName);
  });

  const max = options?.maxCandidates ?? 10;
  const candidates: TypeCandidate[] = scoredCandidates.slice(0, max).map(c => ({
    id: c.id,
    name: c.name,
    qualifiedName: c.qualifiedName,
    metaclass: c.metaclass,
    score: c.score,
  }));

  const parts = text.split('::');
  const suggestedName = parts[parts.length - 1] || text;
  const targetNamespace = parts.length > 1 ? parts.slice(0, -1) : [];

  return {
    found: false,
    success: false,
    code: 'TYPE_NOT_FOUND',
    searchedType: text,
    message: `Type "${text}" not found in model repository. Silent creation prohibited.`,
    candidates,
    action: {
      actionKind: 'CreateNewType',
      suggestedName,
      targetNamespace,
    },
  };
}
