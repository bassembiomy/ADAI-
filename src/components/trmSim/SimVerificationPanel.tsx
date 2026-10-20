import React, { useMemo, useState } from 'react';
import type { SysmlRepository, VerificationCase } from '../../engine/sysml/model';
import { validateCriterion, type SimCheck, type SimCriterion, type SimStimulusProfile } from '../../engine/trmSim/simCriterion';
import { buildSimExternalElements } from '../../engine/trmSim/simExternalElements';
import { projectSimSources } from '../../engine/trmSim/simEndpoints';
import { createSimulationCase, linkedSimTargets, simCandidates, simEvidenceStatusFor, simulationCases, verifyRequirementBySimulation, verifyRequirementsByScenario } from '../../engine/trmSim/simVerification';
import { scenarioSchedule } from '../../engine/trmSim/simScenario';
import type { SimScenarioRun } from '../../engine/trmSim/simScenarioRunner';
import { ScenarioEditor } from './ScenarioEditor';
import { SimTracePlot } from './SimTracePlot';

export interface SimVerificationPanelProps {
  repository: SysmlRepository;
  requirementId: string;
  project: unknown;
  onRepositoryChange: (repository: SysmlRepository) => void;
  now?: () => string;
  newId?: () => string;
}

type CheckKind = SimCheck['kind'];
type ProfileKind = SimStimulusProfile['kind'];
interface StimulusDraft { target: string; kind: ProfileKind; a: string; b: string; c: string }
interface Draft {
  observe: string; check: CheckKind; value: string; by: string; w0: string; w1: string; tolerance: string;
  duration: string; step: string; stimuli: StimulusDraft[];
  direction?: 'rising' | 'falling'; unit?: string; id?: string;
}

const LINK_KINDS = ['satisfy', 'verify', 'refine', 'trace'] as const;
const num = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s));
const str = (n: number): string => String(n);
const defaultNewId = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const emptyDraft = (): Draft => ({ observe: '', check: '>=', value: '', by: '', w0: '', w1: '', tolerance: '', duration: '', step: '', stimuli: [] });

function draftOf(c: SimCriterion): Draft {
  const k = c.check;
  const d: Draft = {
    observe: c.observe, check: k.kind, value: str(k.value), by: '', w0: '', w1: '', tolerance: '',
    duration: str(c.duration), step: str(c.step), id: c.id, unit: c.unit,
    stimuli: c.stimuli.map(s => s.profile.kind === 'constant' ? { target: s.target, kind: 'constant', a: str(s.profile.value), b: '', c: '' }
      : s.profile.kind === 'step' ? { target: s.target, kind: 'step', a: str(s.profile.before), b: str(s.profile.after), c: str(s.profile.at) }
      : { target: s.target, kind: 'ramp', a: str(s.profile.from), b: str(s.profile.slope), c: str(s.profile.start) }),
  };
  if ('window' in k) { d.w0 = str(k.window[0]); d.w1 = str(k.window[1]); }
  if ('by' in k) { d.by = str(k.by); if (k.kind === 'reaches') d.direction = k.direction; }
  if ('tolerance' in k) d.tolerance = str(k.tolerance);
  return d;
}

function criterionOf(d: Draft, requirementId: string, vc: VerificationCase): SimCriterion {
  const value = num(d.value);
  let check: SimCheck;
  switch (d.check) {
    case 'reaches': check = { kind: 'reaches', value, by: num(d.by), ...(d.direction ? { direction: d.direction } : {}) }; break;
    case 'settles': check = { kind: 'settles', value, tolerance: num(d.tolerance), by: num(d.by) }; break;
    case 'within': check = { kind: 'within', value, tolerance: num(d.tolerance), window: [num(d.w0), num(d.w1)] }; break;
    default: check = { kind: d.check, value, window: [num(d.w0), num(d.w1)] };
  }
  return {
    id: d.id ?? `crit-${vc.id}`, requirementId, verificationCaseId: vc.id,
    stimuli: d.stimuli.map(s => ({
      target: s.target,
      profile: s.kind === 'constant' ? { kind: 'constant', value: num(s.a) }
        : s.kind === 'step' ? { kind: 'step', before: num(s.a), after: num(s.b), at: num(s.c) }
        : { kind: 'ramp', from: num(s.a), slope: num(s.b), start: num(s.c) },
    })),
    observe: d.observe, ...(d.unit !== undefined ? { unit: d.unit } : {}),
    check, duration: num(d.duration), step: num(d.step),
  };
}

const ENGINE_NAMES: Record<string, string> = { sm: 'State machine', xb: 'X-Bridges', vlab: 'V-Lab' };
const r4 = (n: number): number => Math.round(n * 10000) / 10000;

