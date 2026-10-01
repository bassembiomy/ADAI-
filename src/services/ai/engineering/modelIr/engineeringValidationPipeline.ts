import {
  EngineeringModelIR,
  BoundEngineeringModelIR,
  EngineeringModelIRSchema
} from '../contracts/modelIr';
import { StructuredDiagnostic } from '../../contracts/engineeringModel';
import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';

export interface ValidationContext {
  catalog?: XbridgesCapabilityIndex;
  checkAlgebraicLoops?: boolean;
}

export type ValidationStatus = 'passed' | 'warnings_found' | 'failed';

export interface EngineeringValidationReport {
  status: ValidationStatus;
  isValid: boolean;
  diagnostics: StructuredDiagnostic[];
  stages: {
    schemaAndIntegrity: boolean;
    parametersAndCompleteness: boolean;
    portsAndDimensions: boolean;
    topologyAndFeedback: boolean;
  };
}

export class EngineeringValidationPipeline {
  /**
   * Executes a staged validation pipeline covering schema, parameters, ports/dimensions, and topology.
   */
  public validate(
    ir: EngineeringModelIR | BoundEngineeringModelIR,
    context: ValidationContext = {}
  ): EngineeringValidationReport {
    const diagnostics: StructuredDiagnostic[] = [];

    // Stage 1: Schema & Structural Integrity
    const stage1Valid = this.validateSchemaAndIntegrity(ir, diagnostics);

    // Stage 2: Parameters & Completeness
    const stage2Valid = this.validateParametersAndCompleteness(ir, diagnostics);

    // Stage 3: Ports & Physical Domains
    const stage3Valid = this.validatePortsAndDimensions(ir, diagnostics);

    // Stage 4: Topology & Feedback Loops
    const stage4Valid = this.validateTopologyAndFeedback(ir, context, diagnostics);

    const hasErrors = diagnostics.some(d => d.severity === 'ERROR');
    const hasWarnings = diagnostics.some(d => d.severity === 'WARNING');

    let status: ValidationStatus = 'passed';
    if (hasErrors) status = 'failed';
    else if (hasWarnings) status = 'warnings_found';

    return {
      status,
      isValid: !hasErrors,
      diagnostics,
      stages: {
        schemaAndIntegrity: stage1Valid,
        parametersAndCompleteness: stage2Valid,
        portsAndDimensions: stage3Valid,
        topologyAndFeedback: stage4Valid
      }
    };
  }

