/**
 * Bounded tokenizer for restricted OPM expressions.
 */

import type { OpmDiagnostic, OpmSourceRef } from './executableTypes';

export type TokenKind =
  | 'BooleanLiteral'
  | 'IntegerLiteral'
  | 'FloatLiteral'
  | 'StringLiteral'
  | 'Identifier'
  | 'LParen'
  | 'RParen'
  | 'Comma'
  | 'Plus'
  | 'Minus'
  | 'Star'
  | 'Slash'
  | 'Percent'
  | 'Exclamation'
  | 'EqualEqual'
  | 'BangEqual'
  | 'Less'
  | 'LessEqual'
  | 'Greater'
  | 'GreaterEqual'
  | 'AmpAmp'
  | 'PipePipe'
  | 'EOF';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  value?: boolean | number | string;
}

export interface LexResult {
  tokens: Token[];
  diagnostics: OpmDiagnostic[];
}

const MAX_TOKEN_LENGTH = 128;

export function tokenizeOpmExpression(
  text: string,
  source: OpmSourceRef,
): LexResult {
  const tokens: Token[] = [];
  const diagnostics: OpmDiagnostic[] = [];
  let pos = 0;
  const len = text.length;

  function makeDiagnostic(
    code: string,
    message: string,
    start: number,
    end: number,
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

  while (pos < len) {
    const ch = text[pos];

    // Skip whitespace
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    const start = pos;

    // Reject unsupported characters
    if (/[;{}[\]#@$?\\`~^]/.test(ch)) {
      diagnostics.push(
        makeDiagnostic('OPM_EXPR_INVALID_CHARACTER', `Invalid character "${ch}" in expression.`, start, start + 1),
      );
      pos++;
      continue;
    }

    // Two-character operators
    if (pos + 1 < len) {
      const two = text.slice(pos, pos + 2);
      if (two === '&&') {
        tokens.push({ kind: 'AmpAmp', text: '&&', start, end: pos + 2 });
        pos += 2;
        continue;
      }
      if (two === '||') {
        tokens.push({ kind: 'PipePipe', text: '||', start, end: pos + 2 });
        pos += 2;
        continue;
      }
      if (two === '==') {
        tokens.push({ kind: 'EqualEqual', text: '==', start, end: pos + 2 });
        pos += 2;
        continue;
      }
      if (two === '!=') {
        tokens.push({ kind: 'BangEqual', text: '!=', start, end: pos + 2 });
        pos += 2;
        continue;
      }
      if (two === '<=') {
        tokens.push({ kind: 'LessEqual', text: '<=', start, end: pos + 2 });
        pos += 2;
        continue;
      }
      if (two === '>=') {
        tokens.push({ kind: 'GreaterEqual', text: '>=', start, end: pos + 2 });
        pos += 2;
        continue;
      }
      if (two === '++' || two === '--') {
        diagnostics.push(
          makeDiagnostic('OPM_EXPR_UNSUPPORTED_OPERATOR', `Increment/decrement operators are not allowed.`, start, pos + 2),
        );
        pos += 2;
        continue;
      }
    }

    // Single-character operators and punctuation
    if (ch === '(') {
      tokens.push({ kind: 'LParen', text: '(', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'RParen', text: ')', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'Comma', text: ',', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '+') {
      tokens.push({ kind: 'Plus', text: '+', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '-') {
      tokens.push({ kind: 'Minus', text: '-', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '*') {
      tokens.push({ kind: 'Star', text: '*', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '/') {
      tokens.push({ kind: 'Slash', text: '/', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '%') {
      tokens.push({ kind: 'Percent', text: '%', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '!') {
      tokens.push({ kind: 'Exclamation', text: '!', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '<') {
      tokens.push({ kind: 'Less', text: '<', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ kind: 'Greater', text: '>', start, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === '&' || ch === '|') {
      diagnostics.push(
        makeDiagnostic('OPM_EXPR_INVALID_OPERATOR', `Bitwise operator "${ch}" is not supported; use "${ch}${ch}" for logical operations.`, start, start + 1),
      );
      pos++;
      continue;
    }

    // String literals
    if (ch === '"' || ch === '\'') {
      const quote = ch;
      pos++;
      let raw = '';
      while (pos < len && text[pos] !== quote) {
        if (text[pos] === '\\' && pos + 1 < len) {
          pos++;
          raw += text[pos];
        } else {
          raw += text[pos];
        }
        pos++;
      }
      if (pos >= len) {
        diagnostics.push(makeDiagnostic('OPM_EXPR_UNCLOSED_STRING', 'Unclosed string literal.', start, pos));
        continue;
      }
      pos++; // consume closing quote
      tokens.push({ kind: 'StringLiteral', text: raw, start, end: pos, value: raw });
      continue;
    }

    // Numbers: hex or decimal
    if (/[0-9]/.test(ch)) {
      let isHex = false;
      let isFloat = false;
      let raw = '';

      if (ch === '0' && pos + 1 < len && (text[pos + 1] === 'x' || text[pos + 1] === 'X')) {
        isHex = true;
        raw += text.slice(pos, pos + 2);
        pos += 2;
        while (pos < len && /[0-9a-fA-F]/.test(text[pos])) {
          raw += text[pos];
          pos++;
        }
      } else {
        while (pos < len && /[0-9]/.test(text[pos])) {
          raw += text[pos];
          pos++;
        }
        if (pos < len && text[pos] === '.' && pos + 1 < len && /[0-9]/.test(text[pos + 1])) {
          isFloat = true;
          raw += '.';
          pos++;
          while (pos < len && /[0-9]/.test(text[pos])) {
            raw += text[pos];
            pos++;
          }
        }
        if (pos < len && (text[pos] === 'e' || text[pos] === 'E')) {
          isFloat = true;
          raw += text[pos];
          pos++;
          if (pos < len && (text[pos] === '+' || text[pos] === '-')) {
            raw += text[pos];
            pos++;
          }
          while (pos < len && /[0-9]/.test(text[pos])) {
            raw += text[pos];
            pos++;
          }
        }
        if (pos < len && (text[pos] === 'f' || text[pos] === 'F')) {
          isFloat = true;
          pos++; // consume optional 'f' suffix
        }
      }

      if (raw.length > MAX_TOKEN_LENGTH) {
        diagnostics.push(makeDiagnostic('OPM_EXPR_TOKEN_TOO_LONG', `Number literal exceeds maximum length of ${MAX_TOKEN_LENGTH}.`, start, pos));
        continue;
      }

      if (isFloat) {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          diagnostics.push(makeDiagnostic('OPM_EXPR_INVALID_FLOAT', `Non-finite float literal "${raw}".`, start, pos));
        } else {
          tokens.push({ kind: 'FloatLiteral', text: raw, start, end: pos, value: parsed });
        }
      } else {
        const parsed = isHex ? parseInt(raw, 16) : parseInt(raw, 10);
        // int32 limit check: 2147483647
        if (parsed > 2147483647) {
          diagnostics.push(makeDiagnostic('OPM_EXPR_INTEGER_OVERFLOW', `Integer literal "${raw}" exceeds 32-bit signed range.`, start, pos));
        } else {
          tokens.push({ kind: 'IntegerLiteral', text: raw, start, end: pos, value: parsed });
        }
      }
      continue;
    }

    // Identifiers and Keywords (including dot notation: a.b.c)
    if (/[A-Za-z_]/.test(ch)) {
      let raw = '';
      while (pos < len && (/[A-Za-z0-9_]/.test(text[pos]) || (text[pos] === '.' && pos + 1 < len && /[A-Za-z_]/.test(text[pos + 1])))) {
        raw += text[pos];
        pos++;
      }

      if (raw.length > MAX_TOKEN_LENGTH) {
        diagnostics.push(makeDiagnostic('OPM_EXPR_TOKEN_TOO_LONG', `Identifier "${raw.slice(0, 20)}..." exceeds maximum length of ${MAX_TOKEN_LENGTH}.`, start, pos));
        continue;
      }

      if (raw === 'true') {
        tokens.push({ kind: 'BooleanLiteral', text: raw, start, end: pos, value: true });
      } else if (raw === 'false') {
        tokens.push({ kind: 'BooleanLiteral', text: raw, start, end: pos, value: false });
      } else {
        tokens.push({ kind: 'Identifier', text: raw, start, end: pos, value: raw });
      }
      continue;
    }

    // Fallback unrecognized character
    diagnostics.push(makeDiagnostic('OPM_EXPR_UNRECOGNIZED_TOKEN', `Unrecognized token starting with "${ch}".`, start, start + 1));
    pos++;
  }

  tokens.push({ kind: 'EOF', text: '', start: pos, end: pos });
  return { tokens, diagnostics };
}
