/**
 * src/services/ai/planner/engineeringEntityParser.ts
 *
 * Generic parser for extracting engineering quantities, units, and symbols
 * from natural language input.
 */

export interface ParsedEngineeringEntities {
  resistance?: number;
  inductance?: number;
  capacitance?: number;
  frequency?: number;
  gain?: number;
  dampingRatio?: number;
  kp?: number;
  ki?: number;
  kd?: number;
  setpoint?: number;
  sourceVoltage?: number;
}

const PREFIX_MULTIPLIERS: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

function parseScaledNumber(numStr: string, unitStr?: string): number | undefined {
  const num = parseFloat(numStr);
  if (isNaN(num)) return undefined;
  if (!unitStr) return num;

  const firstChar = unitStr.charAt(0);
  if (PREFIX_MULTIPLIERS[firstChar] !== undefined) {
    return num * PREFIX_MULTIPLIERS[firstChar];
  }

  return num;
}

export interface ParsedArithmeticOperand {
  value: number;
  unit?: string;
  baseUnit?: string;
  raw: string;
}

export function parseArithmeticOperands(text: string): {
  operands: ParsedArithmeticOperand[];
  hasEachQualifier: boolean;
} {
  const operands: ParsedArithmeticOperand[] = [];
  const eachQualifier = /\beach\s+(?:is|=|of)?\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)/i.test(text);

  // Matches signed floats, scientific notation, with optional SI prefix and unit
  const tokenRegex = /(?:^|[^\w.])([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([pnuµmkKMGT]?)(Hz|ohm|ohms|Ω|V|s|F|H|%|(?=[^\w]|$))/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    const rawNum = match[1];
    const prefix = match[2];
    const rawUnit = match[3];

    let val = parseFloat(rawNum);
    if (!Number.isFinite(val)) continue;

    // Apply SI prefix if present and not already accounted for by scientific exponent (e.g. 1e3)
    if (prefix && PREFIX_MULTIPLIERS[prefix] && !/[eE]/.test(rawNum)) {
      val = val * PREFIX_MULTIPLIERS[prefix];
    }

    let baseUnit: string | undefined = undefined;
    if (rawUnit) {
      if (/^(?:ohm|ohms|Ω)$/i.test(rawUnit)) baseUnit = 'ohm';
      else if (/^Hz$/i.test(rawUnit)) baseUnit = 'Hz';
      else if (/^V$/i.test(rawUnit)) baseUnit = 'V';
      else if (/^s$/i.test(rawUnit)) baseUnit = 's';
      else if (/^F$/i.test(rawUnit)) baseUnit = 'F';
      else if (/^H$/i.test(rawUnit)) baseUnit = 'H';
      else if (/^%$/i.test(rawUnit)) baseUnit = '%';
    }

    operands.push({
      value: val,
      unit: (prefix || '') + (rawUnit || ''),
      baseUnit,
      raw: match[0].trim(),
    });
  }

  return { operands, hasEachQualifier: eachQualifier };
}

