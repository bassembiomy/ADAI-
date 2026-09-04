/**
 * Restricted expression compiler: parses, resolves symbols, checks types,
 * and emits typed IR for embedded C generation and TypeScript runtime.
 */

import type {
  OpmDiagnostic,
  OpmScalarType,
  OpmSourceRef,
} from './executableTypes';
import { parseOpmExpression, type ExpressionAst } from './expressionParser';

export type OpmExpectedType =
  | { kind: 'exact'; type: OpmScalarType }
  | { kind: 'boolean' }
  | { kind: 'numeric' }
  | { kind: 'anyScalar' };

export interface OpmValueSymbol {
  id: string;
  name: string;
  cIdentifier: string;
  type: OpmScalarType;
  access?: 'readOnly' | 'readWrite';
}

export interface OpmExpressionScope {
  symbols: Readonly<Record<string, OpmValueSymbol>>;
}

export type TypedExpressionIr =
  | {
      kind: 'literal';
      op?: undefined;
      type: OpmScalarType;
      value: boolean | number | string;
      sourceRange?: [number, number];
    }
  | {
      kind: 'reference';
      op?: undefined;
      type: OpmScalarType;
      symbolId: string;
      name: string;
      cIdentifier: string;
      sourceRange?: [number, number];
    }
  | {
      kind: 'unary';
      op: 'not' | 'negate' | 'plus';
      type: OpmScalarType;
      operand: TypedExpressionIr;
      sourceRange?: [number, number];
    }
  | {
      kind: 'binary';
      op:
        | 'add'
        | 'subtract'
        | 'multiply'
        | 'divide'
        | 'modulo'
        | 'and'
        | 'or'
        | 'equal'
        | 'notEqual'
        | 'lessThan'
        | 'lessEqual'
        | 'greaterThan'
        | 'greaterEqual';
      type: OpmScalarType;
      left: TypedExpressionIr;
      right: TypedExpressionIr;
      sourceRange?: [number, number];
    }
  | {
      kind: 'intrinsic';
      op?: undefined;
      name: 'abs' | 'min' | 'max' | 'clamp';
      type: OpmScalarType;
      args: TypedExpressionIr[];
      sourceRange?: [number, number];
    };

export interface ExpressionCompileResult {
  ir?: TypedExpressionIr;
  diagnostics: OpmDiagnostic[];
}

const SUPPORTED_INTRINSICS = new Set(['abs', 'min', 'max', 'clamp']);

function isNumericType(t: OpmScalarType): boolean {
  return t.kind === 'int32' || t.kind === 'uint32' || t.kind === 'float32';
}

function isBoolType(t: OpmScalarType): boolean {
  return t.kind === 'bool';
}

function typesCompatible(a: OpmScalarType, b: OpmScalarType): boolean {
  if (a.kind === 'enum' || b.kind === 'enum') {
    return a.kind === 'enum' && b.kind === 'enum' && a.enumId === b.enumId;
  }
  if (a.kind === 'bool' || b.kind === 'bool') {
    return a.kind === 'bool' && b.kind === 'bool';
  }
  return isNumericType(a) && isNumericType(b);
}

function resolveNumericPromotion(a: OpmScalarType, b: OpmScalarType): OpmScalarType {
  if (a.kind === 'float32' || b.kind === 'float32') {
    return { kind: 'float32' };
  }
  if (a.kind === 'uint32' || b.kind === 'uint32') {
    return { kind: 'uint32' };
  }
  return { kind: 'int32' };
}

