// WP-17/18a: simulation scenario model. Contract: plan §7.5
import type { SimEngine } from './simSession';
import { MAX_SIM_STEPS, TIME_EPS, stepCount, timeGE, timeLE, type SimCriterion, type SimStimulus } from './simCriterion';
import { createSimSession, engineOfSimTarget, type SimEngineSession } from './simSession';
import { parseSimExpression, type SimExprNode } from './simExpression';
import type { SysmlRepository, VerificationCase } from '../sysml/model';

export interface SimSignalRef { alias: string; target: string }
export type SimTemporal =
  | { kind: 'always' | 'never' | 'eventually'; window?: [number, number] }
  | { kind: 'response'; trigger: string; within: number; window?: [number, number] };
export interface SimAssertion { id: string; requirementId: string; name?: string; condition: string; temporal: SimTemporal }
/** observable target -> drivable target of ANOTHER engine */
export interface SimCoupling { from: string; to: string }
export interface SimScenario {
  id: string; verificationCaseId: string; duration: number; step: number;
  order?: SimEngine[]; signals: SimSignalRef[]; stimuli: SimStimulus[]; couplings: SimCoupling[]; assertions: SimAssertion[];
}

export const DEFAULT_ENGINE_ORDER: SimEngine[] = ['sm', 'xb', 'vlab'];

export interface SimScenarioDiagnostic { severity: 'error' | 'warning'; code: string; message: string; path?: string; target?: string }
export interface SimScheduleCoupling { from: string; to: string; fromEngine: SimEngine; toEngine: SimEngine; delayed: boolean }

const ENGINES: SimEngine[] = ['sm', 'xb', 'vlab'];
const RESERVED = new Set(['true', 'false', 'abs', 'min', 'max']);
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function participatingEngines(s: SimScenario): Set<SimEngine> {
  const set = new Set<SimEngine>();
  for (const x of s.signals ?? []) set.add(engineOfSimTarget(x.target));
  for (const x of s.stimuli ?? []) set.add(engineOfSimTarget(x.target));
  for (const c of s.couplings ?? []) { set.add(engineOfSimTarget(c.from)); set.add(engineOfSimTarget(c.to)); }
  return set;
}

export function scenarioSchedule(scenario: SimScenario): { order: SimEngine[]; engines: SimEngine[]; steps: number; couplings: SimScheduleCoupling[] } {
  const part = participatingEngines(scenario);
  const configured = scenario.order ?? DEFAULT_ENGINE_ORDER;
  const order = configured.filter((e, i) => part.has(e) && configured.indexOf(e) === i);
  const couplings = (scenario.couplings ?? []).map(c => {
    const fromEngine = engineOfSimTarget(c.from);
    const toEngine = engineOfSimTarget(c.to);
    return { from: c.from, to: c.to, fromEngine, toEngine, delayed: order.indexOf(fromEngine) > order.indexOf(toEngine) };
  });
  return { order, engines: [...order], steps: stepCount(scenario.duration, scenario.step), couplings };
}

/** True when a ==/!= node has an operand subtree that references an alias for which isContinuous(alias) holds. */
function nodeFloatEq(node: SimExprNode, isContinuous: ((alias: string) => boolean) | null): boolean {
  switch (node.kind) {
    case 'num': case 'alias': return false;
    case 'unary': return nodeFloatEq(node.arg, isContinuous);
    case 'call': return node.args.some(a => nodeFloatEq(a, isContinuous));
    case 'binary': {
      if ((node.op === '==' || node.op === '!=') && isContinuous) {
        const used = [...aliasesOf(node.left), ...aliasesOf(node.right)];
        if (used.some(isContinuous)) return true;
      }
      return nodeFloatEq(node.left, isContinuous) || nodeFloatEq(node.right, isContinuous);
    }
  }
}
function aliasesOf(node: SimExprNode): string[] {
  switch (node.kind) {
    case 'num': return [];
    case 'alias': return [node.name];
    case 'unary': return aliasesOf(node.arg);
    case 'call': return node.args.flatMap(aliasesOf);
    case 'binary': return [...aliasesOf(node.left), ...aliasesOf(node.right)];
  }
}

