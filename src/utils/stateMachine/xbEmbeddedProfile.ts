export interface XBEmbeddedLimits {
  readonly maxVectorLength: number;
  readonly maxMatrixRows: number;
  readonly maxMatrixColumns: number;
  readonly maxStateElements: number;
  readonly maxLoopIterations: number;
}

export interface XBEmbeddedResource {
  readonly vectorLength: number;
  readonly matrixRows: number;
  readonly matrixColumns: number;
  readonly stateElements: number;
  readonly loopIterations: number;
}

export const DEFAULT_XB_EMBEDDED_LIMITS: XBEmbeddedLimits = Object.freeze({
  maxVectorLength: 64,
  maxMatrixRows: 8,
  maxMatrixColumns: 8,
  maxStateElements: 128,
  maxLoopIterations: 256,
});

export function assertXBResourceWithinLimits(
  resource: XBEmbeddedResource,
  limits: XBEmbeddedLimits,
): void {
  for (const [resourceKey, limitKey] of [
    ['vectorLength', 'maxVectorLength'],
    ['matrixRows', 'maxMatrixRows'],
    ['matrixColumns', 'maxMatrixColumns'],
    ['stateElements', 'maxStateElements'],
    ['loopIterations', 'maxLoopIterations'],
  ] as const) {
    if (
      !Number.isInteger(resource[resourceKey]) ||
      resource[resourceKey] < 0 ||
      resource[resourceKey] > limits[limitKey]
    ) {
      throw new Error(
        `${resourceKey} exceeds ${limitKey}=${limits[limitKey]}`,
      );
    }
  }
}
