export type XBSignalShape = 'scalar' | 'vector' | 'matrix';

export type XBTargetRequirement = 'math-library';

/**
 * The explicit execution contract for one X-Bridges block type.
 *
 * `codegen` is intentionally opt-in: types missing from this registry are
 * unsupported by the embedded pipeline.
 */
export interface XBBlockCapability {
  codegen: boolean;
  directFeedthrough: boolean;
  shapes: readonly XBSignalShape[];
  /** Optional direction-specific shapes where a block's ports differ. */
  inputShapes?: readonly XBSignalShape[];
  outputShapes?: readonly XBSignalShape[];
  reason?: string;
  requiredTargetCapabilities?: readonly XBTargetRequirement[];
  /** Stable direct interpreter execution cases for enabled Task-10 types. */
  interpreterConformanceCaseIds?: readonly string[];
  /** Stable strict-C99 execution cases for enabled Task-10 types. */
  cConformanceCaseIds?: readonly string[];
}

type XBCodegenCapability = Omit<XBBlockCapability, 'codegen'> & {
  codegen: true;
};

type XBHostOnlyCapability = Omit<XBBlockCapability, 'codegen' | 'reason'> & {
  codegen: false;
  reason: string;
};

const scalar: readonly XBSignalShape[] = ['scalar'];
const allShapes: readonly XBSignalShape[] = ['scalar', 'vector', 'matrix'];
const vectorOrMatrix: readonly XBSignalShape[] = ['vector', 'matrix'];

const direct = (
  shapes: readonly XBSignalShape[] = allShapes,
  requiredTargetCapabilities?: readonly XBTargetRequirement[],
  interpreterConformanceCaseIds?: readonly string[],
  cConformanceCaseIds?: readonly string[],
  directionalShapes: Pick<XBBlockCapability, 'inputShapes' | 'outputShapes'> = {},
): XBCodegenCapability => ({
  codegen: true,
  directFeedthrough: true,
  shapes,
  requiredTargetCapabilities,
  interpreterConformanceCaseIds,
  cConformanceCaseIds,
  ...directionalShapes,
});

const stateful = (
  shapes: readonly XBSignalShape[] = allShapes,
  requiredTargetCapabilities?: readonly XBTargetRequirement[],
  interpreterConformanceCaseIds?: readonly string[],
  cConformanceCaseIds?: readonly string[],
  directionalShapes: Pick<XBBlockCapability, 'inputShapes' | 'outputShapes'> = {},
): XBCodegenCapability => ({
  codegen: true,
  directFeedthrough: false,
  shapes,
  requiredTargetCapabilities,
  interpreterConformanceCaseIds,
  cConformanceCaseIds,
  ...directionalShapes,
});

const hostOnly = (reason: string): XBHostOnlyCapability => ({
  codegen: false,
  directFeedthrough: false,
  shapes: allShapes,
  reason,
});

/**
 * Embedded-safe X-Bridges block types. This registry is declarative and never
 * imports or invokes UI block factories.
 */