  private validateSchemaAndIntegrity(
    ir: EngineeringModelIR,
    diagnostics: StructuredDiagnostic[]
  ): boolean {
    let valid = true;
    const parsed = EngineeringModelIRSchema.safeParse(ir);
    if (!parsed.success) {
      valid = false;
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          category: 'SCHEMA',
          code: 'SCHEMA_VALIDATION_ERROR',
          severity: 'ERROR',
          message: issue.message,
          fieldPath: issue.path.join('.')
        });
      }
    }

    const subsystemIds = new Set(ir.subsystems.map(s => s.id));
    for (const sub of ir.subsystems) {
      if (sub.parentSubsystemId && !subsystemIds.has(sub.parentSubsystemId)) {
        valid = false;
        diagnostics.push({
          category: 'TOPOLOGY',
          code: 'DANGLING_SUBSYSTEM_PARENT',
          severity: 'ERROR',
          message: `Subsystem '${sub.id}' references non-existent parentSubsystemId '${sub.parentSubsystemId}'`,
          entityId: sub.id
        });
      }
    }

    for (const comp of ir.components) {
      if (!subsystemIds.has(comp.subsystemId)) {
        valid = false;
        diagnostics.push({
          category: 'TOPOLOGY',
          code: 'DANGLING_COMPONENT_SUBSYSTEM',
          severity: 'ERROR',
          message: `Component '${comp.id}' references non-existent subsystem '${comp.subsystemId}'`,
          entityId: comp.id
        });
      }

      if (comp.conceptId.startsWith('xbridges_') || comp.conceptId.startsWith('block_')) {
        valid = false;
        diagnostics.push({
          category: 'ENGINEERING',
          code: 'LEAKED_CATALOG_ID_IN_CONCEPT',
          severity: 'ERROR',
          message: `Component '${comp.id}' illegally contains catalog block ID '${comp.conceptId}' in conceptId`,
          entityId: comp.id,
          remediation: 'Use a semantic concept identifier instead of a raw catalog block ID.'
        });
      }
    }

    return valid;
  }

  private validateParametersAndCompleteness(
    ir: EngineeringModelIR,
    diagnostics: StructuredDiagnostic[]
  ): boolean {
    let valid = true;

    if (ir.unresolvedParameters && ir.unresolvedParameters.length > 0) {
      valid = false;
      for (const p of ir.unresolvedParameters) {
        diagnostics.push({
          category: 'PARAMETER',
          code: 'UNRESOLVED_REQUIRED_PARAMETER',
          severity: 'ERROR',
          message: `Required parameter '${p}' remains unresolved in Model IR`,
          fieldPath: p,
          remediation: 'Provide a value or resolve through clarification before compilation.'
        });
      }
    }

    for (const comp of ir.components) {
      for (const param of comp.parameters) {
        if (param.resolutionState === 'unresolved' || param.value === undefined) {
          valid = false;
          diagnostics.push({
            category: 'PARAMETER',
            code: 'PARAMETER_VALUE_UNDEFINED',
            severity: 'ERROR',
            message: `Parameter '${param.name}' on component '${comp.id}' is undefined`,
            entityId: comp.id,
            fieldPath: `components.${comp.id}.${param.name}`
          });
        }
      }
    }

    return valid;
  }

  private validatePortsAndDimensions(
    ir: EngineeringModelIR,
    diagnostics: StructuredDiagnostic[]
  ): boolean {
    let valid = true;
    const portMap = new Map(ir.ports.map(p => [p.id, p]));

    for (const conn of ir.connections) {
      const fromPort = portMap.get(conn.fromPortId);
      const toPort = portMap.get(conn.toPortId);

      if (!fromPort) {
        valid = false;
        diagnostics.push({
          category: 'TOPOLOGY',
          code: 'DANGLING_CONNECTION_SOURCE_PORT',
          severity: 'ERROR',
          message: `Connection '${conn.id}' source port '${conn.fromPortId}' does not exist`,
          entityId: conn.id,
          portId: conn.fromPortId
        });
      }

      if (!toPort) {
        valid = false;
        diagnostics.push({
          category: 'TOPOLOGY',
          code: 'DANGLING_CONNECTION_TARGET_PORT',
          severity: 'ERROR',
          message: `Connection '${conn.id}' target port '${conn.toPortId}' does not exist`,
          entityId: conn.id,
          portId: conn.toPortId
        });
      }

      if (fromPort && toPort) {
        // Physical domain consistency
        if (fromPort.domain !== toPort.domain && fromPort.domain !== 'signal' && toPort.domain !== 'signal') {
          valid = false;
          diagnostics.push({
            category: 'ENGINEERING',
            code: 'PHYSICAL_DOMAIN_MISMATCH',
            severity: 'ERROR',
            message: `Connection '${conn.id}' connects incompatible physical domains '${fromPort.domain}' and '${toPort.domain}'`,
            entityId: conn.id,
            expected: fromPort.domain,
            actual: toPort.domain,
            remediation: `Insert an appropriate transducer or domain converter between ${fromPort.domain} and ${toPort.domain}.`
          });
        }
      }
    }

    return valid;
  }

  private validateTopologyAndFeedback(
    ir: EngineeringModelIR,
    context: ValidationContext,
    diagnostics: StructuredDiagnostic[]
  ): boolean {
    let valid = true;

    // Algebraic loop detection: directed cycle among direct feedthrough / algebraic components
    if (context.checkAlgebraicLoops !== false) {
      const portToComp = new Map(ir.ports.map(p => [p.id, p.componentId]));
      const compMap = new Map(ir.components.map(c => [c.id, c]));

      // Build adjacency list for components
      const adj = new Map<string, string[]>();
      for (const comp of ir.components) {
        adj.set(comp.id, []);
      }

      for (const conn of ir.connections) {
        const fromCompId = portToComp.get(conn.fromPortId);
        const toCompId = portToComp.get(conn.toPortId);
        if (fromCompId && toCompId && fromCompId !== toCompId) {
          adj.get(fromCompId)?.push(toCompId);
        }
      }

      // Detect direct cycles among non-stateful blocks (gain, sum, etc.)
      const isDynamic = (compId: string): boolean => {
        const c = compMap.get(compId);
        if (!c) return false;
        const concept = c.conceptId.toLowerCase();
        return (
          concept.includes('integrator') ||
          concept.includes('delay') ||
          concept.includes('motor') ||
          concept.includes('plant') ||
          concept.includes('observer') ||
          concept.includes('pid')
        );
      };

      const visited = new Set<string>();
      const recStack = new Set<string>();

      const checkCycle = (node: string, path: string[]): boolean => {
        visited.add(node);
        recStack.add(node);

        for (const neighbor of adj.get(node) || []) {
          if (recStack.has(neighbor)) {
            // Cycle detected! Check if ALL nodes in the cycle are algebraic (non-dynamic)
            const cycleNodes = path.slice(path.indexOf(neighbor));
            const isAlgebraicLoop = cycleNodes.every(n => !isDynamic(n));

            if (isAlgebraicLoop) {
              valid = false;
              diagnostics.push({
                category: 'TOPOLOGY',
                code: 'ALGEBRAIC_LOOP_DETECTED',
                severity: 'ERROR',
                message: `Direct algebraic loop detected along path: ${[...cycleNodes, neighbor].join(' -> ')}`,
                entityId: node,
                remediation: 'Break the direct algebraic loop by introducing a stateful delay or integrator block.'
              });
              return true;
            }
          } else if (!visited.has(neighbor)) {
            if (checkCycle(neighbor, [...path, neighbor])) {
              return true;
            }
          }
        }

        recStack.delete(node);
        return false;
      };

      for (const comp of ir.components) {
        if (!visited.has(comp.id)) {
          checkCycle(comp.id, [comp.id]);
        }
      }
    }

    return valid;
  }
}