const field = 'rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs';
const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900';

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 text-[11px] text-neutral-400">{label}<input className={field} value={value} onChange={e => onChange(e.target.value)} /></label>;
}

export function SimVerificationPanel({ repository, requirementId, project, onRepositoryChange, now, newId }: SimVerificationPanelProps) {
  const requirement = repository.requirements[requirementId];
  const [results, setResults] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [scenarioEditing, setScenarioEditing] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, { run?: SimScenarioRun; notTested: number; error?: string }>>({});
  const [linkTarget, setLinkTarget] = useState('');
  const [linkKind, setLinkKind] = useState<(typeof LINK_KINDS)[number]>('satisfy');

  const linked = linkedSimTargets(repository, requirementId, project);
  const cases = simulationCases(repository, requirementId);
  const candidates = useMemo(() => simCandidates(project), [project]);
  const elements = useMemo(() => buildSimExternalElements(projectSimSources(project)), [project]);
  const makeId = newId ?? defaultNewId;
  const stamp = now ?? (() => new Date().toISOString());

  const commit = (mutate: (repo: SysmlRepository) => void) => {
    const next = structuredClone(repository);
    mutate(next);
    onRepositoryChange(next);
  };

  const link = () => {
    const target = linkTarget || elements[0]?.id;
    if (!target) return;
    commit(r => { const id = makeId(); r.relationships[id] = { id, kind: linkKind, sourceId: target, targetId: requirementId } as any; });
  };

  const runScenario = (vc: VerificationCase) => {
    const out = verifyRequirementsByScenario(repository, project, vc.id, { newId: () => makeId(), executedAt: stamp() });
    setRuns(prev => ({ ...prev, [vc.id]: { ...(out.run ? { run: out.run } : {}), notTested: out.skipped.filter(k => !k.reason.startsWith('inconclusive')).length, ...(out.error !== undefined ? { error: out.error } : {}) } }));
    if (out.error === undefined) onRepositoryChange(out.repository);
  };

  const saveScenario = (vc: VerificationCase, scenario: NonNullable<VerificationCase['simulationScenario']>, verifies: string[]) => {
    commit(r => { r.verificationCases[vc.id] = { ...r.verificationCases[vc.id], simulationScenario: scenario, verifiesRequirementIds: verifies }; });
    setScenarioEditing(null);
  };

  const nameOf = (target: string, list: { target: string; name: string }[]): string => list.find(c => c.target === target)?.name ?? target;

  const run = (vc: VerificationCase) => {
    if (vc.simulationScenario) { runScenario(vc); return; }
    const out = verifyRequirementBySimulation(repository, project, vc.id, { id: makeId(), executedAt: stamp() });
    let text: string;
    if (out.error) {
      text = out.error;
    } else if (out.evidence?.result === 'passed') {
      text = 'Passed';
    } else {
      const v = out.evidence?.simulation?.firstViolation;
      text = v ? `Failed: first violation at t=${v.t}, value ${v.value} (${v.reason})` : 'Failed';
    }
    setResults(prev => ({ ...prev, [vc.id]: text }));
    if (!out.error) onRepositoryChange(out.repository);
  };

  const openEditor = (vc: VerificationCase, fromExisting: boolean) => {
    setEditing(vc.id);
    setErrors([]);
    setDraft(fromExisting && vc.simulationCriterion ? draftOf(vc.simulationCriterion) : emptyDraft());
  };

  const save = (vc: VerificationCase) => {
    const criterion = criterionOf(draft, requirementId, vc);
    const unit = candidates.observe.find(c => c.target === criterion.observe)?.unit;
    const diagnostics = validateCriterion(criterion, unit);
    if (diagnostics.length > 0) { setErrors(diagnostics.map(d => d.message)); return; }
    setErrors([]);
    commit(r => { r.verificationCases[vc.id] = { ...r.verificationCases[vc.id], simulationCriterion: criterion }; });
    setEditing(null);
  };

  const setD = (patch: Partial<Draft>) => setDraft(prev => ({ ...prev, ...patch }));
  const setStim = (i: number, patch: Partial<StimulusDraft>) => setDraft(prev => ({ ...prev, stimuli: prev.stimuli.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const latestEvidence = (caseId: string) => Object.values(repository.evidence)
    .filter(e => e.verificationCaseId === caseId && e.requirementId === requirementId)
    .sort((a, b) => (a.executedAt < b.executedAt ? 1 : a.executedAt > b.executedAt ? -1 : b.revision - a.revision))[0];

  const hasWindow = draft.check === '<=' || draft.check === '>=' || draft.check === 'within';
  const hasBy = draft.check === 'reaches' || draft.check === 'settles';
  const hasTolerance = draft.check === 'within' || draft.check === 'settles';

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-[var(--surface-canvas)] p-3 text-xs text-[var(--text-primary)]" aria-label="Simulation verification">
      <h2 className="text-sm font-semibold">
        <span className="font-mono text-orange-300">{requirement?.requirementId ?? requirementId}</span> {requirement?.name ?? ''}
      </h2>

      <div>
        <h3 className="mb-1 font-semibold text-neutral-300">Linked simulation targets</h3>
        <ul aria-label="Linked simulation targets" className="flex flex-col gap-1">
          {linked.map(l => (
            <li key={l.relationshipId} className="flex items-center gap-2">
              <span>{l.name}</span>
              <span className="text-neutral-500">{l.kind} · {l.relationship}{l.missing ? ' · missing in project' : ''}</span>
              <button type="button" className={btn} aria-label={`Unlink ${l.name}`}
                onClick={() => commit(r => { delete r.relationships[l.relationshipId]; })}>Unlink</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-neutral-400">Link target
            <select className={field} value={linkTarget} onChange={e => setLinkTarget(e.target.value)}>
              {elements.map(e => <option key={e.id} value={e.id}>{e.name} ({e.kind})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-400">Link kind
            <select className={field} value={linkKind} onChange={e => setLinkKind(e.target.value as typeof linkKind)}>
              {LINK_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <button type="button" className={btn} onClick={link}>Link</button>
        </div>
      </div>

      <div>
        <button type="button" className={btn} onClick={() => onRepositoryChange(createSimulationCase(repository, requirementId, { id: makeId() }))}>New simulation test case</button>
      </div>
      {cases.length === 0 && <p className="text-neutral-400">No simulation verification case verifies this requirement.</p>}
      {cases.map(vc => {
        const ev = latestEvidence(vc.id);
        const scenario = vc.simulationScenario;
        const schedule = scenario ? scenarioSchedule(scenario) : undefined;
        const outcome = runs[vc.id];
        const counts = outcome?.run ? (() => {
          const verdicts = Object.values(outcome.run.requirements).map(r => r.verdict);
          const passed = verdicts.filter(v => v === 'passed').length;
          const failed = verdicts.filter(v => v === 'failed').length;
          return { passed, failed, inconclusive: verdicts.length - passed - failed, notTested: outcome.notTested };
        })() : undefined;
        const resultText = outcome?.error !== undefined ? outcome.error
          : counts ? `${counts.passed} passed, ${counts.failed} failed, ${counts.inconclusive} inconclusive, ${counts.notTested} not tested` : (results[vc.id] ?? '');
        return (
          <section key={vc.id} className="rounded border border-neutral-800 p-2" aria-label={vc.name}>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{vc.name}</h3>
              <button type="button" className={btn} aria-label={`Run ${vc.name}`} disabled={!vc.simulationCriterion && !vc.simulationScenario} onClick={() => run(vc)}>Run</button>
              {vc.simulationCriterion && (
                <button type="button" className={btn} onClick={() => openEditor(vc, true)} aria-label={`Edit criterion for ${vc.name}`}>Edit criterion</button>
              )}
              <button type="button" className={btn} onClick={() => openEditor(vc, false)} aria-label={`Define criterion for ${vc.name}`}>
                {vc.simulationCriterion ? 'Define new criterion' : 'Define criterion'}
              </button>
              <button type="button" className={btn} onClick={() => setScenarioEditing(vc.id)}
                aria-label={scenario ? `Edit scenario for ${vc.name}` : `Define scenario for ${vc.name}`}>
                {scenario ? 'Edit scenario' : 'Define scenario'}
              </button>
            </div>
            {scenario && schedule && (
              <div className="mt-1 text-neutral-300">
                <p>Execution order: {schedule.order.map(e => ENGINE_NAMES[e] ?? e).join(' → ')}</p>
                <ul aria-label="Couplings" className="list-disc pl-4">
                  {schedule.couplings.map((c, i) => (
                    <li key={i}>{nameOf(c.from, candidates.observe)} → {nameOf(c.to, candidates.stimulus)} · {c.delayed ? 'one-step delay' : 'same step'}</li>
                  ))}
                </ul>
              </div>
            )}
            <div role="status" aria-label={`${vc.name} result`} className="mt-1 text-neutral-300">{resultText}</div>
            {outcome?.run && (
              <>
                <table aria-label={`${vc.name} assertions`} className="mt-1 w-full text-left text-[11px]">
                  <thead><tr><th>Requirement</th><th>Assertion</th><th>Verdict</th><th>Time</th><th>Values</th><th>Reason</th></tr></thead>
                  <tbody>
                    {outcome.run.assertions.map(a => {
                      const def = scenario?.assertions.find(x => x.id === a.assertionId);
                      return (
                        <tr key={a.assertionId}>
                          <td>{repository.requirements[a.requirementId]?.requirementId ?? a.requirementId}</td>
                          <td>{def ? (def.name ? `${def.name}: ${def.condition}` : def.condition) : a.assertionId}</td>
                          <td>{a.verdict}</td>
                          <td>{a.at ? `t = ${r4(a.at.t)}` : ''}</td>
                          <td>{a.at ? Object.entries(a.at.values).map(([k, v]) => `${k} = ${r4(v)}`).join(', ') : ''}</td>
                          <td>{a.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(scenario?.signals ?? []).map(sg => (
                    <SimTracePlot key={sg.alias} alias={sg.alias} times={outcome.run!.series.times} values={outcome.run!.series.values[sg.alias] ?? []} />
                  ))}
                </div>
              </>
            )}
            {scenarioEditing === vc.id && (
              <ScenarioEditor verificationCase={vc} repository={repository} project={project} requirementId={requirementId}
                onSave={(sc, verifies) => saveScenario(vc, sc, verifies)} onCancel={() => setScenarioEditing(null)} />
            )}
            <p className="text-neutral-500">Evidence: {ev ? simEvidenceStatusFor(repository, ev.id, project) : 'none'}</p>
            {editing === vc.id && (
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-neutral-400">Observe
                  <select className={field} value={draft.observe} onChange={e => setD({ observe: e.target.value })}>
                    <option value="">Select a signal</option>
                    {candidates.observe.map(c => <option key={c.target} value={c.target}>{c.name}</option>)}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <label className="flex flex-col gap-1 text-[11px] text-neutral-400">Check
                    <select className={field} value={draft.check} onChange={e => setD({ check: e.target.value as CheckKind })}>
                      {['<=', '>=', 'within', 'reaches', 'settles'].map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                  <Num label="Value" value={draft.value} onChange={v => setD({ value: v })} />
                  {hasBy && <Num label="By (s)" value={draft.by} onChange={v => setD({ by: v })} />}
                  {hasWindow && <Num label="Window start (s)" value={draft.w0} onChange={v => setD({ w0: v })} />}
                  {hasWindow && <Num label="Window end (s)" value={draft.w1} onChange={v => setD({ w1: v })} />}
                  {hasTolerance && <Num label="Tolerance" value={draft.tolerance} onChange={v => setD({ tolerance: v })} />}
                  <Num label="Duration (s)" value={draft.duration} onChange={v => setD({ duration: v })} />
                  <Num label="Step (s)" value={draft.step} onChange={v => setD({ step: v })} />
                </div>
                {draft.stimuli.map((s, i) => {
                  const n = i + 1;
                  const names = s.kind === 'constant' ? ['value'] : s.kind === 'step' ? ['before', 'after', 'at'] : ['from', 'slope', 'start'];
                  const keys: ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
                  return (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-neutral-400">{`Stimulus ${n} target`}
                        <select className={field} value={s.target} onChange={e => setStim(i, { target: e.target.value })}>
                          <option value="">Select a target</option>
                          {candidates.stimulus.map(c => <option key={c.target} value={c.target}>{c.name}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-neutral-400">{`Stimulus ${n} profile`}
                        <select className={field} value={s.kind} onChange={e => setStim(i, { kind: e.target.value as ProfileKind })}>
                          <option value="constant">constant</option><option value="step">step</option><option value="ramp">ramp</option>
                        </select>
                      </label>
                      {names.map((nm, j) => <Num key={nm} label={`Stimulus ${n} ${nm}`} value={s[keys[j]]} onChange={v => setStim(i, { [keys[j]]: v })} />)}
                      <button type="button" className={btn} aria-label={`Remove stimulus ${n}`}
                        onClick={() => setDraft(prev => ({ ...prev, stimuli: prev.stimuli.filter((_, j) => j !== i) }))}>Remove</button>
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <button type="button" className={btn} onClick={() => setDraft(prev => ({ ...prev, stimuli: [...prev.stimuli, { target: '', kind: 'constant', a: '', b: '', c: '' }] }))}>Add stimulus</button>
                  <button type="button" className={btn} onClick={() => save(vc)}>Save criterion</button>
                  <button type="button" className={btn} onClick={() => { setEditing(null); setErrors([]); }}>Cancel</button>
                </div>
                {errors.length > 0 && <div role="alert" className="text-red-400">{errors.map(m => <p key={m}>{m}</p>)}</div>}
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
}
