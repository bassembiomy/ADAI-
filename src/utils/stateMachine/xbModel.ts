/** JSON-compatible parameter values persisted with an X-Bridges block. */
export type XBParameterValue =
  | boolean
  | number
  | string
  | null
  | readonly XBParameterValue[]
  | { readonly [key: string]: XBParameterValue };

/** The stable identity and configuration of one X-Bridges block. */
export interface XBNodeV1 {
  id: string;
  type: string;
  label?: string;
  parameters: Readonly<Record<string, XBParameterValue>>;
}

/** A directed connection between two named block ports. */
export interface XBEdgeV1 {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

/** A state-machine variable mapped to an X-Bridges block port. */
export interface XBMappingV1 {
  smVarId: string;
  blockId: string;
  portId: string;
  direction: 'in' | 'out';
}

export type XBMemoryPolicy = 'reset' | 'retain';
export type XBSolverKind = 'euler' | 'rk4';
export type XBFaultPolicy = 'signal-only' | 'escalate';

export interface XBSolverConfig {
  kind: XBSolverKind;
  stepSeconds: number;
}

export interface XBStatePolicy {
  memory: XBMemoryPolicy;
  numericFault: XBFaultPolicy;
}

/** The versioned, UI-independent representation used by validation and codegen. */
export interface XBPersistedModelV1 {
  schemaVersion: 1;
  nodes: readonly XBNodeV1[];
  edges: readonly XBEdgeV1[];
  mappings: readonly XBMappingV1[];
  solver: XBSolverConfig;
  policy: XBStatePolicy;
}

/**
 * The current UI-owned X-Bridges persistence shape. It remains at the state
 * boundary until the model adapter normalizes it to `XBPersistedModelV1`.
 */
export interface XBLegacyXBridgesModel extends Partial<
  Omit<XBPersistedModelV1, 'nodes' | 'edges' | 'mappings'>
> {
  nodes: any[];
  edges: any[];
  mappings?: XBMappingV1[];
}

/** Static limits and optional libraries supplied by an embedded target. */
export interface XBTargetCapabilities {
  supportsFloat32: boolean;
  supportsFloat64: boolean;
  supportsFloat16: boolean;
  supportsMathLibrary: boolean;
  maxVectorLength: number;
  maxMatrixDimension: number;
}
