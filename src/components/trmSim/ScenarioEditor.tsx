import React, { useMemo, useState } from 'react';
import type { SysmlRepository, VerificationCase } from '../../engine/sysml/model';
import type { SimStimulusProfile } from '../../engine/trmSim/simCriterion';
import type { SimEngine } from '../../engine/trmSim/simSession';
import { DEFAULT_ENGINE_ORDER, validateScenario, type SimAssertion, type SimScenario, type SimTemporal } from '../../engine/trmSim/simScenario';
import { simCandidates, type SimCandidate } from '../../engine/trmSim/simVerification';

type ProfileKind = SimStimulusProfile['kind'];
type Mode = SimTemporal['kind'];
interface SignalDraft { alias: string; target: string }
interface StimulusDraft { target: string; kind: ProfileKind; a: string; b: string; c: string }
interface CouplingDraft { from: string; to: string }
interface AssertionDraft { id: string; name?: string; requirementId: string; condition: string; mode: Mode; w0: string; w1: string; trigger: string; within: string }
interface Draft {
  duration: string; step: string; order: SimEngine[];
  signals: SignalDraft[]; stimuli: StimulusDraft[]; couplings: CouplingDraft[]; assertions: AssertionDraft[];
}

const num = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s));
const str = (n: number): string => String(n);
const ENGINES: SimEngine[] = ['sm', 'xb', 'vlab'];
const ENGINE_NAMES: Record<SimEngine, string> = { sm: 'State machine', xb: 'X-Bridges', vlab: 'V-Lab' };
const field = 'rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs';
const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-50';
const lbl = 'flex flex-col gap-1 text-[11px] text-neutral-400';

function draftOf(s: SimScenario | undefined): Draft {
  if (!s) return { duration: '', step: '', order: [...DEFAULT_ENGINE_ORDER], signals: [], stimuli: [], couplings: [], assertions: [] };
  const order = [...(s.order ?? DEFAULT_ENGINE_ORDER)];
  return {
    duration: str(s.duration), step: str(s.step), order,
    signals: s.signals.map(x => ({ alias: x.alias, target: x.target })),
    stimuli: s.stimuli.map(x => x.profile.kind === 'constant' ? { target: x.target, kind: 'constant' as const, a: str(x.profile.value), b: '', c: '' }
      : x.profile.kind === 'step' ? { target: x.target, kind: 'step' as const, a: str(x.profile.before), b: str(x.profile.after), c: str(x.profile.at) }
      : { target: x.target, kind: 'ramp' as const, a: str(x.profile.from), b: str(x.profile.slope), c: str(x.profile.start) }),
    couplings: s.couplings.map(c => ({ from: c.from, to: c.to })),
    assertions: s.assertions.map(a => ({
      id: a.id, ...(a.name !== undefined ? { name: a.name } : {}), requirementId: a.requirementId, condition: a.condition, mode: a.temporal.kind,
      w0: a.temporal.window ? str(a.temporal.window[0]) : '', w1: a.temporal.window ? str(a.temporal.window[1]) : '',
      trigger: a.temporal.kind === 'response' ? a.temporal.trigger : '', within: a.temporal.kind === 'response' ? str(a.temporal.within) : '',
    })),
  };
}

function scenarioOf(d: Draft, id: string, vcId: string): SimScenario {
  return {
    id, verificationCaseId: vcId, duration: num(d.duration), step: num(d.step), order: d.order,
    signals: d.signals.map(s => ({ alias: s.alias, target: s.target })),
    stimuli: d.stimuli.map(s => ({
      target: s.target,
      profile: s.kind === 'constant' ? { kind: 'constant', value: num(s.a) }
        : s.kind === 'step' ? { kind: 'step', before: num(s.a), after: num(s.b), at: num(s.c) }
        : { kind: 'ramp', from: num(s.a), slope: num(s.b), start: num(s.c) },
    })),
    couplings: d.couplings.map(c => ({ from: c.from, to: c.to })),
    assertions: d.assertions.map((a): SimAssertion => {
      const hasWindow = a.w0.trim() !== '' || a.w1.trim() !== '';
      const window: { window?: [number, number] } = hasWindow ? { window: [num(a.w0), num(a.w1)] } : {};
      const temporal: SimTemporal = a.mode === 'response'
        ? { kind: 'response', trigger: a.trigger, within: num(a.within), ...window }
        : { kind: a.mode, ...window };
      return { id: a.id, requirementId: a.requirementId, ...(a.name !== undefined ? { name: a.name } : {}), condition: a.condition, temporal };
    }),
  };
}

