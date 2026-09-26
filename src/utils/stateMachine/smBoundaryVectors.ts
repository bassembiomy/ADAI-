export interface TimingBoundaryVector {
  deltaMs: number;
  accepted: boolean;
}

export type RelationalOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

export interface RelationalBoundaryVector {
  value: number;
  outcome: boolean;
  role: 'below' | 'boundary' | 'above';
}

export interface MCDCAssignmentVector {
  assignments: Readonly<Record<string, boolean>>;
  decisionOutcome: boolean;
}

export interface MCDCPair {
  condition: string;
  trueVector: MCDCAssignmentVector;
  falseVector: MCDCAssignmentVector;
}

/**
 * Computes boundary timing delta vectors given tick interval and tolerance in ms.
 * Enforces unsigned-safe deltaMs >= 0.
 */
export const timingBoundaryValues = (
  tickMs: number,
  toleranceMs: number,
): readonly TimingBoundaryVector[] => {
  const minValid = Math.max(0, tickMs - toleranceMs);
  const maxValid = tickMs + toleranceMs;

  const vectors: TimingBoundaryVector[] = [];

  // Below lower boundary if minValid > 0
  if (minValid > 0) {
    vectors.push({ deltaMs: minValid - 1, accepted: false });
  }

  // Exact lower boundary
  vectors.push({ deltaMs: minValid, accepted: true });

  // Center / nominal
  if (tickMs !== minValid && tickMs !== maxValid) {
    vectors.push({ deltaMs: tickMs, accepted: true });
  }

  // Exact upper boundary (if tolerance > 0)
  if (maxValid !== minValid) {
    vectors.push({ deltaMs: maxValid, accepted: true });
  }

  // Above upper boundary
  vectors.push({ deltaMs: maxValid + 1, accepted: false });

  return Object.freeze(vectors);
};

const evaluateRelational = (
  val: number,
  op: RelationalOperator,
  threshold: number,
): boolean => {
  switch (op) {
    case '<':
      return val < threshold;
    case '<=':
      return val <= threshold;
    case '>':
      return val > threshold;
    case '>=':
      return val >= threshold;
    case '==':
      return val === threshold;
    case '!=':
      return val !== threshold;
  }
};

/**
 * Synthesizes boundary vectors for relational expressions.
 */
export const relationalBoundaryValues = (
  operator: RelationalOperator,
  threshold: number,
  type: 'int' | 'float',
): readonly RelationalBoundaryVector[] => {
  const step = type === 'int' ? 1 : 0.001;
  const belowVal = type === 'int' ? threshold - step : Number((threshold - step).toFixed(4));
  const atVal = threshold;
  const aboveVal = type === 'int' ? threshold + step : Number((threshold + step).toFixed(4));

  return Object.freeze([
    {
      value: belowVal,
      outcome: evaluateRelational(belowVal, operator, threshold),
      role: 'below',
    },
    {
      value: atVal,
      outcome: evaluateRelational(atVal, operator, threshold),
      role: 'boundary',
    },
    {
      value: aboveVal,
      outcome: evaluateRelational(aboveVal, operator, threshold),
      role: 'above',
    },
  ]);
};

/**
 * Synthesizes boundary and out-of-range indices for array bounds checking.
 */
export const invalidIndexValues = (validCount: number): readonly number[] => {
  return Object.freeze([-1, validCount, validCount + 1, 0xffff, 0xffffffff]);
};

/**
 * Evaluates a simple boolean expression with given variable truth assignments.
 */
/**
 * Safely parses and evaluates a boolean expression consisting only of
 * 'true', 'false', '!', '&&', '||', parentheses, and whitespace.
 */
