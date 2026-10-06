import { describe, expect, it } from 'vitest';
import { createHistory } from '../../engine/sysml/mutations';
import { createEmptyRepository } from '../../engine/sysml/model';

describe('external explorer command history', () => {
  it('shares the immutable repository when the application owns command history', () => {
    const repository = createEmptyRepository();
    expect(createHistory(repository, { sharePresent: true }).present).toBe(repository);
  });

  it('keeps the default independent snapshot for legacy history owners', () => {
    const repository = createEmptyRepository();
    expect(createHistory(repository).present).not.toBe(repository);
  });
});
