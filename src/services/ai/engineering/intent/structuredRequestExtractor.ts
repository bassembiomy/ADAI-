import { sha256Hex } from '../../../../engine/opm/canonicalHash';
import {
  ExtractedValue,
  RequestEntity,
  RequestRelationship,
  RequestUnderstandingResult,
  StructuredEngineeringRequest,
  UnresolvedRequirement,
  RequestIntentKind
} from '../contracts/structuredEngineeringRequest';
import { normalizeEngineeringRequest } from './requestNormalizer';
import { CatalogEntityResolver } from './catalogEntityResolver';

const NON_ENGINEERING_PATTERNS = [
  /\b(?:poem|poetry|story|vacation|recipe|baking|joke|taxes)\b/i
];

const CFD_FEA_PATTERNS = [
  /\b(?:cfd|fea|finite element|aerodynamic airflow)\b/i
];

const SI_PREFIX_MULTIPLIERS: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9
};

export class StructuredRequestExtractor {
  public extract(input: string): RequestUnderstandingResult {
    const originalText = input;
    const normResult = normalizeEngineeringRequest(input);
    const normalizedText = normResult.normalizedText;
    const lower = normalizedText.toLowerCase();

    // 1. Boundary check: non-engineering
    for (const pat of NON_ENGINEERING_PATTERNS) {
      if (pat.test(lower)) {
        return {
          status: 'unsupported',
          reason: `The ADIA agent specializes in Model-Based Systems Engineering (MBSE), control systems, and dynamic block simulation in X-Bridges. '${originalText.trim()}' is a non-engineering request outside this domain.`
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

    // 3. Detect intent
    let intent: RequestIntentKind = 'create';
    if (lower.startsWith('inspect') || lower.includes('inspect current')) {
      intent = 'inspect';
    } else if (lower.startsWith('modify') || lower.includes('update parameter') || lower.includes('change to') || lower.includes('make it')) {
      intent = 'modify';
    } else if (lower.startsWith('validate') || lower.includes('check model')) {
      intent = 'validate';
    } else if (lower.startsWith('simulate') || lower.includes('run simulation')) {
      intent = 'simulate';
    } else if (lower.startsWith('optimize')) {
      intent = 'optimize';
    }

    // 4. Detect count phrases to avoid confusing counts with operand values
    // e.g. "adding two numbers" -> "two" / "2" is count of numbers, not operand
    const countPatterns = [
      /\b(?:(\d+)|two|three|four|five)\s+(?:numbers|values|operands|inputs|signals)\b/gi,
      /\ba\s+pair\s+of\s+(?:numbers|values|operands)\b/gi
    ];
    let strippedForNumbers = normalizedText;
    for (const pat of countPatterns) {
      strippedForNumbers = strippedForNumbers.replace(pat, ' __COUNT_PHRASE__ ');
    }

    // 5. Operations
    const operations: string[] = [];
    const isTfOrPid = /\b(?:transfer function|transfer_function|tf|pid|controller|plant)\b/i.test(lower);
    const isAdd = !isTfOrPid && /(?:\b(?:add|adding|addition|sum|plus)\b|\+)/i.test(lower);
    const isSub = !isTfOrPid && /(?:\b(?:subtract|subtracting|subtraction|minus|difference)\b|(?<=\w\s+)-(?=\s+\w))/i.test(lower);
    const isMul = /(?:\b(?:multiply|multiplying|multiplication|product|times|vectormul)\b|\*)/i.test(lower);
    const isDiv = /(?:\b(?:divide|dividing|division|quotient)\b|(?<=\d|\s)\/(?=\s|\d))/i.test(lower.replace(/rad\/s/g, ''));

    if (isAdd) operations.push('add');
    if (isSub) operations.push('subtract');
    if (isMul) operations.push('multiply');
    if (isDiv) operations.push('divide');
    if (operations.length === 0) {
      operations.push(intent);
    }

    // 6. Polynomial arrays extraction (e.g. numerator [1], denominator [1, 2, 1])
    const values: ExtractedValue[] = [];
    let polyStripped = strippedForNumbers;
    const numPolyMatch = normalizedText.match(/\bnumerator\s*[:=]?\s*\[([0-9.,\s+-]+)\]/i);
    if (numPolyMatch) {
      const coeffs = numPolyMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      values.push({
        id: 'numerator',
        kind: 'text',
        sourceText: numPolyMatch[0],
        normalizedValue: coeffs,
        confidence: 1.0
      });
      polyStripped = polyStripped.replace(numPolyMatch[0], ' ');
    }
    const denPolyMatch = normalizedText.match(/\bdenominator\s*[:=]?\s*\[([0-9.,\s+-]+)\]/i);
    if (denPolyMatch) {
      const coeffs = denPolyMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      values.push({
        id: 'denominator',
        kind: 'text',
        sourceText: denPolyMatch[0],
        normalizedValue: coeffs,
        confidence: 1.0
      });
      polyStripped = polyStripped.replace(denPolyMatch[0], ' ');
    }

    // 7. Numeric & Unit Values extraction
    // Regex matches signed floats, scientific notation with optional prefix & unit
    const STANDARD_UNITS: Record<string, string> = {
      hz: 'Hz',
      hertz: 'Hz',
      v: 'V',
      volt: 'V',
      volts: 'V',
      ohm: 'ohm',
      ohms: 'ohm',
      'ω': 'ohm',
      'Ω': 'ohm',
      s: 's',
      sec: 's',
      secs: 's',
      second: 's',
      seconds: 's',
      f: 'F',
      h: 'H',
      w: 'W',
      a: 'A',
      rad: 'rad',
      'rad/s': 'rad/s',
      '%': '%'
    };

    const numRegex = /(?:^|[^\w.])([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([pnuµmkKMGT]?)(Hz|ohm|ohms|Ω|V|s|sec|F|H|A|W|%|rad\/s|(?=[^\w]|$))/gi;
    let match: RegExpExecArray | null;
    let valIndex = 1;

    while ((match = numRegex.exec(polyStripped)) !== null) {
      const rawNum = match[1];
      let prefix = match[2];
      const rawUnit = match[3];

      let numVal = parseFloat(rawNum);
      if (!Number.isFinite(numVal)) continue;

      let unit: string | undefined = undefined;
      if (rawUnit && rawUnit.trim().length > 0) {
        unit = STANDARD_UNITS[rawUnit.toLowerCase()] || rawUnit;
      }

      // Check case-sensitive prefix if unit is present
      if (unit && prefix) {
        // Find exact casing of prefix in original match
        const fullMatchText = match[0];
        const prefixIdx = fullMatchText.indexOf(prefix + rawUnit);
        if (prefixIdx !== -1) {
          prefix = fullMatchText[prefixIdx];
        }
      }

      if (prefix && SI_PREFIX_MULTIPLIERS[prefix] && !/[eE]/.test(rawNum)) {
        numVal = parseFloat((numVal * SI_PREFIX_MULTIPLIERS[prefix]).toPrecision(12));
      }

      values.push({
        id: `val_${valIndex++}`,
        kind: unit ? 'unit_value' : 'number',
        sourceText: match[0].trim(),
        normalizedValue: numVal,
        unit,
        confidence: 1.0
      });
    }

    // 8. Entities extraction
    const entities: RequestEntity[] = [];
    const entityNames = new Set<string>();

    const addEntity = (entity: RequestEntity) => {
      if (!entityNames.has(entity.id)) {
        entityNames.add(entity.id);
        entities.push(entity);
      }
    };

    // Constant entities for numeric values if arithmetic
    const isArithmetic = isAdd || isSub || isMul || isDiv;
    if (isArithmetic) {
      values.forEach((val, idx) => {
        if (typeof val.normalizedValue === 'number') {
          addEntity({
            id: `const_${idx + 1}`,
            semanticType: 'Constant',
            sourceText: val.sourceText,
            confidence: 1.0
          });
        }
      });

      if (isAdd) {
        addEntity({
          id: 'sum_1',
          semanticType: 'Sum',
          sourceText: 'add',
          confidence: 1.0
        });
      }
      if (isSub) {
        addEntity({
          id: 'sub_1',
          semanticType: 'Sum',
          sourceText: 'subtract',
          confidence: 1.0
        });
      }
      if (isMul) {
        addEntity({
          id: 'mul_1',
          semanticType: 'VectorMul',
          sourceText: 'multiply',
          confidence: 1.0
        });
      }
      if (isDiv) {
        addEntity({
          id: 'div_1',
          semanticType: 'VectorDiv',
          sourceText: 'divide',
          confidence: 1.0
        });
      }
    }

    // PID Controller entity
    if (/\b(?:pid|pid_controller|pid controller|controller)\b/i.test(lower)) {
      addEntity({
        id: 'pid_1',
        semanticType: 'PID_CONTROLLER',
        sourceText: 'PID controller',
        confidence: 1.0
      });
    }

    // Transfer Function entity
    if (/\b(?:transfer function|transfer_function|tf|plant)\b/i.test(lower)) {
      addEntity({
        id: 'tf_1',
        semanticType: 'TRANSFER_FUNCTION',
        sourceText: 'transfer function',
        confidence: 1.0
      });
    }

    // Scope entity
    const requestedOutputs: string[] = [];
    const hasScope = /\b(?:scope|display|show|plot|observe|observability)\b/i.test(lower);
    if (hasScope) {
      requestedOutputs.push('scope');
      addEntity({
        id: 'scope_1',
        semanticType: 'Scope',
        sourceText: 'scope',
        confidence: 1.0
      });
    }

    // 9. Relationships extraction
    const relationships: RequestRelationship[] = [];
    let relIndex = 1;

    // Constants feed arithmetic blocks
    if (isArithmetic) {
      const targetOpEntity = entities.find(e => e.semanticType === 'Sum' || e.semanticType === 'VectorMul' || e.semanticType === 'VectorDiv');
      if (targetOpEntity) {
        const constEntities = entities.filter(e => e.semanticType === 'Constant');
        for (const c of constEntities) {
          relationships.push({
            id: `rel_${relIndex++}`,
            type: 'feeds',
            sourceEntityId: c.id,
            targetEntityId: targetOpEntity.id,
            sourceText: `${c.sourceText} feeds ${targetOpEntity.semanticType}`
          });
        }
      }
    }

    // Scope observation
    const scopeEntity = entities.find(e => e.semanticType === 'Scope');
    if (scopeEntity) {
      const producer = entities.find(e => e.semanticType === 'VectorMul' || e.semanticType === 'Sum' || e.semanticType === 'VectorDiv' || e.semanticType === 'TRANSFER_FUNCTION');
      if (producer) {
        relationships.push({
          id: `rel_${relIndex++}`,
          type: 'observes',
          sourceEntityId: scopeEntity.id,
          targetEntityId: producer.id,
          sourceText: 'display it on a scope'
        });
      }
    }

    // PID controls Transfer Function / feedback
    const pidEntity = entities.find(e => e.semanticType === 'PID_CONTROLLER');
    const tfEntity = entities.find(e => e.semanticType === 'TRANSFER_FUNCTION');
    if (pidEntity && tfEntity) {
      relationships.push({
        id: `rel_${relIndex++}`,
        type: 'controls',
        sourceEntityId: pidEntity.id,
        targetEntityId: tfEntity.id,
        sourceText: 'PID controller for it'
      });
      relationships.push({
        id: `rel_${relIndex++}`,
        type: 'feedback',
        sourceEntityId: tfEntity.id,
        targetEntityId: pidEntity.id,
        sourceText: 'feedback'
      });
    }

    // 10. Unresolved requirements
    const unresolvedRequirements: UnresolvedRequirement[] = [];
    const requestId = sha256Hex(`${normalizedText}:${Date.now()}`).substring(0, 16);

    if (isArithmetic && values.filter(v => typeof v.normalizedValue === 'number').length < 2) {
      const opName = operations[0] || 'arithmetic';
      unresolvedRequirements.push({
        id: `slot_operands_${requestId}`,
        slotName: 'operands',
        classification: 'REQUIRED',
        valueSchema: 'number[]',
        prompt: `Please provide the two numbers/operands to ${opName}.`,
        reason: `Arithmetic operation '${opName}' requires numeric operands to execute.`,
        affectedDecisionIds: [`${opName}_operands`],
        status: 'unresolved'
      });
    }

    // 11. Ground extracted entities against verified catalog
    const resolver = new CatalogEntityResolver();
    const grounded = resolver.groundEntities(entities);
    const finalEntities = grounded.groundedEntities;

    const structuredReq: StructuredEngineeringRequest = {
      schemaVersion: '1.0.0',
      requestId,
      originalText,
      normalizedText,
      intent,
      operations,
      entities: finalEntities,
      values,
      relationships,
      requestedOutputs,
      constraints: [],
      unresolvedRequirements,
      confidence: unresolvedRequirements.some(r => r.classification === 'REQUIRED') ? 0.8 : 0.95,
      evidence: [
        {
          source: 'user',
          description: `Extracted from user prompt: "${originalText.trim()}"`
        }
      ]
    };

    if (unresolvedRequirements.some(r => r.classification === 'REQUIRED')) {
      const blocking = unresolvedRequirements.find(r => r.classification === 'REQUIRED')!;
      return {
        status: 'clarification_required',
        request: structuredReq,
        blockingRequirement: blocking
      };
    }

    const domainOperations = operations.filter(op => !['create', 'modify', 'inspect', 'validate', 'simulate', 'optimize'].includes(op));

    if (finalEntities.length === 0 && domainOperations.length === 0) {
      return {
        status: 'unsupported',
        reason: `No supported engineering entities or operations detected in: "${originalText.trim()}"`,
        request: structuredReq
      };
    }

    return {
      status: 'ready',
      request: structuredReq
    };
  }
}

export function extractStructuredEngineeringRequest(input: string): RequestUnderstandingResult {
  const extractor = new StructuredRequestExtractor();
  return extractor.extract(input);
}
