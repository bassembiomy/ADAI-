/**
 * Textual subset of MISRA C:2012. It checks only rules that can be decided on
 * comment- and literal-stripped source text. It is NOT a replacement for a
 * qualified MISRA checker, which the integrator must run.
 */
export interface MisraSourceFile {
  name: string;
  content: string;
}

export interface MisraFinding {
  rule: string;
  file: string;
  line: number;
  message: string;
}

export const CHECKED_MISRA_RULES: ReadonlyArray<{ rule: string; summary: string }> = [
  { rule: 'Rule 3.1', summary: 'The character sequences /* and // shall not be used within a comment (checked: /* inside a block comment)' },
  { rule: 'Rule 4.2', summary: 'Trigraphs shall not be used' },
  { rule: 'Rule 7.3', summary: 'The lowercase character l shall not be used in a literal suffix' },
  { rule: 'Rule 15.1', summary: 'The goto statement should not be used' },
  { rule: 'Rule 15.6', summary: 'The body of an iteration or selection statement shall be a compound statement' },
  { rule: 'Rule 17.1', summary: 'The features of <stdarg.h> shall not be used' },
  { rule: 'Rule 21.3', summary: 'The memory allocation and deallocation functions of <stdlib.h> shall not be used' },
  { rule: 'Rule 21.6', summary: 'The Standard Library input/output functions shall not be used' },
  { rule: 'Rule 21.7', summary: 'The atof, atoi, atol and atoll functions of <stdlib.h> shall not be used' },
  { rule: 'Rule 21.8', summary: 'The termination functions abort, exit, getenv and system of <stdlib.h> shall not be used' },
];

interface Scanned {
  /** Source with comments and string/char literals blanked (newlines kept). */
  code: string;
  /** Line numbers (1-based) of a block comment opener found inside a block comment. */
  nestedCommentLines: number[];
}

const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

const scan = (source: string): Scanned => {
  let code = '';
  const nestedCommentLines: number[] = [];
  let index = 0;
  let line = 1;
  const length = source.length;
  while (index < length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end < 0 ? length : end + 2;
      const comment = source.slice(index, stop);
      let offset = comment.indexOf('/*', 2);
      while (offset >= 0) {
        nestedCommentLines.push(line + (comment.slice(0, offset).match(/\n/g)?.length ?? 0));
        offset = comment.indexOf('/*', offset + 2);
      }
      code += blank(comment);
      line += comment.match(/\n/g)?.length ?? 0;
      index = stop;
    } else if (char === '/' && next === '/') {
      let stop = source.indexOf('\n', index);
      if (stop < 0) stop = length;
      code += blank(source.slice(index, stop));
      index = stop;
    } else if (char === '"' || char === '\'') {
      let stop = index + 1;
      while (stop < length && source[stop] !== char && source[stop] !== '\n') {
        stop += source[stop] === '\\' ? 2 : 1;
      }
      stop = Math.min(length, stop + 1);
      const literal = source.slice(index, stop);
      code += char + blank(literal.slice(1, -1)) + (literal.length > 1 ? char : '');
      line += literal.match(/\n/g)?.length ?? 0;
      index = stop;
    } else {
      if (char === '\n') line += 1;
      code += char;
      index += 1;
    }
  }
  return { code, nestedCommentLines };
};


const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
};

const lineFromStarts = (starts: readonly number[], position: number): number => {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= position) low = mid; else high = mid - 1;
  }
  return low + 1;
};

const matchingBraces = (code: string): Map<number, number> => {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '{') stack.push(index);
    else if (code[index] === '}' && stack.length > 0) pairs.set(index, stack.pop()!);
  }
  return pairs;
};

const skipSpace = (code: string, from: number): number => {
  let index = from;
  while (index < code.length && /\s/.test(code[index])) index += 1;
  return index;
};

/** Index just after the parenthesis group that opens at `open`, or -1. */
const closeParen = (code: string, open: number): number => {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '(') depth += 1;
    else if (code[index] === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
};

const previousWord = (code: string, before: number): string => {
  let index = before - 1;
  while (index >= 0 && /\s/.test(code[index])) index -= 1;
  const end = index + 1;
  while (index >= 0 && /[A-Za-z0-9_]/.test(code[index])) index -= 1;
  return code.slice(index + 1, end);
};

const previousNonSpace = (code: string, before: number): number => {
  let index = before - 1;
  while (index >= 0 && /\s/.test(code[index])) index -= 1;
  return index;
};

