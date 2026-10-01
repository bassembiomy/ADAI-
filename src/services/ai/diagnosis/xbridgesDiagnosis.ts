import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { StructuredDiagnostic } from '../contracts/engineeringModel';

export interface DiagnosisEvidence {
  compileError?: string;
  simulationFailed?: boolean;
  runtimeError?: string;
  engineRunId?: string;
  observables?: Record<string, unknown>;
  rawOutput?: string;
}

export interface DiagnosisReport {
  status: 'clean' | 'has_issues';
  modelFingerprint: string;
  diagnostics: StructuredDiagnostic[];
  evidence?: DiagnosisEvidence;
}

export function diagnoseXbridges(
  snapshot: ModelSnapshot,
  evidence: DiagnosisEvidence = {},
  catalog: XbridgesCapabilityIndex
): DiagnosisReport {
  const diagnostics: StructuredDiagnostic[] = [];

  // 1. Topology & Catalog verification
  const connectedInputPorts = new Set<string>(); // `${nodeId}:${portId}`
  for (const edge of snapshot.edges) {
    if (edge.target && edge.targetHandle) {
      connectedInputPorts.add(`${edge.target}:${edge.targetHandle}`);
    }
  }

  for (const node of snapshot.nodes) {
    const blockType = node.type;
    const capability = catalog.blocks.get(blockType);

    if (!capability) {
      diagnostics.push({
        category: 'COMPILE',
        severity: 'ERROR',
        code: 'UNSUPPORTED_BLOCK_IN_CATALOG',
        message: `Block definition '${blockType}' for node '${node.id}' is not in active X-Bridges catalog`,
        entityId: node.id,
        remediation: 'Replace with supported catalog block'
      });
      continue;
    }

    // Check unconnected required input ports
    const inputPorts = capability.ports.filter(p => p.direction === 'input');
    for (const inPort of inputPorts) {
      const key = `${node.id}:${inPort.id}`;
      if (!connectedInputPorts.has(key)) {
        diagnostics.push({
          category: 'TOPOLOGY',
          severity: 'ERROR',
          code: 'UNCONNECTED_REQUIRED_INPUT',
          message: `Required input port '${inPort.id}' on node '${node.id}' (${blockType}) is unconnected`,
          entityId: node.id,
          portId: inPort.id,
          remediation: `Connect port '${inPort.id}' or provide source signal`
        });
      }
    }

    // Check parameter bounds
    const params = (node.data as any)?.params || {};
    for (const [pName, pVal] of Object.entries(params)) {
      if (typeof pVal === 'number') {
        // Check standard domain constraints: time >= 0, frequency >= 0, resistance/inductance/capacitance > 0
        if (pName.toLowerCase().includes('time') && pVal < 0) {
          diagnostics.push({
            category: 'PARAMETER',
            severity: 'ERROR',
            code: 'INVALID_PARAMETER_VALUE',
            message: `Parameter '${pName}' on block '${node.id}' must be non-negative, got ${pVal}`,
            entityId: node.id,
            fieldPath: pName,
            actual: pVal,
            expected: 0,
            remediation: 'Set value to >= 0'
          });
        }
      }
    }
  }

  // 2. Evidence verification (compile/solver/runtime failures)
  if (evidence.compileError) {
    diagnostics.push({
      category: 'COMPILE',
      severity: 'ERROR',
      code: 'COMPILE_FAILURE',
      message: `Model compilation failed: ${evidence.compileError}`,
      remediation: evidence.compileError
    });
  }

  if (evidence.simulationFailed || evidence.runtimeError) {
    diagnostics.push({
      category: 'SIMULATION',
      severity: 'ERROR',
      code: 'SOLVER_RUNTIME_FAILURE',
      message: `Solver runtime failed: ${evidence.runtimeError || 'Simulation unhandled failure'}`,
      remediation: evidence.runtimeError
    });
  }

  return {
    status: diagnostics.length === 0 ? 'clean' : 'has_issues',
    modelFingerprint: snapshot.stateHash,
    diagnostics,
    evidence
  };
}