export const XB_CAPABILITIES: Readonly<Record<string, XBBlockCapability>> = {
  // Sources and state-machine mappings.
  Constant: direct(allShapes),
  Inport: direct(allShapes),
  Outport: direct(allShapes),
  Step: direct(scalar),

  // Deterministic arithmetic and reductions.
  Sum: direct(allShapes),
  SUM_JUNCTION: direct(allShapes),
  GAIN: direct(allShapes),
  PRODUCT: direct(allShapes),
  VectorAdd: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorSub: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorMul: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorDiv: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorPow: direct(allShapes),
  UnaryNeg: direct(allShapes),
  Abs: direct(allShapes),
  SumElements: direct(vectorOrMatrix),
  Mean: direct(vectorOrMatrix),
  Max: direct(vectorOrMatrix),

  // Statically bounded linear algebra. Each entry has interpreter and C99
  // conformance coverage in xbInterpreter/xbCGenerator tests (Task 10).
  MatrixMul: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  Transpose: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  MatrixConcat: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  MatrixDiag: direct(vectorOrMatrix, undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX'], {
    inputShapes: ['vector'], outputShapes: ['matrix'],
  }),
  IdentityMatrix: direct(vectorOrMatrix),
  SubMatrix: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  MatrixSolve: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),

  // Logic and bitwise operations.
  AND: direct(scalar),
  OR: direct(scalar),
  NOT: direct(scalar),
  NAND: direct(scalar),
  NOR: direct(scalar),
  XOR: direct(scalar),
  BitwiseAND: direct(scalar),
  BitwiseOR: direct(scalar),
  BitwiseXOR: direct(scalar),
  BitwiseNOT: direct(scalar),
  ShiftLeft: direct(scalar),
  ShiftRight: direct(scalar),

  // Signal routing.
  SWITCH: direct(allShapes),
  MUX: direct(vectorOrMatrix),
  DEMUX: direct(vectorOrMatrix),
  TERMINATOR: direct(allShapes),

  // Stateful primitives.
  DELAY: stateful(allShapes),
  UNIT_DELAY: stateful(allShapes),
  MEMORY: stateful(allShapes),
  INTEGRATOR_DISCRETE: stateful(allShapes),
  INTEGRATOR_CONTINUOUS: stateful(allShapes),
  Integrator: stateful(allShapes),

  // Bounded control and linear-system blocks. Each entry is enabled only with
  // paired interpreter and compiled-C conformance coverage (Task 10).
  PID_BASIC: stateful(scalar, undefined, ['T10-INT-PID-BASIC'], ['T10-C99-PID-BASIC']),
  PID_CONTROLLER: hostOnly('PID_CONTROLLER has no compiled-C conformance contract.'),
  LOW_PASS_FILTER: stateful(allShapes),
  HIGH_PASS_FILTER: stateful(allShapes),
  MOVING_AVERAGE: stateful(allShapes),
  DISCRETE_TRANSFER_FUNCTION: stateful(['vector'], undefined, ['T10-INT-DISCRETE-REALIZATION'], ['T10-C99-DISCRETE-REALIZATION']),
  STATE_SPACE: stateful(['vector'], undefined, ['T10-INT-DISCRETE-REALIZATION'], ['T10-C99-DISCRETE-REALIZATION']),

  // Motor-control transforms, covered against fixed reference vectors in both
  // the interpreter and generated C conformance suites (Task 10).
  CLARKE_TRANSFORM: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),
  PARK_TRANSFORM: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),
  INVERSE_PARK: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),
  INVERSE_CLARKE: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),

  // Trigonometry requires a target-provided math library.
  SIN: direct(scalar, ['math-library']),
  COS: direct(scalar, ['math-library']),
  TAN: direct(scalar, ['math-library']),
  COT: direct(scalar, ['math-library']),
  SEC: direct(scalar, ['math-library']),
  COSEC: direct(scalar, ['math-library']),
  ASIN: direct(scalar, ['math-library']),
  ACOS: direct(scalar, ['math-library']),
  ATAN: direct(scalar, ['math-library']),
  ACOT: direct(scalar, ['math-library']),
  ASEC: direct(scalar, ['math-library']),
  ACOSEC: direct(scalar, ['math-library']),
  SINH: direct(scalar, ['math-library']),
  COSH: direct(scalar, ['math-library']),
  TANH: direct(scalar, ['math-library']),
  COTH: direct(scalar, ['math-library']),
  SECH: direct(scalar, ['math-library']),
  COSECH: direct(scalar, ['math-library']),
  ASINH: direct(scalar, ['math-library']),
  ACOSH: direct(scalar, ['math-library']),
  ATANH: direct(scalar, ['math-library']),
  ACOTH: direct(scalar, ['math-library']),
  ASECH: direct(scalar, ['math-library']),
  ACOSECH: direct(scalar, ['math-library']),

  // Explicit numeric representation changes.
  DATA_TYPE_CONVERSION: direct(allShapes),
  NUMERIC_REPRESENTATION: direct(allShapes),

  // Host-only blocks intentionally rejected by embedded code generation.
  Scope: hostOnly('Visualization requires the host runtime.'),
  LMS_ADAPTIVE_FILTER: hostOnly('Online learning is not in the embedded-safe set.'),
};

export const getXBBlockCapability = (
  type: string,
): XBBlockCapability | null => (
  Object.prototype.hasOwnProperty.call(XB_CAPABILITIES, type)
    ? XB_CAPABILITIES[type]
    : null
);