const union = (existing: string[], extra: string[]): string[] => {
  const out = [...existing];
  for (const id of extra) if (!out.includes(id)) out.push(id);
  return out;
};

function TargetOptions({ items, placeholder }: { items: SimCandidate[]; placeholder: string }) {
  return (
    <>
      <option value="">{placeholder}</option>
      {ENGINES.map(e => {
        const group = items.filter(c => c.engine === e);
        return group.length === 0 ? null : (
          <optgroup key={e} label={ENGINE_NAMES[e]}>
            {group.map(c => <option key={c.target} value={c.target}>{c.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

function Txt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className={lbl}>{label}<input aria-label={label} className={field} value={value} onChange={e => onChange(e.target.value)} /></label>;
}

export interface ScenarioEditorProps {
  verificationCase: VerificationCase;
  repository: SysmlRepository;
  project: unknown;
  requirementId: string;
  onSave: (scenario: SimScenario, verifiesRequirementIds: string[]) => void;
  onCancel: () => void;
}

export function ScenarioEditor({ verificationCase: vc, repository, project, requirementId, onSave, onCancel }: ScenarioEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(vc.simulationScenario));
  const candidates = useMemo(() => simCandidates(project), [project]);
  const requirements = Object.values(repository.requirements);
  const scenarioId = vc.simulationScenario?.id ?? `scn-${vc.id}`;

  const scenario = useMemo(() => scenarioOf(draft, scenarioId, vc.id), [draft, scenarioId, vc.id]);
  const verifies = useMemo(() => union(vc.verifiesRequirementIds, scenario.assertions.map(a => a.requirementId)), [vc, scenario]);
  const diagnostics = useMemo(
    () => validateScenario(scenario, { project, repository, verificationCase: { ...vc, verifiesRequirementIds: verifies } }),
    [scenario, project, repository, vc, verifies],
  );
  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  const set = (patch: Partial<Draft>) => setDraft(prev => ({ ...prev, ...patch }));
  const upd = <K extends 'signals' | 'stimuli' | 'couplings' | 'assertions'>(key: K, i: number, patch: Partial<Draft[K][number]>) =>
    setDraft(prev => ({ ...prev, [key]: (prev[key] as any[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const del = (key: 'signals' | 'stimuli' | 'couplings' | 'assertions', i: number) =>
    setDraft(prev => ({ ...prev, [key]: (prev[key] as any[]).filter((_, j) => j !== i) }));
  const nextAssertionId = (): string => {
    let n = draft.assertions.length + 1;
    while (draft.assertions.some(a => a.id === `asr-${n}`)) n++;
    return `asr-${n}`;
  };

  return (
    <div className="mt-2 flex flex-col gap-2" aria-label="Scenario editor">
      <div className="flex flex-wrap gap-2">
        <Txt label="Duration (s)" value={draft.duration} onChange={v => set({ duration: v })} />
        <Txt label="Step (s)" value={draft.step} onChange={v => set({ step: v })} />
        {draft.order.map((e, i) => (
          <label key={i} className={lbl}>{`Order ${i + 1}`}
            <select aria-label={`Order ${i + 1}`} className={field} value={e}
              onChange={ev => set({ order: draft.order.map((x, j) => (j === i ? ev.target.value as SimEngine : x)) })}>
              {ENGINES.map(k => <option key={k} value={k}>{ENGINE_NAMES[k]}</option>)}
            </select>
          </label>
        ))}
      </div>

      {draft.signals.map((s, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <Txt label={`Signal ${i + 1} alias`} value={s.alias} onChange={v => upd('signals', i, { alias: v })} />
          <label className={lbl}>{`Signal ${i + 1} target`}
            <select aria-label={`Signal ${i + 1} target`} className={field} value={s.target} onChange={e => upd('signals', i, { target: e.target.value })}>
              <TargetOptions items={candidates.observe} placeholder="Select a signal" />
            </select>
          </label>
          <button type="button" className={btn} aria-label={`Remove signal ${i + 1}`} onClick={() => del('signals', i)}>Remove</button>
        </div>
      ))}

      {draft.stimuli.map((s, i) => {
        const n = i + 1;
        const names = s.kind === 'constant' ? ['value'] : s.kind === 'step' ? ['before', 'after', 'at'] : ['from', 'slope', 'start'];
        const keys = ['a', 'b', 'c'] as const;
        return (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className={lbl}>{`Stimulus ${n} target`}
              <select aria-label={`Stimulus ${n} target`} className={field} value={s.target} onChange={e => upd('stimuli', i, { target: e.target.value })}>
                <TargetOptions items={candidates.stimulus} placeholder="Select a target" />
              </select>
            </label>
            <label className={lbl}>{`Stimulus ${n} profile`}
              <select aria-label={`Stimulus ${n} profile`} className={field} value={s.kind} onChange={e => upd('stimuli', i, { kind: e.target.value as ProfileKind })}>
                <option value="constant">constant</option><option value="step">step</option><option value="ramp">ramp</option>
              </select>
            </label>
            {names.map((nm, j) => <Txt key={nm} label={`Stimulus ${n} ${nm}`} value={s[keys[j]]} onChange={v => upd('stimuli', i, { [keys[j]]: v })} />)}
            <button type="button" className={btn} aria-label={`Remove stimulus ${n}`} onClick={() => del('stimuli', i)}>Remove</button>
          </div>
        );
      })}

      {draft.couplings.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className={lbl}>{`Coupling ${i + 1} from`}
            <select aria-label={`Coupling ${i + 1} from`} className={field} value={c.from} onChange={e => upd('couplings', i, { from: e.target.value })}>
              <TargetOptions items={candidates.observe} placeholder="Select a signal" />
            </select>
          </label>
          <label className={lbl}>{`Coupling ${i + 1} to`}
            <select aria-label={`Coupling ${i + 1} to`} className={field} value={c.to} onChange={e => upd('couplings', i, { to: e.target.value })}>
              <TargetOptions items={candidates.stimulus} placeholder="Select a target" />
            </select>
          </label>
          <button type="button" className={btn} aria-label={`Remove coupling ${i + 1}`} onClick={() => del('couplings', i)}>Remove</button>
        </div>
      ))}

      {draft.assertions.map((a, i) => {
        const n = i + 1;
        return (
          <div key={a.id} className="flex flex-wrap items-end gap-2">
            <label className={lbl}>{`Assertion ${n} requirement`}
              <select aria-label={`Assertion ${n} requirement`} className={field} value={a.requirementId} onChange={e => upd('assertions', i, { requirementId: e.target.value })}>
                {requirements.map(r => <option key={r.id} value={r.id}>{r.requirementId}</option>)}
              </select>
            </label>
            <Txt label={`Assertion ${n} condition`} value={a.condition} onChange={v => upd('assertions', i, { condition: v })} />
            <label className={lbl}>{`Assertion ${n} mode`}
              <select aria-label={`Assertion ${n} mode`} className={field} value={a.mode} onChange={e => upd('assertions', i, { mode: e.target.value as Mode })}>
                {['always', 'never', 'eventually', 'response'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            {a.mode === 'response' && <Txt label={`Assertion ${n} trigger`} value={a.trigger} onChange={v => upd('assertions', i, { trigger: v })} />}
            {a.mode === 'response' && <Txt label={`Assertion ${n} within (s)`} value={a.within} onChange={v => upd('assertions', i, { within: v })} />}
            <Txt label={`Assertion ${n} window start`} value={a.w0} onChange={v => upd('assertions', i, { w0: v })} />
            <Txt label={`Assertion ${n} window end`} value={a.w1} onChange={v => upd('assertions', i, { w1: v })} />
            <button type="button" className={btn} aria-label={`Remove assertion ${n}`} onClick={() => del('assertions', i)}>Remove</button>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => setDraft(p => ({ ...p, signals: [...p.signals, { alias: '', target: '' }] }))}>Add signal</button>
        <button type="button" className={btn} onClick={() => setDraft(p => ({ ...p, stimuli: [...p.stimuli, { target: '', kind: 'constant', a: '', b: '', c: '' }] }))}>Add stimulus</button>
        <button type="button" className={btn} onClick={() => setDraft(p => ({ ...p, couplings: [...p.couplings, { from: '', to: '' }] }))}>Add coupling</button>
        <button type="button" className={btn} onClick={() => setDraft(p => ({
          ...p, assertions: [...p.assertions, { id: nextAssertionId(), requirementId, condition: '', mode: 'always', w0: '', w1: '', trigger: '', within: '' }],
        }))}>Add assertion</button>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="text-red-400">
          {errors.map((d, i) => <p key={i}>{d.code}: {d.message}</p>)}
        </div>
      )}
      {warnings.length > 0 && (
        <ul aria-label="Scenario warnings" className="text-amber-400">
          {warnings.map((d, i) => <li key={i}>{d.code}: {d.message}</li>)}
        </ul>
      )}

      <div className="flex gap-2">
        <button type="button" className={btn} disabled={errors.length > 0} onClick={() => onSave(scenario, verifies)}>Save scenario</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
