// WP-18a: temporal evaluation of scenario assertions. Contract: plan §7.6
import { evaluateSimExpression, isTruthy, parseSimExpression, type SimExprNode } from './simExpression';
import { timeGE, timeLE } from './simCriterion';
import type { SimAssertion } from './simScenario';

export interface SimSeries { times: number[]; values: Record<string, (number | null)[]> }
export type SimVerdict = 'passed' | 'failed' | 'inconclusive';
export interface SimAssertionResult {
  assertionId: string;
  requirementId: string;
  verdict: SimVerdict;
  samplesChecked: number;
  at?: { t: number; values: Record<string, number> };
  reason: string;
}

export function evaluateAssertion(assertion: SimAssertion, series: SimSeries, duration: number): SimAssertionResult {
  const base = { assertionId: assertion.id, requirementId: assertion.requirementId };
  const temporal = assertion.temporal;
  const cond = parseSimExpression(assertion.condition);
  if (!cond.ok) return { ...base, verdict: 'failed', samplesChecked: 0, reason: `invalid expression: ${cond.error}` };
  let trig: { ast: SimExprNode; aliases: string[] } | null = null;
  if (temporal.kind === 'response') {
    const p = parseSimExpression(temporal.trigger);
    if (!p.ok) return { ...base, verdict: 'failed', samplesChecked: 0, reason: `invalid expression: ${p.error}` };
    trig = p;
  }
  const aliases: string[] = [];
  for (const al of [...cond.aliases, ...(trig ? trig.aliases : [])]) if (!aliases.includes(al)) aliases.push(al);

  const [w0, w1] = temporal.window ?? [0, duration];
  const idx: number[] = [];
  for (let k = 0; k < series.times.length; k++) {
    const t = series.times[k];
    if (!timeGE(t, w0) || !timeLE(t, w1)) continue;
    if (aliases.every(al => { const col = series.values[al]; return col !== undefined && col[k] !== null && col[k] !== undefined; })) idx.push(k);
  }
  if (idx.length === 0) return { ...base, verdict: 'inconclusive', samplesChecked: 0, reason: 'no samples in window' };

  const envAt = (k: number): Record<string, number> => {
    const env: Record<string, number> = {};
    for (const al of aliases) env[al] = series.values[al][k] as number;
    return env;
  };
  const atOf = (i: number) => ({ t: series.times[idx[i]], values: envAt(idx[i]) });

  // Evaluate sequentially; stop at the first non-finite value.
  const c: number[] = [];
  const g: number[] = [];
  let nonFinite = -1;
  for (let i = 0; i < idx.length; i++) {
    const env = envAt(idx[i]);
    const cv = evaluateSimExpression(cond.ast, env);
    const tv = trig ? evaluateSimExpression(trig.ast, env) : 0;
    if (!Number.isFinite(cv) || !Number.isFinite(tv)) { nonFinite = i; break; }
    c.push(cv); g.push(tv);
    if (temporal.kind === 'always' && !isTruthy(cv)) return { ...base, verdict: 'failed', samplesChecked: i + 1, at: atOf(i), reason: 'condition false' };
    if (temporal.kind === 'never' && isTruthy(cv)) return { ...base, verdict: 'failed', samplesChecked: i + 1, at: atOf(i), reason: 'condition true' };
    if (temporal.kind === 'eventually' && isTruthy(cv)) return { ...base, verdict: 'passed', samplesChecked: i + 1, at: atOf(i), reason: 'condition became true' };
  }
  const nfFail = (): SimAssertionResult => ({ ...base, verdict: 'failed', samplesChecked: nonFinite + 1, at: atOf(nonFinite), reason: 'non-finite value' });

  if (temporal.kind !== 'response') {
    if (nonFinite >= 0) return nfFail();
    const last = idx.length - 1;
    if (temporal.kind === 'eventually') {
      return { ...base, verdict: 'failed', samplesChecked: idx.length, at: atOf(last), reason: `never became true in [${w0}, ${w1}]` };
    }
    return { ...base, verdict: 'passed', samplesChecked: idx.length, reason: temporal.kind === 'always' ? 'condition held at every sample' : 'condition never true' };
  }

  // response: analyse the samples that were evaluated (those before a non-finite one).
  const n = c.length;
  let failIdx = -1;
  let failReason = '';
  let pending: number | null = null;
  let edges = 0;
  for (let i = 0; i < n; i++) {
    if (!(isTruthy(g[i]) && (i === 0 || !isTruthy(g[i - 1])))) continue;
    edges++;
    const te = series.times[idx[i]];
    const deadline = te + temporal.within;
    let answered = false;
    for (let j = i; j < n && timeLE(series.times[idx[j]], deadline); j++) {
      if (isTruthy(c[j])) { answered = true; break; }
    }
    if (answered) continue;
    if (timeLE(deadline, series.times[idx[n - 1]])) {
      let f = i;
      for (let j = i; j < n && timeLE(series.times[idx[j]], deadline); j++) f = j;
      if (failIdx < 0 || f < failIdx) { failIdx = f; failReason = `no response within ${temporal.within} s of trigger at t=${te}`; }
    } else if (pending === null) pending = te;
  }
  if (failIdx >= 0 && (nonFinite < 0 || failIdx < nonFinite)) {
    return { ...base, verdict: 'failed', samplesChecked: failIdx + 1, at: atOf(failIdx), reason: failReason };
  }
  if (nonFinite >= 0) return nfFail();
  if (pending !== null) return { ...base, verdict: 'inconclusive', samplesChecked: idx.length, reason: `trigger at t=${pending} has no complete response window` };
  if (edges === 0) return { ...base, verdict: 'inconclusive', samplesChecked: idx.length, reason: 'trigger never rose' };
  return { ...base, verdict: 'passed', samplesChecked: idx.length, reason: `${edges} trigger(s) answered` };
}

export function aggregateRequirementVerdicts(results: SimAssertionResult[]): Record<string, { verdict: SimVerdict; assertionIds: string[] }> {
  const rank: Record<SimVerdict, number> = { passed: 0, inconclusive: 1, failed: 2 };
  const out: Record<string, { verdict: SimVerdict; assertionIds: string[] }> = {};
  for (const r of results) {
    const e = out[r.requirementId];
    if (!e) out[r.requirementId] = { verdict: r.verdict, assertionIds: [r.assertionId] };
    else {
      e.assertionIds.push(r.assertionId);
      if (rank[r.verdict] > rank[e.verdict]) e.verdict = r.verdict;
    }
  }
  return out;
}