function stimulusNumbers(p: SimStimulus['profile']): number[] {
  return p.kind === 'constant' ? [p.value] : p.kind === 'step' ? [p.before, p.after, p.at] : [p.from, p.slope, p.start];
}

export function validateScenario(
  scenario: SimScenario,
  ctx: { project: unknown; repository?: SysmlRepository; verificationCase?: VerificationCase },
): SimScenarioDiagnostic[] {
  const out: SimScenarioDiagnostic[] = [];
  const err = (code: string, message: string, path?: string, target?: string) => out.push({ severity: 'error', code, message, ...(path !== undefined ? { path } : {}), ...(target !== undefined ? { target } : {}) });
  const warn = (code: string, message: string, path?: string, target?: string) => out.push({ severity: 'warning', code, message, ...(path !== undefined ? { path } : {}), ...(target !== undefined ? { target } : {}) });
  const fin = Number.isFinite;
  const signals = scenario.signals ?? [];
  const stimuli = scenario.stimuli ?? [];
  const couplings = scenario.couplings ?? [];
  const assertions = scenario.assertions ?? [];

  const durOk = fin(scenario.duration) && scenario.duration > 0;
  if (!durOk) err('DURATION', 'duration must be a finite number > 0', 'duration');
  let stepOk = false;
  if (!(fin(scenario.step) && scenario.step > 0)) err('STEP', 'step must be a finite number > 0', 'step');
  else if (durOk && scenario.step > scenario.duration) err('STEP', 'step must be <= duration', 'step');
  else if (durOk) {
    stepOk = true;
    const n = stepCount(scenario.duration, scenario.step);
    if (Math.abs(n * scenario.step - scenario.duration) > TIME_EPS * Math.max(1, scenario.duration)) {
      err('STEP', 'duration must be a whole multiple of step', 'step'); stepOk = false;
    }
    if (n > MAX_SIM_STEPS) { err('STEP', `too many steps (${n} > ${MAX_SIM_STEPS})`, 'step'); stepOk = false; }
  }
  const runOk = durOk && stepOk;

  const part = participatingEngines(scenario);
  if (scenario.order) {
    const seen = new Set<string>();
    scenario.order.forEach((e, i) => {
      if (!ENGINES.includes(e)) err('ORDER', `unknown engine "${String(e)}" in order`, `order[${i}]`);
      else if (seen.has(e)) err('ORDER', `engine "${e}" appears more than once in order`, `order[${i}]`);
      seen.add(e);
    });
    for (const e of ENGINES) if (part.has(e) && !seen.has(e)) err('ORDER', `participating engine "${e}" is missing from order`, 'order');
  }

  const aliasSet = new Set<string>();
  const seenAlias = new Set<string>();
  signals.forEach((sg, i) => {
    const path = `signals[${i}].alias`;
    if (typeof sg.alias !== 'string' || !ALIAS_RE.test(sg.alias)) err('ALIAS', `alias "${String(sg.alias)}" is not a valid identifier`, path);
    else if (RESERVED.has(sg.alias)) err('ALIAS', `alias "${sg.alias}" is a reserved word`, path);
    else if (seenAlias.has(sg.alias)) err('ALIAS', `alias "${sg.alias}" is declared more than once`, path);
    seenAlias.add(sg.alias);
    aliasSet.add(sg.alias);
  });

  stimuli.forEach((s, i) => {
    if (!stimulusNumbers(s.profile).every(fin)) err('STIMULUS', `stimulus "${s.target}" has non-finite profile numbers`, `stimuli[${i}]`, s.target);
  });

  // Same-engine couplings and drive conflicts.
  couplings.forEach((c, i) => {
    if (engineOfSimTarget(c.from) === engineOfSimTarget(c.to)) err('SAME_ENGINE_COUPLING', `coupling from "${c.from}" to "${c.to}" stays inside one engine`, `couplings[${i}]`);
  });
  const driveCount = new Map<string, number>();
  for (const t of [...stimuli.map(s => s.target), ...couplings.map(c => c.to)]) driveCount.set(t, (driveCount.get(t) ?? 0) + 1);
  for (const [t, n] of driveCount) if (n > 1) err('DRIVE_CONFLICT', `target "${t}" is driven ${n} times`, undefined, t);

  // Resolve targets through sessions.
  const sessions = new Map<SimEngine, SimEngineSession>();
  if (runOk) {
    for (const engine of ENGINES) {
      if (!part.has(engine)) continue;
      const observe = [...signals.filter(x => engineOfSimTarget(x.target) === engine).map(x => x.target), ...couplings.filter(c => engineOfSimTarget(c.from) === engine).map(c => c.from)];
      const drive = [...stimuli.filter(x => engineOfSimTarget(x.target) === engine).map(x => x.target), ...couplings.filter(c => engineOfSimTarget(c.to) === engine).map(c => c.to)];
      const res = createSimSession(engine, ctx.project, { observe: [...new Set(observe)], drive: [...new Set(drive)], step: scenario.step });
      if (res.session) sessions.set(engine, res.session);
      const flat = res.diagnostics.flatMap(d => (d.details && d.details.length ? d.details : [d]));
      const reported = new Set<string>();
      for (const d of flat) {
        if (d.code === 'STEP_NOT_TICK_MULTIPLE') {
          if (!reported.has('tick')) { reported.add('tick'); err('STEP_NOT_TICK_MULTIPLE', d.message, 'step', d.target); }
          continue;
        }
        const t = d.target;
        const inObserve = d.code !== 'NOT_STIMULABLE';
        const inDrive = d.code !== 'NOT_OBSERVABLE';
        const msg = `${d.code}: ${d.message}`;
        let mapped = false;
        if (inObserve) {
          signals.forEach((sg, i) => { if (sg.target === t) { err('SIGNAL', msg, `signals[${i}].target`, t); mapped = true; } });
          couplings.forEach((c, i) => { if (c.from === t) { err('COUPLING', msg, `couplings[${i}]`, t); mapped = true; } });
        }
        if (inDrive) {
          stimuli.forEach((s, i) => { if (s.target === t) { err('STIMULUS', msg, `stimuli[${i}].target`, t); mapped = true; } });
          couplings.forEach((c, i) => { if (c.to === t) { err('COUPLING', msg, `couplings[${i}]`, t); mapped = true; } });
        }
        if (!mapped) err('SIGNAL', msg, undefined, t);
      }
    }
  }

  if (assertions.length === 0) err('NO_ASSERTIONS', 'scenario needs at least one assertion', 'assertions');

  const allowed = ctx.verificationCase ? new Set(ctx.verificationCase.verifiesRequirementIds ?? []) : null;
  const signalTarget = new Map(signals.map(s => [s.alias, s.target] as const));
  const isContinuous = (alias: string): boolean => {
    const target = signalTarget.get(alias);
    if (target === undefined) return false;
    const session = sessions.get(engineOfSimTarget(target));
    if (!session) return false;
    try { return !session.signalInfo(target).discrete; } catch { return false; }
  };
  const REL_KINDS = new Set(['satisfy', 'verify', 'refine', 'trace']);
  const rels = ctx.repository ? Object.values(ctx.repository.relationships ?? {}) as any[] : [];
  const linked = (target: string, req: string) => rels.some(r => REL_KINDS.has(r.kind) && ((r.sourceId === target && r.targetId === req) || (r.sourceId === req && r.targetId === target)));

  assertions.forEach((a, i) => {
    const condPath = `assertions[${i}].condition`;
    const tPath = `assertions[${i}].temporal`;
    const used = new Set<string>();
    const asts: SimExprNode[] = [];
    const checkExpr = (src: string, code: 'EXPRESSION' | 'RESPONSE', path: string) => {
      const p = parseSimExpression(src);
      if (!p.ok) { err(code, `invalid expression: ${p.error}`, path); return; }
      asts.push(p.ast);
      for (const al of p.aliases) {
        used.add(al);
        if (!aliasSet.has(al)) err(code, `alias "${al}" is not declared in signals`, path);
      }
    };
    checkExpr(a.condition, 'EXPRESSION', condPath);
    const tmp = a.temporal;
    if (tmp.kind === 'response') {
      if (!(fin(tmp.within) && tmp.within > 0)) err('RESPONSE', 'within must be a finite number > 0', `${tPath}.within`);
      checkExpr(tmp.trigger, 'RESPONSE', `${tPath}.trigger`);
    }
    if (tmp.window) {
      const [t0, t1] = tmp.window;
      const wp = `${tPath}.window`;
      if (!fin(t0) || !fin(t1) || !timeLE(t0, t1)) err('WINDOW', 'window must be finite with start <= end', wp);
      else if (!timeGE(t0, 0) || (durOk && !timeLE(t1, scenario.duration))) err('WINDOW', 'window must lie within [0, duration]', wp);
      else if (runOk && Math.ceil(t0 / scenario.step - 1e-9) > Math.floor(t1 / scenario.step + 1e-9)) err('WINDOW', 'window contains no grid sample', wp);
    }
    if (allowed && !allowed.has(a.requirementId)) err('REQUIREMENT', `requirement "${a.requirementId}" is not verified by the verification case`, `assertions[${i}].requirementId`);

    if (asts.some(n => nodeFloatEq(n, isContinuous))) {
      warn('FLOAT_EQUALITY', '== / != on a continuous signal is fragile; prefer a tolerance comparison', condPath);
    }
    if (ctx.repository) {
      const bad = [...used].filter(al => { const t = signalTarget.get(al); return t !== undefined && !linked(t, a.requirementId); });
      if (bad.length > 0) warn('UNLINKED_SIGNAL', `signal(s) ${bad.join(', ')} not linked to requirement "${a.requirementId}" by satisfy/verify/refine/trace`, `assertions[${i}]`);
    }
  });
  return out;
}

