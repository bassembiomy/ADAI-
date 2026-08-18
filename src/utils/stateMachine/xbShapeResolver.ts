import type { ModelDiagnostic } from './smModel';
import type { XBNodeV1, XBPersistedModelV1 } from './xbModel';
import { getXBBlockCapability, isDiagBlockType, isMatrixSolveBlockType } from './xbCapabilities';
import { validateStateSpaceNode, stateSpacePortShape } from './stateSpaceValidation';

export type SemanticShapeKind = 'scalar' | 'vector' | 'matrix' | 'unresolved';

export interface SemanticShape {
  readonly kind: SemanticShapeKind;
  readonly dimensions: readonly number[];
  readonly elementCount: number;
}

export const SCALAR_SHAPE: SemanticShape = Object.freeze({
  kind: 'scalar',
  dimensions: [],
  elementCount: 1,
});

export const UNRESOLVED_SHAPE: SemanticShape = Object.freeze({
  kind: 'unresolved',
  dimensions: [],
  elementCount: 0,
});

export const vectorShape = (length: number): SemanticShape =>
  Object.freeze({
    kind: 'vector',
    dimensions: [length],
    elementCount: length,
  });

export const matrixShape = (rows: number, columns: number): SemanticShape =>
  Object.freeze({
    kind: 'matrix',
    dimensions: [rows, columns],
    elementCount: rows * columns,
  });

