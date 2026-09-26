import {
  StructuredDiagnostic,
  StructuredDiagnosticSchema,
} from '../contracts/engineeringModel';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

export interface InternalBlockSpec {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface InternalConnSpec {
  fromBlockId: string;
  fromPortId: string;
  toBlockId: string;
  toPortId: string;
}

export interface GraphValidationOptions {
  maxBlocks?: number;
  maxConnections?: number;
  requireObservableSink?: boolean;
  requireAllInputsConnected?: boolean;
}

export interface GraphValidationResult {
  valid: boolean;
  diagnostics: StructuredDiagnostic[];
}

const DEFAULT_MAX_BLOCKS = 50;
const DEFAULT_MAX_CONNECTIONS = 100;

const KNOWN_SINK_TYPES = new Set(['Scope', 'Display', 'XYPlot', 'ToWorkspace', 'spectrum_analyzer', 'bode_plotter']);

function isFiniteValue(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(item => isFiniteValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(item => isFiniteValue(item));
  }
  return true;
}

function matchesParameterType(value: unknown, declaredType: string): boolean {
  if (declaredType === 'array') return Array.isArray(value);
  if (declaredType === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
  if (declaredType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (declaredType === 'boolean') return typeof value === 'boolean';
  if (declaredType === 'string') return typeof value === 'string';
  return true;
}

export function validateGeneratedGraph(
  blocks: InternalBlockSpec[],
  connections: InternalConnSpec[],
  catalog: XbridgesCapabilityIndex,
  options?: GraphValidationOptions
): GraphValidationResult {
  const diagnostics: StructuredDiagnostic[] = [];

  const maxBlocks = options?.maxBlocks ?? DEFAULT_MAX_BLOCKS;
  const maxConnections = options?.maxConnections ?? DEFAULT_MAX_CONNECTIONS;

  // 1. Graph Size Limits
  if (blocks.length > maxBlocks) {
    diagnostics.push(StructuredDiagnosticSchema.parse({
      category: 'SCHEMA',
      code: 'EXCEEDS_MAX_BLOCKS',
      severity: 'ERROR',
      message: `Graph block count ${blocks.length} exceeds maximum limit of ${maxBlocks}`,
      expected: maxBlocks,
      actual: blocks.length,
      remediation: `Reduce model complexity or decompose into subsystems with <= ${maxBlocks} blocks.`,
    }));
  }

  if (connections.length > maxConnections) {
    diagnostics.push(StructuredDiagnosticSchema.parse({
      category: 'SCHEMA',
      code: 'EXCEEDS_MAX_CONNECTIONS',
      severity: 'ERROR',
      message: `Graph connection count ${connections.length} exceeds maximum limit of ${maxConnections}`,
      expected: maxConnections,
      actual: connections.length,
      remediation: `Reduce connections or simplify signal routing to <= ${maxConnections} connections.`,
    }));
  }

  // 2. Block Validation
  const blockMap = new Map<string, InternalBlockSpec>();
  const seenBlockIds = new Set<string>();

  for (const block of blocks) {
    if (!block.id || typeof block.id !== 'string' || block.id.trim() === '') {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'SCHEMA',
        code: 'INVALID_BLOCK_ID',
        severity: 'ERROR',
        message: 'Block ID must be a non-empty string',
        entityId: block.id || 'unknown',
      }));
      continue;
    }

    if (seenBlockIds.has(block.id)) {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'SCHEMA',
        code: 'DUPLICATE_BLOCK_ID',
        severity: 'ERROR',
        message: `Duplicate block ID detected: '${block.id}'`,
        entityId: block.id,
        remediation: 'Ensure every block in the generated model has a unique identifier.',
      }));
    } else {
      seenBlockIds.add(block.id);
      blockMap.set(block.id, block);
    }

    const cap = catalog.blocks.get(block.type);
    if (!cap) {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'SCHEMA',
        code: 'UNKNOWN_BLOCK_TYPE',
        severity: 'ERROR',
        message: `Unknown block type '${block.type}' for block '${block.id}'. Not found in X-Bridges capability index.`,
        entityId: block.id,
        actual: block.type,
        remediation: 'Use a block type that exists in the canonical X-Bridges catalog.',
      }));
      continue;
    }

    // Parameter validation
    if (block.params && typeof block.params === 'object') {
      const declaredParamNames = new Set(cap.parameterNames || []);
      const hasDeclaredParams = declaredParamNames.size > 0;

      for (const [paramKey, paramVal] of Object.entries(block.params)) {
        if (paramKey.startsWith('_')) {
          continue; // Allow internal metadata
        }

        // Check if parameter is allowed
        if (hasDeclaredParams && !declaredParamNames.has(paramKey)) {
          diagnostics.push(StructuredDiagnosticSchema.parse({
            category: 'PARAMETER',
            code: 'INVALID_PARAMETER',
            severity: 'ERROR',
            message: `Parameter '${paramKey}' is not recognized for block type '${block.type}' (${block.id}).`,
            entityId: block.id,
            fieldPath: `params.${paramKey}`,
            actual: paramKey,
            expected: Array.from(declaredParamNames),
            remediation: `Available parameters for ${block.type}: ${Array.from(declaredParamNames).join(', ')}`,
          }));
          continue;
        }

        const declaredParam = cap.parameters[paramKey];
        if (declaredParam && !matchesParameterType(paramVal, declaredParam.type)) {
          diagnostics.push(StructuredDiagnosticSchema.parse({
            category: 'PARAMETER',
            code: 'INVALID_PARAMETER_TYPE',
            severity: 'ERROR',
            message: `Parameter '${paramKey}' on block '${block.id}' must have type '${declaredParam.type}'.`,
            entityId: block.id,
            fieldPath: `params.${paramKey}`,
            actual: Array.isArray(paramVal) ? 'array' : typeof paramVal,
            expected: declaredParam.type,
            remediation: `Provide a value matching the catalog type for ${block.type}.${paramKey}.`,
          }));
        }

        // Check finite numerical values
        if (!isFiniteValue(paramVal)) {
          diagnostics.push(StructuredDiagnosticSchema.parse({
            category: 'PARAMETER',
            code: 'INVALID_PARAMETER',
            severity: 'ERROR',
            message: `Parameter '${paramKey}' on block '${block.id}' contains non-finite numerical value (NaN or Infinity).`,
            entityId: block.id,
            fieldPath: `params.${paramKey}`,
            actual: String(paramVal),
            remediation: 'Provide valid finite numeric values for parameters.',
          }));
        }
      }
    }
  }

  // 3. Connection Validation
  const seenConnections = new Set<string>();
  const inDegrees = new Map<string, number>();
  const outDegrees = new Map<string, number>();
  const inputConnections = new Map<string, Map<string, number>>();

  for (const conn of connections) {
    const fromBlock = blockMap.get(conn.fromBlockId);
    const toBlock = blockMap.get(conn.toBlockId);

    if (!fromBlock) {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'TOPOLOGY',
        code: 'DANGLING_CONNECTION',
        severity: 'ERROR',
        message: `Connection references nonexistent source block: '${conn.fromBlockId}'`,
        entityId: conn.fromBlockId,
        portId: conn.fromPortId,
        remediation: 'Ensure the source block exists in the model block specification.',
      }));
    }

    if (!toBlock) {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'TOPOLOGY',
        code: 'DANGLING_CONNECTION',
        severity: 'ERROR',
        message: `Connection references nonexistent target block: '${conn.toBlockId}'`,
        entityId: conn.toBlockId,
        portId: conn.toPortId,
        remediation: 'Ensure the target block exists in the model block specification.',
      }));
    }

    if (!fromBlock || !toBlock) {
      continue;
    }

    // Duplicate connection check
    const connKey = `${conn.fromBlockId}:${conn.fromPortId}->${conn.toBlockId}:${conn.toPortId}`;
    if (seenConnections.has(connKey)) {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'TOPOLOGY',
        code: 'DUPLICATE_CONNECTION',
        severity: 'ERROR',
        message: `Duplicate connection from '${conn.fromBlockId}:${conn.fromPortId}' to '${conn.toBlockId}:${conn.toPortId}'.`,
        entityId: conn.fromBlockId,
        portId: conn.fromPortId,
        remediation: 'Remove duplicate connection edges between identical ports.',
      }));
    } else {
      seenConnections.add(connKey);
    }

    // Source Port Validation
    const fromCap = catalog.blocks.get(fromBlock.type);
    if (fromCap) {
      const isOutput = fromCap.outputs.some(p => p.id === conn.fromPortId);
      const isInput = fromCap.inputs.some(p => p.id === conn.fromPortId);

      if (isInput) {
        diagnostics.push(StructuredDiagnosticSchema.parse({
          category: 'TOPOLOGY',
          code: 'UNKNOWN_SOURCE_PORT',
          severity: 'ERROR',
          message: `Port '${conn.fromPortId}' on block '${fromBlock.id}' (${fromBlock.type}) is an input port, but used as source (output required).`,
          entityId: fromBlock.id,
          portId: conn.fromPortId,
          remediation: 'Connect signals only from output ports.',
        }));
      } else if (!isOutput && !fromCap.allowDynamicOutputs) {
        diagnostics.push(StructuredDiagnosticSchema.parse({
          category: 'TOPOLOGY',
          code: 'UNKNOWN_SOURCE_PORT',
          severity: 'ERROR',
          message: `Output port '${conn.fromPortId}' not found on block '${fromBlock.id}' (${fromBlock.type}).`,
          entityId: fromBlock.id,
          portId: conn.fromPortId,
          expected: fromCap.outputs.map(p => p.id),
          remediation: `Available output ports for ${fromBlock.type}: ${fromCap.outputs.map(p => p.id).join(', ') || 'none'}`,
        }));
      }
    }

    // Target Port Validation
    const toCap = catalog.blocks.get(toBlock.type);
    if (toCap) {
      const isInput = toCap.inputs.some(p => p.id === conn.toPortId);
      const isOutput = toCap.outputs.some(p => p.id === conn.toPortId);

      if (isOutput) {
        diagnostics.push(StructuredDiagnosticSchema.parse({
          category: 'TOPOLOGY',
          code: 'UNKNOWN_TARGET_PORT',
          severity: 'ERROR',
          message: `Port '${conn.toPortId}' on block '${toBlock.id}' (${toBlock.type}) is an output port, but used as target (input required).`,
          entityId: toBlock.id,
          portId: conn.toPortId,
          remediation: 'Connect signals only to input ports.',
        }));
      } else if (!isInput && !toCap.allowDynamicInputs) {
        diagnostics.push(StructuredDiagnosticSchema.parse({
          category: 'TOPOLOGY',
          code: 'UNKNOWN_TARGET_PORT',
          severity: 'ERROR',
          message: `Input port '${conn.toPortId}' not found on block '${toBlock.id}' (${toBlock.type}).`,
          entityId: toBlock.id,
          portId: conn.toPortId,
          expected: toCap.inputs.map(p => p.id),
          remediation: `Available input ports for ${toBlock.type}: ${toCap.inputs.map(p => p.id).join(', ') || 'none'}`,
        }));
      }
    }

    // Track connectivity
    outDegrees.set(conn.fromBlockId, (outDegrees.get(conn.fromBlockId) || 0) + 1);
    inDegrees.set(conn.toBlockId, (inDegrees.get(conn.toBlockId) || 0) + 1);
    const blockInputs = inputConnections.get(conn.toBlockId) || new Map<string, number>();
    blockInputs.set(conn.toPortId, (blockInputs.get(conn.toPortId) || 0) + 1);
    inputConnections.set(conn.toBlockId, blockInputs);
  }

  // 4. Disconnected Blocks Validation
  if (blocks.length > 1) {
    for (const block of blocks) {
      const inDeg = inDegrees.get(block.id) || 0;
      const outDeg = outDegrees.get(block.id) || 0;
      const cap = catalog.blocks.get(block.type);

      if (inDeg === 0 && outDeg === 0) {
        diagnostics.push(StructuredDiagnosticSchema.parse({
          category: 'TOPOLOGY',
          code: 'DISCONNECTED_BLOCK',
          severity: 'ERROR',
          message: `Block '${block.id}' (${block.type}) is completely disconnected from the model graph.`,
          entityId: block.id,
          remediation: 'Connect block inputs and outputs or remove unused block.',
        }));
        continue;
      }

      if (cap) {
        const isPureSource = cap.inputs.length === 0;
        const isPureSink = cap.outputs.length === 0;

        if (!cap.allowDynamicInputs) {
          const connectedInputs = inputConnections.get(block.id) || new Map<string, number>();
          for (const input of cap.inputs) {
            const count = connectedInputs.get(input.id) || 0;
            if (count === 0 && options?.requireAllInputsConnected) {
              diagnostics.push(StructuredDiagnosticSchema.parse({
                category: 'TOPOLOGY',
                code: 'MISSING_INPUT_CONNECTION',
                severity: 'ERROR',
                message: `Required input port '${input.id}' on block '${block.id}' (${block.type}) is not connected.`,
                entityId: block.id,
                portId: input.id,
                remediation: `Connect a signal to every required input port on ${block.type}.`,
              }));
            } else if (count > 1) {
              diagnostics.push(StructuredDiagnosticSchema.parse({
                category: 'TOPOLOGY',
                code: 'INPUT_PORT_OVERCONNECTED',
                severity: 'ERROR',
                message: `Input port '${input.id}' on block '${block.id}' (${block.type}) has ${count} incoming connections.`,
                entityId: block.id,
                portId: input.id,
                remediation: 'Connect at most one signal to a non-dynamic input port.',
              }));
            }
          }
        }

        if (!isPureSource && !isPureSink) {
          // Internal processing block requires both in and out connectivity
          if (inDeg === 0) {
            diagnostics.push(StructuredDiagnosticSchema.parse({
              category: 'TOPOLOGY',
              code: 'DISCONNECTED_BLOCK',
              severity: 'ERROR',
              message: `Processing block '${block.id}' (${block.type}) has no incoming connections to its inputs.`,
              entityId: block.id,
              remediation: 'Connect an upstream signal source to this processing block.',
            }));
          }
          if (outDeg === 0) {
            diagnostics.push(StructuredDiagnosticSchema.parse({
              category: 'TOPOLOGY',
              code: 'DISCONNECTED_BLOCK',
              severity: 'ERROR',
              message: `Processing block '${block.id}' (${block.type}) has no outgoing connections from its outputs.`,
              entityId: block.id,
              remediation: 'Connect the output of this processing block to a downstream block or sink.',
            }));
          }
        }
      }
    }
  }

  // 5. Observable Sink Validation
  if (options?.requireObservableSink) {
    const hasConnectedSink = blocks.some(b => {
      const cap = catalog.blocks.get(b.type);
      const isSink = KNOWN_SINK_TYPES.has(b.type) || cap?.category === 'Sinks';
      const inDeg = inDegrees.get(b.id) || 0;
      return isSink && inDeg > 0;
    });

    if (!hasConnectedSink) {
      diagnostics.push(StructuredDiagnosticSchema.parse({
        category: 'ENGINEERING',
        code: 'MISSING_OBSERVABLE_SINK',
        severity: 'ERROR',
        message: 'The model requires a connected observable sink (e.g., Scope, Display, XYPlot) to capture and visualize simulation results.',
        remediation: 'Add a Scope or Display block and connect the output signal to it.',
      }));
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