export const evaluateSafeBooleanExpression = (expr: string): boolean => {
  let pos = 0;

  const skipWhitespace = () => {
    while (pos < expr.length && (expr[pos] === ' ' || expr[pos] === '\t' || expr[pos] === '\n' || expr[pos] === '\r')) {
      pos++;
    }
  };

  const parsePrimary = (): boolean => {
    skipWhitespace();
    if (pos >= expr.length) {
      throw new Error('Unexpected end of expression');
    }
    if (expr[pos] === '(') {
      pos++;
      const val = parseOr();
      skipWhitespace();
      if (pos >= expr.length || expr[pos] !== ')') {
        throw new Error("Expected ')'");
      }
      pos++;
      return val;
    }
    if (expr[pos] === '!') {
      pos++;
      return !parsePrimary();
    }
    if (expr.startsWith('true', pos) && !/[a-zA-Z0-9_]/.test(expr[pos + 4] ?? '')) {
      pos += 4;
      return true;
    }
    if (expr.startsWith('false', pos) && !/[a-zA-Z0-9_]/.test(expr[pos + 5] ?? '')) {
      pos += 5;
      return false;
    }
    throw new Error(`Unexpected token at position ${pos}`);
  };

  const parseAnd = (): boolean => {
    let left = parsePrimary();
    while (true) {
      skipWhitespace();
      if (expr.startsWith('&&', pos)) {
        pos += 2;
        const right = parsePrimary();
        left = left && right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseOr = (): boolean => {
    let left = parseAnd();
    while (true) {
      skipWhitespace();
      if (expr.startsWith('||', pos)) {
        pos += 2;
        const right = parseAnd();
        left = left || right;
      } else {
        break;
      }
    }
    return left;
  };

  const result = parseOr();
  skipWhitespace();
  if (pos < expr.length) {
    throw new Error(`Extra tokens at position ${pos}`);
  }
  return result;
};

const evaluateBooleanExpression = (
  expression: string,
  assignment: Readonly<Record<string, boolean>>,
): boolean => {
  // Replace identifier tokens with their boolean values
  let expr = expression;
  // Sort keys by descending length so substrings don't get partially replaced
  const sortedKeys = Object.keys(assignment).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const val = assignment[key] ? 'true' : 'false';
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    expr = expr.replace(regex, val);
  }

  // Validate expression only contains boolean keywords, operators, and parentheses
  if (!/^[truefals!&|() \t]+$/.test(expr)) {
    throw new Error(`SM_MCDC_VECTOR_UNRESOLVED: unsafe expression syntax: ${expression}`);
  }

  try {
    return evaluateSafeBooleanExpression(expr);
  } catch {
    throw new Error(`SM_MCDC_VECTOR_UNRESOLVED: failed to evaluate: ${expression}`);
  }
};

/**
 * Synthesizes MC/DC independent-condition test pairs for a boolean decision.
 * Throws SM_MCDC_VECTOR_UNRESOLVED if independent pairs cannot be synthesized.
 */
export const mcdcVectors = (
  expression: string,
  conditions: readonly string[],
): readonly MCDCPair[] => {
  if (conditions.length === 0) {
    throw new Error('SM_MCDC_VECTOR_UNRESOLVED: conditions list cannot be empty.');
  }

  // Generate all 2^N possible truth combinations
  const n = conditions.length;
  if (n > 12) {
    throw new Error('SM_MCDC_VECTOR_UNRESOLVED: too many conditions for MC/DC synthesis.');
  }

  const combinationsCount = 1 << n;
  const truthTable: { assignment: Record<string, boolean>; outcome: boolean }[] = [];

  for (let i = 0; i < combinationsCount; i++) {
    const assignment: Record<string, boolean> = {};
    for (let c = 0; c < n; c++) {
      assignment[conditions[c]] = Boolean((i >> c) & 1);
    }
    const outcome = evaluateBooleanExpression(expression, assignment);
    truthTable.push({ assignment, outcome });
  }

  const pairs: MCDCPair[] = [];

  for (const targetCondition of conditions) {
    let foundPair: MCDCPair | null = null;

    // Search for two entries in truthTable where:
    // 1. targetCondition differs (one true, one false)
    // 2. all other conditions match
    // 3. outcome differs
    for (const entryA of truthTable) {
      if (!entryA.assignment[targetCondition]) continue; // entryA has targetCondition = true

      for (const entryB of truthTable) {
        if (entryB.assignment[targetCondition]) continue; // entryB has targetCondition = false

        // Check if other conditions are identical
        let otherMatch = true;
        for (const cond of conditions) {
          if (cond !== targetCondition && entryA.assignment[cond] !== entryB.assignment[cond]) {
            otherMatch = false;
            break;
          }
        }

        if (otherMatch && entryA.outcome !== entryB.outcome) {
          // If entryA is true outcome, trueVector is entryA; otherwise entryA is false outcome
          const trueVector: MCDCAssignmentVector = {
            assignments: Object.freeze({ ...entryA.assignment }),
            decisionOutcome: entryA.outcome,
          };
          const falseVector: MCDCAssignmentVector = {
            assignments: Object.freeze({ ...entryB.assignment }),
            decisionOutcome: entryB.outcome,
          };

          foundPair = {
            condition: targetCondition,
            trueVector,
            falseVector,
          };
          break;
        }
      }
      if (foundPair) break;
    }

    if (!foundPair) {
      throw new Error(
        `SM_MCDC_VECTOR_UNRESOLVED: cannot synthesize independent condition pair for '${targetCondition}' in '${expression}'`,
      );
    }

    pairs.push(foundPair);
  }

  return Object.freeze(pairs);
};
