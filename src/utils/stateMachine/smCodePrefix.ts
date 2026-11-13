/**
 * Several charts in one firmware: the code prefix.
 *
 * A chart's generated C always uses the default prefix 'SM' internally. When the model
 * declares another `codePrefix`, this isolated post-generation pass renames every external
 * symbol, macro, include guard and file name of the generated files, so the emit sites never
 * need to know the prefix. The default prefix is a no-op (byte-identical output).
 *
 *   SM_*            -> <PREFIX>_*          (types, functions, macros, guards)
 *   sm_*            -> <prefix>_*          (file stems, lower-case identifiers)
 *   ADIA_Instance*  -> <PREFIX>_Instance*
 *   MCAL_CH_*       -> <PREFIX>_MCAL_CH_*  (channel macros)
 *   mcal_dio(.h)    -> <prefix>_mcal_dio   (header file name, include lines, guard MCAL_DIO_H)
 *   ADIA_Component* / ADIA_Scheduler* / adia_component.[ch] -> <PREFIX>_Component* / <PREFIX>_Scheduler* / <prefix>_component.[ch]
 *
 * The MCAL driver functions (MCAL_Dio_ReadChannel, ...) stay unprefixed so one driver serves
 * every chart. The pass is token aware: only whole identifiers are renamed; string and
 * character literals are left alone except the path of an `#include "..."`.
 */

export const DEFAULT_CODE_PREFIX = 'SM';

const PREFIX_SHAPE = /^[A-Z][A-Z0-9_]{0,15}$/;

/** Prefixes owned by ADIA itself. */
const ADIA_RESERVED = new Set(['MCAL', 'ADIA', 'HAL', 'HIL']);

/** Names the C library reserves (macro families and common identifiers of the standard headers). */
const C_RESERVED = new Set([
  'NULL', 'FILE', 'EOF', 'BUFSIZ', 'RAND', 'EXIT', 'CLOCKS', 'STDC', 'SIG', 'LC', 'PRI', 'SCN', 'FOPEN', 'TMP',
  'INT', 'UINT', 'FLT', 'DBL', 'LDBL', 'CHAR', 'SCHAR', 'UCHAR', 'SHRT', 'USHRT', 'LONG', 'ULONG', 'LLONG', 'ULLONG',
  'WCHAR', 'WINT', 'SIZE', 'PTRDIFF', 'SSIZE', 'UINTPTR', 'INTPTR', 'INTMAX', 'UINTMAX', 'MB', 'HUGE', 'M',
]);