const num = (n: number): string => String(n);

export function criterionToScenario(c: SimCriterion): SimScenario {
  const k = c.check;
  let condition: string;
  let temporal: SimTemporal;
  switch (k.kind) {
    case '<=': condition = `y <= ${num(k.value)}`; temporal = { kind: 'always', window: [k.window[0], k.window[1]] }; break;
    case '>=': condition = `y >= ${num(k.value)}`; temporal = { kind: 'always', window: [k.window[0], k.window[1]] }; break;
    case 'within': condition = `abs(y - ${num(k.value)}) <= ${num(k.tolerance)}`; temporal = { kind: 'always', window: [k.window[0], k.window[1]] }; break;
    case 'reaches': condition = `y ${k.direction === 'falling' ? '<=' : '>='} ${num(k.value)}`; temporal = { kind: 'eventually', window: [0, k.by] }; break;
    case 'settles': condition = `abs(y - ${num(k.value)}) <= ${num(k.tolerance)}`; temporal = { kind: 'always', window: [k.by, c.duration] }; break;
  }
  return {
    id: `scn-${c.id}`, verificationCaseId: c.verificationCaseId, duration: c.duration, step: c.step,
    signals: [{ alias: 'y', target: c.observe }],
    stimuli: c.stimuli.map(s => ({ target: s.target, profile: { ...s.profile } })),
    couplings: [],
    assertions: [{ id: `as-${c.id}`, requirementId: c.requirementId, condition, temporal }],
  };
}