export interface XBShapeResolutionResult {
  readonly portShapes: Map<string, SemanticShape>;
  readonly diagnostics: ModelDiagnostic[];
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const diagnostic = (
  code: string,
  message: string,
  elementId?: string,
): ModelDiagnostic => ({
  code,
  message,
  elementId,
  severity: 'error',
});

const shapesAreEqual = (left: SemanticShape, right: SemanticShape): boolean => {
  if (left.kind !== right.kind || left.elementCount !== right.elementCount) {
    return false;
  }
  if (left.dimensions.length !== right.dimensions.length) return false;
  return left.dimensions.every((dim, idx) => dim === right.dimensions[idx]);
};

interface KalmanDimensions {
  readonly nStates: number;
  readonly nMeas: number;
  readonly nInputs: number;
}

const resolveKalmanDimensions = (node: XBNodeV1): KalmanDimensions => {
  const p = node.parameters;
  let nStates: number | null = null;
  let nMeas: number | null = null;
  let nInputs: number | null = null;

  if (node.type === 'KALMAN_FILTER') {
    if (Array.isArray(p.A) && p.A.length > 0) {
      nStates = p.A.length;
    }
    if (Array.isArray(p.P0) && p.P0.length > 0) {
      nStates ??= p.P0.length;
    }
    if (Array.isArray(p.x0) && p.x0.length > 0) {
      nStates ??= p.x0.length;
    }
    if (Array.isArray(p.Q) && p.Q.length > 0) {
      nStates ??= p.Q.length;
    }

    if (Array.isArray(p.C) && p.C.length > 0) {
      nMeas = p.C.length;
    }
    if (Array.isArray(p.R) && p.R.length > 0) {
      nMeas ??= p.R.length;
    }

    if (Array.isArray(p.B) && p.B.length > 0 && Array.isArray(p.B[0])) {
      nInputs = p.B[0].length;
    }
  } else if (node.type === 'EXTENDED_KALMAN_FILTER') {
    if (Array.isArray(p.f) && p.f.length > 0) {
      nStates = p.f.length;
    }
    if (Array.isArray(p.P0) && p.P0.length > 0) {
      nStates ??= p.P0.length;
    }
    if (Array.isArray(p.h) && p.h.length > 0) {
      nMeas = p.h.length;
    }
  }

  return {
    nStates: nStates ?? 1,
    nMeas: nMeas ?? 1,
    nInputs: nInputs ?? 1,
  };
};

function isKalmanSignalShapeCompatible(shape: SemanticShape, expectedWidth: number): boolean {
  if (shape.kind === 'unresolved') return true;
  if (expectedWidth === 1) {
    return shape.kind === 'scalar' || (shape.kind === 'vector' && shape.elementCount === 1);
  }
  return shape.kind === 'vector' && shape.elementCount === expectedWidth;
}

interface RawPortMeta {
  readonly id: string;
  readonly direction: 'input' | 'output';
  readonly explicitShape?: string;
  readonly shape?: string;
  readonly dimensions?: readonly number[];
}

const extractPortMeta = (node: XBNodeV1): RawPortMeta[] => {
  const meta: RawPortMeta[] = [];
  const processList = (list: unknown, dir: 'input' | 'output') => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (isRecord(item) && typeof item.id === 'string') {
        meta.push({
          id: item.id,
          direction: item.direction === 'output' ? 'output' : item.direction === 'input' ? 'input' : dir,
          explicitShape: typeof item.explicitShape === 'string' ? item.explicitShape : undefined,
          shape: typeof item.shape === 'string' ? item.shape : undefined,
          dimensions: Array.isArray(item.dimensions)
            ? item.dimensions.filter((d): d is number => typeof d === 'number')
            : undefined,
        });
      }
    }
  };

  processList(node.parameters.inputs, 'input');
  processList(node.parameters.outputs, 'output');
  if (Array.isArray(node.parameters.ports)) {
    for (const p of node.parameters.ports) {
      if (isRecord(p) && typeof p.id === 'string') {
        const dir = p.direction === 'output' ? 'output' : 'input';
        meta.push({
          id: p.id,
          direction: dir,
          explicitShape: typeof p.explicitShape === 'string' ? p.explicitShape : undefined,
          shape: typeof p.shape === 'string' ? p.shape : undefined,
          dimensions: Array.isArray(p.dimensions)
            ? p.dimensions.filter((d): d is number => typeof d === 'number')
            : undefined,
        });
      }
    }
  }

  // Deduplicate by port ID
  const seen = new Set<string>();
  const ports = meta.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const hasInput = ports.some((p) => p.direction === 'input');
  const hasOutput = ports.some((p) => p.direction === 'output');

  if (node.type === 'DEMUX') {
    if (!hasInput) ports.push({ id: 'in', direction: 'input' });
    if (!hasOutput) {
      ports.push({ id: 'out1', direction: 'output' }, { id: 'out2', direction: 'output' });
    }
  } else if (node.type === 'MUX') {
    if (!hasInput) {
      ports.push({ id: 'in1', direction: 'input' }, { id: 'in2', direction: 'input' });
    }
    if (!hasOutput) ports.push({ id: 'out', direction: 'output' });
  } else if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow'].includes(node.type)) {
    if (!hasInput) {
      ports.push({ id: 'in1', direction: 'input' }, { id: 'in2', direction: 'input' });
    }
    if (!hasOutput) ports.push({ id: 'out', direction: 'output' });
  } else if (['SumElements', 'Mean', 'Max'].includes(node.type)) {
    if (!hasInput) ports.push({ id: 'in', direction: 'input' });
    if (!hasOutput) ports.push({ id: 'out', direction: 'output' });
  } else if (node.type === 'IdentityMatrix') {
    if (!hasOutput) ports.push({ id: 'out', direction: 'output' });
  } else if (node.type === 'Constant' || node.type === 'Step') {
    if (!hasOutput) ports.push({ id: 'out', direction: 'output' });
  } else if (['SATURATION', 'DEADZONE', 'RATE_LIMITER'].includes(node.type)) {
    if (!hasInput) ports.push({ id: 'u', direction: 'input' });
    if (!hasOutput) ports.push({ id: 'y', direction: 'output' });
  } else if (node.type === 'STATE_SPACE') {
    if (!hasInput) ports.push({ id: 'u', direction: 'input' });
    if (!ports.some((p) => p.id === 'y')) ports.push({ id: 'y', direction: 'output' });
    if (!ports.some((p) => p.id === 'x')) ports.push({ id: 'x', direction: 'output' });
  }

  return ports;
};

const parseExplicitShape = (meta: RawPortMeta): SemanticShape | null => {
  if (meta.explicitShape === 'scalar') return SCALAR_SHAPE;
  if ((meta.explicitShape === 'vector' || meta.shape === 'vector') && meta.dimensions?.length === 1 && meta.dimensions[0] > 0) {
    return vectorShape(meta.dimensions[0]);
  }
  if ((meta.explicitShape === 'matrix' || meta.shape === 'matrix') && meta.dimensions?.length === 2 && meta.dimensions[0] > 0 && meta.dimensions[1] > 0) {
    return matrixShape(meta.dimensions[0], meta.dimensions[1]);
  }
  if (meta.dimensions !== undefined && meta.dimensions.length > 0) {
    if (meta.dimensions.length === 1 && meta.dimensions[0] > 0) {
      return vectorShape(meta.dimensions[0]);
    }
    if (meta.dimensions.length === 2 && meta.dimensions[0] > 0 && meta.dimensions[1] > 0) {
      return matrixShape(meta.dimensions[0], meta.dimensions[1]);
    }
  }
  return null;
};


