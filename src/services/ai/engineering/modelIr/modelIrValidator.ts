import {
  EngineeringModelIR,
  validateModelIrIntegrity,
  ModelIrIntegrityResult
} from '../contracts/modelIr';

export interface ModelIrValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateModelIr(ir: EngineeringModelIR): ModelIrValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Structural integrity (subsystem, component, port, and connection references)
  const integrity: ModelIrIntegrityResult = validateModelIrIntegrity(ir);
  if (!integrity.valid) {
    errors.push(...integrity.errors);
  }

  // 2. Unresolved parameters check
  if (ir.unresolvedParameters && ir.unresolvedParameters.length > 0) {
    for (const p of ir.unresolvedParameters) {
      errors.push(`Unresolved parameter: '${p}'`);
    }
  }

  for (const comp of ir.components) {
    for (const param of comp.parameters) {
      if (param.resolutionState === 'unresolved' || param.value === undefined) {
        errors.push(`Component '${comp.id}' has unresolved parameter '${param.name}'`);
      }
    }
  }

  // 3. Port direction consistency
  const portMap = new Map(ir.ports.map(p => [p.id, p]));
  for (const conn of ir.connections) {
    const fromPort = portMap.get(conn.fromPortId);
    const toPort = portMap.get(conn.toPortId);

    if (fromPort && toPort) {
      if (fromPort.direction === 'in') {
        warnings.push(
          `Connection '${conn.id}' source port '${fromPort.id}' has direction 'in' instead of 'out'`
        );
      }
      if (toPort.direction === 'out') {
        warnings.push(
          `Connection '${conn.id}' target port '${toPort.id}' has direction 'out' instead of 'in'`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
