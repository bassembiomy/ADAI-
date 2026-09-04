/**
 * Precedence parser for restricted OPM expressions.
 */

import type { OpmDiagnostic, OpmSourceRef } from './executableTypes';
import { tokenizeOpmExpression, type Token, type TokenKind } from './expressionLexer';

export type AstBinaryOp =
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

export type AstUnaryOp = 'not' | 'negate' | 'plus';

export type ExpressionAst =
  | {
      kind: 'literal';
      literalType: 'bool' | 'int32' | 'float32' | 'string';
      value: boolean | number | string;
      sourceRange: [number, number];
    }
  | {
      kind: 'identifier';
      name: string;
      sourceRange: [number, number];
    }
  | {
      kind: 'unary';
      op: AstUnaryOp;
      operand: ExpressionAst;
      sourceRange: [number, number];
    }
  | {
      kind: 'binary';
      op: AstBinaryOp;
      left: ExpressionAst;
      right: ExpressionAst;
      sourceRange: [number, number];
    }
  | {
      kind: 'call';
      callee: string;
      args: ExpressionAst[];
      sourceRange: [number, number];
    };

export interface ParseResult {
  ast?: ExpressionAst;
  diagnostics: OpmDiagnostic[];
}

export function parseOpmExpression(
  text: string,
  source: OpmSourceRef,
): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return {
      diagnostics: [
        {
          code: 'OPM_EXPR_EMPTY',
          severity: 'error',
          message: 'Expression text is empty.',
          source,
        },
      ],
    };
  }

  const lexResult = tokenizeOpmExpression(text, source);
  if (lexResult.diagnostics.length > 0) {
    return { diagnostics: lexResult.diagnostics };
  }

  const tokens = lexResult.tokens;
  let cursor = 0;
  const diagnostics: OpmDiagnostic[] = [];

  function current(): Token {
    return tokens[cursor] || { kind: 'EOF', text: '', start: text.length, end: text.length };
  }

  function consume(): Token {
    const tok = current();
    cursor++;
    return tok;
  }

  function match(kind: TokenKind): boolean {
    if (current().kind === kind) {
      consume();
      return true;
    }
    return false;
  }

  function makeDiagnostic(code: string, message: string, start: number, end: number): void {
    diagnostics.push({
      code,
      severity: 'error',
      message,
      source: {
        elementId: source.elementId,
        propertyPath: source.propertyPath,
        start,
        end,
      },
    });
  }

  function parseLogicalOr(): ExpressionAst | undefined {
    let left = parseLogicalAnd();
    if (!left) return undefined;

    while (match('PipePipe')) {
      const right = parseLogicalAnd();
      if (!right) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', 'Expected expression after "||".', left.sourceRange[1], left.sourceRange[1] + 2);
        return undefined;
      }
      left = {
        kind: 'binary',
        op: 'or',
        left,
        right,
        sourceRange: [left.sourceRange[0], right.sourceRange[1]],
      };
    }
    return left;
  }

  function parseLogicalAnd(): ExpressionAst | undefined {
    let left = parseEquality();
    if (!left) return undefined;

    while (match('AmpAmp')) {
      const right = parseEquality();
      if (!right) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', 'Expected expression after "&&".', left.sourceRange[1], left.sourceRange[1] + 2);
        return undefined;
      }
      left = {
        kind: 'binary',
        op: 'and',
        left,
        right,
        sourceRange: [left.sourceRange[0], right.sourceRange[1]],
      };
    }
    return left;
  }

  function parseEquality(): ExpressionAst | undefined {
    let left = parseComparison();
    if (!left) return undefined;

    while (current().kind === 'EqualEqual' || current().kind === 'BangEqual') {
      const tok = consume();
      const op: AstBinaryOp = tok.kind === 'EqualEqual' ? 'equal' : 'notEqual';
      const right = parseComparison();
      if (!right) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', `Expected expression after "${tok.text}".`, tok.start, tok.end);
        return undefined;
      }
      left = {
        kind: 'binary',
        op,
        left,
        right,
        sourceRange: [left.sourceRange[0], right.sourceRange[1]],
      };
    }
    return left;
  }

  function parseComparison(): ExpressionAst | undefined {
    let left = parseAdditive();
    if (!left) return undefined;

    while (
      current().kind === 'Less' ||
      current().kind === 'LessEqual' ||
      current().kind === 'Greater' ||
      current().kind === 'GreaterEqual'
    ) {
      const tok = consume();
      let op: AstBinaryOp;
      if (tok.kind === 'Less') op = 'lessThan';
      else if (tok.kind === 'LessEqual') op = 'lessEqual';
      else if (tok.kind === 'Greater') op = 'greaterThan';
      else op = 'greaterEqual';

      const right = parseAdditive();
      if (!right) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', `Expected expression after "${tok.text}".`, tok.start, tok.end);
        return undefined;
      }
      left = {
        kind: 'binary',
        op,
        left,
        right,
        sourceRange: [left.sourceRange[0], right.sourceRange[1]],
      };
    }
    return left;
  }

  function parseAdditive(): ExpressionAst | undefined {
    let left = parseMultiplicative();
    if (!left) return undefined;

    while (current().kind === 'Plus' || current().kind === 'Minus') {
      const tok = consume();
      const op: AstBinaryOp = tok.kind === 'Plus' ? 'add' : 'subtract';
      const right = parseMultiplicative();
      if (!right) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', `Expected expression after "${tok.text}".`, tok.start, tok.end);
        return undefined;
      }
      left = {
        kind: 'binary',
        op,
        left,
        right,
        sourceRange: [left.sourceRange[0], right.sourceRange[1]],
      };
    }
    return left;
  }

  function parseMultiplicative(): ExpressionAst | undefined {
    let left = parseUnary();
    if (!left) return undefined;

    while (current().kind === 'Star' || current().kind === 'Slash' || current().kind === 'Percent') {
      const tok = consume();
      let op: AstBinaryOp;
      if (tok.kind === 'Star') op = 'multiply';
      else if (tok.kind === 'Slash') op = 'divide';
      else op = 'modulo';

      const right = parseUnary();
      if (!right) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', `Expected expression after "${tok.text}".`, tok.start, tok.end);
        return undefined;
      }
      left = {
        kind: 'binary',
        op,
        left,
        right,
        sourceRange: [left.sourceRange[0], right.sourceRange[1]],
      };
    }
    return left;
  }

  function parseUnary(): ExpressionAst | undefined {
    if (current().kind === 'Exclamation' || current().kind === 'Minus' || current().kind === 'Plus') {
      const tok = consume();
      let op: AstUnaryOp;
      if (tok.kind === 'Exclamation') op = 'not';
      else if (tok.kind === 'Minus') op = 'negate';
      else op = 'plus';

      const operand = parseUnary();
      if (!operand) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', `Expected expression after unary "${tok.text}".`, tok.start, tok.end);
        return undefined;
      }
      return {
        kind: 'unary',
        op,
        operand,
        sourceRange: [tok.start, operand.sourceRange[1]],
      };
    }
    return parsePrimary();
  }

  function parsePrimary(): ExpressionAst | undefined {
    const tok = current();

    if (tok.kind === 'BooleanLiteral') {
      consume();
      return {
        kind: 'literal',
        literalType: 'bool',
        value: Boolean(tok.value),
        sourceRange: [tok.start, tok.end],
      };
    }

    if (tok.kind === 'IntegerLiteral') {
      consume();
      return {
        kind: 'literal',
        literalType: 'int32',
        value: Number(tok.value),
        sourceRange: [tok.start, tok.end],
      };
    }

    if (tok.kind === 'FloatLiteral') {
      consume();
      return {
        kind: 'literal',
        literalType: 'float32',
        value: Number(tok.value),
        sourceRange: [tok.start, tok.end],
      };
    }

    if (tok.kind === 'StringLiteral') {
      consume();
      return {
        kind: 'literal',
        literalType: 'string',
        value: String(tok.value),
        sourceRange: [tok.start, tok.end],
      };
    }

    if (tok.kind === 'Identifier') {
      consume();
      // Check if function call
      if (current().kind === 'LParen') {
        consume(); // '('
        const args: ExpressionAst[] = [];
        if (current().kind !== 'RParen') {
          do {
            const arg = parseLogicalOr();
            if (!arg) break;
            args.push(arg);
          } while (match('Comma'));
        }
        if (!match('RParen')) {
          makeDiagnostic('OPM_EXPR_UNCLOSED_PAREN', `Expected ")" closing call to "${tok.text}".`, tok.start, current().end);
          return undefined;
        }
        const closingParen = tokens[cursor - 1];
        return {
          kind: 'call',
          callee: tok.text,
          args,
          sourceRange: [tok.start, closingParen ? closingParen.end : tok.end],
        };
      }

      return {
        kind: 'identifier',
        name: tok.text,
        sourceRange: [tok.start, tok.end],
      };
    }

    if (tok.kind === 'LParen') {
      consume();
      const expr = parseLogicalOr();
      if (!expr) {
        makeDiagnostic('OPM_EXPR_EXPECTED_EXPRESSION', 'Expected expression inside parentheses.', tok.start, tok.end);
        return undefined;
      }
      if (!match('RParen')) {
        makeDiagnostic('OPM_EXPR_UNCLOSED_PAREN', 'Expected closing ")".', tok.start, current().end);
        return undefined;
      }
      const closeTok = tokens[cursor - 1];
      return {
        ...expr,
        sourceRange: [tok.start, closeTok ? closeTok.end : expr.sourceRange[1]],
      };
    }

    makeDiagnostic('OPM_EXPR_UNEXPECTED_TOKEN', `Unexpected token "${tok.text || tok.kind}".`, tok.start, tok.end);
    return undefined;
  }

  const ast = parseLogicalOr();
  if (ast && cursor < tokens.length && current().kind !== 'EOF') {
    makeDiagnostic('OPM_EXPR_UNEXPECTED_TRAILING', `Unexpected trailing token "${current().text}".`, current().start, current().end);
    return { diagnostics };
  }

  return { ast, diagnostics };
}