/** Returns a human-readable reason when the prefix is invalid, otherwise null. */
export const codePrefixProblem = (prefix: unknown): string | null => {
  if (typeof prefix !== 'string' || !PREFIX_SHAPE.test(prefix)) {
    return `Code prefix '${String(prefix)}' must match [A-Z][A-Z0-9_]{0,15}.`;
  }
  if (ADIA_RESERVED.has(prefix) || prefix.startsWith('MCAL_') || prefix.startsWith('ADIA_')) {
    return `Code prefix '${prefix}' is reserved by ADIA.`;
  }
  if (C_RESERVED.has(prefix) || /^(INT|UINT)\d/.test(prefix) || /^E[0-9A-Z]/.test(prefix)
    || /^(SIG|LC|PRI|SCN)_/.test(prefix)) {
    return `Code prefix '${prefix}' is reserved by the C standard library.`;
  }
  return null;
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

/**
 * Names the pass must leave alone: external C functions and their headers belong to the
 * integrator, not to the chart (see ExternalFunctionDef).
 */
export interface PreservedNames {
  names?: ReadonlySet<string>;
  headers?: ReadonlySet<string>;
}

/** The names and headers of a chart's external functions, to be left alone by the pass. */
export const preservedNamesOf = (
  chart: { externalFunctions?: readonly { name: string; header: string }[] },
): PreservedNames => ({
  names: new Set((chart.externalFunctions ?? []).map((def) => def.name)),
  headers: new Set((chart.externalFunctions ?? []).map((def) => def.header)),
});

const renameToken = (token: string, upper: string, lower: string, preserved?: PreservedNames): string => {
  if (preserved?.names?.has(token) === true) return token;
  if (token.startsWith('SM_')) return upper + token.slice(2);
  if (token.startsWith('sm_')) return lower + token.slice(2);
  if (token === 'ADIA_Instance' || token === 'ADIA_Instance_t') return `${upper}_${token.slice(5)}`;
  if (token.startsWith('MCAL_CH_')) return `${upper}_${token}`;
  if (token === 'mcal_dio') return `${lower}_mcal_dio`;
  // Component layer (embedded/HIL): one component and one scheduler type per chart.
  if (token.startsWith('ADIA_Component') || token.startsWith('ADIA_Scheduler')) return `${upper}_${token.slice(5)}`;
  if (token === 'ADIA_COMPONENT_H') return `${upper}_COMPONENT_H`;
  if (token === 'adia_component') return `${lower}_component`;
  if (token === 'MCAL_DIO_H') return `${upper}_${token}`;
  return token;
};

/** Renames the stem of each path segment the way the pass renames identifiers. */
export const prefixedFileName = (name: string, prefix: string): string => {
  if (prefix === DEFAULT_CODE_PREFIX) return name;
  const lower = prefix.toLowerCase();
  return name.split('/').map((segment) => {
    const dot = segment.indexOf('.');
    const stem = dot < 0 ? segment : segment.slice(0, dot);
    const rest = dot < 0 ? '' : segment.slice(dot);
    if (stem.startsWith('sm_')) return lower + stem.slice(2) + rest;
    if (stem === 'mcal_dio') return `${lower}_mcal_dio${rest}`;
    if (stem === 'adia_component') return `${lower}_component${rest}`;
    return segment;
  }).join('/');
};

/**
 * Renames identifiers in C source text (comments included, string/char literals excluded
 * except an `#include "path"`).
 */
export const applyCodePrefixToSource = (text: string, prefix: string, preserved?: PreservedNames): string => {
  if (prefix === DEFAULT_CODE_PREFIX) return text;
  const upper = prefix;
  const lower = prefix.toLowerCase();
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      let end = text.indexOf('\n', i);
      if (end < 0) end = n;
      out += text.slice(i, end).replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => renameToken(token, upper, lower, preserved));
      i = end;
    } else if (ch === '/' && text[i + 1] === '*') {
      let end = text.indexOf('*/', i + 2);
      end = end < 0 ? n : end + 2;
      out += text.slice(i, end).replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => renameToken(token, upper, lower, preserved));
      i = end;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && text[j] !== ch && text[j] !== '\n') {
        j += text[j] === '\\' ? 2 : 1;
      }
      const end = Math.min(j + 1, n);
      const literal = text.slice(i, end);
      const lineStart = text.lastIndexOf('\n', i - 1) + 1;
      if (ch === '"' && /^\s*#\s*include\s*$/.test(text.slice(lineStart, i))) {
        const path = literal.slice(1, -1);
        out += preserved?.headers?.has(path) === true ? literal : `"${prefixedFileName(path, prefix)}"`;
      } else {
        out += literal;
      }
      i = end;
    } else if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(text[j])) j += 1;
      out += renameToken(text.slice(i, j), upper, lower, preserved);
      i = j;
    } else if (ch >= '0' && ch <= '9') {
      // A pp-number (12U, 0x1F, 1e5) never starts an identifier in its tail.
      let j = i + 1;
      while (j < n && IDENT_PART.test(text[j])) j += 1;
      out += text.slice(i, j);
      i = j;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
};

/** Plain identifier renaming for non-C text (markdown reports, JSON manifests). */
const applyCodePrefixToProse = (text: string, prefix: string, preserved?: PreservedNames): string => {
  const lower = prefix.toLowerCase();
  return text.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => renameToken(token, prefix, lower, preserved));
};

export interface PrefixableFile {
  name: string;
  content: string;
}

/** Applies the prefix to a generated file set: contents and file names. */
export const applyCodePrefix = <T extends PrefixableFile>(
  files: readonly T[],
  prefix: string | undefined,
  preserved?: PreservedNames,
): T[] => {
  if (prefix === undefined || prefix === DEFAULT_CODE_PREFIX) return [...files];
  return files.map((file) => ({
    ...file,
    name: prefixedFileName(file.name, prefix),
    content: /\.(?:c|h|cpp|ino)$/i.test(file.name)
      ? applyCodePrefixToSource(file.content, prefix, preserved)
      : applyCodePrefixToProse(file.content, prefix, preserved),
  }));
};