const checkCompoundBodies = (
  file: string,
  code: string,
  starts: readonly number[],
  findings: MisraFinding[],
): void => {
  const braces = matchingBraces(code);
  const keyword = /\b(if|else|for|while|do)\b/g;
  let match: RegExpExecArray | null;
  const report = (position: number, text: string): void => {
    findings.push({ rule: 'Rule 15.6', file, line: lineFromStarts(starts, position), message: text });
  };
  while ((match = keyword.exec(code)) !== null) {
    const word = match[1];
    const start = match.index;
    const after = start + word.length;
    if (code[previousNonSpace(code, start)] === '#') continue;
    if (word === 'do') {
      if (code[skipSpace(code, after)] !== '{') report(start, 'The body of a do statement shall be a compound statement.');
    } else if (word === 'else') {
      const index = skipSpace(code, after);
      const isElseIf = /^if\b/.test(code.slice(index, index + 3)) && !/[A-Za-z0-9_]/.test(code[index + 2] ?? ' ');
      if (code[index] !== '{' && !isElseIf) report(start, 'The body of an else statement shall be a compound statement.');
    } else {
      const open = skipSpace(code, after);
      if (code[open] !== '(') continue;
      const close = closeParen(code, open);
      if (close < 0) continue;
      const index = skipSpace(code, close);
      if (code[index] === '{') continue;
      if (word === 'while' && code[index] === ';') {
        const closing = previousNonSpace(code, start);
        const opening = closing >= 0 && code[closing] === '}' ? braces.get(closing) : undefined;
        if (opening !== undefined && previousWord(code, opening) === 'do') continue;
      }
      report(start, `The body of a ${word} statement shall be a compound statement.`);
    }
  }
};

const simpleRules: ReadonlyArray<{ rule: string; pattern: RegExp; message: string }> = [
  { rule: 'Rule 15.1', pattern: /\bgoto\b/g, message: 'goto shall not be used.' },
  { rule: 'Rule 21.3', pattern: /\b(?:malloc|calloc|realloc|free)\s*\(/g, message: 'Dynamic memory allocation functions shall not be used.' },
  { rule: 'Rule 21.6', pattern: /#\s*include\s*<\s*(?:stdio|wchar)\.h\s*>/g, message: 'The Standard Library input/output header shall not be used.' },
  {
    rule: 'Rule 21.6',
    pattern: /\b(?:printf|fprintf|sprintf|snprintf|vprintf|scanf|fscanf|sscanf|puts|gets|fgets|fputs|getchar|putchar|fopen|fclose|fread|fwrite)\s*\(/g,
    message: 'Standard Library input/output functions shall not be used.',
  },
  { rule: 'Rule 17.1', pattern: /#\s*include\s*<\s*stdarg\.h\s*>/g, message: '<stdarg.h> shall not be used.' },
  { rule: 'Rule 21.7', pattern: /\b(?:atof|atoi|atol|atoll)\s*\(/g, message: 'atof, atoi, atol and atoll shall not be used.' },
  { rule: 'Rule 21.8', pattern: /\b(?:abort|exit|_Exit|getenv|system)\s*\(/g, message: 'abort, exit, getenv and system shall not be used.' },
  {
    rule: 'Rule 7.3',
    pattern: /\b(?:0[xX][0-9a-fA-F]+|\d[\d.]*(?:[eE][+-]?\d+)?)(?:[uU]?l{1,2}[uU]?)(?![A-Za-z0-9_])/g,
    message: 'The lowercase character l shall not be used in a literal suffix.',
  },
];

export const checkMisraSubset = (files: readonly MisraSourceFile[]): MisraFinding[] => {
  const findings: MisraFinding[] = [];
  for (const file of files) {
    const { code, nestedCommentLines } = scan(file.content);
    const starts = lineStarts(code);
    for (const line of nestedCommentLines) {
      findings.push({ rule: 'Rule 3.1', file: file.name, line, message: 'The character sequence /* shall not be used within a comment.' });
    }
    const raw = lineStarts(file.content);
    const trigraph = /\?\?[=(/)'<!>-]/g;
    let hit: RegExpExecArray | null;
    while ((hit = trigraph.exec(file.content)) !== null) {
      findings.push({ rule: 'Rule 4.2', file: file.name, line: lineFromStarts(raw, hit.index), message: 'Trigraphs shall not be used.' });
    }
    for (const rule of simpleRules) {
      rule.pattern.lastIndex = 0;
      while ((hit = rule.pattern.exec(code)) !== null) {
        findings.push({ rule: rule.rule, file: file.name, line: lineFromStarts(starts, hit.index), message: rule.message });
      }
    }
    checkCompoundBodies(file.name, code, starts, findings);
  }
  return findings;
};

