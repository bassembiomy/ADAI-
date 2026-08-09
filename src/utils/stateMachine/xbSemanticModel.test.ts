import { describe, expect, it } from 'vitest';
import type { XBDelayParameters, XBSemanticOperation } from './xbSemanticModel';

describe('XBDelayParameters', () => {
  it('supports delayParameters on XBSemanticOperation', () => {
    const delayParams: XBDelayParameters = {
      delayLength: 2,
      initialCondition: -1,
      samplePeriod: 0.1,
      isUnitDelay: false,
    };
    const op: Partial<XBSemanticOperation> = { delayParameters: delayParams };
    expect(op.delayParameters?.delayLength).toBe(2);
    expect(op.delayParameters?.initialCondition).toBe(-1);
    expect(op.delayParameters?.samplePeriod).toBe(0.1);
    expect(op.delayParameters?.isUnitDelay).toBe(false);
  });
});