export function compileOpmExpression(
  text: string,
  expected: OpmExpectedType,
  scope: OpmExpressionScope,
  source: OpmSourceRef,
): ExpressionCompileResult {
  const parseRes = parseOpmExpression(text, source);
  if (parseRes.diagnostics.length > 0 || !parseRes.ast) {
    return { diagnostics: parseRes.diagnostics };
  }

  const diagnostics: OpmDiagnostic[] = [];

  function makeDiagnostic(
    code: string,
    message: string,
    start?: number,
    end?: number,
  ): OpmDiagnostic {
    return {
      code,
      severity: 'error',
      message,
      source: {
        elementId: source.elementId,
        propertyPath: source.propertyPath,
        start,
        end,
      },
    };
  }

  function resolveSymbol(name: string, sourceRange: [number, number]): OpmValueSymbol | undefined {
    // 1. Direct match by key
    if (scope.symbols[name]) {
      return scope.symbols[name];
    }

    // 2. Search by symbol name, id, or cIdentifier
    for (const sym of Object.values(scope.symbols)) {
      if (sym.name === name || sym.id === name || sym.cIdentifier === name) {
        return sym;
      }
    }

    // 3. Dot notation search (e.g. temperature.value -> symbol with id 'temperature_value' or attr on obj)
    const dotIndex = name.indexOf('.');
    if (dotIndex > 0) {
      const parent = name.slice(0, dotIndex);
      const child = name.slice(dotIndex + 1);
      for (const sym of Object.values(scope.symbols)) {
        if (
          sym.id === `${parent}_${child}` ||
          sym.id === `${parent}::${child}` ||
          sym.name === `${parent}.${child}` ||
          (sym.name === child && sym.id.startsWith(parent))
        ) {
          return sym;
        }
      }
    }

    diagnostics.push(
      makeDiagnostic(
        'OPM_EXPR_UNKNOWN_REFERENCE',
        `Unknown symbol reference "${name}".`,
        sourceRange[0],
        sourceRange[1],
      ),
    );
    return undefined;
  }

  function compileAst(ast: ExpressionAst): TypedExpressionIr | undefined {
    if (ast.kind === 'literal') {
      const type: OpmScalarType =
        ast.literalType === 'bool'
          ? { kind: 'bool' }
          : ast.literalType === 'float32'
          ? { kind: 'float32' }
          : ast.literalType === 'string'
          ? { kind: 'enum', enumId: '' }
          : { kind: 'int32' };

      return {
        kind: 'literal',
        type,
        value: ast.value,
        sourceRange: ast.sourceRange,
      };
    }

    if (ast.kind === 'identifier') {
      const sym = resolveSymbol(ast.name, ast.sourceRange);
      if (!sym) return undefined;
      return {
        kind: 'reference',
        type: sym.type,
        symbolId: sym.id,
        name: sym.name,
        cIdentifier: sym.cIdentifier,
        sourceRange: ast.sourceRange,
      };
    }

    if (ast.kind === 'call') {
      if (!SUPPORTED_INTRINSICS.has(ast.callee)) {
        diagnostics.push(
          makeDiagnostic(
            'OPM_EXPR_UNKNOWN_INTRINSIC',
            `Unknown intrinsic function "${ast.callee}". Supported: abs, min, max, clamp.`,
            ast.sourceRange[0],
            ast.sourceRange[1],
          ),
        );
        return undefined;
      }

      const intrinsicName = ast.callee as 'abs' | 'min' | 'max' | 'clamp';
      const compiledArgs: TypedExpressionIr[] = [];
      for (const argAst of ast.args) {
        const cArg = compileAst(argAst);
        if (!cArg) return undefined;
        compiledArgs.push(cArg);
      }

      // Check arity
      const expectedArity = intrinsicName === 'abs' ? 1 : intrinsicName === 'clamp' ? 3 : 2;
      if (compiledArgs.length !== expectedArity) {
        diagnostics.push(
          makeDiagnostic(
            'OPM_EXPR_WRONG_ARITY',
            `Intrinsic "${intrinsicName}" expects ${expectedArity} argument(s), got ${compiledArgs.length}.`,
            ast.sourceRange[0],
            ast.sourceRange[1],
          ),
        );
        return undefined;
      }

      // Validate argument types (all numeric)
      for (let i = 0; i < compiledArgs.length; i++) {
        if (!isNumericType(compiledArgs[i].type)) {
          diagnostics.push(
            makeDiagnostic(
              'OPM_EXPR_TYPE_MISMATCH',
              `Argument ${i + 1} of "${intrinsicName}" must be numeric, got ${compiledArgs[i].type.kind}.`,
              ast.sourceRange[0],
              ast.sourceRange[1],
            ),
          );
          return undefined;
        }
      }

      // Resolve result type
      let resType = compiledArgs[0].type;
      for (let i = 1; i < compiledArgs.length; i++) {
        resType = resolveNumericPromotion(resType, compiledArgs[i].type);
      }

      return {
        kind: 'intrinsic',
        name: intrinsicName,
        type: resType,
        args: compiledArgs,
        sourceRange: ast.sourceRange,
      };
    }

    if (ast.kind === 'unary') {
      const operand = compileAst(ast.operand);
      if (!operand) return undefined;

      if (ast.op === 'not') {
        if (!isBoolType(operand.type)) {
          diagnostics.push(
            makeDiagnostic(
              'OPM_EXPR_TYPE_MISMATCH',
              `Unary "!" operator requires boolean operand, got ${operand.type.kind}.`,
              ast.sourceRange[0],
              ast.sourceRange[1],
            ),
          );
          return undefined;
        }
        return {
          kind: 'unary',
          op: 'not',
          type: { kind: 'bool' },
          operand,
          sourceRange: ast.sourceRange,
        };
      }

      if (ast.op === 'negate' || ast.op === 'plus') {
        if (!isNumericType(operand.type)) {
          diagnostics.push(
            makeDiagnostic(
              'OPM_EXPR_TYPE_MISMATCH',
              `Unary "${ast.op === 'negate' ? '-' : '+'}" operator requires numeric operand, got ${operand.type.kind}.`,
              ast.sourceRange[0],
              ast.sourceRange[1],
            ),
          );
          return undefined;
        }
        return {
          kind: 'unary',
          op: ast.op,
          type: operand.type,
          operand,
          sourceRange: ast.sourceRange,
        };
      }
    }

    if (ast.kind === 'binary') {
      const left = compileAst(ast.left);
      const right = compileAst(ast.right);
      if (!left || !right) return undefined;

      // Logical operators: &&, ||
      if (ast.op === 'and' || ast.op === 'or') {
        if (!isBoolType(left.type) || !isBoolType(right.type)) {
          diagnostics.push(
            makeDiagnostic(
              'OPM_EXPR_TYPE_MISMATCH',
              `Logical "${ast.op === 'and' ? '&&' : '||'}" requires boolean operands, got ${left.type.kind} and ${right.type.kind}.`,
              ast.sourceRange[0],
              ast.sourceRange[1],
            ),
          );
          return undefined;
        }
        return {
          kind: 'binary',
          op: ast.op,
          type: { kind: 'bool' },
          left,
          right,
          sourceRange: ast.sourceRange,
        };
      }

      // Equality operators: ==, !=
      if (ast.op === 'equal' || ast.op === 'notEqual') {
        if (!typesCompatible(left.type, right.type)) {
          diagnostics.push(
            makeDiagnostic(
              'OPM_EXPR_TYPE_MISMATCH',
              `Cannot compare operands of incompatible types ${left.type.kind} and ${right.type.kind}.`,
              ast.sourceRange[0],
              ast.sourceRange[1],
            ),
          );
          return undefined;
        }
        return {
          kind: 'binary',
          op: ast.op,
          type: { kind: 'bool' },
          left,
          right,
          sourceRange: ast.sourceRange,
        };
      }

      // Relational comparisons: <, <=, >, >=
      if (
        ast.op === 'lessThan' ||
        ast.op === 'lessEqual' ||
        ast.op === 'greaterThan' ||
        ast.op === 'greaterEqual'
      ) {
        if (!isNumericType(left.type) || !isNumericType(right.type)) {
          diagnostics.push(
            makeDiagnostic(
              'OPM_EXPR_TYPE_MISMATCH',
              `Comparison operator requires numeric operands, got ${left.type.kind} and ${right.type.kind}.`,
              ast.sourceRange[0],
              ast.sourceRange[1],
            ),
          );
          return undefined;
        }
        return {
          kind: 'binary',
          op: ast.op,
          type: { kind: 'bool' },
          left,
          right,
          sourceRange: ast.sourceRange,
        };
      }

      // Arithmetic operators: +, -, *, /, %
      if (!isNumericType(left.type) || !isNumericType(right.type)) {
        diagnostics.push(
          makeDiagnostic(
            'OPM_EXPR_TYPE_MISMATCH',
            `Arithmetic operator requires numeric operands, got ${left.type.kind} and ${right.type.kind}.`,
            ast.sourceRange[0],
            ast.sourceRange[1],
          ),
        );
        return undefined;
      }

      const resType = resolveNumericPromotion(left.type, right.type);
      return {
        kind: 'binary',
        op: ast.op,
        type: resType,
        left,
        right,
        sourceRange: ast.sourceRange,
      };
    }

    return undefined;
  }

  const ir = compileAst(parseRes.ast);
  if (diagnostics.length > 0 || !ir) {
    return { diagnostics };
  }

  // Verify against expected type
  if (expected.kind === 'boolean') {
    if (!isBoolType(ir.type)) {
      diagnostics.push(
        makeDiagnostic(
          'OPM_EXPR_TYPE_MISMATCH',
          `Expected boolean expression, got ${ir.type.kind}.`,
          ir.sourceRange?.[0],
          ir.sourceRange?.[1],
        ),
      );
      return { diagnostics };
    }
  } else if (expected.kind === 'numeric') {
    if (!isNumericType(ir.type)) {
      diagnostics.push(
        makeDiagnostic(
          'OPM_EXPR_TYPE_MISMATCH',
          `Expected numeric expression, got ${ir.type.kind}.`,
          ir.sourceRange?.[0],
          ir.sourceRange?.[1],
        ),
      );
      return { diagnostics };
    }
  } else if (expected.kind === 'exact') {
    if (!typesCompatible(ir.type, expected.type)) {
      diagnostics.push(
        makeDiagnostic(
          'OPM_EXPR_TYPE_MISMATCH',
          `Expected expression of type ${expected.type.kind}, got ${ir.type.kind}.`,
          ir.sourceRange?.[0],
          ir.sourceRange?.[1],
        ),
      );
      return { diagnostics };
    }
  }

  return { ir, diagnostics: [] };
}
