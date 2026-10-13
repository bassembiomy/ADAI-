import { EngineeringArchitecturePlan } from '../contracts/architecturePlan';
import {
  EngineeringModelIR,
  IRSubsystem,
  SemanticComponent,
  SemanticPort,
  SemanticConnection,
  IRParameter,
  IRTraceLink,
  IRValidationRule
} from '../contracts/modelIr';

export class ModelIrBuilder {
  /**
   * Converts an approved EngineeringArchitecturePlan into a hierarchical EngineeringModelIR.
   */
  public buildModelIr(
    plan: EngineeringArchitecturePlan,
    modelId: string,
    baseRevision: number = 0
  ): EngineeringModelIR {
    const subsystems: IRSubsystem[] = plan.subsystems.map(s => ({
      id: s.id,
      name: s.name,
      parentSubsystemId: s.parentSubsystemId,
      description: s.description
    }));

    const ports: SemanticPort[] = [];
    const connections: SemanticConnection[] = [];
    const portMap = new Map<string, SemanticPort>();

    // Generate ports from connections
    for (const conn of plan.connections) {
      const fromPortId = `${conn.fromComponentId}_${conn.fromPort}`;
      const toPortId = `${conn.toComponentId}_${conn.toPort}`;

      if (!portMap.has(fromPortId)) {
        const fromPort: SemanticPort = {
          id: fromPortId,
          componentId: conn.fromComponentId,
          name: conn.fromPort,
          direction: 'out',
          domain: conn.domain || 'signal',
          dataType: conn.semanticType
        };
        portMap.set(fromPortId, fromPort);
        ports.push(fromPort);
      }

      if (!portMap.has(toPortId)) {
        const toPort: SemanticPort = {
          id: toPortId,
          componentId: conn.toComponentId,
          name: conn.toPort,
          direction: 'in',
          domain: conn.domain || 'signal',
          dataType: conn.semanticType
        };
        portMap.set(toPortId, toPort);
        ports.push(toPort);
      }

      connections.push({
        id: conn.id,
        fromPortId,
        toPortId,
        semanticType: conn.semanticType
      });
    }

    const traceLinks: IRTraceLink[] = [];

    // Subsystem trace links
    for (const sub of plan.subsystems) {
      traceLinks.push({
        irEntityId: sub.id,
        architectureElementId: sub.id,
        rationale: `Subsystem trace for ${sub.name}`
      });
    }

    // Components & Parameters
    const components: SemanticComponent[] = [];
    const unresolvedParameters: string[] = [];

    for (const comp of plan.components) {
      traceLinks.push({
        irEntityId: comp.id,
        architectureElementId: comp.id,
        rationale: `Component trace for ${comp.name} (${comp.role})`
      });

      const parameters: IRParameter[] = [];

      for (const [paramName, paramVal] of Object.entries(comp.designParameters || {})) {
        const req = plan.informationRequirements.find(
          r => r.slotName === paramName
        );

        let resolutionState: 'resolved' | 'unresolved' = 'resolved';
        let val: unknown = paramVal;
        let source: 'user' | 'inferred' | 'defaulted' | 'catalog' = 'user';

        if (req) {
          resolutionState = req.resolutionState === 'unresolved' ? 'unresolved' : 'resolved';
          val = req.resolvedValue !== undefined ? req.resolvedValue : paramVal;
          source = req.classification === 'DEFAULTABLE' ? 'defaulted' : 'user';
        }

        if (resolutionState === 'unresolved' || val === undefined) {
          unresolvedParameters.push(`${comp.id}.${paramName}`);
        }

        parameters.push({
          name: paramName,
          value: val,
          source,
          confidence: 1.0,
          resolutionState
        });
      }

      components.push({
        id: comp.id,
        name: comp.name,
        conceptId: comp.conceptId,
        subsystemId: comp.subsystemId,
        parameters
      });
    }

    const validationRules: IRValidationRule[] = [
      {
        ruleId: 'rule_structural_integrity',
        description: 'Verify hierarchical containment and valid connection endpoints',
        severity: 'error'
      },
      {
        ruleId: 'rule_no_unresolved_parameters',
        description: 'All required parameters must be resolved before compilation',
        severity: 'error'
      },
      {
        ruleId: 'rule_port_direction_consistency',
        description: 'Connections must flow from out to in ports',
        severity: 'error'
      }
    ];

    const assumptions = plan.assumptions.map(a => a.statement);

    return {
      schemaVersion: '1.0.0',
      modelId,
      name: plan.system.name,
      targetDomain: plan.system.conceptId,
      baseRevision,
      subsystems,
      components,
      ports,
      connections,
      assumptions,
      unresolvedParameters,
      validationRules,
      traceLinks,
      rationale: plan.rationale
    };
  }
}