export const resolveGraphShapes = (
  model: XBPersistedModelV1,
): XBShapeResolutionResult => {
  const diagnostics: ModelDiagnostic[] = [];
  const portShapes = new Map<string, SemanticShape>();
  const nodesById = new Map<string, XBNodeV1>();
  const nodePorts = new Map<string, RawPortMeta[]>();

  const explicitPortKeys = new Set<string>();

  // Step 1: Seed node ports and explicitly declared shapes
  for (const node of model.nodes) {
    nodesById.set(node.id, node);
    const ports = extractPortMeta(node);
    nodePorts.set(node.id, ports);

const getConstantParamValue = (node: XBNodeV1): unknown =>
  node.parameters.value ?? node.parameters.Value ?? node.parameters.constant;

const parseConstantValueShape = (node: XBNodeV1): SemanticShape => {
  const val = getConstantParamValue(node);
  if (Array.isArray(val) && val.length > 0) {
    return val.length > 1 ? vectorShape(val.length) : SCALAR_SHAPE;
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.length > 1 ? vectorShape(parsed.length) : SCALAR_SHAPE;
      }
    } catch {
      // ignore
    }
  }
  return SCALAR_SHAPE;
};

    for (const port of ports) {
      const key = `${node.id}:${port.id}`;
      const explicit = parseExplicitShape(port);
      if (explicit !== null) {
        portShapes.set(key, explicit);
        explicitPortKeys.add(key);
      } else if (node.type === 'Constant' || node.type === 'Step' || node.type === 'Inport' || node.type === 'Outport') {
        if (port.direction === 'output' && node.type !== 'Outport') {
          portShapes.set(key, parseConstantValueShape(node));
        } else if (port.direction === 'input' && node.type === 'Outport') {
          portShapes.set(key, SCALAR_SHAPE);
        } else {
          portShapes.set(key, UNRESOLVED_SHAPE);
        }
      } else {
        portShapes.set(key, UNRESOLVED_SHAPE);
      }
    }

    // Default implicit ports if node parameters don't declare ports explicitly
    if (ports.length === 0) {
      if (node.type === 'Constant' || node.type === 'Step') {
        const key = `${node.id}:out`;
        portShapes.set(key, parseConstantValueShape(node));
        nodePorts.set(node.id, [{ id: 'out', direction: 'output' }]);

      } else if (node.type === 'MUX') {
        const in1 = `${node.id}:in1`;
        const in2 = `${node.id}:in2`;
        const out = `${node.id}:out`;
        portShapes.set(in1, UNRESOLVED_SHAPE);
        portShapes.set(in2, UNRESOLVED_SHAPE);
        portShapes.set(out, UNRESOLVED_SHAPE);
        nodePorts.set(node.id, [
          { id: 'in1', direction: 'input' },
          { id: 'in2', direction: 'input' },
          { id: 'out', direction: 'output' },
        ]);
      } else if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow'].includes(node.type)) {
        const in1 = `${node.id}:in1`;
        const in2 = `${node.id}:in2`;
        const out = `${node.id}:out`;
        portShapes.set(in1, UNRESOLVED_SHAPE);
        portShapes.set(in2, UNRESOLVED_SHAPE);
        portShapes.set(out, UNRESOLVED_SHAPE);
        nodePorts.set(node.id, [
          { id: 'in1', direction: 'input' },
          { id: 'in2', direction: 'input' },
          { id: 'out', direction: 'output' },
        ]);
      } else if (['SumElements', 'Mean', 'Max'].includes(node.type)) {
        const inPort = `${node.id}:in`;
        const outPort = `${node.id}:out`;
        portShapes.set(inPort, UNRESOLVED_SHAPE);
        portShapes.set(outPort, SCALAR_SHAPE);
        nodePorts.set(node.id, [
          { id: 'in', direction: 'input' },
          { id: 'out', direction: 'output' },
        ]);
      } else if (node.type === 'IdentityMatrix') {
        const outPort = `${node.id}:out`;
        const dim = Number(node.parameters.dimension ?? node.parameters.matrixSize ?? 1);
        const shape = Number.isInteger(dim) && dim > 0 ? matrixShape(dim, dim) : UNRESOLVED_SHAPE;
        portShapes.set(outPort, shape);
        nodePorts.set(node.id, [{ id: 'out', direction: 'output' }]);
      } else if (node.type === 'DEMUX') {
        const inPort = `${node.id}:in`;
        const out1 = `${node.id}:out1`;
        const out2 = `${node.id}:out2`;
        portShapes.set(inPort, UNRESOLVED_SHAPE);
        portShapes.set(out1, UNRESOLVED_SHAPE);
        portShapes.set(out2, UNRESOLVED_SHAPE);
        nodePorts.set(node.id, [
          { id: 'in', direction: 'input' },
          { id: 'out1', direction: 'output' },
          { id: 'out2', direction: 'output' },
        ]);
      }
    }
  }

  // Map incoming edges per input port
  const edgeSourceMap = new Map<string, string>(); // targetKey -> sourceKey
  for (const edge of model.edges) {
    const srcKey = `${edge.sourceNodeId}:${edge.sourcePortId}`;
    const tgtKey = `${edge.targetNodeId}:${edge.targetPortId}`;
    edgeSourceMap.set(tgtKey, srcKey);
  }

  // Step 2: Fixed-point graph-wide shape propagation
  const maxPasses = 50;
  let pass = 0;
  let changed = true;

  while (changed && pass < maxPasses) {
    pass++;
    changed = false;

    // 2a. Propagate along edges (Source -> Target)
    for (const [tgtKey, srcKey] of edgeSourceMap.entries()) {
      const srcShape = portShapes.get(srcKey) ?? UNRESOLVED_SHAPE;
      const tgtShape = portShapes.get(tgtKey) ?? UNRESOLVED_SHAPE;
      if (srcShape.kind !== 'unresolved' && tgtShape.kind === 'unresolved' && !explicitPortKeys.has(tgtKey)) {
        portShapes.set(tgtKey, srcShape);
        changed = true;
      }
    }

    // 2b. Block-local shape inference
    for (const node of model.nodes) {
      const ports = nodePorts.get(node.id) ?? [];
      const inputPorts = ports.filter((p) => p.direction === 'input');
      const outputPorts = ports.filter((p) => p.direction === 'output');

      if (node.type === 'MUX') {
        // MUX output element count = sum(input element counts)
        let totalElements = 0;
        let allInputsResolved = inputPorts.length > 0;
        for (const inP of inputPorts) {
          const inKey = `${node.id}:${inP.id}`;
          const inShape = portShapes.get(inKey) ?? UNRESOLVED_SHAPE;
          if (inShape.kind === 'unresolved') {
            allInputsResolved = false;
          } else {
            totalElements += inShape.elementCount;
          }
        }
        if (allInputsResolved && totalElements > 0) {
          const outShape = totalElements > 1 ? vectorShape(totalElements) : SCALAR_SHAPE;
          for (const outP of outputPorts) {
            const outKey = `${node.id}:${outP.id}`;
            if (!explicitPortKeys.has(outKey)) {
              const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
              if (!shapesAreEqual(cur, outShape)) {
                portShapes.set(outKey, outShape);
                changed = true;
              }
            }
          }
        }
      } else if (node.type === 'DEMUX') {
        // DEMUX partitions input shape among output ports
        const inP = inputPorts.find((p) => p.id === 'in') ?? inputPorts[0];
        if (inP !== undefined) {
          const inKey = `${node.id}:${inP.id}`;
          const inShape = portShapes.get(inKey) ?? UNRESOLVED_SHAPE;
          if (inShape.kind !== 'unresolved') {
            const outputCount = Math.max(1, outputPorts.length);
            const elementsPerOut = Math.max(1, Math.floor(inShape.elementCount / outputCount));
            const outShape = elementsPerOut > 1 ? vectorShape(elementsPerOut) : SCALAR_SHAPE;
            for (const outP of outputPorts) {
              const outKey = `${node.id}:${outP.id}`;
              if (!explicitPortKeys.has(outKey)) {
                const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
                if (!shapesAreEqual(cur, outShape)) {
                  portShapes.set(outKey, outShape);
                  changed = true;
                }
              }
            }
          }
        }
      } else if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow'].includes(node.type)) {
        // Preserves vector/matrix shape when input operands have compatible dimensions
        const resolvedInputShapes = inputPorts
          .map((p) => portShapes.get(`${node.id}:${p.id}`) ?? UNRESOLVED_SHAPE)
          .filter((s) => s.kind !== 'unresolved');

        if (resolvedInputShapes.length > 0) {
          const firstNonScalar = resolvedInputShapes.find((s) => s.kind !== 'scalar' || s.elementCount > 1) ?? resolvedInputShapes[0];
          if (firstNonScalar !== undefined) {
            for (const outP of outputPorts) {
              const outKey = `${node.id}:${outP.id}`;
              if (!explicitPortKeys.has(outKey)) {
                const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
                if (!shapesAreEqual(cur, firstNonScalar)) {
                  portShapes.set(outKey, firstNonScalar);
                  changed = true;
                }
              }
            }
          }
        }
      } else if (['SumElements', 'Mean', 'Max'].includes(node.type)) {
        for (const outP of outputPorts) {
          const outKey = `${node.id}:${outP.id}`;
          if (!explicitPortKeys.has(outKey)) {
            const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
            if (!shapesAreEqual(cur, SCALAR_SHAPE)) {
              portShapes.set(outKey, SCALAR_SHAPE);
              changed = true;
            }
          }
        }
      } else if (node.type === 'IdentityMatrix') {
        const dim = Number(node.parameters.dimension ?? node.parameters.matrixSize ?? 1);
        const outShape = Number.isInteger(dim) && dim > 0 ? matrixShape(dim, dim) : UNRESOLVED_SHAPE;
        for (const outP of outputPorts) {
          const outKey = `${node.id}:${outP.id}`;
          if (!explicitPortKeys.has(outKey)) {
            const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
            if (!shapesAreEqual(cur, outShape)) {
              portShapes.set(outKey, outShape);
              changed = true;
            }
          }
        }
      } else if (isDiagBlockType(node.type)) {
        const inP = inputPorts[0];
        if (inP !== undefined) {
          const inShape = portShapes.get(`${node.id}:${inP.id}`) ?? UNRESOLVED_SHAPE;
          if (inShape.kind === 'vector') {
            const outShape = matrixShape(inShape.elementCount, inShape.elementCount);
            for (const outP of outputPorts) {
              const outKey = `${node.id}:${outP.id}`;
              if (!explicitPortKeys.has(outKey)) {
                const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
                if (!shapesAreEqual(cur, outShape)) {
                  portShapes.set(outKey, outShape);
                  changed = true;
                }
              }
            }
          } else if (inShape.kind === 'matrix') {
            const diagLen = Math.min(inShape.dimensions[0] ?? 1, inShape.dimensions[1] ?? 1);
            const outShape = vectorShape(diagLen);
            for (const outP of outputPorts) {
              const outKey = `${node.id}:${outP.id}`;
              if (!explicitPortKeys.has(outKey)) {
                const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
                if (!shapesAreEqual(cur, outShape)) {
                  portShapes.set(outKey, outShape);
                  changed = true;
                }
              }
            }
          }
        }
      } else if (isMatrixSolveBlockType(node.type)) {
        const in2P = inputPorts[1] ?? inputPorts[0];
        if (in2P !== undefined) {
          const in2Shape = portShapes.get(`${node.id}:${in2P.id}`) ?? UNRESOLVED_SHAPE;
          if (in2Shape.kind === 'vector' || in2Shape.kind === 'matrix') {
            const outShape = in2Shape;
            for (const outP of outputPorts) {
              const outKey = `${node.id}:${outP.id}`;
              if (!explicitPortKeys.has(outKey)) {
                const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
                if (!shapesAreEqual(cur, outShape)) {
                  portShapes.set(outKey, outShape);
                  changed = true;
                }
              }
            }
          }
        }
      } else if (node.type === 'STATE_SPACE') {
        const ssRes = validateStateSpaceNode(node);
        if (ssRes.ok) {
          const dims = ssRes.value.dimensions;
          for (const p of ports) {
            const portKey = `${node.id}:${p.id}`;
            if (!explicitPortKeys.has(portKey)) {
              let pShape: SemanticShape;
              if (p.id === 'u') {
                pShape = stateSpacePortShape(dims.nInputs);
              } else if (p.id === 'x') {
                pShape = stateSpacePortShape(dims.nStates);
              } else if (p.id === 'y') {
                pShape = stateSpacePortShape(dims.nOutputs);
              } else {
                continue;
              }
              const cur = portShapes.get(portKey) ?? UNRESOLVED_SHAPE;
              if (!shapesAreEqual(cur, pShape)) {
                portShapes.set(portKey, pShape);
                changed = true;
              }
            }
          }
        }
      } else if (node.type === 'KALMAN_FILTER' || node.type === 'EXTENDED_KALMAN_FILTER') {
        const dims = resolveKalmanDimensions(node);
        for (const outP of outputPorts) {
          const outKey = `${node.id}:${outP.id}`;
          if (!explicitPortKeys.has(outKey)) {
            let outShape = SCALAR_SHAPE;
            if (outP.id === 'x_hat' || outP.id === 'x') {
              outShape = dims.nStates > 1 ? vectorShape(dims.nStates) : SCALAR_SHAPE;
            } else if (outP.id === 'y_hat' || outP.id === 'innovation') {
              outShape = dims.nMeas > 1 ? vectorShape(dims.nMeas) : SCALAR_SHAPE;
            } else if (outP.id === 'kg' || outP.id === 'K') {
              const total = dims.nStates * dims.nMeas;
              outShape = total > 1 ? vectorShape(total) : SCALAR_SHAPE;
            } else if (outP.id === 'P') {
              outShape = dims.nStates > 1 ? matrixShape(dims.nStates, dims.nStates) : SCALAR_SHAPE;
            }
            const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
            if (!shapesAreEqual(cur, outShape)) {
              portShapes.set(outKey, outShape);
              changed = true;
            }
          }
        }
      } else {
        // Standard pass-through from first input port shape to output ports
        if (inputPorts.length > 0 && outputPorts.length > 0) {
          const capability = getXBBlockCapability(node.type);
          const allowedOutShapes = capability?.outputShapes ?? capability?.shapes;
          const firstInKey = `${node.id}:${inputPorts[0].id}`;
          const inShape = portShapes.get(firstInKey) ?? UNRESOLVED_SHAPE;
          if (inShape.kind !== 'unresolved') {
            for (const outP of outputPorts) {
              const outKey = `${node.id}:${outP.id}`;
              if (!explicitPortKeys.has(outKey)) {
                const cur = portShapes.get(outKey) ?? UNRESOLVED_SHAPE;
                if (cur.kind === 'unresolved') {
                  if (allowedOutShapes && allowedOutShapes.length === 1 && allowedOutShapes[0] === 'scalar') {
                    portShapes.set(outKey, SCALAR_SHAPE);
                  } else {
                    portShapes.set(outKey, inShape);
                  }
                  changed = true;
                }
              }
            }
          }
        }
      }
    }
  }

  // Step 3: Diagnostic Verification Phase
  for (const node of model.nodes) {
    const ports = nodePorts.get(node.id) ?? [];
    const inputPorts = ports.filter((p) => p.direction === 'input');
    const capability = getXBBlockCapability(node.type);

    if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv'].includes(node.type)) {
      const inputShapes = inputPorts.map((p) => ({
        id: p.id,
        key: `${node.id}:${p.id}`,
        shape: portShapes.get(`${node.id}:${p.id}`) ?? UNRESOLVED_SHAPE,
      }));

      // Check if any input is unresolved
      const unresolvedPort = inputShapes.find((p) => p.shape.kind === 'unresolved');
      if (unresolvedPort !== undefined) {
        diagnostics.push(diagnostic(
          'XB_SHAPE_UNRESOLVED',
          `Vector block '${node.id}' input '${unresolvedPort.id}' shape could not be resolved.`,
          node.id,
        ));
        continue;
      }

      // Check if any input is scalar (elementCount <= 1)
      const scalarPort = inputShapes.find((p) => p.shape.kind === 'scalar' || p.shape.elementCount <= 1);
      if (scalarPort !== undefined) {
        diagnostics.push(diagnostic(
          'XB_SHAPE_MISMATCH',
          `Vector block '${node.id}' input '${scalarPort.id}' is scalar, but vector signal is required.`,
          node.id,
        ));
        continue;
      }

      // Check operand dimension compatibility
      const firstShape = inputShapes[0]?.shape;
      if (firstShape !== undefined && inputShapes.some((p) => !shapesAreEqual(p.shape, firstShape))) {
        const details = inputShapes.map((p) => `${p.id}: Vector[${p.shape.elementCount}]`).join(', ');
        diagnostics.push(diagnostic(
          'XB_SHAPE_MISMATCH',
          `Vector block '${node.id}' has incompatible input operand dimensions: ${details}.`,
          node.id,
        ));
      }
    } else if (node.type === 'KALMAN_FILTER' || node.type === 'EXTENDED_KALMAN_FILTER') {
      const dims = resolveKalmanDimensions(node);
      for (const inP of inputPorts) {
        const inKey = `${node.id}:${inP.id}`;
        const shape = portShapes.get(inKey) ?? UNRESOLVED_SHAPE;
        let expectedWidth = 1;
        if (inP.id === 'u') {
          expectedWidth = dims.nInputs;
        } else if (inP.id === 'y_meas' || inP.id === 'y') {
          expectedWidth = dims.nMeas;
        } else {
          continue;
        }

        if (shape.kind === 'unresolved') {
          if (expectedWidth > 1) {
            diagnostics.push(diagnostic(
              'XB_SHAPE_UNRESOLVED',
              `Block '${node.id}' port '${inP.id}' shape could not be resolved.`,
              node.id,
            ));
          }
        } else if (!isKalmanSignalShapeCompatible(shape, expectedWidth)) {
          diagnostics.push(diagnostic(
            'XB_SHAPE_MISMATCH',
            `Block '${node.id}' port '${inP.id}' shape ${shape.kind} is not supported for expected dimension ${expectedWidth}.`,
            node.id,
          ));
        }
      }
    } else if (capability !== null && capability.codegen === true) {
      // Check shape capabilities for non-vector blocks
      const allowedShapes = capability.inputShapes ?? capability.shapes;
      for (const inP of inputPorts) {
        const inKey = `${node.id}:${inP.id}`;
        const shape = portShapes.get(inKey) ?? UNRESOLVED_SHAPE;
        if (shape.kind === 'unresolved') {
          // If required shape cannot be resolved
          if (!allowedShapes.includes('scalar')) {
            diagnostics.push(diagnostic(
              'XB_SHAPE_UNRESOLVED',
              `Block '${node.id}' port '${inP.id}' shape could not be resolved.`,
              node.id,
            ));
          }
        } else if (!allowedShapes.includes(shape.kind as any)) {
          diagnostics.push(diagnostic(
            'XB_SHAPE_MISMATCH',
            `Block '${node.id}' port '${inP.id}' shape ${shape.kind} is not supported.`,
            node.id,
          ));
        }
      }
    }
  }

  // Check edge shape compatibility
  for (const edge of model.edges) {
    const srcKey = `${edge.sourceNodeId}:${edge.sourcePortId}`;
    const tgtKey = `${edge.targetNodeId}:${edge.targetPortId}`;
    const srcShape = portShapes.get(srcKey);
    const tgtShape = portShapes.get(tgtKey);

    if (srcShape !== undefined && tgtShape !== undefined && srcShape.kind !== 'unresolved' && tgtShape.kind !== 'unresolved') {
      if (!shapesAreEqual(srcShape, tgtShape)) {
        // Exception: MUX allows scalar/vector inputs to combine, so target is handled by MUX rule
        const tgtNode = nodesById.get(edge.targetNodeId);
        const is1DKalmanPort = (tgtNode?.type === 'KALMAN_FILTER' || tgtNode?.type === 'EXTENDED_KALMAN_FILTER') &&
          srcShape.elementCount === 1 && tgtShape.elementCount === 1;

        if (tgtNode?.type !== 'MUX' && tgtNode?.type !== 'DEMUX' && !is1DKalmanPort) {
          diagnostics.push(diagnostic(
            'XB_SHAPE_MISMATCH',
            `Edge '${edge.id}' connects incompatible shapes (${srcShape.kind}[${srcShape.dimensions.join(',')}] -> ${tgtShape.kind}[${tgtShape.dimensions.join(',')}]).`,
            edge.id,
          ));
        }
      }
    }
  }

  return {
    portShapes,
    diagnostics,
  };
};
