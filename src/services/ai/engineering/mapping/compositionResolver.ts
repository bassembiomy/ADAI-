import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { EngineeringPattern } from '../../planner/generalGraphPlanner';

export interface ConceptBlockResolution {
  blockId: string;
  blockType: string;
  confidence: number;
  parameterMapping: Record<string, string>;
  portMapping: Record<string, string>;
}

export class CompositionResolver {
  private static readonly DIRECT_CONCEPT_MAP: Record<
    string,
    {
      blockId: string;
      parameterMapping?: Record<string, string>;
      portMapping?: Record<string, string>;
    }
  > = {
    concept_addition: {
      blockId: 'Sum',
      portMapping: { in1: 'in1', in2: 'in2', sum: 'out' }
    },
    concept_subtraction: {
      blockId: 'Sum', // Sum block handles signs (+-)
      portMapping: { in1: 'in1', in2: 'in2', diff: 'out' }
    },
    concept_gain: {
      blockId: 'Gain',
      parameterMapping: { gain: 'gain', k: 'gain' },
      portMapping: { in: 'in', out: 'out' }
    },
    concept_speed_controller: {
      blockId: 'PID_CONTROLLER',
      parameterMapping: { kp: 'Kp', ki: 'Ki', kd: 'Kd' },
      portMapping: { setpoint: 'in1', error: 'in1', out: 'out' }
    },
    concept_pid_controller: {
      blockId: 'PID_CONTROLLER',
      parameterMapping: { kp: 'Kp', ki: 'Ki', kd: 'Kd' },
      portMapping: { in: 'in1', out: 'out' }
    },
    concept_inverter: {
      blockId: 'THREE_PHASE_INVERTER',
      parameterMapping: { dc_bus_voltage: 'dc_bus_voltage' },
      portMapping: { gate_in: 'gate_in', u: 'u', v: 'v', w: 'w' }
    },
    concept_constant: {
      blockId: 'Constant',
      parameterMapping: { value: 'value' },
      portMapping: { out: 'out' }
    },
    concept_integrator: {
      blockId: 'Integrator',
      portMapping: { in: 'in', out: 'out' }
    }
  };

  /**
   * Resolves a semantic concept ID to an verified catalog block definition.
   */
  public resolveConcept(
    conceptId: string,
    catalog: XbridgesCapabilityIndex,
    patterns: readonly EngineeringPattern[] = []
  ): ConceptBlockResolution | undefined {
    // 1. Direct verified taxonomy map
    const direct = CompositionResolver.DIRECT_CONCEPT_MAP[conceptId];
    if (direct && catalog.blocks.has(direct.blockId)) {
      return {
        blockId: direct.blockId,
        blockType: direct.blockId,
        confidence: 1.0,
        parameterMapping: direct.parameterMapping || {},
        portMapping: direct.portMapping || {}
      };
    }

    // 2. Direct exact blockId match in catalog
    const upperId = conceptId.replace(/^concept_/, '').toUpperCase();
    if (catalog.blocks.has(upperId)) {
      return {
        blockId: upperId,
        blockType: upperId,
        confidence: 0.95,
        parameterMapping: {},
        portMapping: {}
      };
    }

    // 3. Match from verified engineering patterns
    for (const pat of patterns) {
      if (pat.patternId.toLowerCase().includes(conceptId.toLowerCase()) && pat.primaryBlockId) {
        if (catalog.blocks.has(pat.primaryBlockId)) {
          return {
            blockId: pat.primaryBlockId,
            blockType: pat.primaryBlockId,
            confidence: 0.9,
            parameterMapping: {},
            portMapping: {}
          };
        }
      }
    }

    return undefined;
  }
}
