import { describe, expect, it } from 'vitest';
import { InMemoryConceptStore } from './inMemoryKnowledgeStores';

describe('InMemoryConceptStore seed validation', () => {
  it('rejects malformed bundled seed concepts before they enter the renderer store', () => {
    expect(() => new InMemoryConceptStore([{ id: 'unvalidated' }] as any))
      .toThrow(/seed concept/i);
  });
});
