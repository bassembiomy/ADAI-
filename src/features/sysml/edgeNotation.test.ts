import { describe, expect, it } from 'vitest';
import { edgeBadgeLabel } from './edgeNotation';

describe('edgeBadgeLabel', () => {
  it.each(['association', 'composition', 'aggregation', 'sharedAggregation', 'generalization'])(
    'shows no keyword on a plain %s', kind => {
      expect(edgeBadgeLabel({ type: kind })).toBe('');
      expect(edgeBadgeLabel({ type: kind, label: '  ' })).toBe('');
    });

  it('shows only an explicit name on those symbols', () => {
    expect(edgeBadgeLabel({ type: 'association', label: ' Controls ' })).toBe('Controls');
  });

  it.each([
    ['allocation', '«allocate»'], ['satisfy', '«satisfy»'], ['verify', '«verify»'], ['refine', '«refine»'],
    ['trace', '«trace»'], ['copy', '«copy»'], ['deriveReqt', '«deriveReqt»'], ['derive', '«deriveReqt»'],
    ['requirementContainment', '«contains»'], ['packageImport', '«import»'], ['packageMerge', '«merge»'],
  ])('shows the %s keyword', (kind, keyword) => {
    expect(edgeBadgeLabel({ type: kind })).toBe(keyword);
  });

  it('prefers a stored label (e.g. «access», an alias) over the fallback', () => {
    expect(edgeBadgeLabel({ type: 'packageImport', label: '«access»' })).toBe('«access»');
  });

  it('shows nothing for a plain dependency or an unknown kind', () => {
    expect(edgeBadgeLabel({ type: 'dependency' })).toBe('');
    expect(edgeBadgeLabel({ type: 'somethingElse' })).toBe('');
  });
});