export function parseEngineeringEntities(input: string): ParsedEngineeringEntities {
  const result: ParsedEngineeringEntities = {};
  if (!input || typeof input !== 'string') return result;

  // 1. Resistance (R = 100, 100 ohm, 2.2k, 10kOhm)
  const rMatch = input.match(/\b(?:R\s*[:=]\s*|resistance\s*(?:is|of|[:=])?\s*)?(-?\d+(?:\.\d+)?)\s*([kKMm]?)\s*(?:ohm|ohms|Ω|\b)/i);
  // Also match explicit R=100
  const rEqMatch = input.match(/\bR\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*([kKMm]?)\s*(?:ohm|ohms|Ω)?\b/i);
  const rWordMatch = input.match(/(-?\d+(?:\.\d+)?)\s*([kKMm]?)\s*(?:ohm|ohms|Ω)\b/i);
  if (rEqMatch) {
    result.resistance = parseScaledNumber(rEqMatch[1], rEqMatch[2]);
  } else if (rWordMatch) {
    result.resistance = parseScaledNumber(rWordMatch[1], rWordMatch[2]);
  }

  // 2. Inductance (L = 10mH, 500nH, 1H)
  const lMatch = input.match(/\b(?:L\s*[:=]\s*|inductance\s*(?:is|of|[:=])?\s*)?(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*H\b/i) ||
                 input.match(/\bL\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*H?\b/i);
  if (lMatch) {
    result.inductance = parseScaledNumber(lMatch[1], lMatch[2]);
  }

  // 3. Capacitance (C = 100uF, 47µF, 10nF)
  const cMatch = input.match(/\b(?:C\s*[:=]\s*|capacitance\s*(?:is|of|[:=])?\s*)?(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*F\b/i) ||
                 input.match(/\bC\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*F?\b/i);
  if (cMatch) {
    result.capacitance = parseScaledNumber(cMatch[1], cMatch[2]);
  }

  // 4. Frequency (cutoff 50kHz, 100 Hz)
  const freqMatch = input.match(/(?:(?:cutoff|frequency|freq|fc)\s*[:=]?\s*|\b)(-?\d+(?:\.\d+)?)\s*([kKMmG]?)\s*Hz\b/i);
  if (freqMatch) {
    result.frequency = parseScaledNumber(freqMatch[1], freqMatch[2]);
  }

  // 5. Gain (gain = 2.5, gain 2)
  const gainMatch = input.match(/\bgain\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (gainMatch) {
    result.gain = parseFloat(gainMatch[1]);
  }

  // 6. Damping ratio (zeta = 0.707, damping = 0.5)
  const zetaMatch = input.match(/\b(?:zeta|damping|dampingRatio)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (zetaMatch) {
    result.dampingRatio = parseFloat(zetaMatch[1]);
  }

  // 7. PID parameters: Kp, Ki, Kd
  const kpMatch = input.match(/\bKp\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (kpMatch) result.kp = parseFloat(kpMatch[1]);

  const kiMatch = input.match(/\bKi\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (kiMatch) result.ki = parseFloat(kiMatch[1]);

  const kdMatch = input.match(/\bKd\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (kdMatch) result.kd = parseFloat(kdMatch[1]);

  // 8. Setpoint (setpoint = 120, target = 100)
  const spMatch = input.match(/\b(?:setpoint|target)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (spMatch) result.setpoint = parseFloat(spMatch[1]);

  // 9. Source voltage (V_in = 24V, 12V, 400V)
  const vMatch = input.match(/\b(?:V|Vin|voltage|supply)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*([kKmM]?)\s*V\b/i);
  if (vMatch) {
    result.sourceVoltage = parseScaledNumber(vMatch[1], vMatch[2]);
  }

  // 10. Positional & Sequence Fallbacks for component values (e.g. "10 10mH 100uF", "10 10 100", "10, 10m, 100u")
  if (result.resistance === undefined && result.inductance !== undefined && result.capacitance !== undefined) {
    // If L and C are identified, check if there is a remaining bare number before or around them for Resistance
    const stripped = input
      .replace(/\b(?:L\s*[:=]\s*|inductance\s*(?:is|of|[:=])?\s*)?(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*H\b/gi, '')
      .replace(/\bL\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*H?\b/gi, '')
      .replace(/\b(?:C\s*[:=]\s*|capacitance\s*(?:is|of|[:=])?\s*)?(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*F\b/gi, '')
      .replace(/\bC\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*([pnumµMG]?)\s*F?\b/gi, '');
    const bareNumMatch = stripped.match(/\b(-?\d+(?:\.\d+)?)\s*([kKMm]?)\b/);
    if (bareNumMatch) {
      result.resistance = parseScaledNumber(bareNumMatch[1], bareNumMatch[2]);
    }
  } else if (result.resistance === undefined && result.inductance === undefined && result.capacitance === undefined) {
    // Check if input is a space/comma separated sequence of numbers (e.g. "10 10 100", "10 10m 100u", "10 10 100 100")
    const numberTokens = input.trim().match(/(-?\d+(?:\.\d+)?\s*[pnumµkKM]?(?:[HhFf]|ohm|ohms|Ω)?)/g);
    if (numberTokens && numberTokens.length >= 3) {
      const parseToken = (tok: string): number | undefined => {
        const m = tok.match(/(-?\d+(?:\.\d+)?)\s*([pnumµkKM]?)/i);
        if (!m) return undefined;
        return parseScaledNumber(m[1], m[2]);
      };
      const n1 = parseToken(numberTokens[0]);
      const n2 = parseToken(numberTokens[1]);
      const n3 = parseToken(numberTokens[2]);
      if (n1 !== undefined && n2 !== undefined && n3 !== undefined) {
        result.resistance = n1;
        result.inductance = n2;
        result.capacitance = n3;
      }
    }
  }

  return result;
}
