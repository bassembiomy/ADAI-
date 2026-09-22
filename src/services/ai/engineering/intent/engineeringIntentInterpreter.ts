import {
  EngineeringIntent,
  EngineeringIntentSchema,
  IntentKind
} from '../contracts/semanticIntent';
import {
  parseArithmeticOperands,
  parseEngineeringEntities
} from '../../planner/engineeringEntityParser';
import { ReferenceResolver, MemoryContextForResolution } from './referenceResolver';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';
import { StructuredEngineeringRequest } from '../contracts/structuredEngineeringRequest';
import { StructuredRequestExtractor } from './structuredRequestExtractor';

export type EngineeringIntentResult =
  | {
      status: 'ok';
      intent: EngineeringIntent;
      structuredRequest?: StructuredEngineeringRequest;
    }
  | {
      status: 'unsupported';
      reason: string;
    };

const NON_ENGINEERING_PATTERNS = [
  /\b(?:poem|poetry|story|vacation|recipe|baking|joke|taxes)\b/i
];

const CFD_FEA_PATTERNS = [
  /\b(?:cfd|fea|finite element|aerodynamic airflow)\b/i
];

export class EngineeringIntentInterpreter {
  private readonly refResolver = new ReferenceResolver();

  public async interpret(
    input: string,
    memory?: MemoryContextForResolution
  ): Promise<EngineeringIntentResult> {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    // 1. Boundary check: Non-engineering
    for (const pat of NON_ENGINEERING_PATTERNS) {
      if (pat.test(lower)) {
        return {
          status: 'unsupported',
          reason: `The ADIA agent specializes in Model-Based Systems Engineering (MBSE), control systems, and dynamic block simulation in X-Bridges. '${trimmed}' is a non-engineering request outside this domain.`
        };
      }
    }

    // 2. Boundary check: 3D CFD / FEA
    for (const pat of CFD_FEA_PATTERNS) {
      if (pat.test(lower)) {
        return {
          status: 'unsupported',
          reason: `3D CFD/FEA analysis is outside 1D lumped-parameter and dynamic modeling. Please formulate a 1D lumped system.`
        };
      }
    }

    // 3. Detect primary intent kind
    let intentKind: IntentKind = 'create';
    if (lower.startsWith('inspect') || lower.includes('inspect current')) {
      intentKind = 'inspect';
    } else if (lower.startsWith('modify') || lower.includes('update parameter') || lower.includes('change to') || lower.includes('make it')) {
      intentKind = 'modify';
    } else if (lower.startsWith('validate') || lower.includes('check model')) {
      intentKind = 'validate';
    } else if (lower.startsWith('simulate') || lower.includes('run simulation')) {
      intentKind = 'simulate';
    } else if (lower.startsWith('optimize')) {
      intentKind = 'optimize';
    }

    // 4. Structured Request extraction & deterministic entity/operand extraction
    const structuredResult = new StructuredRequestExtractor().extract(trimmed);
    const arithmetic = parseArithmeticOperands(trimmed);
    const parsedEntities = parseEngineeringEntities(trimmed);

    // Pronoun resolution check
    const references: string[] = [];
    if (lower.includes(' it ') || lower.endsWith(' it') || lower.includes('make it')) {
      references.push('it');
    }

    // Check for unknown terms (e.g. exotic physics words)
    const unknownTerms: string[] = [];
    const exoticWords = ['hyper-relativistic', 'tachyon', 'dilithium', 'flux capacitor'];
    for (const ew of exoticWords) {
      if (lower.includes(ew)) {
        unknownTerms.push(ew);
      }
    }

    // 5A. Handle arithmetic path
    const isArithmeticWord = /\b(?:add|adding|addition|sum|plus|subtract|subtracting|minus|multiply|multiplying|product|divide|dividing|division)\b/i.test(lower);
    if (isArithmeticWord) {
      const op1 = arithmetic.operands[0]?.value;
      const op2 = arithmetic.operands[1]?.value;
      const opType = lower.includes('subtract') || lower.includes('minus')
        ? 'subtract'
        : lower.includes('multiply') || lower.includes('product')
          ? 'multiply'
          : lower.includes('divide')
            ? 'divide'
            : 'add';
      const operationId = sha256Hex(trimmed.trim().toLowerCase()).slice(0, 16);

      const parameters: Record<string, unknown> = {};
      if (op1 !== undefined && op2 !== undefined) {
        parameters.operand1 = op1;
        parameters.operand2 = op2;
      } else if (op1 !== undefined) {
        parameters.operand1 = op1;
      }

      const intent: EngineeringIntent = {
        schemaVersion: '1.0.0',
        id: `intent.arithmetic.${operationId}`,
        intent: intentKind,
        objective: trimmed,
        domainCandidates: ['arithmetic'],
        systemConceptIds: [
          opType === 'add' ? 'concept_addition' : `concept_${opType}`,
          opType === 'add' ? 'concept.math.addition' : `concept.math.${opType}`
        ],
        operations: [
          {
            type: opType,
            parameters,
            targetConceptId: opType === 'add' ? 'concept_addition' : `concept_${opType}`
          }
        ],
        controlledVariables: [],
        actuators: [],
        plants: [],
        sensors: [],
        inputs: arithmetic.operands.map(o => String(o.value)),
        outputs: [opType === 'add' ? 'sum' : 'difference'],
        constraints: [],
        requestedFidelity: 'symbolic',
        references,
        confidence: 1.0,
        unknownTerms,
        unresolvedReferences: [],
        evidence: [
          { sourceId: 'user_prompt', description: 'Arithmetic intent detected', score: 1.0 }
        ]
      };
      return {
        status: 'ok',
        intent,
        structuredRequest: structuredResult.status === 'ready' || structuredResult.status === 'clarification_required'
          ? structuredResult.request
          : undefined
      };
    }

    // 5B. Handle motor control & electromechanical systems
    const plants: string[] = [];
    const actuators: string[] = [];
    const sensors: string[] = [];
    const controlledVariables: string[] = [];
    const systemConceptIds: string[] = [];
    const domainCandidates: string[] = [];

    if (lower.includes('bldc') || lower.includes('brushless')) {
      plants.push('concept.electromechanical.bldc_motor');
      systemConceptIds.push('concept.electromechanical.bldc_motor');
      domainCandidates.push('electromechanical');
    }

    if (lower.includes('inverter')) {
      actuators.push('concept.electrical.three_phase_inverter');
      systemConceptIds.push('concept.electrical.three_phase_inverter');
      domainCandidates.push('electrical');
    }

    if (lower.includes('hall') || lower.includes('sensor')) {
      sensors.push('concept.sensing.hall_sensors');
      systemConceptIds.push('concept.sensing.hall_sensors');
      domainCandidates.push('sensing');
    }

    if (lower.includes('speed') || lower.includes('velocity')) {
      controlledVariables.push('speed');
      systemConceptIds.push('concept.control.speed_controller');
      domainCandidates.push('control');
    }

    // If motor was requested without explicit inverter, motor still functionally requires an inverter
    if (plants.includes('concept.electromechanical.bldc_motor') && actuators.length === 0) {
      actuators.push('concept.electrical.three_phase_inverter');
    }

    const constraints: string[] = [];
    if (lower.includes('24v')) constraints.push('24V');
    if (lower.includes('12v')) constraints.push('12V');
    if (lower.includes('48v')) constraints.push('48V');

    const intentId = sha256Hex(trimmed.trim().toLowerCase()).slice(0, 16);
    const intent: EngineeringIntent = {
      schemaVersion: '1.0.0',
      id: `intent.engineering.${intentId}`,
      intent: intentKind,
      objective: trimmed,
      domainCandidates: domainCandidates.length > 0 ? Array.from(new Set(domainCandidates)) : ['control'],
      systemConceptIds: Array.from(new Set(systemConceptIds)),
      operations: [],
      controlledVariables,
      actuators,
      plants,
      sensors,
      inputs: [],
      outputs: controlledVariables.length > 0 ? controlledVariables : ['output'],
      constraints,
      requestedFidelity: 'dynamic',
      references,
      confidence: 0.95,
      unknownTerms,
      unresolvedReferences: [],
      evidence: [
        { sourceId: 'user_prompt', description: 'Extracted functional engineering concepts', score: 0.95 }
      ]
    };

    return {
      status: 'ok',
      intent: EngineeringIntentSchema.parse(intent)
    };
  }
}
