/**
 * State machine interface extraction (WP-02): declared variables with inferred direction,
 * observable states/transitions, and undeclared identifiers used in scripts.
 */
import type { VariableType } from '../../types/sm_types';
import { formatSimTarget } from './simTarget';

export interface SmInterfaceSignal { target: string; variableId: string; name: string; dataType: VariableType; direction: 'input' | 'output' | 'internal'; directionSource: 'hil' | 'scan' }
export interface SmInterfaceDiagnostic { code: 'UNDECLARED_IDENTIFIER'; name: string; elementIds: string[]; message: string }
export interface SmInterface {
  signals: SmInterfaceSignal[];
  states: { id: string; name: string; target: string }[];
  transitions: { id: string; name: string; target: string }[];
  diagnostics: SmInterfaceDiagnostic[];
}

const KEYWORDS = new Set(['true', 'false', 'TRUE', 'FALSE']);
// Built-in functions of the expression language (smExpressions.ts:299)
const BUILTINS = new Set(['sin', 'cos', 'exp', 'sqrt', 'abs']);

const TOKEN_RE = /0[xX][0-9a-fA-F]+[uUlL]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[uUlLfF]*|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|\+=|-=|\*=|\/=|\+\+|--|&&|\|\||<<|>>|[\s\S]/g;
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=']);

interface Tok { kind: 'id' | 'op' | 'other'; value: string }

function tokenize(source: string): Tok[] {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, ' ');
  const out: Tok[] = [];
  for (const m of clean.matchAll(TOKEN_RE)) {
    const v = m[0];
    if (/^\s$/.test(v)) {
      if (v === '\n') out.push({ kind: 'op', value: ';' });
      continue;
    }
    if (/^[A-Za-z_]/.test(v)) out.push({ kind: 'id', value: v });
    else if (/^[\d.]/.test(v) && v !== '.') out.push({ kind: 'other', value: v });
    else out.push({ kind: 'op', value: v });
  }
  return out;
}

interface Usage { reads: Set<string>; writes: Set<string>; all: Set<string> }

function scan(source: string | undefined, usage: Usage): void {
  if (typeof source !== 'string' || source.trim() === '') return;
  const toks = tokenize(source);
  const skip = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== 'id' || KEYWORDS.has(t.value)) continue;
    const next = toks[i + 1];
    const prev = toks[i - 1];
    const isWrite =
      (next?.kind === 'op' && (ASSIGN_OPS.has(next.value) || next.value === '++' || next.value === '--')) ||
      (prev?.kind === 'op' && (prev.value === '++' || prev.value === '--'));
    usage.all.add(t.value);
    if (skip.has(i)) continue;
    if (isWrite) {
      usage.writes.add(t.value);
      if (next?.kind === 'op' && ASSIGN_OPS.has(next.value)) {
        for (let j = i + 2; j < toks.length && !(toks[j].kind === 'op' && toks[j].value === ';'); j++) {
          if (toks[j].kind === 'id' && toks[j].value === t.value) skip.add(j);
        }
      }
    } else {
      usage.reads.add(t.value);
    }
  }
}

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);

export function extractSmInterface(model: { states?: any[]; transitions?: any[]; variables?: any[]; junctions?: any[]; hilConfig?: any }): SmInterface {
  const states = model.states ?? [];
  const junctions = model.junctions ?? [];
  const transitions = model.transitions ?? [];
  const variables = model.variables ?? [];

  const names = new Map<string, string>();
  for (const s of states) names.set(s.id, nonEmpty(s.name) ?? s.id);
  for (const j of junctions) names.set(j.id, nonEmpty(j.name) ?? j.id);

  const total: Usage = { reads: new Set(), writes: new Set(), all: new Set() };
  const usedBy = new Map<string, string[]>();
  const scanElement = (id: string, scripts: unknown[]): void => {
    const u: Usage = { reads: new Set(), writes: new Set(), all: new Set() };
    for (const s of scripts) scan(typeof s === 'string' ? s : undefined, u);
    u.reads.forEach(n => total.reads.add(n));
    u.writes.forEach(n => total.writes.add(n));
    u.all.forEach(n => {
      const list = usedBy.get(n) ?? [];
      if (!list.includes(id)) list.push(id);
      usedBy.set(n, list);
    });
  };
  for (const s of states) scanElement(s.id, [s.entry, s.during, s.exit, s.internalTransitions]);
  for (const t of transitions) scanElement(t.id, [t.condition, t.action]);

  const hilOn = model.hilConfig?.enabled === true;
  const mappings: any[] = hilOn && Array.isArray(model.hilConfig?.mappings) ? model.hilConfig.mappings : [];

  const signals: SmInterfaceSignal[] = variables.map((v: any) => {
    let direction: SmInterfaceSignal['direction'];
    let directionSource: SmInterfaceSignal['directionSource'] = 'scan';
    const r = total.reads.has(v.name);
    const w = total.writes.has(v.name);
    direction = r && !w ? 'input' : w && !r ? 'output' : 'internal';
    const m = mappings.find(x => x?.adiaVarId === v.id || x?.adiaVarId === v.name);
    if (m && (m.direction === 'read' || m.direction === 'write')) {
      direction = m.direction === 'read' ? 'input' : 'output';
      directionSource = 'hil';
    }
    return {
      target: formatSimTarget({ domain: 'sm', kind: 'variable', id: v.id }),
      variableId: v.id,
      name: v.name,
      dataType: v.type,
      direction,
      directionSource,
    };
  });

  const declared = new Set<string>(variables.map((v: any) => v.name));
  const stateNames = new Set<string>(states.map((s: any) => names.get(s.id) as string));
  const diagnostics: SmInterfaceDiagnostic[] = [];
  for (const [name, ids] of usedBy) {
    if (declared.has(name) || stateNames.has(name) || KEYWORDS.has(name) || BUILTINS.has(name)) continue;
    diagnostics.push({
      code: 'UNDECLARED_IDENTIFIER',
      name,
      elementIds: ids,
      message: `Identifier '${name}' is used but not declared as a variable`,
    });
  }

  return {
    signals,
    states: states.map((s: any) => ({ id: s.id, name: names.get(s.id) as string, target: s.id })),
    transitions: transitions.map((t: any) => ({
      id: t.id,
      name: `${names.get(t.sourceId) ?? t.sourceId} → ${names.get(t.targetId) ?? t.targetId}`,
      target: formatSimTarget({ domain: 'sm', kind: 'transition', id: t.id }),
    })),
    diagnostics,
  };
}
