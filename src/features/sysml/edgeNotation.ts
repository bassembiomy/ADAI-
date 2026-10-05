/**
 * Text shown on a relationship edge, following SysML 1.6 / Cameo notation:
 *  - association, composition, aggregation and generalization carry no
 *    keyword (their symbol — line, diamond, triangle — is the notation); only
 *    an explicit user-given name is shown;
 *  - stereotyped dependencies show their keyword in guillemets, e.g. «satisfy»;
 *  - a user-given name always wins over the keyword's fallback.
 */
const NO_KEYWORD_KINDS = new Set(['association', 'composition', 'aggregation', 'sharedAggregation', 'generalization']);

const KEYWORD_BY_KIND: Record<string, string> = {
  allocation: '«allocate»',
  allocate: '«allocate»',
  satisfy: '«satisfy»',
  verify: '«verify»',
  refine: '«refine»',
  trace: '«trace»',
  copy: '«copy»',
  derive: '«deriveReqt»',
  deriveReqt: '«deriveReqt»',
  requirementContainment: '«contains»',
  binding: '«equal»',
  packageImport: '«import»',
  elementImport: '«import»',
  packageMerge: '«merge»',
  include: '«include»',
  extend: '«extend»',
  conform: '«conform»',
  expose: '«expose»',
};

export function edgeBadgeLabel(rel: { type: string; label?: string }): string {
  const explicit = rel.label?.trim();
  if (explicit) return explicit;
  if (NO_KEYWORD_KINDS.has(rel.type)) return '';
  return KEYWORD_BY_KIND[rel.type] ?? '';
}
