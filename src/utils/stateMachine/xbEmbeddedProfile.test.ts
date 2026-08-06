import { describe, expect, it } from 'vitest';
import {
  assertXBResourceWithinLimits,
  DEFAULT_XB_EMBEDDED_LIMITS,
} from './xbEmbeddedProfile';

describe('XBEmbeddedProfile', () => {
  it('accepts a model-sized matrix at the configured boundary', () => {
    expect(() =>
      assertXBResourceWithinLimits(
        {
          vectorLength: 0,
          matrixRows: 8,
          matrixColumns: 8,
          stateElements: 64,
          loopIterations: 64,
        },
        {
          maxVectorLength: 64,
          maxMatrixRows: 8,
          maxMatrixColumns: 8,
          maxStateElements: 64,
          maxLoopIterations: 64,
        },
      ),
    ).not.toThrow();
  });

  it('rejects a resource before C generation when any bound is exceeded', () => {
    expect(() =>
      assertXBResourceWithinLimits(
        {
          vectorLength: 65,
          matrixRows: 0,
          matrixColumns: 0,
          stateElements: 0,
          loopIterations: 65,
        },
        DEFAULT_XB_EMBEDDED_LIMITS,
      ),
    ).toThrow(/maxVectorLength/);
  });
});
